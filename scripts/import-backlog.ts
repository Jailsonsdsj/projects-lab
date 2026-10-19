// pnpm tsx scripts/import-backlog.ts <learning-backlog.md> [out.sql]
// ST-10: cs-learning-lab's backlog → one SQL file the owner runs once against
// production (`wrangler d1 execute … --remote --file`; that step is the
// owner's). Keeps the topic IDs, reuses or creates each skill, creates any area
// the seed lacks, and moves each area's counter past the imported IDs. Every
// insert is guarded, so running it twice changes nothing; it never deletes.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseLearningBacklog } from "../packages/shared/src/study/import";

const [source, out = "scripts/out/import-cs-learning-lab.sql"] =
  process.argv.slice(2);
if (!source) {
  console.error(
    "usage: tsx scripts/import-backlog.ts <learning-backlog.md> [out.sql]",
  );
  process.exit(2);
}

const q = (value: string | number | null) =>
  value === null
    ? "NULL"
    : typeof value === "number"
      ? String(value)
      : `'${value.replace(/'/g, "''")}'`;

/** The skill a name finds: a live one by name or alias, else any by name. */
const skillOf = (name: string) =>
  `(SELECT id FROM skill
     WHERE name = ${q(name)} COLLATE NOCASE
        OR (deleted_at IS NULL AND EXISTS (
              SELECT 1 FROM json_each(skill.aliases_json) WHERE value = ${q(name)} COLLATE NOCASE))
     ORDER BY deleted_at IS NOT NULL LIMIT 1)`;

export function importSql(markdown: string, now: string): string {
  const { topics, warnings } = parseLearningBacklog(markdown);
  const lines = [
    "-- ST-10: cs-learning-lab learning-backlog.md → Projects Lab.",
    `-- Generated ${now}. ${topics.length} topic(s). Safe to run twice; deletes nothing.`,
    ...warnings.map((w) => `-- warning: ${w}`),
  ];

  const areas = new Map<string, string>();
  for (const t of topics)
    if (!areas.has(t.prefix)) areas.set(t.prefix, t.areaName);
  for (const [prefix, name] of areas)
    lines.push(
      `INSERT INTO learn_area (id, prefix, name, position, created_at)
  SELECT ${q(`area-${prefix.toLowerCase()}`)}, ${q(prefix)}, ${q(name)},
         (SELECT COALESCE(MAX(position), 0) + 1 FROM learn_area), ${q(now)}
  WHERE NOT EXISTS (SELECT 1 FROM learn_area WHERE prefix = ${q(prefix)});`,
    );

  for (const t of topics) {
    // A skill soft-deleted under this name is restored (its name stays taken, C-1).
    lines.push(
      `UPDATE skill SET deleted_at = NULL
  WHERE name = ${q(t.skill)} COLLATE NOCASE AND deleted_at IS NOT NULL;`,
      `INSERT INTO skill (id, name, created_at)
  SELECT ${q(`import-skill-${t.code.toLowerCase()}`)}, ${q(t.skill)}, ${q(now)}
  WHERE ${skillOf(t.skill)} IS NULL;`,
      `INSERT INTO learn_topic (id, code, area_id, skill_id, level, priority, status, note, started_on, created_at, updated_at)
  SELECT ${q(`import-${t.code.toLowerCase()}`)}, ${q(t.code)}, a.id, ${skillOf(t.skill)},
         ${q(t.level)}, ${q(t.priority)}, ${q(t.status)}, ${q(t.note)}, ${q(t.startedOn)}, ${q(now)}, ${q(now)}
  FROM learn_area a
  WHERE a.prefix = ${q(t.prefix)}
    AND NOT EXISTS (SELECT 1 FROM learn_topic WHERE code = ${q(t.code)} OR skill_id = ${skillOf(t.skill)});`,
    );
  }

  // Each area's next topic comes after the highest imported ID.
  const highest = new Map<string, number>();
  for (const t of topics) {
    const seq = Number(t.code.slice(3));
    highest.set(t.prefix, Math.max(highest.get(t.prefix) ?? 0, seq));
  }
  for (const [prefix, seq] of highest)
    lines.push(
      `UPDATE learn_area SET next_seq = MAX(next_seq, ${seq + 1}) WHERE prefix = ${q(prefix)};`,
    );

  const sql = `${lines.join("\n")}\n`;
  if (/\b(DELETE|DROP|ALTER|PRAGMA)\b/i.test(sql))
    throw new Error("import SQL may only insert and update");
  return sql;
}

const sql = importSql(readFileSync(source, "utf8"), new Date().toISOString());
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, sql);
console.log(`wrote ${out}`);
