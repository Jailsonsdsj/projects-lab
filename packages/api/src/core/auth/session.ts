import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";

export const SESSION_COOKIE = "pl_session";
export const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "Strict",
  path: "/",
} as const;

export type SessionClaims = {
  sub: string;
  sv: number;
  iat: number;
  exp: number;
};

/**
 * The key every session is signed with. Call it OUTSIDE any try that maps
 * errors to 401: a Worker without its key is misconfigured, not a failed login,
 * and the message must say how to fix it.
 */
export function signingKey(env: { TOKEN_SIGNING_KEY?: string }): string {
  const key = env.TOKEN_SIGNING_KEY;
  if (!key) {
    throw new Error(
      "TOKEN_SIGNING_KEY is not set. Locally: cp packages/api/.dev.vars.example " +
        "packages/api/.dev.vars and fill it in. In production the owner runs " +
        "`wrangler secret put TOKEN_SIGNING_KEY`.",
    );
  }
  return key;
}

/** Signs a session and sets the cookie; returns the token for the response body. */
export async function issueSession(
  c: Context,
  key: string,
  user: { id: string; sessionVersion: number },
  nowSeconds: number,
): Promise<string> {
  const claims: SessionClaims = {
    sub: user.id,
    sv: user.sessionVersion,
    iat: nowSeconds,
    exp: nowSeconds + SESSION_TTL_SECONDS,
  };
  const token = await sign(claims, key, "HS256");
  setCookie(c, SESSION_COOKIE, token, {
    ...COOKIE_OPTIONS,
    maxAge: SESSION_TTL_SECONDS,
  });
  return token;
}

export function clearSession(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, COOKIE_OPTIONS);
}

/** Verifies signature and expiry; returns null for any invalid token. */
export async function readSession(
  token: string,
  key: string,
): Promise<SessionClaims | null> {
  try {
    const payload = await verify(token, key, "HS256");
    const { sub, sv, iat, exp } = payload;
    if (
      typeof sub !== "string" ||
      typeof sv !== "number" ||
      typeof iat !== "number" ||
      typeof exp !== "number"
    ) {
      return null;
    }
    return { sub, sv, iat, exp };
  } catch {
    return null;
  }
}
