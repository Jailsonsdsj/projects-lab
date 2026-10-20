// Career Lab tables (docs/prd/99-data-model.md § Career Lab). `drizzle-kit
// generate` reads this after core's and Study's schemas; never hand-edit its
// output. Invariants on nullable columns, across rows or over time are
// triggers in their own custom migration. Every column a CHECK references is
// NOT NULL; the allowed values and limits come from @projects-lab/shared/career.
import {
  APPLICATION_STATUSES,
  EXPERIENCE_KINDS,
  FACT_MAX_LENGTH,
  FIT_NOTES_MAX_LENGTH,
  JOB_NOTE_MAX_LENGTH,
  LINK_KINDS,
  POSTING_MAX_LENGTH,
  REQUIREMENT_MAX_LENGTH,
  REQUIREMENT_TYPES,
  SKILL_LEVELS,
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
