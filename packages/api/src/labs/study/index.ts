// Study Lab (stub until Phase 2): mounts at /api/study and owns StudyContract.
import type { LabSummary, StudyContract } from "@projects-lab/shared";
import { Hono } from "hono";
import type { ApiLab, LabEnv } from "../../core/lab";
import { contentRoutes } from "./content";

const NOT_YET = "StudyContract arrives with Study Lab (Phase 2).";

export function studyLab(): ApiLab & { contract: StudyContract } {
  const routes = new Hono<LabEnv>();
  // No data yet: Home shows Study's empty card.
  routes.get("/summary", (c) => c.json<LabSummary | null>(null));
  routes.route("/", contentRoutes());

  return {
    id: "study",
    routes,
    tools: [],
    contract: {
      ensureTopics: () => Promise.reject(new Error(NOT_YET)),
      skillStatus: () => Promise.reject(new Error(NOT_YET)),
    },
  };
}
