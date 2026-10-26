// Study Lab: mounts at /api/study (backlog and content routes) and owns the
// Study contract, which Career builds per request with its own D1.
import type { StudyContract } from "@projects-lab/shared";
import { Hono } from "hono";
import { database } from "../../core/db";
import type { ApiLab, LabEnv } from "../../core/lab";
import { contentRoutes } from "./content";
import { studyContract } from "./contract";
import { removeDeletedExamFiles } from "./exam-delete";
import { backlogRoutes } from "./routes";
import { studyTools } from "./tools";

export function studyLab(): ApiLab & {
  contract: (db: D1Database) => StudyContract;
} {
  const routes = new Hono<LabEnv>();
  routes.route("/", backlogRoutes());
  routes.route("/", contentRoutes());

  return {
    id: "study",
    routes,
    tools: studyTools,
    contract: studyContract,
    // Deleted exams' files leave study-materials (ST-14). A removal that
    // failed is thrown so the run shows it; the exam is tried again tomorrow.
    async scheduled(env, nowMs) {
      const result = await removeDeletedExamFiles(env, database(env), nowMs);
      if (result.failed.length > 0)
        throw new Error(
          `Deleted exams' files not removed: ${JSON.stringify(result.failed)}`,
        );
      return result;
    },
  };
}
