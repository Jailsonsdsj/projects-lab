// /api/auth (docs/prd/01-identity-and-access.md). The passphrase never reaches
// the Worker: the browser sends authKey = PBKDF2(passphrase), the Worker hashes it.
import {
  type AuthError,
  hashAuthKey,
  type LoginResponse,
  loginRequestSchema,
  type SaltResponse,
} from "@projects-lab/shared";
import { Hono } from "hono";
import { database } from "../db";
import { constantTimeEqual, hmacBase64 } from "./crypto";
import { getOwner } from "./owner";
import { recordAuthAttempt } from "./rate-limit";
import { clearSession, issueSession, signingKey } from "./session";

const fail = (error: AuthError["error"]): AuthError => ({ error });

/**
 * Hashes and compares even when there is no owner (against an empty hash), so
 * "no owner" and "wrong key" take the same path and return the same 401.
 */
export async function verifyAuthKey(
  authKey: string,
  storedHash: string | null,
): Promise<boolean> {
  let candidate: string;
  try {
    candidate = await hashAuthKey(authKey);
  } catch {
    candidate = ""; // not base64
  }
  const matches = constantTimeEqual(candidate, storedHash ?? "");
  return matches && storedHash !== null;
}

/** `clock` is injectable so tests can move past a rate-limit window. */
export function authRoutes(clock: () => number = Date.now) {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/salt", async (c) => {
    const owner = await getOwner(database(c.env));
    if (!owner) return c.json(fail("not_provisioned"), 404);
    const body: SaltResponse = {
      salt: owner.kdfSalt,
      iterations: owner.kdfIterations,
    };
    return c.json(body);
  });

  app.post("/login", async (c) => {
    // Outside any try: a missing key is misconfiguration, not a failed login.
    const key = signingKey(c.env);
    const db = database(c.env);
    const nowSeconds = Math.floor(clock() / 1000);

    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const attempt = await recordAuthAttempt(
      db,
      await hmacBase64(key, ip),
      nowSeconds,
    );
    if (!attempt.allowed) {
      c.header("Retry-After", String(attempt.retryAfter));
      return c.json(fail("too_many_attempts"), 429);
    }

    const parsed = loginRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json(fail("bad_request"), 400);

    const owner = await getOwner(db);
    const ok = await verifyAuthKey(
      parsed.data.authKey,
      owner?.authKeyHash ?? null,
    );
    if (!owner || !ok) return c.json(fail("invalid_passphrase"), 401);

    const body: LoginResponse = {
      token: await issueSession(c, key, owner, nowSeconds),
    };
    return c.json(body);
  });

  // Ends this device's session only; see the spec for logout everywhere.
  app.post("/logout", (c) => {
    clearSession(c);
    return c.body(null, 204);
  });

  return app;
}
