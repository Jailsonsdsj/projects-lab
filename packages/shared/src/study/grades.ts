// Grades (docs/prd/12-study-exams.md): integer tenths 0–100, shown with one
// decimal. A topic's grade and Finished date are its most recently graded
// exam's, at any level, derived at read time.
import type { CourseLevel } from "./backlog";

export const GRADE_MIN = 0;
export const GRADE_MAX = 100;

export function isGradeTenths(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= GRADE_MIN &&
    value <= GRADE_MAX
  );
}

/** 85 → "8.5", 100 → "10.0", 0 → "0.0". */
export function formatGrade(tenths: number): string {
  if (!isGradeTenths(tenths)) throw new RangeError(`Not a grade: ${tenths}`);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

const GRADE_TEXT = /^(\d{1,2})(?:\.(\d))?$/;

/** "8.5" → 85, "10" → 100; null for anything else ("8.55", "10.5", "-1"). No floats. */
export function parseGrade(text: string): number | null {
  const match = GRADE_TEXT.exec(text.trim());
  if (!match) return null;
  const tenths = Number(match[1]) * 10 + Number(match[2] ?? 0);
  return isGradeTenths(tenths) ? tenths : null;
}

export interface ExamGrade {
  level: CourseLevel;
  attempt: number;
  grade: number | null;
  /** UTC ISO-8601; null while ungraded. */
  gradedAt: string | null;
}

/** The owner's local date (YYYY-MM-DD) of a UTC instant. */
export function localDate(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const part = (type: string) =>
    parts.find((each) => each.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * A topic's grade and Finished date: the most recently graded exam, at any
 * level (a retake at a lower grade replaces a higher one). Ties on the instant
 * go to the higher attempt.
 */
export function deriveGrade(
  exams: readonly ExamGrade[],
  timeZone: string,
): { grade: number | null; finishedOn: string | null } {
  let latest: (ExamGrade & { grade: number; gradedAt: string }) | null = null;
  for (const exam of exams) {
    if (exam.grade === null || exam.gradedAt === null) continue;
    const graded = exam as ExamGrade & { grade: number; gradedAt: string };
    if (
      latest === null ||
      Date.parse(graded.gradedAt) > Date.parse(latest.gradedAt) ||
      (Date.parse(graded.gradedAt) === Date.parse(latest.gradedAt) &&
        graded.attempt > latest.attempt)
    )
      latest = graded;
  }
  return latest
    ? { grade: latest.grade, finishedOn: localDate(latest.gradedAt, timeZone) }
    : { grade: null, finishedOn: null };
}
