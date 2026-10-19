// Study backlog MCP tools (docs/prd/10-study-backlog.md § Operations). Thin
// adapters: the shared schema validates, the ST-03 service does the work, and
// a refusal is already a ToolError. No SQL here: a test scans tool files.
import {
  addAreaInputSchema,
  addTopicsInputSchema,
  getSummaryInputSchema,
  listBacklogInputSchema,
  removeTopicInputSchema,
  updateTopicInputSchema,
} from "@projects-lab/shared/study";
import { defineTool, type ToolContext } from "../../core/lab";
import {
  addArea,
  addTopics,
  getBacklogSummary,
  listBacklog,
  ownerTimeZone,
  removeTopic,
  updateTopic,
} from "./backlog";

const zone = (ctx: ToolContext) => ownerTimeZone(ctx.db, ctx.userId);

export const studyTools = [
  defineTool({
    name: "study_list_backlog",
    kind: "read",
    description:
      "Lists the study backlog in its order (areas, then In progress, Not started, Done; then priority), each topic with its ID (FE-01), skill, level, priority, status, grade in tenths, dates and note. Read it before acting on the backlog; filter by area prefix or status.",
    input: listBacklogInputSchema,
    async run(input, ctx) {
      return listBacklog(ctx.db, await zone(ctx), input);
    },
  }),
  defineTool({
    name: "study_get_summary",
    kind: "read",
    description:
      "Summarizes the backlog for /backlog: per-area and total counts by status, the average grade of Done topics (tenths), and the suggested next topic. Changes nothing.",
    input: getSummaryInputSchema,
    async run(_input, ctx) {
      return getBacklogSummary(ctx.db, await zone(ctx));
    },
  }),
  defineTool({
    name: "study_add_topics",
    kind: "write",
    description:
      "Adds topics as Not started (/add, or topics the owner confirmed from a roadmap). `skill` is a name or alias, found in the skill registry or created; a skill that already has a topic returns that topic unchanged, and a removed one is restored with its ID, so it never duplicates.",
    input: addTopicsInputSchema,
    async run({ topics }, ctx) {
      return {
        topics: await addTopics(ctx.db, topics, new Date(), await zone(ctx)),
      };
    },
  }),
  defineTool({
    name: "study_update_topic",
    kind: "write",
    description:
      'Changes a topic\'s level, priority, status or note ("mark FE-02 as in progress", "change the level of DB-01"). Going In progress sets its Started date the first time; the note is one line, at most 120 characters.',
    input: updateTopicInputSchema,
    async run({ topicId, ...changes }, ctx) {
      return {
        topic: await updateTopic(
          ctx.db,
          topicId,
          changes,
          new Date(),
          await zone(ctx),
        ),
      };
    },
  }),
  defineTool({
    name: "study_remove_topic",
    kind: "write",
    description:
      "Removes a topic from the backlog. Its ID is never reused, and adding the same skill again restores it with its courses and exams.",
    input: removeTopicInputSchema,
    async run({ topicId }, ctx) {
      await removeTopic(ctx.db, topicId, new Date());
      return { removed: topicId };
    },
  }),
  defineTool({
    name: "study_add_area",
    kind: "write",
    description:
      'Adds a backlog area when a topic fits none of the existing ones (e.g. "AI and Machine Learning", prefix "AI"). The two-letter prefix must be new; it starts every topic ID in the area and never changes.',
    input: addAreaInputSchema,
    async run(input, ctx) {
      return { area: await addArea(ctx.db, input, new Date()) };
    },
  }),
];
