// Study backlog rules (docs/prd/10-study-backlog.md) as pure functions, shared
// by the API, the MCP tools and the web. Derived state (summary, next topic,
// verified) is computed here at read time and never stored.

export const TOPIC_LEVELS = [
  "unset",
  "fast_track",
  "essential",
  "specialized",
] as const;
export type TopicLevel = (typeof TOPIC_LEVELS)[number];

/** A course or exam always has a real level; only a topic can be unset. */
export const COURSE_LEVELS = [
  "fast_track",
  "essential",
  "specialized",
] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number];

export const PRIORITIES = [1, 2, 3] as const;
export type Priority = (typeof PRIORITIES)[number];
export const DEFAULT_PRIORITY: Priority = 2;

/** In backlog order: In progress, then Not started, then Done. */
export const TOPIC_STATUSES = ["in_progress", "not_started", "done"] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export const NOTE_MAX_LENGTH = 120;
/** A skill is verified for Career at a Done topic with at least this grade (A-8). */
export const VERIFIED_MIN_GRADE = 70;
export const SPECIALIZED_MAX_MODULES = 4;
/**
 * A deleted exam's files leave study-materials at the nightly run once it has
 * been deleted this long (ST-14): an Undo just before the run can't race it.
 */
export const DELETED_EXAM_FILES_AFTER_MINUTES = 60;

const PREFIX = /^[A-Z]{2}$/;
const CODE = /^([A-Z]{2})-(\d{2,})$/;

export function isValidPrefix(prefix: string): boolean {
  return PREFIX.test(prefix);
}

/** "FE" + 1 → "FE-01"; 100 → "FE-100". Same as the SQL printf('%02d'). */
export function formatTopicCode(prefix: string, seq: number): string {
  if (!isValidPrefix(prefix))
    throw new RangeError(`Not an area prefix: ${prefix}`);
  if (!Number.isInteger(seq) || seq < 1)
    throw new RangeError(`Not a topic sequence: ${seq}`);
  return `${prefix}-${String(seq).padStart(2, "0")}`;
}

/** The inverse of formatTopicCode; null for anything it wouldn't produce ("FE-1", "FE-001"). */
export function parseTopicCode(
  code: string,
): { prefix: string; seq: number } | null {
  const match = CODE.exec(code);
  if (!match) return null;
  const prefix = match[1] as string;
  const seq = Number(match[2]);
  return seq >= 1 && formatTopicCode(prefix, seq) === code
    ? { prefix, seq }
    : null;
}

export interface AreaRef {
  id: string;
  position: number;
}

export interface TopicRef {
  code: string;
  areaId: string;
  priority: Priority;
  status: TopicStatus;
  /** Derived from exams (deriveGrade); null until one is graded. */
  grade: number | null;
  deletedAt?: string | null;
}

const statusRank = (status: TopicStatus) => TOPIC_STATUSES.indexOf(status);
const seqOf = (code: string) => parseTopicCode(code)?.seq ?? 0;

/** Inside an area: status, then priority, then the code's number (FE-02 < FE-10 < FE-100). */
export function compareTopics(a: TopicRef, b: TopicRef): number {
  return (
    statusRank(a.status) - statusRank(b.status) ||
    a.priority - b.priority ||
    seqOf(a.code) - seqOf(b.code)
  );
}

const live = <T extends TopicRef>(topics: readonly T[]) =>
  topics.filter((topic) => !topic.deletedAt);

/** Live topics in backlog order: area by position, then compareTopics. */
export function sortBacklog<T extends TopicRef>(
  areas: readonly AreaRef[],
  topics: readonly T[],
): T[] {
  const position = new Map(areas.map((area) => [area.id, area.position]));
  return live(topics).sort(
    (a, b) =>
      (position.get(a.areaId) ?? Number.MAX_SAFE_INTEGER) -
        (position.get(b.areaId) ?? Number.MAX_SAFE_INTEGER) ||
      compareTopics(a, b),
  );
}

/** Mean of integer tenths, rounded half-up to a whole tenth; null when empty. */
export function averageTenths(grades: readonly number[]): number | null {
  if (grades.length === 0) return null;
  const sum = grades.reduce((total, grade) => total + grade, 0);
  return Math.round(sum / grades.length);
}

export interface StatusCounts {
  notStarted: number;
  inProgress: number;
  done: number;
  /** Average grade of Done topics that have one, in tenths. */
  average: number | null;
}

export interface BacklogSummary {
  areas: (StatusCounts & { areaId: string })[];
  total: StatusCounts;
}

function counts(topics: readonly TopicRef[]): StatusCounts {
  const graded = topics
    .filter((topic) => topic.status === "done" && topic.grade !== null)
    .map((topic) => topic.grade as number);
  return {
    notStarted: topics.filter((topic) => topic.status === "not_started").length,
    inProgress: topics.filter((topic) => topic.status === "in_progress").length,
    done: topics.filter((topic) => topic.status === "done").length,
    average: averageTenths(graded),
  };
}

/** Every area appears, empty ones included, in position order. Removed topics don't count. */
export function summarize(
  areas: readonly AreaRef[],
  topics: readonly TopicRef[],
): BacklogSummary {
  const current = live(topics);
  return {
    areas: [...areas]
      .sort((a, b) => a.position - b.position)
      .map((area) => ({
        areaId: area.id,
        ...counts(current.filter((topic) => topic.areaId === area.id)),
      })),
    total: counts(current),
  };
}

/** The first Not started P1 in backlog order, else the first P2; null otherwise. */
export function suggestNext<T extends TopicRef>(
  areas: readonly AreaRef[],
  topics: readonly T[],
): T | null {
  const waiting = sortBacklog(areas, topics).filter(
    (topic) => topic.status === "not_started",
  );
  return (
    waiting.find((topic) => topic.priority === 1) ??
    waiting.find((topic) => topic.priority === 2) ??
    null
  );
}

export interface TopicProgress {
  status: TopicStatus;
  /** Owner-local date (YYYY-MM-DD) it first went In progress. */
  startedOn: string | null;
}

/** A status set by hand. Going In progress sets Started once; nothing else touches it. */
export function withStatus(
  topic: TopicProgress,
  status: TopicStatus,
  today: string,
): TopicProgress {
  return {
    status,
    startedOn:
      status === "in_progress" ? (topic.startedOn ?? today) : topic.startedOn,
  };
}

/** Recording a course: a Not started topic goes In progress; others keep their status. */
export function afterCourseRecorded(
  topic: TopicProgress,
  today: string,
): TopicProgress {
  return topic.status === "not_started"
    ? withStatus(topic, "in_progress", today)
    : topic;
}

/** Recording a grade makes the topic Done. */
export function afterGradeRecorded(topic: TopicProgress): TopicProgress {
  return { status: "done", startedOn: topic.startedOn };
}

/** Verified for Career: Done with a grade of at least 70 (A-8). A Done topic without a grade isn't. */
export function isVerified(topic: {
  status: TopicStatus;
  grade: number | null;
}): boolean {
  return (
    topic.status === "done" &&
    topic.grade !== null &&
    topic.grade >= VERIFIED_MIN_GRADE
  );
}
