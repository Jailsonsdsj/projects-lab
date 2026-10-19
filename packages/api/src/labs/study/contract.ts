// The Study contract (docs/architecture.md §4), built per request because it
// needs the database: Career gets `studyContract` at mount time and calls it
// with its request's D1. The only way Career reaches Study Lab.
import type { StudyContract } from "@projects-lab/shared";
import { deriveGrade, isVerified } from "@projects-lab/shared/study";
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
          note,
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
      const { results } = await db
        .prepare(
          `SELECT t.skill_id AS skillId, t.status,
                  e.level, e.attempt, e.grade, e.graded_at AS gradedAt
           FROM learn_topic t
           LEFT JOIN learn_exam e ON e.topic_id = t.id AND e.grade IS NOT NULL
           WHERE t.deleted_at IS NULL
             AND t.skill_id IN (SELECT value FROM json_each(?))`,
        )
        .bind(JSON.stringify(skillIds))
        .all<{
          skillId: string;
          status: "not_started" | "in_progress" | "done";
          level: "fast_track" | "essential" | "specialized" | null;
          attempt: number | null;
          grade: number | null;
          gradedAt: string | null;
        }>();
      return skillIds.map((skillId) => {
        const rows = results.filter((row) => row.skillId === skillId);
        if (rows.length === 0) return { skillId, verified: false, grade: null };
        const { grade } = deriveGrade(
          rows
            .filter((row) => row.level !== null && row.attempt !== null)
            .map((row) => ({
              level: row.level as "fast_track" | "essential" | "specialized",
              attempt: row.attempt as number,
              grade: row.grade,
              gradedAt: row.gradedAt,
            })),
          "UTC",
        );
        const status = (rows[0] as (typeof rows)[number]).status;
        return { skillId, verified: isVerified({ status, grade }), grade };
      });
    },
  };
}
