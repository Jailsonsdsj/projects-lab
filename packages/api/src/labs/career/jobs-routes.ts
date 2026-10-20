// /api/career job routes (docs/prd/21-career-jobs-and-skills.md) and Home's
// Career card. Mounted behind requireAuth by mountLabs; every mutation takes an
// Idempotency-Key. Inputs are the same shared schemas the career_* tools use.
import {
  addJobInputSchema,
  getJobInputSchema,
  listJobsInputSchema,
  removeJobInputSchema,
  sendGapsInputSchema,
  updateJobInputSchema,
  updateRequirementInputSchema,
} from "@projects-lab/shared/career";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import { database } from "../../core/db";
import { idempotent } from "../../core/idempotency";
import type { LabEnv } from "../../core/lab";
import { body, invalid, refused, write } from "./http";
import {
  addJob,
  getHomeSummary,
  getJob,
  listJobs,
  removeJob,
  type Study,
  sendGaps,
  updateJob,
  updateRequirement,
} from "./jobs";

/** The JSON body with a path parameter merged in, validated, then run. */
function withParam<S extends z.ZodType, R>(
  schema: S,
  param: string,
  field: string,
  run: (db: D1Database, input: z.infer<S>, now: Date) => Promise<R>,
  respond: (result: R) => unknown,
) {
  return async (c: Context<LabEnv>) => {
    const raw = await body(c);
    const parsed = schema.safeParse({
      ...(raw && typeof raw === "object" ? raw : {}),
      [field]: c.req.param(param),
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

export function jobRoutes(study: Study) {
  const app = new Hono<LabEnv>();

  // Home's Career card (00-platform); null with no jobs.
  app.get("/summary", async (c) =>
    c.json(await getHomeSummary(database(c.env), study)),
  );

  app.get("/jobs", async (c) => {
    const parsed = listJobsInputSchema.safeParse({
      status: c.req.query("status"),
    });
    if (!parsed.success) return invalid(c, parsed.error);
    return c.json({
      jobs: await listJobs(database(c.env), study, parsed.data),
    });
  });

  app.get("/jobs/:id", async (c) => {
    const parsed = getJobInputSchema.safeParse({ jobId: c.req.param("id") });
    if (!parsed.success) return invalid(c, parsed.error);
    try {
      return c.json({
        job: await getJob(database(c.env), study, parsed.data.jobId),
      });
    } catch (error) {
      return refused(c, error);
    }
  });

  app.post(
    "/jobs",
    idempotent("POST /api/career/jobs"),
    write(
      addJobInputSchema,
      (db, input, now) => addJob(db, study, input, now),
      (job) => ({ job }),
    ),
  );

  app.patch(
    "/jobs/:id",
    idempotent("PATCH /api/career/jobs/:id"),
    withParam(
      updateJobInputSchema,
      "id",
      "jobId",
      (db, input, now) => updateJob(db, study, input, now),
      (job) => ({ job }),
    ),
  );

  app.delete(
    "/jobs/:id",
    idempotent("DELETE /api/career/jobs/:id"),
    async (c) => {
      const parsed = removeJobInputSchema.safeParse({
        jobId: c.req.param("id"),
      });
      if (!parsed.success) return invalid(c, parsed.error);
      try {
        await removeJob(database(c.env), parsed.data.jobId, new Date());
        return c.body(null, 204);
      } catch (error) {
        return refused(c, error);
      }
    },
  );

  app.patch(
    "/requirements/:id",
    idempotent("PATCH /api/career/requirements/:id"),
    withParam(
      updateRequirementInputSchema,
      "id",
      "requirementId",
      (db, input, now) => updateRequirement(db, study, input, now),
      (job) => ({ job }),
    ),
  );

  app.post(
    "/jobs/:id/gaps",
    idempotent("POST /api/career/jobs/:id/gaps"),
    withParam(
      sendGapsInputSchema,
      "id",
      "jobId",
      (db, input) => sendGaps(db, study, input),
      (gaps) => ({ gaps }),
    ),
  );

  return app;
}
