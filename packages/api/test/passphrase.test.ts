// POST /api/auth/passphrase (F-11, docs/prd/01-identity-and-access.md). Each
// test starts from a fresh owner whose passphrase uses 1 KDF iteration; the new
// one uses the real KDF_ITERATIONS, as a browser would send.

import { env } from "cloudflare:workers";
import {
  type ChangePassphraseRequest,
  deriveAuthKey,
  generateSalt,
  hashAuthKey,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAY_HEADER,
  KDF_ITERATIONS,
} from "@projects-lab/shared";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AUTH_ATTEMPT_LIMIT } from "../src/core/auth/rate-limit";
import { readSession, signingKey } from "../src/core/auth/session";
import { loginRequest, testApp } from "./auth-app";
import { db } from "./db";

const OLD = "the old passphrase";
const NEW = "lantern river copper";
let oldSalt: string;
let oldKey: string;
let newSalt: string;
let newKey: string;

beforeAll(async () => {
  newSalt = generateSalt();
  newKey = await deriveAuthKey(NEW, newSalt, KDF_ITERATIONS);
});

beforeEach(async () => {
  oldSalt = generateSalt();
  oldKey = await deriveAuthKey(OLD, oldSalt, 1);
  await db().batch([
    db().prepare("DELETE FROM user"),
    db()
      .prepare(
        `INSERT INTO user (id, auth_key_hash, kdf_salt, kdf_iterations, timezone, created_at)
         VALUES ('owner', ?, ?, 1, 'UTC', '2026-01-01T00:00:00.000Z')`,
      )
      .bind(await hashAuthKey(oldKey), oldSalt),
  ]);
});

let ipCounter = 0;
const freshIp = () => `10.1.0.${++ipCounter}`;

async function signIn(
  app: ReturnType<typeof testApp>["app"],
  key: string,
  ip = freshIp(),
) {
  return app.request("/api/auth/login", loginRequest(key, ip), env);
}

async function sessionToken(app: ReturnType<typeof testApp>["app"]) {
  const res = await signIn(app, oldKey);
  return ((await res.json()) as { token: string }).token;
}

function change(
  token: string | null,
  body: Partial<ChangePassphraseRequest> = {},
  options: { idempotencyKey?: string; ip?: string } = {},
): RequestInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "CF-Connecting-IP": options.ip ?? freshIp(),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.idempotencyKey)
    headers[IDEMPOTENCY_KEY_HEADER] = options.idempotencyKey;
  const request: ChangePassphraseRequest = {
    currentAuthKey: oldKey,
    newAuthKey: newKey,
    newSalt,
    newIterations: KDF_ITERATIONS,
    ...body,
  };
  return { method: "POST", headers, body: JSON.stringify(request) };
}

const owner = () =>
  db()
    .prepare(
      "SELECT auth_key_hash, kdf_salt, kdf_iterations, session_version FROM user",
    )
    .first();

const me = (app: ReturnType<typeof testApp>["app"], token: string) =>
  app.request(
    "/api/me",
    { headers: { Authorization: `Bearer ${token}` } },
    env,
  );

describe("POST /api/auth/passphrase", () => {
  it("swaps the passphrase: the old one and every old session stop working", async () => {
    const { app } = testApp();
    const oldToken = await sessionToken(app);
    const res = await app.request(
      "/api/auth/passphrase",
      change(oldToken),
      env,
    );
    expect(res.status).toBe(200);
    const { token: newToken } = (await res.json()) as { token: string };
    expect(res.headers.get("Set-Cookie")).toMatch(/pl_session=/);

    // The old passphrase is refused; the new one works with the stored cost.
    expect((await signIn(app, oldKey)).status).toBe(401);
    const salt = (await (
      await app.request("/api/auth/salt", {}, env)
    ).json()) as { salt: string; iterations: number };
    expect(salt).toEqual({ salt: newSalt, iterations: KDF_ITERATIONS });
    expect((await signIn(app, newKey)).status).toBe(200);

    // The JWT that made the change is dead; the one it got back is alive.
    expect((await me(app, oldToken)).status).toBe(401);
    expect((await me(app, newToken)).status).toBe(200);
    const claims = await readSession(newToken, signingKey(env));
    expect(claims?.sv).toBe(1);
  });

  it("replays the new session to a retry that carries the now-dead JWT", async () => {
    const { app } = testApp();
    const oldToken = await sessionToken(app);
    const idempotencyKey = crypto.randomUUID();
    const first = await app.request(
      "/api/auth/passphrase",
      change(oldToken, {}, { idempotencyKey }),
      env,
    );
    const retry = await app.request(
      "/api/auth/passphrase",
      change(oldToken, {}, { idempotencyKey }),
      env,
    );
    expect(retry.status).toBe(200);
    expect(retry.headers.get(IDEMPOTENT_REPLAY_HEADER)).toBe("true");
    expect(await retry.json()).toEqual(await first.json());
    expect((await owner())?.session_version).toBe(1); // ran once
  });

  it("changes nothing for a wrong current passphrase, and the session lives on", async () => {
    const { app } = testApp();
    const token = await sessionToken(app);
    const before = await owner();
    const wrong = await deriveAuthKey("not the passphrase", oldSalt, 1);
    const res = await app.request(
      "/api/auth/passphrase",
      change(token, { currentAuthKey: wrong }),
      env,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_passphrase" });
    expect(await owner()).toEqual(before);
    expect((await me(app, token)).status).toBe(200);
  });

  it("refuses a weaker cost or a malformed salt with 400, changing nothing", async () => {
    const { app } = testApp();
    const token = await sessionToken(app);
    const before = await owner();
    for (const body of [
      { newIterations: KDF_ITERATIONS - 1 },
      { newSalt: btoa("short") },
      { newAuthKey: "not base64!" },
    ]) {
      const res = await app.request(
        "/api/auth/passphrase",
        change(token, body),
        env,
      );
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await owner()).toEqual(before);
  });

  it("needs a session", async () => {
    const { app } = testApp();
    const res = await app.request("/api/auth/passphrase", change(null), env);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("counts against the login rate limit (one bucket per IP)", async () => {
    const { app } = testApp();
    const token = await sessionToken(app);
    const ip = freshIp();
    const wrong = await deriveAuthKey("not the passphrase", oldSalt, 1);
    const half = AUTH_ATTEMPT_LIMIT / 2;
    for (let i = 0; i < half; i++) await signIn(app, wrong, ip);
    for (let i = 0; i < half; i++)
      await app.request(
        "/api/auth/passphrase",
        change(token, { currentAuthKey: wrong }, { ip }),
        env,
      );
    const limited = await app.request(
      "/api/auth/passphrase",
      change(token, {}, { ip }),
      env,
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect((await owner())?.session_version).toBe(0);
  });
});
