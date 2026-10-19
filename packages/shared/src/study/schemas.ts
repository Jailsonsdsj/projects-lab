// Inputs of every study_* tool and its /api route (docs/prd/10–12), and the
// study-materials paths (architecture §7, R2-2). Every string is bounded or an
// enum: no tool takes file content (02-integration).
import { z } from "zod";
import {
  COURSE_LEVELS,
  type CourseLevel,
  isValidPrefix,
  NOTE_MAX_LENGTH,
  parseTopicCode,
  SPECIALIZED_MAX_MODULES,
  TOPIC_LEVELS,
  TOPIC_STATUSES,
} from "./backlog";
import { GRADE_MAX, GRADE_MIN } from "./grades";

/** File names spell levels with a hyphen; the database with an underscore. */
export const LEVEL_SLUGS: Record<CourseLevel, string> = {
  fast_track: "fast-track",
  essential: "essential",
  specialized: "specialized",
};
const levelOfSlug = (slug: string) =>
  COURSE_LEVELS.find((level) => LEVEL_SLUGS[level] === slug);

export const PATH_MAX_LENGTH = 300;
const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const LEVEL = "fast-track|essential|specialized";
const COURSE_PATH = new RegExp(
  `^Study Lab/(${SLUG})/(${SLUG})/(${SLUG})__(${LEVEL})(?:_m(\\d+))?\\.md$`,
);
const EXAM_PATH = new RegExp(
  `^Study Lab/(${SLUG})/(${SLUG})/(${SLUG})__(${LEVEL})__exam-(\\d+)\\.(md|pdf)$`,
);

export interface CoursePath {
  areaSlug: string;
  topicSlug: string;
  level: CourseLevel;
  module: number | null;
}

/** `Study Lab/<area>/<topic>/<topic>__<level>[_m<n>].md`; null if it isn't one. */
export function parseCoursePath(path: string): CoursePath | null {
  const match = COURSE_PATH.exec(path);
  if (!match || match[2] !== match[3]) return null;
  const level = levelOfSlug(match[4] as string);
  if (!level) return null;
  return {
    areaSlug: match[1] as string,
    topicSlug: match[2] as string,
    level,
    module: match[5] === undefined ? null : Number(match[5]),
  };
}

export interface ExamPath {
  areaSlug: string;
  topicSlug: string;
  level: CourseLevel;
  attempt: number;
  extension: "md" | "pdf";
  /** The path without its extension: an exam's .md and .pdf share it. */
  stem: string;
}

/** `Study Lab/<area>/<topic>/<topic>__<level>__exam-<n>.(md|pdf)`; null if it isn't one. */
export function parseExamPath(path: string): ExamPath | null {
  const match = EXAM_PATH.exec(path);
  if (!match || match[2] !== match[3]) return null;
  const level = levelOfSlug(match[4] as string);
  if (!level) return null;
  return {
    areaSlug: match[1] as string,
    topicSlug: match[2] as string,
    level,
    attempt: Number(match[5]),
    extension: match[6] as "md" | "pdf",
    stem: path.slice(0, path.lastIndexOf(".")),
  };
}

export const topicCodeSchema = z
  .string()
  .max(12)
  .refine((code) => parseTopicCode(code) !== null, "A topic ID like FE-01");
export const areaPrefixSchema = z
  .string()
  .length(2)
  .refine(isValidPrefix, "Two uppercase letters");
export const skillNameSchema = z.string().trim().min(1).max(200);
export const areaNameSchema = z.string().trim().min(1).max(60);
export const noteSchema = z.string().trim().max(NOTE_MAX_LENGTH);
export const prioritySchema = z.number().int().min(1).max(3);
export const topicLevelSchema = z.enum(TOPIC_LEVELS);
export const courseLevelSchema = z.enum(COURSE_LEVELS);
export const topicStatusSchema = z.enum(TOPIC_STATUSES);
export const gradeSchema = z.number().int().min(GRADE_MIN).max(GRADE_MAX);
const attemptSchema = z.number().int().min(1).max(99);
const pathSchema = z.string().max(PATH_MAX_LENGTH);

// --- Backlog (10) ---

export const listBacklogInputSchema = z.object({
  area: areaPrefixSchema.optional(),
  status: topicStatusSchema.optional(),
});

export const getSummaryInputSchema = z.object({});

export const addTopicsInputSchema = z.object({
  topics: z
    .array(
      z.object({
        /** A skill name or alias; found first, created only when none matches. */
        skill: skillNameSchema,
        area: areaPrefixSchema,
        level: courseLevelSchema.optional(),
        priority: prioritySchema.optional(),
        note: noteSchema.optional(),
      }),
    )
    .min(1)
    .max(50),
});

export const updateTopicInputSchema = z
  .object({
    topicId: topicCodeSchema,
    level: topicLevelSchema.optional(),
    priority: prioritySchema.optional(),
    status: topicStatusSchema.optional(),
    note: noteSchema.optional(),
  })
  .refine(
    ({ topicId: _, ...changes }) =>
      Object.values(changes).some((value) => value !== undefined),
    "Nothing to change",
  );

export const removeTopicInputSchema = z.object({ topicId: topicCodeSchema });

export const addAreaInputSchema = z.object({
  name: areaNameSchema,
  prefix: areaPrefixSchema,
});

// --- Courses (11) ---

export const recordCourseInputSchema = z
  .object({
    topicId: topicCodeSchema,
    level: courseLevelSchema,
    /** 1 to 4 for Specialized; omitted (1) otherwise. */
    module: z.number().int().min(1).max(SPECIALIZED_MAX_MODULES).optional(),
    path: pathSchema,
  })
  .superRefine(({ level, module, path }, ctx) => {
    const parsed = parseCoursePath(path);
    if (!parsed) {
      ctx.addIssue({
        code: "custom",
        path: ["path"],
        message:
          "Not a course path: Study Lab/<area>/<topic>/<topic>__<level>[_m<n>].md",
      });
      return;
    }
    if (parsed.level !== level)
      ctx.addIssue({
        code: "custom",
        path: ["level"],
        message: `The path is a ${LEVEL_SLUGS[parsed.level]} course`,
      });
    if (level === "specialized") {
      if (module === undefined || parsed.module !== module)
        ctx.addIssue({
          code: "custom",
          path: ["module"],
          message:
            "A Specialized course is a module: _m<n> in the path, and the same module",
        });
    } else if (parsed.module !== null || (module !== undefined && module !== 1))
      ctx.addIssue({
        code: "custom",
        path: ["module"],
        message: "Only Specialized courses have modules",
      });
  });

export const listCoursesInputSchema = z.object({
  topicId: topicCodeSchema.optional(),
});

// --- Exams (12) ---

export const recordExamInputSchema = z
  .object({
    topicId: topicCodeSchema,
    level: courseLevelSchema,
    attempt: attemptSchema,
    mdPath: pathSchema,
    pdfPath: pathSchema,
  })
  .superRefine(({ level, attempt, mdPath, pdfPath }, ctx) => {
    const md = parseExamPath(mdPath);
    const pdf = parseExamPath(pdfPath);
    if (md?.extension !== "md")
      ctx.addIssue({
        code: "custom",
        path: ["mdPath"],
        message: "Not an exam path: …/<topic>__<level>__exam-<n>.md",
      });
    if (pdf?.extension !== "pdf" || (md && pdf.stem !== md.stem))
      ctx.addIssue({
        code: "custom",
        path: ["pdfPath"],
        message: "The exam's .pdf, next to its .md with the same name",
      });
    if (md && (md.level !== level || md.attempt !== attempt))
      ctx.addIssue({
        code: "custom",
        path: ["attempt"],
        message: `The path is ${LEVEL_SLUGS[md.level]} exam #${md.attempt}`,
      });
  });

export const recordGradeInputSchema = z.object({
  topicId: topicCodeSchema,
  /** Attempts count per topic and level, like the file names. */
  level: courseLevelSchema,
  attempt: attemptSchema,
  /** Integer tenths, 0–100 (8.5 → 85). */
  grade: gradeSchema,
});

export const listExamsInputSchema = z.object({
  topicId: topicCodeSchema.optional(),
});
