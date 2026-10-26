// /api/career document routes (docs/prd/22-career-documents.md): the brief,
// a job's selection and application kit, and the standard answers. Mounted
// behind requireAuth by mountLabs; every mutation takes an Idempotency-Key.
import {
  documentBriefInputSchema,
  getJobInputSchema,
  saveJobKitInputSchema,
  saveSelectionInputSchema,
  saveStandardAnswersInputSchema,
} from "@projects-lab/shared/career";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import { database } from "../../core/db";
import { idempotent } from "../../core/idempotency";
import type { LabEnv } from "../../core/lab";
import {
  documentBrief,
  getJobKit,
  listStandardAnswers,
  saveJobKit,
  saveSelection,
  saveStandardAnswers,
} from "./documents";
import { body, invalid, refused, write } from "./http";
import type { Study } from "./jobs";

/** The JSON body with the job's id from the path, validated, then run. */
function forJob<S extends z.ZodType, R>(
  schema: S,
  run: (db: D1Database, input: z.infer<S>, now: Date) => Promise<R>,
  respond: (result: R) => unknown,
) {
  return async (c: Context<LabEnv>) => {
    const raw = await body(c);
    const parsed = schema.safeParse({
      ...(raw && typeof raw === "object" ? raw : {}),
      jobId: c.req.param("id"),
    });
    if (!parsed.success) return invalid(c, parsed.error);
    try {
      return c.json(
        respond(await run(database(c.env), parsed.data, new Date())),
      );
    } catch (error) {
      return refused(c, error);
    }
  };
}

export function documentRoutes(study: Study) {
  const app = new Hono<LabEnv>();

  app.get("/jobs/:id/brief", async (c) => {
    const parsed = documentBriefInputSchema.safeParse({
      jobId: c.req.param("id"),
      kind: c.req.query("kind"),
    });
    if (!parsed.success) return invalid(c, parsed.error);
    try {
      return c.json(await documentBrief(database(c.env), study, parsed.data));
    } catch (error) {
      return refused(c, error);
    }
  });

  app.put(
    "/jobs/:id/selection",
    idempotent("PUT /api/career/jobs/:id/selection"),
    forJob(
      saveSelectionInputSchema,
      (db, input) => saveSelection(db, input, new Date()),
      (selection) => ({ selection }),
    ),
  );

  app.get("/jobs/:id/kit", async (c) => {
    const parsed = getJobInputSchema.safeParse({ jobId: c.req.param("id") });
    if (!parsed.success) return invalid(c, parsed.error);
    try {
      return c.json({
        kit: await getJobKit(database(c.env), parsed.data.jobId),
      });
    } catch (error) {
      return refused(c, error);
    }
  });

  app.put(
    "/jobs/:id/kit",
    idempotent("PUT /api/career/jobs/:id/kit"),
    forJob(saveJobKitInputSchema, saveJobKit, (kit) => ({ kit })),
  );

  app.get("/standard-answers", async (c) =>
    c.json({ answers: await listStandardAnswers(database(c.env)) }),
  );

  app.put(
    "/standard-answers",
    idempotent("PUT /api/career/standard-answers"),
    write(
      saveStandardAnswersInputSchema,
      (db, input) => saveStandardAnswers(db, input),
      (answers) => ({ answers }),
    ),
  );

  return app;
}
