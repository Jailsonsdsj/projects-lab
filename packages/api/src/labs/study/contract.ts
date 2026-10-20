// The Study contract (docs/architecture.md §4), built per request because it
// needs the database: Career gets `studyContract` at mount time and calls it
// with its request's D1. The only way Career reaches Study Lab.
import type { StudyContract } from "@projects-lab/shared";
import {
  deriveGrade,
  isVerified,
  NOTE_MAX_LENGTH,
} from "@projects-lab/shared/study";
import { addTopics } from "./backlog";

export function studyContract(db: D1Database): StudyContract {
  return {
    async ensureTopics(input) {
      const added = await addTopics(
        db,
        input.map(({ skillId, area, priority, note }) => ({
          skillId,
          area,
          priority,
          // Study's note limit is Study's: a caller's longer note is cut, not refused.
          note: note.slice(0, NOTE_MAX_LENGTH),
        })),
        new Date(),
        "UTC",
      );
      return added.map(({ topic, created }) => ({
        skillId: topic.skillId,
        topicId: topic.id,
        created,
      }));
    },

    async skillStatus(skillIds) {
      const rows = await topicRows(
        db,
        "t.skill_id IN (SELECT value FROM json_each(?))",
        JSON.stringify(skillIds),
      );
      return skillIds.map((skillId) => statusOf(skillId, rows));
    },

    async verifiedSkills() {
      const rows = await topicRows(db, "t.status = 'done'");
      return [...new Set(rows.map((row) => row.skillId))].flatMap((skillId) => {
        const { verified, grade } = statusOf(skillId, rows);
        return verified && grade !== null ? [{ skillId, grade }] : [];
      });
    },

    async areas() {
      const { results } = await db
        .prepare("SELECT prefix, name FROM learn_area ORDER BY position")
        .all<{ prefix: string; name: string }>();
      return results;
    },
  };
}

type TopicRow = {
  skillId: string;
  code: string;
  status: "not_started" | "in_progress" | "done";
  level: "fast_track" | "essential" | "specialized" | null;
  attempt: number | null;
  grade: number | null;
  gradedAt: string | null;
};

/** Live topics (matching `where`) with their graded exams, one row per exam. */
async function topicRows(
  db: D1Database,
  where: string,
  ...params: unknown[]
): Promise<TopicRow[]> {
  const { results } = await db
    .prepare(
      `SELECT t.skill_id AS skillId, t.code, t.status,
              e.level, e.attempt, e.grade, e.graded_at AS gradedAt
       FROM learn_topic t
       LEFT JOIN learn_exam e ON e.topic_id = t.id AND e.grade IS NOT NULL
       WHERE t.deleted_at IS NULL AND ${where}`,
    )
    .bind(...params)
    .all<TopicRow>();
  return results;
}

/** A skill's grade (its topic's latest graded exam) and whether it's verified. */
function statusOf(skillId: string, rows: readonly TopicRow[]) {
  const own = rows.filter((row) => row.skillId === skillId);
  if (own.length === 0)
    return {
      skillId,
      verified: false,
      grade: null,
      topicId: null,
      topicStatus: null,
    };
  const { grade } = deriveGrade(
    own
      .filter((row) => row.level !== null && row.attempt !== null)
      .map((row) => ({
        level: row.level as "fast_track" | "essential" | "specialized",
        attempt: row.attempt as number,
        grade: row.grade,
        gradedAt: row.gradedAt,
      })),
    "UTC",
  );
  const status = (own[0] as TopicRow).status;
  return {
    skillId,
    verified: isVerified({ status, grade }),
    grade,
    topicId: (own[0] as TopicRow).code,
    topicStatus: status,
  };
}
