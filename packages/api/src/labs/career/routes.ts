// /api/career profile routes (docs/prd/20-career-profile.md). Mounted behind
// requireAuth by mountLabs; every mutation takes an Idempotency-Key. Inputs are
// @projects-lab/shared/career's schemas, the same the career_* tools use.
import {
  declareSkillInputSchema,
  removeItemInputSchema,
  removeSkillInputSchema,
  saveEducationInputSchema,
  saveExperienceInputSchema,
  saveFactInputSchema,
  setLinksInputSchema,
  updatePersonInputSchema,
} from "@projects-lab/shared/career";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import { database } from "../../core/db";
import { idempotent } from "../../core/idempotency";
import { type LabEnv, ToolError } from "../../core/lab";
import {
  declareSkill,
  getProfile,
  removeItem,
  removeSkill,
  saveEducation,
  saveExperience,
  saveFact,
  setLinks,
  updatePerson,
} from "./profile";

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

async function body(c: Context): Promise<unknown> {
  return c.req.json().catch(() => null);
}

/** Validates the JSON body, runs the service, maps a refusal. */
function write<S extends z.ZodType, R>(
  schema: S,
  run: (db: D1Database, input: z.infer<S>, now: Date) => Promise<R>,
  respond: (result: R) => unknown,
) {
  return async (c: Context<LabEnv>) => {
    const parsed = schema.safeParse(await body(c));
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

export function profileRoutes() {
  const app = new Hono<LabEnv>();

  app.get("/profile", async (c) => c.json(await getProfile(database(c.env))));

  app.patch(
    "/person",
    idempotent("PATCH /api/career/person"),
    write(updatePersonInputSchema, updatePerson, (person) => ({ person })),
  );
  app.put(
    "/links",
    idempotent("PUT /api/career/links"),
    write(setLinksInputSchema, setLinks, (links) => ({ links })),
  );
  app.post(
    "/experiences",
    idempotent("POST /api/career/experiences"),
    write(saveExperienceInputSchema, saveExperience, (experience) => ({
      experience,
    })),
  );
  app.post(
    "/education",
    idempotent("POST /api/career/education"),
    write(saveEducationInputSchema, saveEducation, (education) => ({
      education,
    })),
  );
  app.post(
    "/facts",
    idempotent("POST /api/career/facts"),
    write(saveFactInputSchema, saveFact, (fact) => ({ fact })),
  );
  app.put(
    "/skills",
    idempotent("PUT /api/career/skills"),
    write(declareSkillInputSchema, declareSkill, (skill) => ({ skill })),
  );

  app.delete(
    "/skills/:name",
    idempotent("DELETE /api/career/skills/:name"),
    async (c) => {
      const parsed = removeSkillInputSchema.safeParse({
        skill: c.req.param("name"),
      });
      if (!parsed.success) return invalid(c, parsed.error);
      try {
        await removeSkill(database(c.env), parsed.data.skill);
        return c.body(null, 204);
      } catch (error) {
        return refused(c, error);
      }
    },
  );

  app.delete(
    "/items/:kind/:id",
    idempotent("DELETE /api/career/items/:kind/:id"),
    async (c) => {
      const parsed = removeItemInputSchema.safeParse({
        kind: c.req.param("kind"),
        id: c.req.param("id"),
      });
      if (!parsed.success) return invalid(c, parsed.error);
      try {
        await removeItem(database(c.env), parsed.data, new Date());
        return c.body(null, 204);
      } catch (error) {
        return refused(c, error);
      }
    },
  );

  return app;
}
