// Backup and restore (docs/prd/90-services.md § Backup): one JSON file the
// owner downloads from Settings, holding every row that is theirs and every
// file in R2. A restore is a script that turns it back into SQL; the triggers
// stay on, so the statements load in an order they accept.
import { z } from "zod";

export const BACKUP_VERSION = 1;
/** Home nudges for a backup when the last one is older than this. */
export const BACKUP_NUDGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Every table that holds the owner's data, parents before children (D1
 * enforces foreign keys). Left out on purpose: `mutation` (idempotency
 * replays), `auth_attempt` (login rate limits) and `github_cache` (a cache of
 * study-materials), all rebuilt by use; OAuth grants live in KV, so Claude
 * reconnects after a restore.
 */
export const BACKUP_TABLES = [
  "user",
  "skill",
  "mcp_call",
  "learn_area",
  "learn_topic",
  "learn_course",
  "learn_exam",
  "learn_exam_paper",
  "career_person",
  "career_link",
  "career_education",
  "career_experience",
  "career_fact",
  "career_fact_skill",
  "career_declared_skill",
  "career_job",
  "career_requirement",
  "career_job_event",
  "career_job_item",
  "career_job_kit",
  "career_form_answer",
  "career_standard_answer",
  "career_search_criteria",
  "career_opening",
  "career_story",
  "career_story_fact",
  "career_story_skill",
  "career_answer",
  "career_drill",
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

/** Left out on purpose (see above). A new table is in one list or the other: a test checks. */
export const BACKUP_EXCLUDED = [
  "mutation",
  "auth_attempt",
  "github_cache",
] as const;

const cell = z.union([z.string(), z.number(), z.null()]);
export const backupRowSchema = z.record(z.string(), cell);
export type BackupRow = z.infer<typeof backupRowSchema>;

/** GET /api/backup/data: the database part, as the Worker sends it. */
export const backupDataSchema = z.object({
  app: z.literal("projects-lab"),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  /** The migrations the database had: a restore needs the same ones. */
  migrations: z.array(z.string()),
  /** Partial: a backup made before a table existed restores with it empty. */
  tables: z.partialRecord(z.enum(BACKUP_TABLES), z.array(backupRowSchema)),
  /** R2 objects to fetch and add, by key. */
  files: z.array(
    z.object({ key: z.string(), contentType: z.string(), size: z.number() }),
  ),
});
export type BackupData = z.infer<typeof backupDataSchema>;

/** The downloaded file: the data, with each file's bytes added by the browser. */
export const backupFileSchema = backupDataSchema.extend({
  files: z.array(
    z.object({
      key: z.string(),
      contentType: z.string(),
      size: z.number(),
      base64: z.string(),
    }),
  ),
});
export type BackupFile = z.infer<typeof backupFileSchema>;

/** GET /api/backup: when the owner last downloaded one. */
export const backupStatusSchema = z.object({
  lastExportedAt: z.string().nullable(),
});

/** True when there's never been a backup, or the last is older than the nudge. */
export function backupDue(lastExportedAt: string | null, now: string): boolean {
  if (lastExportedAt === null) return true;
  return (
    Date.parse(now) - Date.parse(lastExportedAt) > BACKUP_NUDGE_DAYS * DAY_MS
  );
}

const q = (value: string | number | null) =>
  value === null
    ? "NULL"
    : typeof value === "number"
      ? String(value)
      : `'${value.replace(/'/g, "''")}'`;

const insert = (table: string, row: BackupRow, tail = "") => {
  const columns = Object.keys(row);
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns
    .map((c) => q(row[c] ?? null))
    .join(", ")})${tail}`;
};

/** Removed later, but a saved selection may still cite them (K-15 wants live). */
const REMOVED_AFTER = [
  "career_education",
  "career_experience",
  "career_fact",
  "career_job",
] as const;

/**
 * The SQL that loads a backup into a database with the same migrations and
 * nothing of the owner's yet (the seeded Study areas are updated in place).
 * The triggers stay on: exams go in ungraded and live, in attempt order, then
 * get their grades and, if deleted, their deletion (S-14, S-16, S-23 to
 * S-25); rows removed later go in live and are marked removed
 * last (K-15). Only inserts and updates.
 */
export function restoreStatements(backup: BackupData): string[] {
  const s: string[] = [];
  const removed: string[] = [];
  for (const table of BACKUP_TABLES) {
    const rows = backup.tables[table] ?? [];
    if (table === "learn_area") {
      for (const row of rows)
        s.push(
          insert(
            table,
            row,
            ` ON CONFLICT (id) DO UPDATE SET name = excluded.name, position = excluded.position, next_seq = excluded.next_seq`,
          ),
        );
      continue;
    }
    if (table === "learn_exam") {
      const ordered = [...rows].sort(
        (a, b) =>
          String(a.topic_id).localeCompare(String(b.topic_id)) ||
          String(a.level).localeCompare(String(b.level)) ||
          Number(a.attempt) - Number(b.attempt),
      );
      for (const row of ordered) {
        const id = q(row.id ?? null);
        s.push(
          insert(table, {
            ...row,
            grade: null,
            graded_at: null,
            deleted_at: null,
            files_removed_at: null,
          }),
        );
        if (row.grade !== null && row.grade !== undefined)
          s.push(
            `UPDATE learn_exam SET grade = ${q(row.grade)}, graded_at = ${q(row.graded_at ?? null)} WHERE id = ${id}`,
          );
        // A deleted exam (ST-14): graded first, then deleted, then its files
        // marked removed (S-23 to S-25).
        if (row.deleted_at)
          s.push(
            `UPDATE learn_exam SET deleted_at = ${q(row.deleted_at)} WHERE id = ${id}`,
          );
        if (row.deleted_at && row.files_removed_at)
          s.push(
            `UPDATE learn_exam SET files_removed_at = ${q(row.files_removed_at)} WHERE id = ${id}`,
          );
      }
      continue;
    }
    for (const row of rows) {
      if (
        (REMOVED_AFTER as readonly string[]).includes(table) &&
        row.deleted_at
      ) {
        s.push(insert(table, { ...row, deleted_at: null }));
        removed.push(
          `UPDATE ${table} SET deleted_at = ${q(row.deleted_at)} WHERE id = ${q(row.id ?? null)}`,
        );
      } else s.push(insert(table, row));
    }
  }
  const all = [...s, ...removed];
  if (all.some((sql) => /^\s*(DELETE|DROP|ALTER|PRAGMA)\b/i.test(sql)))
    throw new Error("a restore may only insert and update");
  return all;
}
