// Deleting an exam (ST-14, PRD 12). The row stays, stamped deleted_at, so
// attempts keep counting (S-14) and an Undo is one UPDATE; every read leaves
// it out, so the topic's grade is derived without it. The nightly run removes
// its files from study-materials and stamps files_removed_at, after which it
// stays deleted (S-26).
import {
  DELETED_EXAM_FILES_AFTER_MINUTES,
  type ExamDeletion,
} from "@projects-lab/shared/study";
import { GitHubError, getMetadata, githubDeps } from "../../core/github";
import { ToolError } from "../../core/lab";
import { examWriteDeps, removeExamFile } from "./exam-files";

interface ExamRow extends ExamDeletion {
  filesRemovedAt: string | null;
}

const SELECT = `
  SELECT e.id AS examId, t.code AS topicId, e.level, e.attempt,
         e.deleted_at AS deletedAt, e.files_removed_at AS filesRemovedAt
  FROM learn_exam e JOIN learn_topic t ON t.id = e.topic_id
  WHERE e.id = ?`;

const GONE =
  "Its files were removed from study-materials, so this exam stays deleted.";

async function load(db: D1Database, examId: string): Promise<ExamRow> {
  const row = await db.prepare(SELECT).bind(examId).first<ExamRow>();
  if (!row) throw new ToolError("not_found", "No such exam.");
  return row;
}

const view = ({ filesRemovedAt: _, ...exam }: ExamRow): ExamDeletion => exam;

/** Hides an exam from every read. Deleting it again changes nothing. */
export async function deleteExam(
  db: D1Database,
  examId: string,
  now: Date,
): Promise<{ exam: ExamDeletion }> {
  await load(db, examId);
  await db
    .prepare(
      "UPDATE learn_exam SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(now.toISOString(), examId)
    .run();
  return { exam: view(await load(db, examId)) };
}

/** Brings a deleted exam back, until the nightly run has removed its files. */
export async function restoreExam(
  db: D1Database,
  examId: string,
): Promise<{ exam: ExamDeletion }> {
  const row = await load(db, examId);
  if (!row.deletedAt) return { exam: view(row) };
  if (row.filesRemovedAt) throw new ToolError("conflict", GONE);
  try {
    await db
      .prepare("UPDATE learn_exam SET deleted_at = NULL WHERE id = ?")
      .bind(examId)
      .run();
  } catch (error) {
    // The nightly run got there first (S-26).
    if (String(error).includes("learn_exam_deleted"))
      throw new ToolError("conflict", GONE);
    throw error;
  }
  return { exam: view(await load(db, examId)) };
}

interface PendingRow {
  examId: string;
  topicId: string;
  attempt: number;
  mdPath: string;
  pdfPath: string | null;
}

/**
 * The nightly part (run from the Worker's scheduled handler): removes the
 * files of every exam deleted at least DELETED_EXAM_FILES_AFTER_MINUTES ago,
 * then stamps files_removed_at. A file already gone counts as removed. An
 * exam whose removal fails keeps no stamp and is tried again the next night;
 * the others go ahead.
 */
export async function removeDeletedExamFiles(
  env: Env,
  db: D1Database,
  nowMs: number,
): Promise<{ removed: string[]; failed: { examId: string; error: string }[] }> {
  const cutoff = new Date(
    nowMs - DELETED_EXAM_FILES_AFTER_MINUTES * 60_000,
  ).toISOString();
  const { results } = await db
    .prepare(
      `SELECT e.id AS examId, t.code AS topicId, e.attempt,
              e.md_path AS mdPath, e.pdf_path AS pdfPath
       FROM learn_exam e JOIN learn_topic t ON t.id = e.topic_id
       WHERE e.deleted_at IS NOT NULL AND e.files_removed_at IS NULL
         AND e.deleted_at <= ?`,
    )
    .bind(cutoff)
    .all<PendingRow>();
  const removed: string[] = [];
  const failed: { examId: string; error: string }[] = [];
  if (results.length === 0) return { removed, failed };

  // Outside any try: a missing token is its own named error.
  const read = githubDeps(env, db);
  const write = examWriteDeps(env);
  const at = new Date(nowMs).toISOString();
  for (const exam of results) {
    try {
      for (const path of [exam.mdPath, exam.pdfPath]) {
        if (!path) continue;
        let sha: string;
        try {
          const entry = await getMetadata(read, path);
          if (Array.isArray(entry)) throw new Error(`${path} is a folder`);
          sha = entry.sha;
        } catch (error) {
          if (error instanceof GitHubError && error.code === "not_found")
            continue;
          throw error;
        }
        await removeExamFile(
          write,
          path,
          sha,
          `remove(${exam.topicId}): exam #${exam.attempt}, deleted in Projects Lab`,
        );
      }
      await db
        .prepare(
          `UPDATE learn_exam SET files_removed_at = ?
           WHERE id = ? AND deleted_at IS NOT NULL AND files_removed_at IS NULL`,
        )
        .bind(at, exam.examId)
        .run();
      removed.push(exam.examId);
    } catch (error) {
      failed.push({ examId: exam.examId, error: String(error) });
    }
  }
  return { removed, failed };
}
