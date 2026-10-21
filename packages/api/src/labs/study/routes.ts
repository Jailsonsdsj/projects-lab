// /api/study backlog routes (docs/prd/10-study-backlog.md). Mounted behind
// requireAuth by mountLabs; every mutation takes an Idempotency-Key. Inputs are
// @projects-lab/shared/study's schemas, the same the study_* tools use.
import {
  addAreaInputSchema,
  addTopicsInputSchema,
  examSettingsSchema,
  listBacklogInputSchema,
  listCoursesInputSchema,
  listExamsInputSchema,
  recordCourseInputSchema,
  recordExamInputSchema,
  recordGradeInputSchema,
  topicCodeSchema,
  updateTopicInputSchema,
} from "@projects-lab/shared/study";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import { AI_ERROR_STATUS, AiError } from "../../core/ai";
import { database } from "../../core/db";
import { GitHubError } from "../../core/github";
import { idempotent } from "../../core/idempotency";
import { type LabEnv, ToolError } from "../../core/lab";
import {
  addArea,
  addTopics,
  getBacklogSummary,
  getHomeSummary,
  listBacklog,
  ownerTimeZone,
  removeTopic,
  updateTopic,
} from "./backlog";
import { generateExam } from "./exam-app";
import {
  courseToRead,
  examToRead,
  listCourses,
  listExams,
  recordCourse,
  recordExam,
  recordGrade,
} from "./records";

const STATUS = {
  bad_request: 400,
  not_found: 404,
  conflict: 409,
  github_token_invalid: 502,
  github_rate_limited: 503,
} as const;

function invalid(c: Context, error: z.ZodError) {
  const issue = error.issues[0];
  const where = issue?.path.join(".");
  return c.json(
    {
      error: "bad_request",
      message: where ? `${where}: ${issue?.message}` : issue?.message,
    },
    400,
  );
}

/** A refused service call becomes PRD 02's { error, message } with its status. */
function refused(c: Context, error: unknown) {
  if (error instanceof ToolError)
    return c.json(
      { error: error.code, message: error.message },
      STATUS[error.code],
    );
  throw error;
}

/** An AI or GitHub failure, or a refused service call, as { error, message } (PRD 02). */
function serviceFailed(c: Context, error: unknown) {
  if (error instanceof AiError || error instanceof GitHubError) {
    if (error.retryAfter) c.header("Retry-After", String(error.retryAfter));
    const status =
      error instanceof AiError
        ? AI_ERROR_STATUS[error.code]
        : (
            {
              github_token_invalid: 502,
              github_rate_limited: 503,
              not_found: 404,
              github_conflict: 409,
            } as const
          )[error.code];
    return c.json({ error: error.code, message: error.message }, status);
  }
  return refused(c, error);
}

async function body(c: Context): Promise<unknown> {
  return c.req.json().catch(() => null);
}

export function backlogRoutes() {
  const app = new Hono<LabEnv>();
  const zone = (c: Context<LabEnv>) =>
    ownerTimeZone(database(c.env), c.get("userId"));

  // Home's Study card (00-platform); null while the backlog is empty.
  app.get("/summary", async (c) =>
    c.json(await getHomeSummary(database(c.env), await zone(c))),
  );

  app.get("/backlog", async (c) => {
    const parsed = listBacklogInputSchema.safeParse({
      area: c.req.query("area"),
      status: c.req.query("status"),
    });
    if (!parsed.success) return invalid(c, parsed.error);
    return c.json(
      await listBacklog(database(c.env), await zone(c), parsed.data),
    );
  });

  app.get("/backlog/summary", async (c) =>
    c.json(await getBacklogSummary(database(c.env), await zone(c))),
  );

  app.post("/topics", idempotent("POST /api/study/topics"), async (c) => {
    const parsed = addTopicsInputSchema.safeParse(await body(c));
    if (!parsed.success) return invalid(c, parsed.error);
    try {
      const topics = await addTopics(
        database(c.env),
        parsed.data.topics,
        new Date(),
        await zone(c),
      );
      return c.json({ topics });
    } catch (error) {
      return refused(c, error);
    }
  });

  app.patch(
    "/topics/:code",
    idempotent("PATCH /api/study/topics/:code"),
    async (c) => {
      const raw = await body(c);
      const parsed = updateTopicInputSchema.safeParse({
        ...(raw && typeof raw === "object" ? raw : {}),
        topicId: c.req.param("code"),
      });
      if (!parsed.success) return invalid(c, parsed.error);
      const { topicId, ...changes } = parsed.data;
      try {
        const topic = await updateTopic(
          database(c.env),
          topicId,
          changes,
          new Date(),
          await zone(c),
        );
        return c.json({ topic });
      } catch (error) {
        return refused(c, error);
      }
    },
  );

  app.delete(
    "/topics/:code",
    idempotent("DELETE /api/study/topics/:code"),
    async (c) => {
      const parsed = topicCodeSchema.safeParse(c.req.param("code"));
      if (!parsed.success) return invalid(c, parsed.error);
      try {
        await removeTopic(database(c.env), parsed.data, new Date());
        return c.body(null, 204);
      } catch (error) {
        return refused(c, error);
      }
    },
  );

  app.post("/areas", idempotent("POST /api/study/areas"), async (c) => {
    const parsed = addAreaInputSchema.safeParse(await body(c));
    if (!parsed.success) return invalid(c, parsed.error);
    try {
      return c.json({
        area: await addArea(database(c.env), parsed.data, new Date()),
      });
    } catch (error) {
      return refused(c, error);
    }
  });

  // --- Courses and exams (PRDs 11, 12): recorded after Claude pushes the files.

  app.post("/courses", idempotent("POST /api/study/courses"), async (c) => {
    const parsed = recordCourseInputSchema.safeParse(await body(c));
    if (!parsed.success) return invalid(c, parsed.error);
    try {
      return c.json(
        await recordCourse(
          c.env,
          database(c.env),
          parsed.data,
          new Date(),
          await zone(c),
        ),
      );
    } catch (error) {
      return refused(c, error);
    }
  });

  app.get("/courses", async (c) => {
    const parsed = listCoursesInputSchema.safeParse({
      topicId: c.req.query("topicId"),
    });
    if (!parsed.success) return invalid(c, parsed.error);
    return c.json(await listCourses(database(c.env), parsed.data.topicId));
  });

  // The reader (PRD 11): the course and its file's blob SHA; the content itself
  // comes from /content/<sha>/<name>, immutable and cached for offline.
  app.get("/courses/:courseId", async (c) => {
    try {
      return c.json(
        await courseToRead(c.env, database(c.env), c.req.param("courseId")),
      );
    } catch (error) {
      return refused(c, error);
    }
  });

  // Exams in the app (ST-13c; PRD 12 § Exams in the app): the Worker writes
  // one through the Anthropic API, commits its file and records it.
  app.post(
    "/courses/:courseId/exams",
    idempotent("POST /api/study/courses/:courseId/exams"),
    async (c) => {
      const parsed = examSettingsSchema.safeParse(await body(c));
      if (!parsed.success) return invalid(c, parsed.error);
      try {
        return c.json(
          await generateExam(
            c.env,
            database(c.env),
            c.req.param("courseId"),
            parsed.data,
            new Date(),
          ),
        );
      } catch (error) {
        return serviceFailed(c, error);
      }
    },
  );

  app.post("/exams", idempotent("POST /api/study/exams"), async (c) => {
    const parsed = recordExamInputSchema.safeParse(await body(c));
    if (!parsed.success) return invalid(c, parsed.error);
    try {
      return c.json(
        await recordExam(c.env, database(c.env), parsed.data, new Date()),
      );
    } catch (error) {
      return refused(c, error);
    }
  });

  app.get("/exams", async (c) => {
    const parsed = listExamsInputSchema.safeParse({
      topicId: c.req.query("topicId"),
    });
    if (!parsed.success) return invalid(c, parsed.error);
    return c.json(await listExams(database(c.env), parsed.data.topicId));
  });

  // An exam to read (PRD 12): both files' blob SHAs, for /content.
  app.get("/exams/:examId", async (c) => {
    try {
      return c.json(
        await examToRead(c.env, database(c.env), c.req.param("examId")),
      );
    } catch (error) {
      return refused(c, error);
    }
  });

  app.post("/grades", idempotent("POST /api/study/grades"), async (c) => {
    const parsed = recordGradeInputSchema.safeParse(await body(c));
    if (!parsed.success) return invalid(c, parsed.error);
    try {
      return c.json(
        await recordGrade(
          database(c.env),
          parsed.data,
          new Date(),
          await zone(c),
        ),
      );
    } catch (error) {
      return refused(c, error);
    }
  });

  return app;
}
