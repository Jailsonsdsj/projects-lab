// The composition root: the one place that knows every lab. It builds them,
// injects one lab's contract into another, and mounts them (architecture §4).
import { Hono } from "hono";
import { authRoutes } from "./core/auth/routes";
import { type LabEnv, mountLabs } from "./core/lab";
import { careerLab } from "./labs/career";
import { studyLab } from "./labs/study";

const app = new Hono<LabEnv>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/auth", authRoutes());

const study = studyLab();
const career = careerLab({ study: study.contract });
/** Every lab's MCP tools, for the MCP endpoint (F-15). */
export const labTools = mountLabs(app, [study, career]);

app.notFound((c) => c.json({ error: "not_found" }, 404));

// Misconfiguration (a missing secret or binding) lands here with a message that
// names the fix; it goes to the logs, never to the client.
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal" }, 500);
});

export default app;
