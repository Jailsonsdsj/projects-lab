// Grades are integer tenths, 0–100, everywhere (CLAUDE.md): 8.5 is 85. Study
// records them; Career shows Study's grade beside a verified skill.

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
