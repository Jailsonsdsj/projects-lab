// /api/auth (docs/prd/01-identity-and-access.md). The passphrase never reaches
// the Worker: the browser sends authKey = PBKDF2(passphrase), the Worker hashes it.
import {
  type AuthError,
  changePassphraseRequestSchema,
  hashAuthKey,
  type LoginResponse,
  loginRequestSchema,
  type SaltResponse,
} from "@projects-lab/shared";
import { type Context, Hono } from "hono";
import { database } from "../db";
import { idempotent } from "../idempotency";
import { constantTimeEqual, hmacBase64 } from "./crypto";
import { getOwner } from "./owner";
import { recordAuthAttempt } from "./rate-limit";
import { type AuthVariables, requireAuth } from "./require-auth";
import { clearSession, issueSession, signingKey } from "./session";

const fail = (error: AuthError["error"]): AuthError => ({ error });

/**
 * Counts this attempt against the caller's hashed IP (login and passphrase
 * change share the bucket) and returns the 429 when it's over the limit.
 */
export async function overRateLimit(
  c: Context,
  db: D1Database,
  key: string,
  nowSeconds: number,
): Promise<Response | null> {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const attempt = await recordAuthAttempt(
    db,
    await hmacBase64(key, ip),
    nowSeconds,
  );
  if (attempt.allowed) return null;
  c.header("Retry-After", String(attempt.retryAfter));
  return c.json(fail("too_many_attempts"), 429);
}

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
  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

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

    const limited = await overRateLimit(c, db, key, nowSeconds);
    if (limited) return limited;

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

  /**
   * Change passphrase (F-11). Idempotency runs BEFORE requireAuth: a success
   * ends every session, the caller's included, so a retry after a lost
   * response carries a dead JWT and must still get the stored answer (the new
   * session). The key is a client UUID only ever sent over TLS with a live
   * session, pruned after 7 days (F-19): holding it is holding a bearer secret.
   */
  app.post(
    "/passphrase",
    idempotent("POST /api/auth/passphrase"),
    requireAuth,
    async (c) => {
      const key = signingKey(c.env);
      const db = database(c.env);
      const nowSeconds = Math.floor(clock() / 1000);

      const limited = await overRateLimit(c, db, key, nowSeconds);
      if (limited) return limited;

      const parsed = changePassphraseRequestSchema.safeParse(
        await c.req.json().catch(() => null),
      );
      if (!parsed.success) return c.json(fail("bad_request"), 400);
      const change = parsed.data;

      const userId = c.get("userId");
      const user = await db
        .prepare("SELECT auth_key_hash AS authKeyHash FROM user WHERE id = ?")
        .bind(userId)
        .first<{ authKeyHash: string }>();
      const ok = await verifyAuthKey(
        change.currentAuthKey,
        user?.authKeyHash ?? null,
      );
      if (!user || !ok) return c.json(fail("invalid_passphrase"), 401);

      // One statement: new credential, and every session (this one too) ends.
      // `AND auth_key_hash = ?` makes a concurrent change lose cleanly.
      const changed = await db
        .prepare(
          `UPDATE user SET auth_key_hash = ?, kdf_salt = ?, kdf_iterations = ?,
             session_version = session_version + 1
           WHERE id = ? AND auth_key_hash = ?
           RETURNING session_version AS sessionVersion`,
        )
        .bind(
          await hashAuthKey(change.newAuthKey),
          change.newSalt,
          change.newIterations,
          userId,
          user.authKeyHash,
        )
        .first<{ sessionVersion: number }>();
      if (!changed) return c.json(fail("invalid_passphrase"), 401);

      const body: LoginResponse = {
        token: await issueSession(
          c,
          key,
          { id: userId, sessionVersion: changed.sessionVersion },
          nowSeconds,
        ),
      };
      return c.json(body);
    },
  );

  // Ends this device's session only; see the spec for logout everywhere.
  app.post("/logout", (c) => {
    clearSession(c);
    return c.body(null, 204);
  });

  return app;
}
