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
import { Hono } from "hono";
import { database } from "../../core/db";
import { idempotent } from "../../core/idempotency";
import type { LabEnv } from "../../core/lab";
import { invalid, refused, write } from "./http";
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
