// Job search (docs/prd/23-career-job-search.md): the openings the weekly
// routine saves and the owner keeps, dismisses or tracks.

export const OPENING_STATUSES = [
  "new",
  "kept",
  "dismissed",
  "tracked",
] as const;
export type OpeningStatus = (typeof OPENING_STATUSES)[number];
/** What the owner sets by hand; `tracked` comes only from career_add_job. */
export const OPENING_DECISIONS = ["kept", "dismissed"] as const;

/** A routine saves at most this many openings a call, each with an excerpt of the posting. */
export const OPENINGS_PER_CALL = 20;
export const OPENING_POSTING_MAX_LENGTH = 4_000;
/** A `new` opening older than this is shown as stale. */
export const OPENING_STALE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isStale(
  opening: { status: OpeningStatus; createdAt: string },
  now: string,
): boolean {
  return (
    opening.status === "new" &&
    Date.parse(now) - Date.parse(opening.createdAt) >=
      OPENING_STALE_DAYS * DAY_MS
  );
}
