// /api/career job search routes (docs/prd/23-career-job-search.md): the
// criteria form and the Openings list. Mounted behind requireAuth by
// mountLabs, so the session only: Claude reads the criteria through its tool
// and never writes them. Every mutation takes an Idempotency-Key.
import {
  listOpeningsInputSchema,
  saveSearchCriteriaInputSchema,
  updateOpeningInputSchema,
} from "@projects-lab/shared/career";
import { Hono } from "hono";
import { database } from "../../core/db";
import { idempotent } from "../../core/idempotency";
import type { LabEnv } from "../../core/lab";
import { body, invalid, refused, write } from "./http";
import {
  getSearchCriteria,
  listOpenings,
  saveSearchCriteria,
  updateOpening,
} from "./search";

export function searchRoutes() {
  const app = new Hono<LabEnv>();

  app.get("/search-criteria", async (c) =>
    c.json({ criteria: await getSearchCriteria(database(c.env)) }),
  );

  app.put(
    "/search-criteria",
    idempotent("PUT /api/career/search-criteria"),
    write(saveSearchCriteriaInputSchema, saveSearchCriteria, (criteria) => ({
      criteria,
    })),
  );

  app.get("/openings", async (c) => {
    const parsed = listOpeningsInputSchema.safeParse({
      status: c.req.query("status"),
    });
    if (!parsed.success) return invalid(c, parsed.error);
    return c.json({
      openings: await listOpenings(database(c.env), parsed.data, new Date()),
    });
  });

  app.patch(
    "/openings/:id",
    idempotent("PATCH /api/career/openings/:id"),
    async (c) => {
      const raw = await body(c);
      const parsed = updateOpeningInputSchema.safeParse({
        ...(raw && typeof raw === "object" ? raw : {}),
        openingId: c.req.param("id"),
      });
      if (!parsed.success) return invalid(c, parsed.error);
      try {
        return c.json({
          opening: await updateOpening(
            database(c.env),
            parsed.data,
            new Date(),
          ),
        });
      } catch (error) {
        return refused(c, error);
      }
    },
  );

  return app;
}
