// Study Lab tables (docs/prd/99-data-model.md § Study Lab). `drizzle-kit
// generate` reads this beside core's schema; never hand-edit its output.
// Triggers (S-4, S-9, S-14, S-16, S-18–S-22) live in their own custom migration, and the
// seven areas are seeded by another. Every column a CHECK references is NOT
// NULL; the allowed values come from @projects-lab/shared/study.
import {
  COURSE_LEVELS,
  EXAM_SOURCES,
  NOTE_MAX_LENGTH,
  SPECIALIZED_MAX_MODULES,
  TOPIC_LEVELS,
  TOPIC_STATUSES,
} from "@projects-lab/shared/study";
import { type SQL, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { skill } from "../../db/schema";

/** A SQL list of string literals from a shared constant: IN ('a', 'b'). */
const sqlList = (values: readonly string[]): SQL =>
  sql.raw(values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", "));
const sqlNumber = (value: number): SQL => sql.raw(String(value));

export const learnArea = sqliteTable(
  "learn_area",
  {
    id: text("id").primaryKey(),
    prefix: text("prefix").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    // The next topic number in this area, claimed in the same batch as the insert.
    nextSeq: integer("next_seq").notNull().default(1),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    // S-1
    check(
      "learn_area_prefix_format",
      sql`length(${t.prefix}) = 2 AND ${t.prefix} NOT GLOB '*[^A-Z]*'`,
    ),
    uniqueIndex("learn_area_prefix_unique").on(t.prefix),
    // S-2
    check("learn_area_name_not_blank", sql`length(trim(${t.name})) > 0`),
    uniqueIndex("learn_area_name_nocase").on(sql`${t.name} COLLATE NOCASE`),
    // S-3
    check(
      "learn_area_next_seq_min",
      sql`typeof(${t.nextSeq}) = 'integer' AND ${t.nextSeq} >= 1`,
    ),
  ],
);

export const learnTopic = sqliteTable(
  "learn_topic",
  {
    id: text("id").primaryKey(),
    // "FE-01": the area prefix and its next_seq, never reused (S-5, S-9).
    code: text("code").notNull(),
    areaId: text("area_id")
      .notNull()
      .references(() => learnArea.id),
    skillId: text("skill_id")
      .notNull()
      .references(() => skill.id),
    level: text("level").notNull().default("unset"),
    priority: integer("priority").notNull().default(2),
    status: text("status").notNull().default("not_started"),
    note: text("note").notNull().default(""),
    // Owner-local date (YYYY-MM-DD) it first went in_progress.
    startedOn: text("started_on"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (t) => [
    // S-5
    uniqueIndex("learn_topic_code_unique").on(t.code),
    // S-6
    uniqueIndex("learn_topic_skill_unique").on(t.skillId),
    index("learn_topic_area").on(t.areaId),
    // S-7
    check(
      "learn_topic_level_allowed",
      sql`${t.level} IN (${sqlList(TOPIC_LEVELS)})`,
    ),
    check(
      "learn_topic_priority_range",
      sql`typeof(${t.priority}) = 'integer' AND ${t.priority} BETWEEN 1 AND 3`,
    ),
    check(
      "learn_topic_status_allowed",
      sql`${t.status} IN (${sqlList(TOPIC_STATUSES)})`,
    ),
    // S-8
    check(
      "learn_topic_note_length",
      sql`length(${t.note}) <= ${sqlNumber(NOTE_MAX_LENGTH)}`,
    ),
  ],
);

export const learnCourse = sqliteTable(
  "learn_course",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id")
      .notNull()
      .references(() => learnTopic.id),
    level: text("level").notNull(),
    module: integer("module").notNull().default(1),
    path: text("path").notNull(),
    recordedAt: text("recorded_at").notNull(),
  },
  (t) => [
    index("learn_course_topic").on(t.topicId),
    // S-10
    check(
      "learn_course_level_allowed",
      sql`${t.level} IN (${sqlList(COURSE_LEVELS)})`,
    ),
    // S-11
    check(
      "learn_course_module_range",
      sql`typeof(${t.module}) = 'integer' AND ${t.module} BETWEEN 1 AND ${sqlNumber(SPECIALIZED_MAX_MODULES)} AND (${t.level} = 'specialized' OR ${t.module} = 1)`,
    ),
    // S-12
    uniqueIndex("learn_course_path_unique").on(t.path),
    check("learn_course_path_layout", sql`${t.path} GLOB 'Study Lab/*.md'`),
  ],
);

export const learnExam = sqliteTable(
  "learn_exam",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id")
      .notNull()
      .references(() => learnTopic.id),
    level: text("level").notNull(),
    attempt: integer("attempt").notNull(),
    mdPath: text("md_path").notNull(),
    // Null only for an exam made in the app (S-22, a trigger: nullable).
    pdfPath: text("pdf_path"),
    // claude (Claude Code, with a PDF) or app (ST-13).
    source: text("source").notNull().default("claude"),
    createdAt: text("created_at").notNull(),
    // Integer tenths 0..100 and its time, set together (S-16, a trigger: nullable).
    grade: integer("grade"),
    gradedAt: text("graded_at"),
    // Deleted by the owner (ST-14): hidden from every read, the grade derived
    // without it; undone by clearing it until its files are removed (S-23..S-26,
    // triggers: nullable).
    deletedAt: text("deleted_at"),
    // When the nightly job removed its files from study-materials.
    filesRemovedAt: text("files_removed_at"),
  },
  (t) => [
    // S-13
    check(
      "learn_exam_attempt_min",
      sql`typeof(${t.attempt}) = 'integer' AND ${t.attempt} >= 1`,
    ),
    uniqueIndex("learn_exam_attempt_unique").on(t.topicId, t.level, t.attempt),
    // S-15
    uniqueIndex("learn_exam_md_path_unique").on(t.mdPath),
    uniqueIndex("learn_exam_pdf_path_unique").on(t.pdfPath),
    // The .pdf's layout is S-22's trigger (pdf_path is nullable).
    check("learn_exam_path_layout", sql`${t.mdPath} GLOB 'Study Lab/*.md'`),
    check(
      "learn_exam_source_allowed",
      sql`${t.source} IN (${sqlList(EXAM_SOURCES)})`,
    ),
    // S-17
    check(
      "learn_exam_level_allowed",
      sql`${t.level} IN (${sqlList(COURSE_LEVELS)})`,
    ),
  ],
);

// An exam made in the app (ST-13): what the model wrote, the key it keeps from
// the owner until grading, the owner's draft, and the graded results. One row
// per app exam (S-18); the paper never changes once written (S-19); the draft
// freezes on submit (S-20); results come once, with the submit time (S-21).
export const learnExamPaper = sqliteTable(
  "learn_exam_paper",
  {
    examId: text("exam_id")
      .primaryKey()
      .references(() => learnExam.id),
    title: text("title").notNull(),
    settingsJson: text("settings_json").notNull(),
    questionsJson: text("questions_json").notNull(),
    keyJson: text("key_json").notNull(),
    // The answers so far, one per question (shared exam-paper.ts).
    draftJson: text("draft_json").notNull(),
    // Set together on submit (S-21, a trigger: nullable).
    submittedAt: text("submitted_at"),
    resultsJson: text("results_json"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    check(
      "learn_exam_paper_json",
      sql`json_valid(${t.settingsJson}) AND json_valid(${t.questionsJson}) AND json_valid(${t.keyJson}) AND json_valid(${t.draftJson})`,
    ),
    check("learn_exam_paper_title", sql`length(trim(${t.title})) > 0`),
  ],
);
