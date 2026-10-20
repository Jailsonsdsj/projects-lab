// Career Lab tables (docs/prd/99-data-model.md § Career Lab). `drizzle-kit
// generate` reads this after core's and Study's schemas; never hand-edit its
// output. Invariants on nullable columns, across rows or over time are
// triggers in their own custom migration. Every column a CHECK references is
// NOT NULL; the allowed values and limits come from @projects-lab/shared/career.
import {
  ANSWER_MAX_LENGTH,
  APPLICATION_STATUSES,
  DRILL_MODES,
  DRILL_WEAKEST_MAX,
  EXPERIENCE_KINDS,
  FACT_MAX_LENGTH,
  FIT_NOTES_MAX_LENGTH,
  FORM_ANSWER_MAX_LENGTH,
  INTRO_MAX_LENGTH,
  JOB_NOTE_MAX_LENGTH,
  LINK_KINDS,
  OPENING_POSTING_MAX_LENGTH,
  OPENING_STATUSES,
  POSTING_MAX_LENGTH,
  QUESTION_MAX_LENGTH,
  REQUIREMENT_MAX_LENGTH,
  REQUIREMENT_TYPES,
  SELECTION_ITEM_KINDS,
  SKILL_LEVELS,
  STANDARD_ANSWER_MAX_LENGTH,
  STAR_PART_MAX_LENGTH,
  SUMMARY_MAX_LENGTH,
} from "@projects-lab/shared/career";
import { type SQL, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { skill } from "../../db/schema";

/** A SQL list of string literals from a shared constant: IN ('a', 'b'). */
const sqlList = (values: readonly string[]): SQL =>
  sql.raw(values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", "));
const sqlNumber = (value: number): SQL => sql.raw(String(value));

/** `YYYY` or `YYYY-MM` with a real month (K-4); the trigger checks `end_on` the same way. */
const profileDate = (column: unknown): SQL =>
  sql`(${column} GLOB '[0-9][0-9][0-9][0-9]' OR (${column} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(${column}, 6, 2) BETWEEN '01' AND '12'))`;
const jsonArray = (column: unknown): SQL =>
  sql`json_valid(${column}) AND json_type(${column}) = 'array'`;
const position = (column: unknown): SQL =>
  sql`typeof(${column}) = 'integer' AND ${column} >= 0`;

// --- Profile (20) ---

/** The owner's person record: exactly one row (K-1). */
export const careerPerson = sqliteTable(
  "career_person",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull().default(""),
    headline: text("headline").notNull().default(""),
    location: text("location").notNull().default(""),
    timezone: text("timezone").notNull().default(""),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    summary: text("summary").notNull().default(""),
    languagesJson: text("languages_json").notNull().default("[]"),
    // profile/photo.<ext> and its type, set together (K-3, a trigger: nullable).
    photoKey: text("photo_key"),
    photoType: text("photo_type"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    // K-1
    check("career_person_one_row", sql`${t.id} = 'person'`),
    check(
      "career_person_summary_length",
      sql`length(${t.summary}) <= ${sqlNumber(SUMMARY_MAX_LENGTH)}`,
    ),
    check("career_person_languages_array", jsonArray(t.languagesJson)),
  ],
);

export const careerLink = sqliteTable(
  "career_link",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    url: text("url").notNull(),
    position: integer("position").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    // K-2
    check(
      "career_link_kind_allowed",
      sql`${t.kind} IN (${sqlList(LINK_KINDS)})`,
    ),
    check("career_link_url_https", sql`${t.url} GLOB 'https://?*'`),
    check("career_link_position_min", position(t.position)),
  ],
);

export const careerEducation = sqliteTable(
  "career_education",
  {
    id: text("id").primaryKey(),
    institution: text("institution").notNull(),
    degree: text("degree").notNull(),
    field: text("field").notNull().default(""),
    startOn: text("start_on").notNull(),
    // No end: in progress (K-4, a trigger: nullable).
    endOn: text("end_on"),
    notes: text("notes").notNull().default(""),
    position: integer("position").notNull(),
    createdAt: text("created_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (t) => [
    // K-4
    check("career_education_start_format", profileDate(t.startOn)),
    check("career_education_position_min", position(t.position)),
  ],
);

export const careerExperience = sqliteTable(
  "career_experience",
  {
    id: text("id").primaryKey(),
    organization: text("organization").notNull(),
    title: text("title").notNull(),
    kind: text("kind").notNull(),
    startOn: text("start_on").notNull(),
    // No end: current (K-4, a trigger: nullable).
    endOn: text("end_on"),
    location: text("location").notNull().default(""),
    summary: text("summary").notNull().default(""),
    position: integer("position").notNull(),
    createdAt: text("created_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (t) => [
    check(
      "career_experience_kind_allowed",
      sql`${t.kind} IN (${sqlList(EXPERIENCE_KINDS)})`,
    ),
    // K-4
    check("career_experience_start_format", profileDate(t.startOn)),
    check(
      "career_experience_summary_length",
      sql`length(${t.summary}) <= ${sqlNumber(SUMMARY_MAX_LENGTH)}`,
    ),
    check("career_experience_position_min", position(t.position)),
  ],
);

/** One claim a document can use. Never hard-deleted (K-8): a selection may cite it. */
export const careerFact = sqliteTable(
  "career_fact",
  {
    id: text("id").primaryKey(),
    // At most one of them (K-5, a trigger: nullable).
    experienceId: text("experience_id").references(() => careerExperience.id),
    educationId: text("education_id").references(() => careerEducation.id),
    text: text("text").notNull(),
    // 0 = excluded from documents until the owner confirms it.
    verified: integer("verified").notNull().default(0),
    position: integer("position").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (t) => [
    index("career_fact_experience").on(t.experienceId),
    index("career_fact_education").on(t.educationId),
    // K-5
    check(
      "career_fact_text_length",
      sql`length(trim(${t.text})) > 0 AND length(${t.text}) <= ${sqlNumber(FACT_MAX_LENGTH)}`,
    ),
    check(
      "career_fact_verified_bool",
      sql`typeof(${t.verified}) = 'integer' AND ${t.verified} IN (0, 1)`,
    ),
    check("career_fact_position_min", position(t.position)),
  ],
);

export const careerFactSkill = sqliteTable(
  "career_fact_skill",
  {
    factId: text("fact_id")
      .notNull()
      .references(() => careerFact.id),
    skillId: text("skill_id")
      .notNull()
      .references(() => skill.id),
  },
  (t) => [
    primaryKey({ columns: [t.factId, t.skillId] }),
    index("career_fact_skill_skill").on(t.skillId),
  ],
);

/** What the owner claims (readiness Declared). One per skill (K-6). */
export const careerDeclaredSkill = sqliteTable(
  "career_declared_skill",
  {
    skillId: text("skill_id")
      .primaryKey()
      .references(() => skill.id),
    level: text("level").notNull(),
    // An integer >= 0 when set (K-7, a trigger: nullable).
    years: integer("years"),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    // K-7
    check(
      "career_declared_skill_level_allowed",
      sql`${t.level} IN (${sqlList(SKILL_LEVELS)})`,
    ),
  ],
);

// --- Jobs (21) ---

/** A tracked job. Never hard-deleted (K-14). Readiness is derived, never stored. */
export const careerJob = sqliteTable(
  "career_job",
  {
    id: text("id").primaryKey(),
    company: text("company").notNull(),
    role: text("role").notNull(),
    seniority: text("seniority").notNull().default(""),
    // The posting's language: documents are written in it.
    language: text("language").notNull(),
    workShape: text("work_shape").notNull().default(""),
    sourceUrl: text("source_url"),
    posting: text("posting").notNull(),
    // Claude's five scores, their sum and the decision: all set or none (K-10, triggers).
    fitTotal: integer("fit_total"),
    fitConstraints: integer("fit_constraints"),
    fitSkills: integer("fit_skills"),
    fitGrowth: integer("fit_growth"),
    fitPay: integer("fit_pay"),
    fitSignal: integer("fit_signal"),
    decision: text("decision"),
    fitNotes: text("fit_notes").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (t) => [
    check(
      "career_job_posting_length",
      sql`length(trim(${t.posting})) > 0 AND length(${t.posting}) <= ${sqlNumber(POSTING_MAX_LENGTH)}`,
    ),
    check(
      "career_job_fit_notes_length",
      sql`length(${t.fitNotes}) <= ${sqlNumber(FIT_NOTES_MAX_LENGTH)}`,
    ),
  ],
);

export const careerRequirement = sqliteTable(
  "career_requirement",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => careerJob.id),
    text: text("text").notNull(),
    type: text("type").notNull(),
    // Null exactly when not mapped (K-9, a trigger); from the registry (K-13).
    skillId: text("skill_id").references(() => skill.id),
    position: integer("position").notNull(),
  },
  (t) => [
    index("career_requirement_job").on(t.jobId),
    index("career_requirement_skill").on(t.skillId),
    // K-9
    check(
      "career_requirement_type_allowed",
      sql`${t.type} IN (${sqlList(REQUIREMENT_TYPES)})`,
    ),
    check(
      "career_requirement_text_length",
      sql`length(trim(${t.text})) > 0 AND length(${t.text}) <= ${sqlNumber(REQUIREMENT_MAX_LENGTH)}`,
    ),
    check("career_requirement_position_min", position(t.position)),
  ],
);

/** The application's history, append-only (K-12); the current status is the latest row. */
export const careerJobEvent = sqliteTable(
  "career_job_event",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => careerJob.id),
    status: text("status").notNull(),
    at: text("at").notNull(),
    note: text("note").notNull().default(""),
  },
  (t) => [
    index("career_job_event_job").on(t.jobId, t.at),
    // K-11
    check(
      "career_job_event_status_allowed",
      sql`${t.status} IN (${sqlList(APPLICATION_STATUSES)})`,
    ),
    check(
      "career_job_event_note_length",
      sql`length(${t.note}) <= ${sqlNumber(JOB_NOTE_MAX_LENGTH)}`,
    ),
  ],
);

// --- Documents (22) ---

/** What a job's last document was made from: IDs only, never the file (A-7). */
export const careerJobItem = sqliteTable(
  "career_job_item",
  {
    jobId: text("job_id")
      .notNull()
      .references(() => careerJob.id),
    // The item exists in its kind's table (K-15, a trigger).
    itemKind: text("item_kind").notNull(),
    itemId: text("item_id").notNull(),
    variant: text("variant").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.jobId, t.itemKind, t.itemId] }),
    // K-15
    check(
      "career_job_item_kind_allowed",
      sql`${t.itemKind} IN (${sqlList(SELECTION_ITEM_KINDS)})`,
    ),
    check(
      "career_job_item_variant_length",
      sql`length(${t.variant}) BETWEEN 1 AND 30`,
    ),
    check("career_job_item_position_min", position(t.position)),
  ],
);

/** What a job's application copies: intro and salary range (A-7). */
export const careerJobKit = sqliteTable(
  "career_job_kit",
  {
    jobId: text("job_id")
      .primaryKey()
      .references(() => careerJob.id),
    intro: text("intro").notNull().default(""),
    // Whole currency units with a currency and a period, all set or none (K-16, triggers).
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: text("salary_currency"),
    salaryPeriod: text("salary_period"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    // K-17
    check(
      "career_job_kit_intro_length",
      sql`length(${t.intro}) <= ${sqlNumber(INTRO_MAX_LENGTH)}`,
    ),
  ],
);

export const careerFormAnswer = sqliteTable(
  "career_form_answer",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => careerJob.id),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [
    index("career_form_answer_job").on(t.jobId),
    // K-17
    check(
      "career_form_answer_question_length",
      sql`length(trim(${t.question})) > 0 AND length(${t.question}) <= ${sqlNumber(QUESTION_MAX_LENGTH)}`,
    ),
    check(
      "career_form_answer_answer_length",
      sql`length(trim(${t.answer})) > 0 AND length(${t.answer}) <= ${sqlNumber(FORM_ANSWER_MAX_LENGTH)}`,
    ),
    check("career_form_answer_position_min", position(t.position)),
  ],
);

/** "Notice period: 30 days": the copy panel's fixed answers. */
export const careerStandardAnswer = sqliteTable(
  "career_standard_answer",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    value: text("value").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [
    // K-18
    uniqueIndex("career_standard_answer_label_nocase").on(
      sql`${t.label} COLLATE NOCASE`,
    ),
    check(
      "career_standard_answer_label_not_blank",
      sql`length(trim(${t.label})) > 0`,
    ),
    // K-19
    check(
      "career_standard_answer_value_length",
      sql`length(${t.value}) <= ${sqlNumber(STANDARD_ANSWER_MAX_LENGTH)}`,
    ),
    check("career_standard_answer_position_min", position(t.position)),
  ],
);

// --- Job search (23) ---

/** The routine reads it at every run; only the app's form writes it. One row (K-20). */
export const careerSearchCriteria = sqliteTable(
  "career_search_criteria",
  {
    id: text("id").primaryKey(),
    queriesJson: text("queries_json").notNull().default("[]"),
    lanesJson: text("lanes_json").notNull().default("[]"),
    shapesJson: text("shapes_json").notNull().default("[]"),
    autoRejectJson: text("auto_reject_json").notNull().default("[]"),
    sourcesJson: text("sources_json").notNull().default("[]"),
    maxHours: integer("max_hours").notNull(),
    timezoneNote: text("timezone_note").notNull().default(""),
    // Set together, the floor an integer >= 0 (K-21, triggers: nullable).
    rateFloor: integer("rate_floor"),
    rateCurrency: text("rate_currency"),
    ratePeriod: text("rate_period"),
    maxAgeDays: integer("max_age_days").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    // K-20
    check("career_search_criteria_one_row", sql`${t.id} = 'criteria'`),
    check(
      "career_search_criteria_lists",
      sql`${jsonArray(t.queriesJson)} AND ${jsonArray(t.lanesJson)} AND ${jsonArray(t.shapesJson)} AND ${jsonArray(t.autoRejectJson)} AND ${jsonArray(t.sourcesJson)}`,
    ),
    // K-21
    check(
      "career_search_criteria_max_hours",
      sql`typeof(${t.maxHours}) = 'integer' AND ${t.maxHours} >= 0`,
    ),
    check(
      "career_search_criteria_max_age",
      sql`typeof(${t.maxAgeDays}) = 'integer' AND ${t.maxAgeDays} >= 1`,
    ),
  ],
);

/** What the routine found. A tracked one points at its job (K-23, a trigger). */
export const careerOpening = sqliteTable(
  "career_opening",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    company: text("company").notNull(),
    role: text("role").notNull(),
    lane: text("lane").notNull(),
    // An excerpt: the routine saves many at once.
    posting: text("posting").notNull(),
    postedOn: text("posted_on"),
    rateText: text("rate_text").notNull().default(""),
    why: text("why").notNull(),
    status: text("status").notNull().default("new"),
    jobId: text("job_id").references(() => careerJob.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    // K-22
    uniqueIndex("career_opening_url_unique").on(t.url),
    check("career_opening_url_https", sql`${t.url} GLOB 'https://?*'`),
    check(
      "career_opening_status_allowed",
      sql`${t.status} IN (${sqlList(OPENING_STATUSES)})`,
    ),
    check(
      "career_opening_posting_length",
      sql`length(${t.posting}) <= ${sqlNumber(OPENING_POSTING_MAX_LENGTH)}`,
    ),
    index("career_opening_status").on(t.status),
  ],
);

// --- Interviews (24) ---

/** A STAR story: reusable evidence, resting on facts. */
export const careerStory = sqliteTable(
  "career_story",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    situation: text("situation").notNull(),
    task: text("task").notNull(),
    action: text("action").notNull(),
    result: text("result").notNull(),
    experienceId: text("experience_id").references(() => careerExperience.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    // K-24
    check(
      "career_story_parts_length",
      sql`length(${t.situation}) <= ${sqlNumber(STAR_PART_MAX_LENGTH)} AND length(${t.task}) <= ${sqlNumber(STAR_PART_MAX_LENGTH)} AND length(${t.action}) <= ${sqlNumber(STAR_PART_MAX_LENGTH)} AND length(${t.result}) <= ${sqlNumber(STAR_PART_MAX_LENGTH)}`,
    ),
    check("career_story_title_not_blank", sql`length(trim(${t.title})) > 0`),
  ],
);

// K-25: a story's facts exist.
export const careerStoryFact = sqliteTable(
  "career_story_fact",
  {
    storyId: text("story_id")
      .notNull()
      .references(() => careerStory.id),
    factId: text("fact_id")
      .notNull()
      .references(() => careerFact.id),
  },
  (t) => [
    primaryKey({ columns: [t.storyId, t.factId] }),
    index("career_story_fact_fact").on(t.factId),
  ],
);

export const careerStorySkill = sqliteTable(
  "career_story_skill",
  {
    storyId: text("story_id")
      .notNull()
      .references(() => careerStory.id),
    skillId: text("skill_id")
      .notNull()
      .references(() => skill.id),
  },
  (t) => [
    primaryKey({ columns: [t.storyId, t.skillId] }),
    index("career_story_skill_skill").on(t.skillId),
  ],
);

/** A question and the owner's answer, with a Drive video when there is one (R2-13). */
export const careerAnswer = sqliteTable(
  "career_answer",
  {
    id: text("id").primaryKey(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    // Drive's file ID only (K-26, a trigger: nullable). Video never goes to R2.
    driveFileId: text("drive_file_id"),
    // K-27
    storyId: text("story_id").references(() => careerStory.id),
    jobId: text("job_id").references(() => careerJob.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("career_answer_job").on(t.jobId),
    check(
      "career_answer_question_length",
      sql`length(trim(${t.question})) > 0 AND length(${t.question}) <= ${sqlNumber(QUESTION_MAX_LENGTH)}`,
    ),
    check(
      "career_answer_answer_length",
      sql`length(trim(${t.answer})) > 0 AND length(${t.answer}) <= ${sqlNumber(ANSWER_MAX_LENGTH)}`,
    ),
  ],
);

/** A practice session in a Claude chat: what to fix next time. */
export const careerDrill = sqliteTable(
  "career_drill",
  {
    id: text("id").primaryKey(),
    at: text("at").notNull(),
    mode: text("mode").notNull(),
    topic: text("topic").notNull(),
    weakestJson: text("weakest_json").notNull().default("[]"),
    fix: text("fix").notNull(),
  },
  (t) => [
    index("career_drill_at").on(t.at),
    // K-28
    check(
      "career_drill_mode_allowed",
      sql`${t.mode} IN (${sqlList(DRILL_MODES)})`,
    ),
    check(
      "career_drill_weakest",
      sql`${jsonArray(t.weakestJson)} AND json_array_length(${t.weakestJson}) <= ${sqlNumber(DRILL_WEAKEST_MAX)}`,
    ),
  ],
);
