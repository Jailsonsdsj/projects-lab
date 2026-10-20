// Grades (docs/prd/12-study-exams.md): integer tenths 0–100, shown with one
// decimal. A topic's grade and Finished date are its most recently graded
// exam's, at any level, derived at read time.
import { isGradeTenths } from "../core/grades";
import type { CourseLevel } from "./backlog";

export {
  formatGrade,
  GRADE_MAX,
  GRADE_MIN,
  isGradeTenths,
  parseGrade,
} from "../core/grades";

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
