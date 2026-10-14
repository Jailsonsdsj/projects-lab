import { Hono } from "hono";
import { authRoutes } from "./core/auth/routes";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/auth", authRoutes());

app.notFound((c) => c.json({ error: "not_found" }, 404));

// Misconfiguration (a missing secret or binding) lands here with a message that
// names the fix; it goes to the logs, never to the client.
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal" }, 500);
});

export default app;
