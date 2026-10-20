// Career profile rules (docs/prd/20-career-profile.md): the lists and limits
// the K-n CHECKs, the services and the forms share.

export const LINK_KINDS = [
  "linkedin",
  "github",
  "portfolio",
  "scholar",
  "other",
] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const EXPERIENCE_KINDS = [
  "job",
  "contract",
  "research",
  "project",
] as const;
export type ExperienceKind = (typeof EXPERIENCE_KINDS)[number];

/** Declared skill levels (K-7); no 1–10 scale. */
export const SKILL_LEVELS = ["familiar", "working", "strong"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

/** Text limits in characters, by PRD: 20 profile, 21 jobs, 22 documents, 24 interviews. */
export const SUMMARY_MAX_LENGTH = 600;
export const FACT_MAX_LENGTH = 300;
export const POSTING_MAX_LENGTH = 20_000;
export const REQUIREMENT_MAX_LENGTH = 120;
export const INTRO_MAX_LENGTH = 1_500;
export const FORM_ANSWER_MAX_LENGTH = 2_000;
export const STANDARD_ANSWER_MAX_LENGTH = 300;
export const STAR_PART_MAX_LENGTH = 600;
export const QUESTION_MAX_LENGTH = 200;
export const ANSWER_MAX_LENGTH = 3_000;

/** The profile photo (K-3): one image, uploaded in the app only. */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const PHOTO_EXTENSIONS: Record<PhotoType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isPhotoType(type: string): type is PhotoType {
  return (PHOTO_TYPES as readonly string[]).includes(type);
}

/** The R2 key of the photo: `profile/photo.<ext>`. */
export function photoKey(type: PhotoType): string {
  return `profile/photo.${PHOTO_EXTENSIONS[type]}`;
}

const PROFILE_DATE = /^(\d{4})(?:-(0[1-9]|1[0-2]))?$/;

/** Education and experience dates are `YYYY` or `YYYY-MM` (K-4). */
export function isProfileDate(value: string): boolean {
  return PROFILE_DATE.test(value);
}

/**
 * An end is not before its start (K-4). Months count only when both dates
 * have one: `2020-05` → `2020` is the same year, so it holds.
 */
export function endNotBeforeStart(start: string, end: string): boolean {
  const a = PROFILE_DATE.exec(start);
  const b = PROFILE_DATE.exec(end);
  if (!a || !b) return false;
  const years = Number(b[1]) - Number(a[1]);
  if (years !== 0 || a[2] === undefined || b[2] === undefined)
    return years >= 0;
  return Number(b[2]) >= Number(a[2]);
}
