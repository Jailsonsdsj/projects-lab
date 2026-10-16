// F-12: the idempotency middleware and the D1 write helpers, against the real
// local D1 with every migration applied.

import { env } from "cloudflare:workers";
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENT_REPLAY_HEADER,
} from "@projects-lab/shared";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import {
  chunkedInsert,
  conditionalInsert,
  D1_MAX_BOUND_PARAMS,
  inserted,
} from "../src/core/d1";
import { idempotent } from "../src/core/idempotency";
import { db } from "./db";

/** A deferred the "slow" route waits on, so a duplicate can arrive mid-flight. */
function gate() {
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

function testApp() {
  const runs = { create: 0, flaky: 0, throws: 0, slow: 0 };
  let slowGate = gate();
  const app = new Hono<{ Bindings: Env }>();

  app.post("/things", idempotent("POST /things"), (c) => {
    runs.create += 1;
    return c.json({ id: `thing-${runs.create}` }, 201);
  });
  app.post("/other", idempotent("POST /other"), (c) => c.json({ ok: true }));
  // Fails the first time (4xx), then succeeds.
  app.post("/flaky", idempotent("POST /flaky"), (c) => {
    runs.flaky += 1;
    return runs.flaky === 1
      ? c.json({ error: "bad_request" }, 400)
      : c.json({ attempt: runs.flaky });
  });
  // Throws the first time, then succeeds.
  app.post("/throws", idempotent("POST /throws"), (c) => {
    runs.throws += 1;
    if (runs.throws === 1) throw new Error("boom");
    return c.json({ attempt: runs.throws });
  });
  app.post("/slow", idempotent("POST /slow"), async (c) => {
    runs.slow += 1;
    await slowGate.opened;
    return c.json({ done: true });
  });
  app.delete("/things/1", idempotent("DELETE /things/1"), (c) =>
    c.body(null, 204),
  );

  return {
    app,
    runs,
    openSlow: () => slowGate.open(),
    resetSlow: () => (slowGate = gate()),
  };
}

const post = (key?: string) =>
  ({
    method: "POST",
    headers: key ? { [IDEMPOTENCY_KEY_HEADER]: key } : {},
  }) as RequestInit;

const stored = (key: string) =>
  db()
    .prepare("SELECT scope, response_json FROM mutation WHERE key = ?")
    .bind(key)
    .first<{ scope: string; response_json: string }>();

describe("idempotent()", () => {
  it("runs once and replays the stored response to every retry", async () => {
    const { app, runs } = testApp();
    const key = crypto.randomUUID();
    const first = await app.request("/things", post(key), env);
    const again = await app.request("/things", post(key), env);

    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect(await again.json()).toEqual(await first.json());
    expect(again.headers.get("Content-Type")).toMatch(/application\/json/);
    expect(again.headers.get(IDEMPOTENT_REPLAY_HEADER)).toBe("true");
    expect(first.headers.get(IDEMPOTENT_REPLAY_HEADER)).toBeNull();
    expect(runs.create).toBe(1);
  });

  it("replays an empty 204", async () => {
    const { app } = testApp();
    const key = crypto.randomUUID();
    const init = { ...post(key), method: "DELETE" };
    await app.request("/things/1", init, env);
    const again = await app.request("/things/1", init, env);
    expect(again.status).toBe(204);
    expect(await again.text()).toBe("");
  });

  it("stores nothing for a failed request (4xx), so the retry runs again", async () => {
    const { app, runs } = testApp();
    const key = crypto.randomUUID();
    const first = await app.request("/flaky", post(key), env);
    expect(first.status).toBe(400);
    expect(await stored(key)).toBeNull();

    const retry = await app.request("/flaky", post(key), env);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ attempt: 2 });
    expect(runs.flaky).toBe(2);
  });

  it("stores nothing when the route throws, so the retry runs again", async () => {
    const { app, runs } = testApp();
    const key = crypto.randomUUID();
    const first = await app.request("/throws", post(key), env);
    expect(first.status).toBe(500);
    expect(await stored(key)).toBeNull();

    const retry = await app.request("/throws", post(key), env);
    expect(await retry.json()).toEqual({ attempt: 2 });
    expect(runs.throws).toBe(2);
  });

  it("refuses the same key on another route (422), never replaying across scopes", async () => {
    const { app } = testApp();
    const key = crypto.randomUUID();
    await app.request("/things", post(key), env);
    const other = await app.request("/other", post(key), env);
    expect(other.status).toBe(422);
    expect(await other.json()).toEqual({ error: "idempotency_key_reused" });
  });

  it("answers 409 to a duplicate while the first is in flight, then replays", async () => {
    const { app, runs, openSlow } = testApp();
    const key = crypto.randomUUID();
    const first = app.request("/slow", post(key), env);
    // Let the first request claim the key before the duplicate arrives.
    await expect.poll(() => runs.slow).toBe(1);

    const duplicate = await app.request("/slow", post(key), env);
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({
      error: "idempotency_key_in_progress",
    });

    openSlow();
    expect((await first).status).toBe(200);
    const replayed = await app.request("/slow", post(key), env);
    expect(replayed.headers.get(IDEMPOTENT_REPLAY_HEADER)).toBe("true");
    expect(runs.slow).toBe(1);
  });

  it("just runs the route when there is no key", async () => {
    const { app, runs } = testApp();
    await app.request("/things", post(), env);
    await app.request("/things", post(), env);
    expect(runs.create).toBe(2);
  });

  it("rejects an empty or oversized key without running the route", async () => {
    const { app, runs } = testApp();
    for (const key of ["", "k".repeat(IDEMPOTENCY_KEY_MAX_LENGTH + 1)]) {
      const res = await app.request(
        "/things",
        { method: "POST", headers: { [IDEMPOTENCY_KEY_HEADER]: key } },
        env,
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "idempotency_key_invalid" });
    }
    expect(runs.create).toBe(0);
  });
});

describe("idempotent() is attached per route", () => {
  it("is never mounted with .use() (wildcard or prefix)", () => {
    const sources = import.meta.glob<string>("../src/**/*.ts", {
      eager: true,
      query: "?raw",
      import: "default",
    });
    expect(Object.keys(sources).length).toBeGreaterThan(5);
    const mounted = Object.entries(sources)
      .filter(([, source]) => /\.use\([^;]*idempotent\(/s.test(source))
      .map(([path]) => path);
    expect(mounted).toEqual([]);
  });
});

describe("chunkedInsert", () => {
  const COLUMNS = ["id", "name", "aliases_json", "created_at"] as const;
  const rows = Array.from({ length: 30 }, (_, i) => [
    `chunk-${i}`,
    `Chunk skill ${i}`,
    "[]",
    "2026-10-16T00:00:00.000Z",
  ]);

  it("inserts 30 rows (120 parameters) in one batch, chunked under D1's limit", async () => {
    const statements = chunkedInsert(db(), "skill", COLUMNS, rows);
    expect(30 * COLUMNS.length).toBeGreaterThan(D1_MAX_BOUND_PARAMS);
    expect(statements).toHaveLength(2); // 25 + 5 rows
    await db().batch(statements);
    const { n } = (await db()
      .prepare("SELECT COUNT(*) AS n FROM skill WHERE id LIKE 'chunk-%'")
      .first<{ n: number }>()) ?? { n: 0 };
    expect(n).toBe(30);
  });

  it("is needed: the same rows as one statement are refused", async () => {
    const tuples = rows.map(() => "(?, ?, ?, ?)").join(", ");
    const unchunked = db()
      .prepare(
        `INSERT INTO skill (id, name, aliases_json, created_at) VALUES ${tuples}`,
      )
      .bind(...rows.flatMap(([id, ...rest]) => [`one-${id}`, ...rest]));
    await expect(unchunked.run()).rejects.toThrow("too many SQL variables");
  });

  it("refuses anything but plain identifiers, since names are interpolated", () => {
    expect(() =>
      chunkedInsert(db(), "skill; DROP TABLE user", ["id"], [["x"]]),
    ).toThrow("not an identifier");
  });
});

describe("conditionalInsert", () => {
  beforeAll(async () => {
    // A test-only ledger: the shape of every spend or decrement.
    await db()
      .prepare(
        "CREATE TABLE IF NOT EXISTS test_ledger (id TEXT PRIMARY KEY, amount INTEGER NOT NULL)",
      )
      .run();
    await db()
      .prepare("INSERT INTO test_ledger (id, amount) VALUES ('top-up', 50)")
      .run();
  });

  const spend = (id: string, amount: number) =>
    conditionalInsert(db(), {
      table: "test_ledger",
      columns: ["id", "amount"],
      values: [id, -amount],
      where: "(SELECT COALESCE(SUM(amount), 0) FROM test_ledger) >= ?",
      whereParams: [amount],
    });

  it("writes when the condition holds and refuses (changes = 0) when it doesn't", async () => {
    expect(inserted(await spend("spend-1", 30).run())).toBe(true);
    expect(inserted(await spend("spend-2", 30).run())).toBe(false); // 20 left
    const [first, second] = await db().batch([
      spend("spend-3", 15),
      spend("spend-4", 15), // sees spend-3 inside the same batch: 5 left
    ]);
    expect(first && inserted(first)).toBe(true);
    expect(second && inserted(second)).toBe(false);
    const { total } = (await db()
      .prepare("SELECT SUM(amount) AS total FROM test_ledger")
      .first<{ total: number }>()) ?? { total: -1 };
    expect(total).toBe(5);
  });
});
