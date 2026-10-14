import { Hono } from "hono";
import { type AuthVariables, requireAuth } from "../src/core/auth/require-auth";
import { authRoutes } from "../src/core/auth/routes";

/** The auth routes on a movable clock, plus one protected route to test requireAuth. */
export function testApp() {
  const clock = { now: Date.UTC(2026, 9, 14, 12, 0, 0) };
  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
  app.route(
    "/api/auth",
    authRoutes(() => clock.now),
  );
  app.get("/api/me", requireAuth, (c) => c.json({ userId: c.get("userId") }));
  return { app, clock };
}

export function loginRequest(authKey: unknown, ip: string): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify({ authKey }),
  };
}
