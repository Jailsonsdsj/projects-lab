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

/**
 * The live skill for `name` (or one of its aliases); otherwise a soft-deleted
 * skill with that name, restored, since C-1 keeps its name taken; otherwise a
 * new skill. A concurrent insert of the same name loses to C-1 and re-reads.
 */
export async function findOrCreateSkill(
  db: D1Database,
  name: string,
  now: string,
): Promise<Skill> {
  const wanted = name.trim();
  const live = await findSkill(db, wanted);
  if (live) return live;

  const removed = await db
    .prepare(
      "SELECT id FROM skill WHERE name = ? COLLATE NOCASE AND deleted_at IS NOT NULL LIMIT 1",
    )
    .bind(wanted)
    .first<{ id: string }>();
  if (removed) {
    await db
      .prepare("UPDATE skill SET deleted_at = NULL WHERE id = ?")
      .bind(removed.id)
      .run();
  } else {
    try {
      await db
        .prepare("INSERT INTO skill (id, name, created_at) VALUES (?, ?, ?)")
        .bind(crypto.randomUUID(), wanted, now)
        .run();
    } catch (error) {
      if (!String(error).includes("UNIQUE constraint failed")) throw error;
    }
  }
  const skill = await findSkill(db, wanted);
  if (!skill) throw new Error(`Skill "${wanted}" vanished after it was saved`);
  return skill;
}
