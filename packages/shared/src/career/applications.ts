// Application statuses (docs/prd/21, 23). The history is append-only events
// (K-12); the current status is the latest one, derived at read time.

export const APPLICATION_STATUSES = [
  "evaluated",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
  "closed_silent",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** An application with no answer for 3 weeks is closed silent (career-os /weekly-review). */
export const SILENT_AFTER_DAYS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface JobEvent {
  status: ApplicationStatus;
  /** ISO timestamp. */
  at: string;
}

/** The latest event's status; ties keep the later row. Null with no events. */
export function currentEvent<T extends JobEvent>(
  events: readonly T[],
): T | null {
  let latest: T | null = null;
  for (const event of events)
    if (latest === null || event.at >= latest.at) latest = event;
  return latest;
}

/** Only an `applied` application goes silent; interviewing waits on the owner too. */
export function isSilent(events: readonly JobEvent[], now: string): boolean {
  const current = currentEvent(events);
  if (current?.status !== "applied") return false;
  return Date.parse(now) - Date.parse(current.at) >= SILENT_AFTER_DAYS * DAY_MS;
}
