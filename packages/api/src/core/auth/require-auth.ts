import type { AuthError } from "@projects-lab/shared";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { database } from "../db";
import { getSessionVersion } from "./owner";
import { readSession, SESSION_COOKIE, signingKey } from "./session";

export type AuthVariables = { userId: string };

const unauthorized: AuthError = { error: "unauthorized" };

/**
 * Gates /api routes with a session JWT, from `Authorization: Bearer` or the
 * `pl_session` cookie. A token whose `sv` no longer matches the user is dead.
 */
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  // Outside any try: a missing key must surface as its own error, not a 401.
  const key = signingKey(c.env);

  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : getCookie(c, SESSION_COOKIE);
  if (!token) return c.json(unauthorized, 401);

  const claims = await readSession(token, key);
  if (!claims) return c.json(unauthorized, 401);

  const current = await getSessionVersion(database(c.env), claims.sub);
  if (current === null || current !== claims.sv)
    return c.json(unauthorized, 401);

  c.set("userId", claims.sub);
  await next();
});
