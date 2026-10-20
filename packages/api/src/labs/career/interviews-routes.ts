// /api/career interview routes (docs/prd/24-career-interviews.md): stories,
// answers with their Drive videos, and the drill log. Mounted behind
// requireAuth by mountLabs; every mutation takes an Idempotency-Key.
import {
  listAnswersInputSchema,
  listDrillsInputSchema,
  logDrillInputSchema,
  saveAnswerInputSchema,
  saveStoryInputSchema,
} from "@projects-lab/shared/career";
import { Hono } from "hono";
import { database } from "../../core/db";
import { idempotent } from "../../core/idempotency";
import type { LabEnv } from "../../core/lab";
import { invalid, refused, write } from "./http";
import {
  listAnswers,
  listDrills,
  listStories,
  logDrill,
  saveAnswer,
  saveStory,
} from "./interviews";

export function interviewRoutes() {
  const app = new Hono<LabEnv>();

  app.get("/stories", async (c) =>
    c.json({ stories: await listStories(database(c.env)) }),
  );
  app.post(
    "/stories",
    idempotent("POST /api/career/stories"),
    write(saveStoryInputSchema, saveStory, (story) => ({ story })),
  );

  app.get("/answers", async (c) => {
    const general = c.req.query("general");
    const parsed = listAnswersInputSchema.safeParse({
      jobId: c.req.query("jobId"),
      general: general === undefined ? undefined : general === "true",
    });
    if (!parsed.success) return invalid(c, parsed.error);
    try {
      return c.json(await listAnswers(database(c.env), parsed.data));
    } catch (error) {
      return refused(c, error);
    }
  });
  app.post(
    "/answers",
    idempotent("POST /api/career/answers"),
    write(saveAnswerInputSchema, saveAnswer, (answer) => ({ answer })),
  );

  app.get("/drills", async (c) => {
    const limit = c.req.query("limit");
    const parsed = listDrillsInputSchema.safeParse({
      limit: limit === undefined ? undefined : Number(limit),
    });
    if (!parsed.success) return invalid(c, parsed.error);
    return c.json({ drills: await listDrills(database(c.env), parsed.data) });
  });
  app.post(
    "/drills",
    idempotent("POST /api/career/drills"),
    write(logDrillInputSchema, logDrill, (drill) => ({ drill })),
  );

  return app;
}
