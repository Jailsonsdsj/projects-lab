// The Skills tab's read (docs/prd/20-career-profile.md § Screens): declared
// skills with their readiness (verified when Study proved them, else
// declared), and the skills Study verified that the profile doesn't declare,
// offered to declare (A-8: an offer, never added silently).
import type { SkillsResponse } from "@projects-lab/shared/career";
import type { Study } from "./jobs";

export async function listSkills(
  db: D1Database,
  study: Study,
): Promise<SkillsResponse> {
  const [declared, verified] = await Promise.all([
    db
      .prepare(
        `SELECT d.skill_id AS skillId, s.name, d.level, d.years, d.note
         FROM career_declared_skill d JOIN skill s ON s.id = d.skill_id
         ORDER BY s.name COLLATE NOCASE`,
      )
      .all<Omit<SkillsResponse["skills"][number], "readiness" | "grade">>(),
    study(db).verifiedSkills(),
  ]);
  const grades = new Map(verified.map((v) => [v.skillId, v.grade]));
  const mine = new Set(declared.results.map((d) => d.skillId));
  const offered = verified.filter((v) => !mine.has(v.skillId));
  const names = offered.length
    ? (
        await db
          .prepare(
            "SELECT id, name FROM skill WHERE deleted_at IS NULL AND id IN (SELECT value FROM json_each(?))",
          )
          .bind(JSON.stringify(offered.map((o) => o.skillId)))
          .all<{ id: string; name: string }>()
      ).results
    : [];
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  return {
    skills: declared.results.map((skill) => ({
      ...skill,
      readiness: grades.has(skill.skillId) ? "verified" : "declared",
      grade: grades.get(skill.skillId) ?? null,
    })),
    offers: offered
      .filter((o) => nameOf.has(o.skillId))
      .map((o) => ({
        skillId: o.skillId,
        name: nameOf.get(o.skillId) as string,
        grade: o.grade,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
