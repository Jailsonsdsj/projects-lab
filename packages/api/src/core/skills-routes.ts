// GET /api/skills?query= (ST-06c): the skill registry's lookup for the app,
// the same findSkill as core_find_skill. Core, not a lab: every lab names skills.
import { findSkillInputSchema } from "@projects-lab/shared";
import { Hono } from "hono";
import { type AuthVariables, requireAuth } from "./auth/require-auth";
import { database } from "./db";
import { findSkill } from "./skills";

export function skillsRoutes() {
  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

  app.get("/", requireAuth, async (c) => {
    const parsed = findSkillInputSchema.safeParse({
      query: c.req.query("query"),
    });
    if (!parsed.success)
      return c.json(
        { error: "bad_request", message: "query: a skill name or alias" },
        400,
      );
    return c.json({
      skill: await findSkill(database(c.env), parsed.data.query),
    });
  });

  return app;
}
