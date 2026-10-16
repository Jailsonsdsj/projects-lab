// Platform tools (docs/prd/02-integration.md). Thin adapters: a shared schema,
// a service call, compact JSON. No SQL here.
import { findSkillInputSchema, LAB_IDS } from "@projects-lab/shared";
import { z } from "zod";
import { getOwnerProfile } from "../../core/auth/owner";
import { defineTool, ToolError } from "../../core/lab";
import { findSkill } from "../../core/skills";

export const coreTools = [
  defineTool({
    name: "core_whoami",
    kind: "read",
    description:
      "Proves the connection to Projects Lab: the owner, the client this grant belongs to, and the labs. Call it first if unsure the connector works.",
    input: z.object({}),
    async run(_input, ctx) {
      const owner = await getOwnerProfile(ctx.db, ctx.userId);
      if (!owner)
        throw new ToolError("not_found", "The owner no longer exists.");
      return { owner, client: ctx.clientName, labs: LAB_IDS };
    },
  }),
  defineTool({
    name: "core_find_skill",
    kind: "read",
    description:
      'Finds the one skill whose canonical name or an alias matches, ignoring case ("postgres" finds PostgreSQL). Use it before creating anything that names a skill. Returns { skill: null } when there is none.',
    input: findSkillInputSchema,
    async run({ query }, ctx) {
      return { skill: await findSkill(ctx.db, query) };
    },
  }),
];
