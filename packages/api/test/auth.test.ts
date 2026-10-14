// /api/auth and requireAuth with an owner (docs/prd/01-identity-and-access.md).
// Storage is shared by the tests in this file, so each rate-limit test uses its
// own IP. The owner uses 1 KDF iteration: login reads the stored count.

import { env } from "cloudflare:workers";
import { deriveAuthKey, generateSalt, hashAuthKey } from "@projects-lab/shared";
import { sign } from "hono/jwt";
import { beforeAll, describe, expect, it } from "vitest";
import {
  AUTH_ATTEMPT_LIMIT,
  AUTH_WINDOW_SECONDS,
} from "../src/core/auth/rate-limit";
import { readSession, signingKey } from "../src/core/auth/session";
import app from "../src/index";
import { loginRequest, testApp } from "./auth-app";
import { db } from "./db";

const PASSPHRASE = "a test passphrase";
let authKey: string;

beforeAll(async () => {
  const salt = generateSalt();
  authKey = await deriveAuthKey(PASSPHRASE, salt, 1);
  await db()
    .prepare(
      `INSERT INTO user (id, auth_key_hash, kdf_salt, kdf_iterations, timezone, created_at)
       VALUES ('owner', ?, ?, 1, 'UTC', '2026-01-01T00:00:00.000Z')`,
    )
    .bind(await hashAuthKey(authKey), salt)
    .run();
});

async function login(ip: string, key: unknown = authKey) {
  const { app, clock } = testApp();
  const res = await app.request("/api/auth/login", loginRequest(key, ip), env);
  return { res, app, clock };
}

describe("GET /api/auth/salt", () => {
  it("returns the owner's stored salt and iterations", async () => {
    const res = await testApp().app.request("/api/auth/salt", {}, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ salt: string; iterations: number }>();
    expect(body.iterations).toBe(1);
    expect(body.salt).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe("POST /api/auth/login", () => {
  it("issues a session for the right key: body token and HttpOnly cookie", async () => {
    const { res } = await login("198.51.100.1");
    expect(res.status).toBe(200);
    const { token } = await res.json<{ token: string }>();
    const claims = await readSession(token, signingKey(env));
    expect(claims).toMatchObject({ sub: "owner", sv: 0 });
    const cookie = res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain(`pl_session=${token}`);
    for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/"]) {
      expect(cookie).toContain(flag);
    }
  });

  it("rejects a wrong key with 401 invalid_passphrase and no cookie", async () => {
    const wrong = await deriveAuthKey("not the passphrase", generateSalt(), 1);
    const { res } = await login("198.51.100.2", wrong);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_passphrase" });
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("rejects a key that isn't base64 with the same 401", async () => {
    const { res } = await login("198.51.100.3", "not base64 !!");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_passphrase" });
  });

  it("rejects a malformed body with 400", async () => {
    const { res } = await login("198.51.100.4", 42);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });
});

describe("rate limit", () => {
  it("answers the 11th attempt in a window with 429, then resets when the window ends", async () => {
    const { app, clock } = testApp();
    const ip = "203.0.113.7";
    const wrong = await deriveAuthKey("wrong", generateSalt(), 1);
    for (let i = 0; i < AUTH_ATTEMPT_LIMIT; i++) {
      const res = await app.request(
        "/api/auth/login",
        loginRequest(wrong, ip),
        env,
      );
      expect(res.status).toBe(401);
    }

    const blocked = await app.request(
      "/api/auth/login",
      loginRequest(authKey, ip),
      env,
    );
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "too_many_attempts" });
    const retryAfter = Number(blocked.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(AUTH_WINDOW_SECONDS);

    // Another IP is unaffected.
    const other = await app.request(
      "/api/auth/login",
      loginRequest(authKey, "203.0.113.8"),
      env,
    );
    expect(other.status).toBe(200);

    clock.now += retryAfter * 1000;
    const nextWindow = await app.request(
      "/api/auth/login",
      loginRequest(authKey, ip),
      env,
    );
    expect(nextWindow.status).toBe(200);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the cookie and returns 204", async () => {
    const res = await testApp().app.request(
      "/api/auth/logout",
      { method: "POST" },
      env,
    );
    expect(res.status).toBe(204);
    const cookie = res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("pl_session=;");
    expect(cookie).toContain("Max-Age=0");
  });
});

describe("requireAuth", () => {
  async function token(ip: string) {
    const { res } = await login(ip);
    return (await res.json<{ token: string }>()).token;
  }
  const me = (init: RequestInit = {}) =>
    testApp().app.request("/api/me", init, env);

  it("accepts the session as a Bearer token", async () => {
    const t = await token("192.0.2.1");
    const res = await me({ headers: { Authorization: `Bearer ${t}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "owner" });
  });

  it("accepts the session cookie", async () => {
    const t = await token("192.0.2.2");
    const res = await me({ headers: { Cookie: `pl_session=${t}` } });
    expect(res.status).toBe(200);
  });

  it.each([
    ["no token", {}],
    ["a tampered token", { Authorization: "Bearer abc.def.ghi" }],
  ])("rejects %s with 401", async (_, headers) => {
    const res = await me({ headers });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects an expired token with 401", async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    const expired = await sign(
      { sub: "owner", sv: 0, iat: past - 60, exp: past },
      signingKey(env),
      "HS256",
    );
    const res = await me({ headers: { Authorization: `Bearer ${expired}` } });
    expect(res.status).toBe(401);
  });

  it("rejects a token with a stale sv after session_version is bumped", async () => {
    const before = await token("192.0.2.3");
    await db()
      .prepare("UPDATE user SET session_version = 1 WHERE id = 'owner'")
      .run();
    try {
      const stale = await me({
        headers: { Authorization: `Bearer ${before}` },
      });
      expect(stale.status).toBe(401);
      const fresh = await token("192.0.2.4");
      expect((await readSession(fresh, signingKey(env)))?.sv).toBe(1);
      const ok = await me({ headers: { Authorization: `Bearer ${fresh}` } });
      expect(ok.status).toBe(200);
    } finally {
      await db()
        .prepare("UPDATE user SET session_version = 0 WHERE id = 'owner'")
        .run();
    }
  });
});

describe("unset TOKEN_SIGNING_KEY", () => {
  const noKey = { ...env, TOKEN_SIGNING_KEY: undefined };

  it("throws an error that names the variable and the fix", () => {
    expect(() => signingKey(noKey)).toThrow(
      /TOKEN_SIGNING_KEY is not set.*\.dev\.vars/,
    );
  });

  it("fails login with 500, not 401", async () => {
    const res = await app.request(
      "/api/auth/login",
      loginRequest(authKey, "192.0.2.9"),
      noKey,
    );
    expect(res.status).toBe(500);
  });

  it("fails a protected route with 500, not 401", async () => {
    const { app: withMe } = testApp();
    withMe.onError((_, c) => c.json({ error: "internal" }, 500));
    const res = await withMe.request(
      "/api/me",
      { headers: { Authorization: "Bearer x" } },
      noKey,
    );
    expect(res.status).toBe(500);
  });
});
