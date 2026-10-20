// Inputs of every career_* tool and its /api/career route (docs/prd/20–24).
// Every string is bounded or an enum; the few longer than TOOL_STRING_MAX are
// named in LONG_TOOL_STRINGS (core/tool-strings.ts). No tool takes file
// content: the photo is the app's only upload, and documents are never stored.
import { z } from "zod";
import { APPLICATION_STATUSES, JOB_NOTE_MAX_LENGTH } from "./applications";
import { DOCUMENT_KINDS, SELECTION_ITEM_KINDS } from "./brief";
import { driveFileId } from "./drive";
import { FIT_DIMENSIONS, FIT_MAX, FIT_NOTES_MAX_LENGTH } from "./fit";
import { DRILL_MODES, DRILL_WEAKEST_MAX } from "./interviews";
import {
  ANSWER_MAX_LENGTH,
  EXPERIENCE_KINDS,
  endNotBeforeStart,
  FACT_MAX_LENGTH,
  FORM_ANSWER_MAX_LENGTH,
  INTRO_MAX_LENGTH,
  isProfileDate,
  LINK_KINDS,
  POSTING_MAX_LENGTH,
  QUESTION_MAX_LENGTH,
  REQUIREMENT_MAX_LENGTH,
  SKILL_LEVELS,
  STANDARD_ANSWER_MAX_LENGTH,
  STAR_PART_MAX_LENGTH,
  SUMMARY_MAX_LENGTH,
} from "./profile";
import { REQUIREMENT_TYPES } from "./readiness";
import { CURRENCIES, isSalaryRange, PAY_PERIODS } from "./salary";
import {
  OPENING_DECISIONS,
  OPENING_POSTING_MAX_LENGTH,
  OPENING_STATUSES,
  OPENINGS_PER_CALL,
} from "./search";

// --- Building blocks ---

/** Row IDs are UUIDs; seeds and probes use short fixed ones, so any safe token. */
export const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "An ID");
const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1).max(max);
/** A skill name or alias; found in the registry first, created only when none matches. */
export const skillNameSchema = required(200);
const nameSchema = required(120);

export const httpsUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "An https:// link");

export const profileDateSchema = z
  .string()
  .max(7)
  .refine(isProfileDate, "YYYY or YYYY-MM");

const calendarDateSchema = z
  .string()
  .max(10)
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      new Date(`${value}T00:00:00Z`).toISOString().startsWith(value),
    "YYYY-MM-DD",
  );

const timezoneSchema = z
  .string()
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "An IANA time zone like America/Recife");

/** The posting's language: `en`, `pt`, `pt-BR`. */
export const languageSchema = z
  .string()
  .max(5)
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, "A language like en or pt-BR");

/** Study's area prefix, checked here because Career can't import Study (the contract validates it again). */
const areaPrefixSchema = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/, "Two uppercase letters");

const position = z.number().int().min(0).max(10_000);
const nothingToChange = "Nothing to change";
const hasChanges = (input: Record<string, unknown>, ignore: string[]) =>
  Object.entries(input).some(
    ([key, value]) => !ignore.includes(key) && value !== undefined,
  );

const datedRange = <T extends { start: string; end?: string | null }>(
  value: T,
  ctx: z.RefinementCtx,
) => {
  if (value.end != null && !endNotBeforeStart(value.start, value.end))
    ctx.addIssue({
      code: "custom",
      path: ["end"],
      message: "The end is before the start",
    });
};

const unique = <T>(items: readonly T[], key: (item: T) => string) =>
  new Set(items.map(key)).size === items.length;

// --- Profile (20) ---

export const getProfileInputSchema = z.object({});

export const updatePersonInputSchema = z
  .object({
    fullName: nameSchema.optional(),
    headline: text(160).optional(),
    location: text(120).optional(),
    timezone: timezoneSchema.optional(),
    email: z.email().max(254).optional(),
    phone: text(40).optional(),
    summary: text(SUMMARY_MAX_LENGTH).optional(),
    languages: z
      .array(z.object({ name: required(40), level: required(40) }))
      .max(10)
      .optional(),
  })
  .refine((input) => hasChanges(input, []), nothingToChange);

/** Replaces the links, in this order. */
export const setLinksInputSchema = z.object({
  links: z
    .array(
      z.object({
        kind: z.enum(LINK_KINDS),
        label: required(60),
        url: httpsUrlSchema,
      }),
    )
    .max(20),
});

/** No `id` adds one; an `id` replaces that one's fields. No `end` is current. */
export const saveExperienceInputSchema = z
  .object({
    id: idSchema.optional(),
    organization: nameSchema,
    title: nameSchema,
    kind: z.enum(EXPERIENCE_KINDS),
    start: profileDateSchema,
    end: profileDateSchema.nullable().optional(),
    location: text(120).optional(),
    summary: text(SUMMARY_MAX_LENGTH).optional(),
    position: position.optional(),
  })
  .superRefine(datedRange);

/** No `end` is in progress. */
export const saveEducationInputSchema = z
  .object({
    id: idSchema.optional(),
    institution: required(160),
    degree: required(120),
    field: text(120).optional(),
    start: profileDateSchema,
    end: profileDateSchema.nullable().optional(),
    notes: text(SUMMARY_MAX_LENGTH).optional(),
    position: position.optional(),
  })
  .superRefine(datedRange);

/**
 * One claim a document can use. `verified` is set by the owner in the app, or
 * by Claude only after the owner confirms it in the chat.
 */
export const saveFactInputSchema = z
  .object({
    id: idSchema.optional(),
    experienceId: idSchema.nullable().optional(),
    educationId: idSchema.nullable().optional(),
    text: required(FACT_MAX_LENGTH),
    verified: z.boolean().optional(),
    skills: z.array(skillNameSchema).max(20).optional(),
    position: position.optional(),
  })
  .refine((input) => input.experienceId == null || input.educationId == null, {
    message: "A fact belongs to an experience or an education, not both",
    path: ["educationId"],
  });

export const declareSkillInputSchema = z.object({
  skill: skillNameSchema,
  level: z.enum(SKILL_LEVELS),
  years: z.number().int().min(0).max(60).nullable().optional(),
  note: text(200).optional(),
});

/** Experiences and education are soft-deleted; a fact is soft-deleted too (K-8). */
export const removeItemInputSchema = z.object({
  kind: z.enum(["experience", "education", "fact"]),
  id: idSchema,
});

export const removeSkillInputSchema = z.object({ skill: skillNameSchema });

// --- Jobs (21) ---

/** Five integers within their maxima; the total and decision come from scoreFit. */
export const fitScoresSchema = z.object(
  Object.fromEntries(
    FIT_DIMENSIONS.map((dimension) => [
      dimension,
      z.number().int().min(0).max(FIT_MAX[dimension]),
    ]),
  ) as Record<(typeof FIT_DIMENSIONS)[number], z.ZodNumber>,
);

const requirementSchema = z
  .object({
    text: required(REQUIREMENT_MAX_LENGTH),
    type: z.enum(REQUIREMENT_TYPES),
    /** Exactly when it's mapped (K-9). */
    skill: skillNameSchema.optional(),
  })
  .refine((r) => (r.type === "not_mapped") === (r.skill === undefined), {
    message:
      "A required or nice requirement names one skill; a not-mapped one none",
    path: ["skill"],
  });

export const addJobInputSchema = z.object({
  /** When it was an opening the routine saved, which becomes tracked. */
  openingId: idSchema.optional(),
  company: nameSchema,
  role: required(160),
  seniority: text(40).optional(),
  language: languageSchema,
  workShape: text(200).optional(),
  sourceUrl: httpsUrlSchema.optional(),
  posting: required(POSTING_MAX_LENGTH),
  requirements: z.array(requirementSchema).min(1).max(60),
  fit: fitScoresSchema,
  fitNotes: text(FIT_NOTES_MAX_LENGTH).optional(),
});

export const listJobsInputSchema = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
});

export const getJobInputSchema = z.object({ jobId: idSchema });

/** A status change appends an event (K-12); its note goes with it. */
export const updateJobInputSchema = z
  .object({
    jobId: idSchema,
    status: z.enum(APPLICATION_STATUSES).optional(),
    note: text(JOB_NOTE_MAX_LENGTH).optional(),
    fit: fitScoresSchema.optional(),
    fitNotes: text(FIT_NOTES_MAX_LENGTH).optional(),
  })
  .refine((input) => hasChanges(input, ["jobId", "note"]), nothingToChange)
  .refine((input) => input.note === undefined || input.status !== undefined, {
    message: "A note goes with a status change",
    path: ["note"],
  });

export const updateRequirementInputSchema = z
  .object({
    requirementId: idSchema,
    type: z.enum(REQUIREMENT_TYPES).optional(),
    /** Null unmaps it. */
    skill: skillNameSchema.nullable().optional(),
  })
  .refine((input) => hasChanges(input, ["requirementId"]), nothingToChange)
  .refine(
    (input) =>
      !(input.type === "not_mapped" && typeof input.skill === "string") &&
      !(input.skill === null && input.type !== "not_mapped"),
    {
      message: "Only a not-mapped requirement has no skill",
      path: ["skill"],
    },
  );

/** The service checks each is one of the job's gaps and notes `Job: <Company>`. */
export const sendGapsInputSchema = z.object({
  jobId: idSchema,
  gaps: z
    .array(
      z.object({
        requirementId: idSchema,
        area: areaPrefixSchema,
        /** P1 core required, P2 other required, P3 nice to have. */
        priority: z.literal([1, 2, 3]),
      }),
    )
    .min(1)
    .max(60)
    .refine(
      (gaps) => unique(gaps, (gap) => gap.requirementId),
      "A requirement twice",
    ),
});

/** Soft: the job leaves the list; Study topics stay. */
export const removeJobInputSchema = z.object({ jobId: idSchema });

// --- Documents (22) ---

export const documentBriefInputSchema = z.object({
  jobId: idSchema,
  kind: z.enum(DOCUMENT_KINDS),
});

/** The IDs a document used, never the file. Replaces the job's selection. */
export const saveSelectionInputSchema = z.object({
  jobId: idSchema,
  variant: z
    .string()
    .max(30)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "A variant like ai or frontend"),
  items: z
    .array(z.object({ kind: z.enum(SELECTION_ITEM_KINDS), id: idSchema }))
    .min(1)
    .max(100)
    .refine(
      (items) => unique(items, (item) => `${item.kind}:${item.id}`),
      "An item twice",
    ),
});

/** Whole currency units with a period (K-16). */
export const salaryRangeSchema = z
  .object({
    min: z.number().int().min(0),
    max: z.number().int().min(0),
    currency: z.enum(CURRENCIES),
    period: z.enum(PAY_PERIODS),
  })
  .refine(isSalaryRange, {
    message: "The minimum is above the maximum",
    path: ["max"],
  });

/** Each part given replaces the saved one; `salary: null` clears it. */
export const saveJobKitInputSchema = z
  .object({
    jobId: idSchema,
    intro: text(INTRO_MAX_LENGTH).optional(),
    salary: salaryRangeSchema.nullable().optional(),
    answers: z
      .array(
        z.object({
          question: required(QUESTION_MAX_LENGTH),
          answer: required(FORM_ANSWER_MAX_LENGTH),
        }),
      )
      .max(30)
      .optional(),
  })
  .refine((input) => hasChanges(input, ["jobId"]), nothingToChange);

/** Replaces the list, in this order; labels unique ignoring case (K-18). */
export const saveStandardAnswersInputSchema = z.object({
  answers: z
    .array(
      z.object({
        label: required(60),
        value: required(STANDARD_ANSWER_MAX_LENGTH),
      }),
    )
    .max(30)
    .refine(
      (answers) => unique(answers, (answer) => answer.label.toLowerCase()),
      "A label twice",
    ),
});

// --- Job search (23) ---

export const getSearchCriteriaInputSchema = z.object({});

const shortList = (maxItems: number, maxLength: number) =>
  z
    .array(required(maxLength))
    .max(maxItems)
    .refine(
      (items) => unique(items, (item) => item.toLowerCase()),
      "A value twice",
    );

/** The app's Search criteria form only: Claude reads the criteria, never changes them. */
export const saveSearchCriteriaInputSchema = z.object({
  queries: shortList(20, 200),
  /** In priority order. */
  lanes: shortList(10, 60).min(1),
  shapes: shortList(10, 40),
  maxHours: z.number().int().min(0).max(168),
  timezoneNote: text(200),
  rateFloor: z
    .object({
      amount: z.number().int().min(0),
      currency: z.enum(CURRENCIES),
      period: z.enum(PAY_PERIODS),
    })
    .nullable(),
  autoReject: shortList(100, 100),
  maxAgeDays: z.number().int().min(1).max(365),
  sources: shortList(30, 200),
});

/** The routine's batch; a known URL is skipped by the service. */
export const saveOpeningsInputSchema = z.object({
  openings: z
    .array(
      z.object({
        url: httpsUrlSchema,
        company: nameSchema,
        role: required(160),
        lane: required(60),
        /** An excerpt: the routine saves many at once. */
        posting: required(OPENING_POSTING_MAX_LENGTH),
        postedOn: calendarDateSchema.optional(),
        rateText: text(100).optional(),
        why: required(500),
      }),
    )
    .min(1)
    .max(OPENINGS_PER_CALL)
    .refine(
      (openings) => unique(openings, (opening) => opening.url),
      "A URL twice",
    ),
});

export const listOpeningsInputSchema = z.object({
  status: z.enum(OPENING_STATUSES).optional(),
});

/** Keep or dismiss; tracking goes through career_add_job { openingId }. */
export const updateOpeningInputSchema = z.object({
  openingId: idSchema,
  status: z.enum(OPENING_DECISIONS),
});

// --- Interviews (24) ---

const starPart = required(STAR_PART_MAX_LENGTH);

export const saveStoryInputSchema = z.object({
  id: idSchema.optional(),
  title: required(120),
  situation: starPart,
  task: starPart,
  action: starPart,
  result: starPart,
  experienceId: idSchema.nullable().optional(),
  /** The facts its result rests on; an unverified one makes the story unverified. */
  factIds: z
    .array(idSchema)
    .max(20)
    .refine((ids) => unique(ids, (id) => id), "A fact twice")
    .optional(),
  skills: z.array(skillNameSchema).max(20).optional(),
});

export const listStoriesInputSchema = z.object({});

/** A pasted Drive link; only the file ID is stored (R2-13). `null` removes the video. */
export const driveLinkSchema = z
  .string()
  .max(500)
  .refine(
    (link) => driveFileId(link) !== null,
    "A drive.google.com/file/d/<id> or open?id=<id> link",
  );

export const saveAnswerInputSchema = z.object({
  id: idSchema.optional(),
  question: required(QUESTION_MAX_LENGTH),
  answer: required(ANSWER_MAX_LENGTH),
  driveLink: driveLinkSchema.nullable().optional(),
  storyId: idSchema.nullable().optional(),
  /** None: a general answer. */
  jobId: idSchema.nullable().optional(),
});

export const listAnswersInputSchema = z
  .object({
    jobId: idSchema.optional(),
    /** Only answers for no job. */
    general: z.boolean().optional(),
  })
  .refine((input) => !(input.jobId && input.general), {
    message: "A job's answers or the general ones, not both",
    path: ["general"],
  });

export const logDrillInputSchema = z.object({
  mode: z.enum(DRILL_MODES),
  /** The topic or the job drilled. */
  topic: required(200),
  weakest: z.array(required(500)).max(DRILL_WEAKEST_MAX),
  fix: required(1_000),
});

export const listDrillsInputSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
});
