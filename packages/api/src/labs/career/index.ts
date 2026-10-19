// Career Lab (stub until Phase 3): mounts at /api/career. Reaches Study Lab
// only through the StudyContract factory it's given at mount time.
import type { LabSummary, StudyContract } from "@projects-lab/shared";
import { Hono } from "hono";
import type { ApiLab, LabEnv } from "../../core/lab";

export function careerLab(_deps: {
  /** Built per request with that request's D1. */
  study: (db: D1Database) => StudyContract;
}): ApiLab {
  const routes = new Hono<LabEnv>();
  // No data yet: Home shows Career's empty card.
  routes.get("/summary", (c) => c.json<LabSummary | null>(null));

  return { id: "career", routes, tools: [] };
}
