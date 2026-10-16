// The skill registry's services, shared by /api routes and MCP tools.
import type { Skill } from "@projects-lab/shared";

/**
 * The live skill whose name or one alias is `query`, ignoring case; soft-
 * deleted skills don't count. C-8 keeps names and aliases unique among live
 * skills, so there is at most one.
 */
export async function findSkill(
  db: D1Database,
  query: string,
): Promise<Skill | null> {
  const row = await db
    .prepare(
      `SELECT id, name, aliases_json AS aliasesJson FROM skill
       WHERE deleted_at IS NULL
         AND (name = ?1 COLLATE NOCASE
              OR EXISTS (SELECT 1 FROM json_each(skill.aliases_json)
                         WHERE value = ?1 COLLATE NOCASE))
       LIMIT 1`,
    )
    .bind(query)
    .first<{ id: string; name: string; aliasesJson: string }>();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    aliases: JSON.parse(row.aliasesJson) as string[],
  };
}
