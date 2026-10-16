// PUT /api/uploads/:token (F-18): the one /api route without a session. The
// signed URL is the credential (PRD 02): `curl` in a Claude session has
// neither the session JWT nor an OAuth token.
import { Hono } from "hono";
import { database } from "./db";
import { acceptUpload } from "./uploads";

/** `clock` is injectable so tests can move past the 10 minutes. */
export function uploadsRoutes(clock: () => number = Date.now) {
  const app = new Hono<{ Bindings: Env }>();

  app.put("/:token", async (c) => {
    const result = await acceptUpload(
      c.env,
      database(c.env),
      c.req.param("token"),
      c.req.raw,
      clock(),
    );
    if (!result.ok)
      return c.json(
        { error: result.error, message: result.message },
        result.status,
      );
    return c.body(null, 204);
  });

  return app;
}
