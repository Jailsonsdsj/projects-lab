// Idempotency for mutations (playbook §8; docs/prd/99-data-model.md, decision
// 1): the Idempotency-Key header on /api routes and the `idempotencyKey`
// argument of MCP write tools (PRD 02), one `mutation` table for both. Attach
// the middleware per route, never by wildcard: two routers on one prefix would
// run it twice, and a request would then meet its own in-flight claim.
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENT_REPLAY_HEADER,
  type IdempotencyError,
} from "@projects-lab/shared";
import { createMiddleware } from "hono/factory";
import { database } from "./db";

/** `response_json` of a claim whose request hasn't stored a response yet. */
const IN_FLIGHT = "";

export type StoredResponse = {
  status: number;
  contentType: string | null;
  body: string;
};

export type Claim =
  /** The caller runs the work, then stores or releases. */
  | { kind: "claimed" }
  | { kind: "replay"; stored: StoredResponse }
  | { kind: "error"; error: IdempotencyError["error"] };

/**
 * Claims `key` for `scope` (`INSERT … ON CONFLICT DO NOTHING`), so two
 * requests can't both run. A claim that never stores its response (the Worker
 * died after the work) answers `idempotency_key_in_progress` until pruning
 * removes it (F-19): an explicit error, never a made-up success.
 */
export async function claimIdempotencyKey(
  db: D1Database,
  key: string,
  scope: string,
): Promise<Claim> {
  const claim = await db
    .prepare(
      `INSERT INTO mutation (key, scope, response_json, created_at)
       VALUES (?, ?, ?, ?) ON CONFLICT (key) DO NOTHING`,
    )
    .bind(key, scope, IN_FLIGHT, new Date().toISOString())
    .run();
  if (claim.meta.changes > 0) return { kind: "claimed" };

  const row = await db
    .prepare(
      "SELECT scope, response_json AS responseJson FROM mutation WHERE key = ?",
    )
    .bind(key)
    .first<{ scope: string; responseJson: string }>();
  // Gone between the two statements: its request failed and let it go.
  if (!row) return { kind: "error", error: "idempotency_key_in_progress" };
  if (row.scope !== scope)
    return { kind: "error", error: "idempotency_key_reused" };
  if (row.responseJson === IN_FLIGHT)
    return { kind: "error", error: "idempotency_key_in_progress" };
  return {
    kind: "replay",
    stored: JSON.parse(row.responseJson) as StoredResponse,
  };
}

/** Stores a successful result for every later retry with the same key. */
export async function storeIdempotentResponse(
  db: D1Database,
  key: string,
  scope: string,
  stored: StoredResponse,
): Promise<void> {
  await db
    .prepare(
      "UPDATE mutation SET response_json = ? WHERE key = ? AND scope = ?",
    )
    .bind(JSON.stringify(stored), key, scope)
    .run();
}

/** Lets a failed request's key go, so its retry runs again. */
export async function releaseIdempotencyKey(
  db: D1Database,
  key: string,
  scope: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM mutation WHERE key = ? AND scope = ?")
    .bind(key, scope)
    .run();
}

const fail = (error: IdempotencyError["error"]): IdempotencyError => ({
  error,
});

const STATUS: Record<IdempotencyError["error"], 400 | 409 | 422> = {
  idempotency_key_invalid: 400,
  idempotency_key_in_progress: 409,
  idempotency_key_reused: 422,
};

function replay(stored: StoredResponse): Response {
  const headers = new Headers({ [IDEMPOTENT_REPLAY_HEADER]: "true" });
  if (stored.contentType) headers.set("Content-Type", stored.contentType);
  const empty = stored.status === 204 || stored.body === "";
  return new Response(empty ? null : stored.body, {
    status: stored.status,
    headers,
  });
}

/**
 * The /api side: claims the key before the route runs. A 2xx response is
 * stored and replayed to every retry (status, content type and body; not
 * cookies, so routes return what a client needs in the body). Anything else
 * releases the claim, so the retry runs again.
 *
 * No header: the route just runs. `scope` names the route, e.g.
 * "POST /api/auth/passphrase"; the same key under another scope is a 422.
 */
export function idempotent(scope: string) {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const key = c.req.header(IDEMPOTENCY_KEY_HEADER);
    if (key === undefined) return next();
    if (key.length === 0 || key.length > IDEMPOTENCY_KEY_MAX_LENGTH)
      return c.json(fail("idempotency_key_invalid"), 400);

    const db = database(c.env);
    const claim = await claimIdempotencyKey(db, key, scope);
    if (claim.kind === "error")
      return c.json(fail(claim.error), STATUS[claim.error]);
    if (claim.kind === "replay") return replay(claim.stored);

    try {
      await next();
    } catch (error) {
      await releaseIdempotencyKey(db, key, scope);
      throw error;
    }

    // Hono turns a thrown route error into c.error plus an error response.
    if (c.error || !c.res.ok) {
      await releaseIdempotencyKey(db, key, scope);
      return;
    }
    await storeIdempotentResponse(db, key, scope, {
      status: c.res.status,
      contentType: c.res.headers.get("Content-Type"),
      body: await c.res.clone().text(),
    });
  });
}
