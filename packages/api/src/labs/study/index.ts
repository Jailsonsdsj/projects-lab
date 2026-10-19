// Study Lab: mounts at /api/study (backlog and content routes) and owns the
// Study contract, which Career builds per request with its own D1.
import type { StudyContract } from "@projects-lab/shared";
import { Hono } from "hono";
import type { ApiLab, LabEnv } from "../../core/lab";
import { contentRoutes } from "./content";
import { studyContract } from "./contract";
import { backlogRoutes } from "./routes";
import { studyTools } from "./tools";

export function studyLab(): ApiLab & {
  contract: (db: D1Database) => StudyContract;
} {
  const routes = new Hono<LabEnv>();
  routes.route("/", backlogRoutes());
  routes.route("/", contentRoutes());

  return { id: "study", routes, tools: studyTools, contract: studyContract };
}
