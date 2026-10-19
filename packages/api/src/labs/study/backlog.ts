// Study backlog services (docs/prd/10-study-backlog.md), shared by the
// /api/study routes, the study_* MCP tools and the Study contract. The rules
// are @projects-lab/shared/study's; this file only reads and writes D1.
import type { LabSummary } from "@projects-lab/shared";
import {
  type CourseLevel,
  deriveGrade,
  formatGrade,
  localDate,
  type Priority,
  sortBacklog,
  suggestNext,
  summarize,
  type TopicLevel,
  type TopicStatus,
  withStatus,
} from "@projects-lab/shared/study";
import { ToolError } from "../../core/lab";
import { findOrCreateSkill } from "../../core/skills";

/** A topic as Claude and the app see it: `id` is the code ("FE-01"). */
export interface Topic {
  id: string;
  skill: string;
  skillId: string;
  area: string;
  level: TopicLevel;
  priority: Priority;
  status: TopicStatus;
  /** Integer tenths, from the most recently graded exam; null until one is. */
  grade: number | null;
  startedOn: string | null;
  finishedOn: string | null;
  note: string;
}

export interface Area {
  prefix: string;
  name: string;
  position: number;
}

interface TopicRow {
  rowId: string;
  code: string;
  areaId: string;
  prefix: string;
  skillId: string;
  skill: string;
  level: TopicLevel;
  priority: Priority;
  status: TopicStatus;
  note: string;
  startedOn: string | null;
  deletedAt: string | null;
}

interface ExamRow {
  topicId: string;
  level: CourseLevel;
  attempt: number;
  grade: number | null;
  gradedAt: string | null;
}

const TOPIC_SELECT = `
  SELECT t.id AS rowId, t.code, t.area_id AS areaId, a.prefix, t.skill_id AS skillId,
         s.name AS skill, t.level, t.priority, t.status, t.note,
         t.started_on AS startedOn, t.deleted_at AS deletedAt
  FROM learn_topic t
  JOIN learn_area a ON a.id = t.area_id
  JOIN skill s ON s.id = t.skill_id`;

/** The owner's IANA timezone: dates (Started, Finished) are their local day. */
export async function ownerTimeZone(
  db: D1Database,
  userId: string,
): Promise<string> {
  const row = await db
    .prepare("SELECT timezone FROM user WHERE id = ?")
    .bind(userId)
    .first<{ timezone: string }>();
  return row?.timezone ?? "UTC";
}

async function gradedExams(
  db: D1Database,
  topicIds: readonly string[],
): Promise<Map<string, ExamRow[]>> {
  const byTopic = new Map<string, ExamRow[]>();
  if (topicIds.length === 0) return byTopic;
  const { results } = await db
    .prepare(
      `SELECT topic_id AS topicId, level, attempt, grade, graded_at AS gradedAt
       FROM learn_exam
       WHERE grade IS NOT NULL
         AND topic_id IN (SELECT value FROM json_each(?))`,
    )
    .bind(JSON.stringify(topicIds))
    .all<ExamRow>();
  for (const exam of results) {
    const list = byTopic.get(exam.topicId) ?? [];
    list.push(exam);
    byTopic.set(exam.topicId, list);
  }
  return byTopic;
}

function toTopic(
  row: TopicRow,
  exams: readonly ExamRow[],
  timeZone: string,
): Topic {
  const { grade, finishedOn } = deriveGrade(exams, timeZone);
  return {
    id: row.code,
    skill: row.skill,
    skillId: row.skillId,
    area: row.prefix,
    level: row.level,
    priority: row.priority,
    status: row.status,
    grade,
    startedOn: row.startedOn,
    finishedOn,
    note: row.note,
  };
}

async function withGrades(
  db: D1Database,
  rows: readonly TopicRow[],
  timeZone: string,
): Promise<Topic[]> {
  const exams = await gradedExams(
    db,
    rows.map((row) => row.rowId),
  );
  return rows.map((row) => toTopic(row, exams.get(row.rowId) ?? [], timeZone));
}

async function areaRows(db: D1Database) {
  const { results } = await db
    .prepare(
      "SELECT id, prefix, name, position FROM learn_area ORDER BY position",
    )
    .all<{ id: string; prefix: string; name: string; position: number }>();
  return results;
}

async function liveTopicRows(db: D1Database): Promise<TopicRow[]> {
  const { results } = await db
    .prepare(`${TOPIC_SELECT} WHERE t.deleted_at IS NULL`)
    .all<TopicRow>();
  return results;
}

/** One live topic by code, or not_found. */
export async function getTopic(
  db: D1Database,
  code: string,
  timeZone: string,
): Promise<Topic> {
  const row = await liveTopicRow(db, code);
  const [topic] = await withGrades(db, [row], timeZone);
  return topic as Topic;
}

async function liveTopicRow(db: D1Database, code: string): Promise<TopicRow> {
  const row = await db
    .prepare(`${TOPIC_SELECT} WHERE t.code = ? AND t.deleted_at IS NULL`)
    .bind(code)
    .first<TopicRow>();
  if (!row)
    throw new ToolError("not_found", `No topic ${code} in the backlog.`);
  return row;
}

/** The backlog in its order (PRD 10): areas by position, then status, priority, code. */
export async function listBacklog(
  db: D1Database,
  timeZone: string,
  filter: { area?: string; status?: TopicStatus } = {},
): Promise<{ areas: Area[]; topics: Topic[] }> {
  const areas = await areaRows(db);
  const rows = await liveTopicRows(db);
  const topics = await withGrades(db, rows, timeZone);
  const sorted = sortBacklog(
    areas,
    topics.map((topic, i) => ({
      ...topic,
      code: topic.id,
      areaId: (rows[i] as TopicRow).areaId,
    })),
  )
    .filter((topic) => !filter.area || topic.area === filter.area)
    .filter((topic) => !filter.status || topic.status === filter.status)
    .map(({ code: _code, areaId: _areaId, ...topic }) => topic);
  return {
    areas: areas.map(({ prefix, name, position }) => ({
      prefix,
      name,
      position,
    })),
    topics: sorted,
  };
}

export interface BacklogSummary {
  areas: (Area & {
    notStarted: number;
    inProgress: number;
    done: number;
    average: number | null;
  })[];
  total: {
    notStarted: number;
    inProgress: number;
    done: number;
    average: number | null;
  };
  /** The first Not started P1, else P2 (PRD 10). */
  next: Pick<Topic, "id" | "skill" | "area" | "priority" | "level"> | null;
}

/** What `/backlog` reports: counts per area and in total, averages, the next topic. */
export async function getBacklogSummary(
  db: D1Database,
  timeZone: string,
): Promise<BacklogSummary> {
  const areas = await areaRows(db);
  const rows = await liveTopicRows(db);
  const topics = (await withGrades(db, rows, timeZone)).map((topic, i) => ({
    ...topic,
    code: topic.id,
    areaId: (rows[i] as TopicRow).areaId,
  }));
  const summary = summarize(areas, topics);
  const byId = new Map(areas.map((area) => [area.id, area]));
  const next = suggestNext(areas, topics);
  return {
    areas: summary.areas.map(({ areaId, ...counts }) => {
      const area = byId.get(areaId);
      return {
        prefix: area?.prefix ?? "",
        name: area?.name ?? "",
        position: area?.position ?? 0,
        ...counts,
      };
    }),
    total: summary.total,
    next: next
      ? {
          id: next.id,
          skill: next.skill,
          area: next.area,
          priority: next.priority,
          level: next.level,
        }
      : null,
  };
}

/** Home's Study card (00-platform): null while the backlog is empty. */
export async function getHomeSummary(
  db: D1Database,
  timeZone: string,
): Promise<LabSummary | null> {
  const { total } = await getBacklogSummary(db, timeZone);
  if (total.notStarted + total.inProgress + total.done === 0) return null;
  const latest = await db
    .prepare(
      `SELECT c.id AS courseId, t.code, s.name AS skill FROM learn_course c
       JOIN learn_topic t ON t.id = c.topic_id
       JOIN skill s ON s.id = t.skill_id
       WHERE t.status = 'in_progress' AND t.deleted_at IS NULL
       ORDER BY c.recorded_at DESC LIMIT 1`,
    )
    .first<{ courseId: string; code: string; skill: string }>();
  return {
    stats: [
      { value: String(total.inProgress), label: "In progress" },
      { value: String(total.notStarted), label: "Not started" },
      {
        value: total.average === null ? "—" : formatGrade(total.average),
        label: "Average grade",
      },
    ],
    // The bundle's foot, "Continue CS-02 Graphs"; the card opens that course.
    ...(latest
      ? {
          foot: { label: "Continue", value: `${latest.code} ${latest.skill}` },
          href: `/study/courses/${latest.courseId}`,
        }
      : {}),
  };
}

export interface AddedTopic {
  topic: Topic;
  created: boolean;
  restored: boolean;
}

/** By skill name (found or created) or by an existing skill's id (the Study contract). */
export type TopicToAdd = (
  | { skill: string; skillId?: undefined }
  | { skillId: string; skill?: undefined }
) & {
  area: string;
  level?: CourseLevel;
  priority?: Priority;
  note?: string;
};

/**
 * Adds each topic the backlog lacks (PRD 10). An existing topic for the skill
 * is returned unchanged; a removed one is restored with its code. A new topic
 * claims its code in one batch with the area counter, so concurrent adds never
 * share a code; losing a race on the skill re-reads the winner.
 */
export async function addTopics(
  db: D1Database,
  items: readonly TopicToAdd[],
  now: Date,
  timeZone: string,
): Promise<AddedTopic[]> {
  const added: AddedTopic[] = [];
  for (const item of items) added.push(await addTopic(db, item, now, timeZone));
  return added;
}

async function addTopic(
  db: D1Database,
  item: TopicToAdd,
  now: Date,
  timeZone: string,
): Promise<AddedTopic> {
  const at = now.toISOString();
  const area = await db
    .prepare("SELECT id FROM learn_area WHERE prefix = ?")
    .bind(item.area)
    .first<{ id: string }>();
  if (!area)
    throw new ToolError(
      "not_found",
      `No backlog area with prefix ${item.area}.`,
    );

  const skillId =
    item.skillId !== undefined
      ? await liveSkillId(db, item.skillId)
      : (await findOrCreateSkill(db, item.skill, at)).id;

  const existing = await topicRowBySkill(db, skillId);
  if (existing) return keepOrRestore(db, existing, at, timeZone);

  const rowId = crypto.randomUUID();
  try {
    await db.batch([
      db
        .prepare("UPDATE learn_area SET next_seq = next_seq + 1 WHERE id = ?")
        .bind(area.id),
      db
        .prepare(
          `INSERT INTO learn_topic
             (id, code, area_id, skill_id, level, priority, status, note, created_at, updated_at)
           SELECT ?, prefix || '-' || printf('%02d', next_seq - 1), id, ?, ?, ?, 'not_started', ?, ?, ?
           FROM learn_area WHERE id = ?`,
        )
        .bind(
          rowId,
          skillId,
          item.level ?? "unset",
          item.priority ?? 2,
          item.note ?? "",
          at,
          at,
          area.id,
        ),
    ]);
  } catch (error) {
    // Another add took this skill first: its topic is the answer.
    if (!String(error).includes("learn_topic.skill_id")) throw error;
    const winner = await topicRowBySkill(db, skillId);
    if (!winner) throw error;
    return keepOrRestore(db, winner, at, timeZone);
  }
  const row = await db
    .prepare(`${TOPIC_SELECT} WHERE t.id = ?`)
    .bind(rowId)
    .first<TopicRow>();
  return {
    topic: toTopic(row as TopicRow, [], timeZone),
    created: true,
    restored: false,
  };
}

async function liveSkillId(db: D1Database, skillId: string): Promise<string> {
  const row = await db
    .prepare("SELECT id FROM skill WHERE id = ? AND deleted_at IS NULL")
    .bind(skillId)
    .first<{ id: string }>();
  if (!row) throw new ToolError("not_found", `No skill ${skillId}.`);
  return row.id;
}

function topicRowBySkill(db: D1Database, skillId: string) {
  return db
    .prepare(`${TOPIC_SELECT} WHERE t.skill_id = ?`)
    .bind(skillId)
    .first<TopicRow>();
}

async function keepOrRestore(
  db: D1Database,
  row: TopicRow,
  at: string,
  timeZone: string,
): Promise<AddedTopic> {
  const restored = row.deletedAt !== null;
  if (restored)
    await db
      .prepare(
        "UPDATE learn_topic SET deleted_at = NULL, updated_at = ? WHERE id = ?",
      )
      .bind(at, row.rowId)
      .run();
  const [topic] = await withGrades(db, [{ ...row, deletedAt: null }], timeZone);
  return { topic: topic as Topic, created: false, restored };
}

export interface TopicChanges {
  level?: TopicLevel;
  priority?: Priority;
  status?: TopicStatus;
  note?: string;
}

/** Edits a live topic. Going In progress sets Started once (withStatus). */
export async function updateTopic(
  db: D1Database,
  code: string,
  changes: TopicChanges,
  now: Date,
  timeZone: string,
): Promise<Topic> {
  const row = await liveTopicRow(db, code);
  const progress =
    changes.status === undefined
      ? { status: row.status, startedOn: row.startedOn }
      : withStatus(
          { status: row.status, startedOn: row.startedOn },
          changes.status,
          localDate(now.toISOString(), timeZone),
        );
  await db
    .prepare(
      `UPDATE learn_topic
       SET level = ?, priority = ?, status = ?, started_on = ?, note = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      changes.level ?? row.level,
      changes.priority ?? row.priority,
      progress.status,
      progress.startedOn,
      changes.note ?? row.note,
      now.toISOString(),
      row.rowId,
    )
    .run();
  return getTopic(db, code, timeZone);
}

/** Soft delete: the topic leaves the backlog and its code stays taken (S-9). */
export async function removeTopic(
  db: D1Database,
  code: string,
  now: Date,
): Promise<void> {
  const { meta } = await db
    .prepare(
      "UPDATE learn_topic SET deleted_at = ?, updated_at = ? WHERE code = ? AND deleted_at IS NULL",
    )
    .bind(now.toISOString(), now.toISOString(), code)
    .run();
  if (meta.changes === 0)
    throw new ToolError("not_found", `No topic ${code} in the backlog.`);
}

/** A new area after the others. Prefix and name are unique (S-1, S-2). */
export async function addArea(
  db: D1Database,
  input: { name: string; prefix: string },
  now: Date,
): Promise<Area> {
  try {
    await db
      .prepare(
        `INSERT INTO learn_area (id, prefix, name, position, created_at)
         SELECT ?, ?, ?, COALESCE(MAX(position), 0) + 1, ? FROM learn_area`,
      )
      .bind(
        `area-${crypto.randomUUID()}`,
        input.prefix,
        input.name,
        now.toISOString(),
      )
      .run();
  } catch (error) {
    const message = String(error);
    if (message.includes("learn_area.prefix"))
      throw new ToolError(
        "conflict",
        `Prefix ${input.prefix} is already taken.`,
      );
    if (message.includes("UNIQUE constraint failed"))
      throw new ToolError(
        "conflict",
        `An area named "${input.name}" already exists.`,
      );
    throw error;
  }
  const row = await db
    .prepare("SELECT prefix, name, position FROM learn_area WHERE prefix = ?")
    .bind(input.prefix)
    .first<Area>();
  return row as Area;
}
