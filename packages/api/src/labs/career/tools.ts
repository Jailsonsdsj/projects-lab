// Career profile MCP tools (docs/prd/20-career-profile.md § Operations). Thin
// adapters: the shared schema validates, the CA-03a service does the work, and
// a refusal is already a ToolError. No SQL here: a test scans tool files. The
// photo has no tool: no tool takes a file.
import {
  declareSkillInputSchema,
  getProfileInputSchema,
  removeItemInputSchema,
  removeSkillInputSchema,
  saveEducationInputSchema,
  saveExperienceInputSchema,
  saveFactInputSchema,
  setLinksInputSchema,
  updatePersonInputSchema,
} from "@projects-lab/shared/career";
import { defineTool } from "../../core/lab";
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

export const careerTools = [
  defineTool({
    name: "career_get_profile",
    kind: "read",
    description:
      "Reads the owner's professional profile: person and contact details, links, experiences and education with their facts (each with `verified` and its skills), facts on their own, and declared skills. The only source a career document may use: never add what isn't here.",
    input: getProfileInputSchema,
    async run(_input, ctx) {
      return getProfile(ctx.db);
    },
  }),
  defineTool({
    name: "career_update_person",
    kind: "write",
    description:
      "Changes the owner's name, headline, location, time zone, email, phone, summary (at most 600 characters) or languages. Only the fields given change.",
    input: updatePersonInputSchema,
    async run(input, ctx) {
      return { person: await updatePerson(ctx.db, input, new Date()) };
    },
  }),
  defineTool({
    name: "career_set_links",
    kind: "write",
    description:
      "Replaces the profile's links (LinkedIn, GitHub, portfolio, scholar, other; https only) with this list, in this order. Send every link to keep.",
    input: setLinksInputSchema,
    async run(input, ctx) {
      return { links: await setLinks(ctx.db, input, new Date()) };
    },
  }),
  defineTool({
    name: "career_save_experience",
    kind: "write",
    description:
      "Adds a job, contract, research post or project to the profile (no `id`), or edits one (`id`). Dates are YYYY or YYYY-MM; no end means current, and `end: null` makes it current again. On an edit, an omitted optional field is kept.",
    input: saveExperienceInputSchema,
    async run(input, ctx) {
      return { experience: await saveExperience(ctx.db, input, new Date()) };
    },
  }),
  defineTool({
    name: "career_save_education",
    kind: "write",
    description:
      "Adds a degree or course of study (no `id`) or edits one (`id`). Dates are YYYY or YYYY-MM; no end means in progress. On an edit, an omitted optional field is kept.",
    input: saveEducationInputSchema,
    async run(input, ctx) {
      return { education: await saveEducation(ctx.db, input, new Date()) };
    },
  }),
  defineTool({
    name: "career_save_fact",
    kind: "write",
    description:
      "Adds or edits one claim a document can use (at most 300 characters, one claim, no invented numbers), under an experience, an education or neither, with the skills it evidences (names or aliases; new ones are added to the registry). A new fact is unverified. Set `verified: true` only after the owner confirms it in this chat; omit `verified` otherwise, and it is kept.",
    input: saveFactInputSchema,
    async run(input, ctx) {
      return { fact: await saveFact(ctx.db, input, new Date()) };
    },
  }),
  defineTool({
    name: "career_declare_skill",
    kind: "write",
    description:
      "Declares a skill the owner claims, at a level (familiar, working, strong), with optional years and a note; declaring it again updates it. A skill Study verified is offered to the owner first, never declared silently.",
    input: declareSkillInputSchema,
    async run(input, ctx) {
      return { skill: await declareSkill(ctx.db, input, new Date()) };
    },
  }),
  defineTool({
    name: "career_remove_item",
    kind: "write",
    description:
      "Removes an experience, an education or a fact from the profile. It's hidden, not erased: a job's saved selection may still cite it. Facts under a removed experience or education are hidden with it.",
    input: removeItemInputSchema,
    async run(input, ctx) {
      await removeItem(ctx.db, input, new Date());
      return { removed: input };
    },
  }),
  defineTool({
    name: "career_remove_skill",
    kind: "write",
    description:
      "Removes a declared skill (by name or alias) from the profile. The skill stays in the registry and in Study.",
    input: removeSkillInputSchema,
    async run({ skill }, ctx) {
      await removeSkill(ctx.db, skill);
      return { removed: skill };
    },
  }),
];
