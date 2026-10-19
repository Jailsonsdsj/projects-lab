// Study backlog MCP tools (docs/prd/10-study-backlog.md § Operations). Thin
// adapters: the shared schema validates, the ST-03 service does the work, and
// a refusal is already a ToolError. No SQL here: a test scans tool files.
import {
  addAreaInputSchema,
  addTopicsInputSchema,
  getSummaryInputSchema,
  listBacklogInputSchema,
  listCoursesInputSchema,
  listExamsInputSchema,
  recordCourseInputSchema,
  recordExamInputSchema,
  recordGradeInputSchema,
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
import {
  listCourses,
  listExams,
  recordCourse,
  recordExam,
  recordGrade,
} from "./records";

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
  defineTool({
    name: "study_record_course",
    kind: "write",
    description:
      "Records a course file after you push it to study-materials (Study Lab/<area>/<topic>/<topic>__<level>[_m<n>].md). The file must already be on GitHub. Sets the topic's level, and a Not started topic goes In progress.",
    input: recordCourseInputSchema,
    async run(input, ctx) {
      return recordCourse(ctx.env, ctx.db, input, new Date(), await zone(ctx));
    },
  }),
  defineTool({
    name: "study_list_courses",
    kind: "read",
    description:
      "Lists recorded course files, newest first, optionally for one topic: their level, module and path in study-materials.",
    input: listCoursesInputSchema,
    async run({ topicId }, ctx) {
      return listCourses(ctx.db, topicId);
    },
  }),
  defineTool({
    name: "study_record_exam",
    kind: "write",
    description:
      "Records a final exam after you push its .md (questions only) and .pdf. The attempt must be the next one for that topic and level (1, then one past the highest). Doesn't change the topic's status.",
    input: recordExamInputSchema,
    async run(input, ctx) {
      return recordExam(ctx.env, ctx.db, input, new Date());
    },
  }),
  defineTool({
    name: "study_record_grade",
    kind: "write",
    description:
      "Records an exam's grade in integer tenths (8.5 → 85) after you push its Results, and marks the topic Done. Calling it again for the same attempt corrects the grade; the graded date stays.",
    input: recordGradeInputSchema,
    async run(input, ctx) {
      return recordGrade(ctx.db, input, new Date(), await zone(ctx));
    },
  }),
  defineTool({
    name: "study_list_exams",
    kind: "read",
    description:
      "Lists exam attempts, most recently graded first, optionally for one topic: level, attempt, paths, and the grade in tenths (null while awaiting one).",
    input: listExamsInputSchema,
    async run({ topicId }, ctx) {
      return listExams(ctx.db, topicId);
    },
  }),
];
