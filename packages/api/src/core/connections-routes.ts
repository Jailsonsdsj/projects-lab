// /api/connections (F-16): the owner's Claude connections, and Revoke.
import type { Connection } from "@projects-lab/shared";
import { Hono } from "hono";
import { type AuthVariables, requireAuth } from "./auth/require-auth";
import { listConnections, revokeConnection } from "./connections";
import { database } from "./db";
import { idempotent } from "./idempotency";

export function connectionsRoutes() {
  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

  app.get("/", requireAuth, async (c) => {
    const connections: Connection[] = await listConnections(
      c.env.OAUTH_PROVIDER,
      database(c.env),
      c.get("userId"),
    );
    return c.json({ connections });
  });

  app.delete(
    "/:grantId",
    requireAuth,
    idempotent("DELETE /api/connections/:grantId"),
    async (c) => {
      const revoked = await revokeConnection(
        c.env.OAUTH_PROVIDER,
        c.req.param("grantId"),
        c.get("userId"),
      );
      if (!revoked) return c.json({ error: "not_found" }, 404);
      return c.body(null, 204);
    },
  );

  return app;
}
