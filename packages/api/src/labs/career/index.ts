// Career Lab: mounts at /api/career (profile and photo routes so far). Reaches
// Study Lab only through the StudyContract factory it's given at mount time.
import type { LabSummary, StudyContract } from "@projects-lab/shared";
import { Hono } from "hono";
import type { ApiLab, LabEnv } from "../../core/lab";
import { photoRoutes } from "./photo";
import { profileRoutes } from "./routes";
import { careerTools } from "./tools";

export function careerLab(_deps: {
  /** Built per request with that request's D1. */
  study: (db: D1Database) => StudyContract;
}): ApiLab {
  const routes = new Hono<LabEnv>();
  // No data yet: Home shows Career's empty card.
  routes.get("/summary", (c) => c.json<LabSummary | null>(null));
  routes.route("/", profileRoutes());
  routes.route("/", photoRoutes());

  return { id: "career", routes, tools: careerTools };
}
