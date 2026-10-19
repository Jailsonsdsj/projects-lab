// Recording courses, exams and grades (docs/prd/11-study-courses.md,
// 12-study-exams.md). Claude pushes the files to study-materials, then records
// them here; every record checks its files exist first, so the app never lists
// something it can't open. Rules from @projects-lab/shared/study.
import {
  afterCourseRecorded,
  afterGradeRecorded,
  type CourseLevel,
  localDate,
} from "@projects-lab/shared/study";
import {
  type GitHubEntry,
  GitHubError,
  getMetadata,
  githubDeps,
} from "../../core/github";
import { ToolError } from "../../core/lab";
import { getTopic, type Topic } from "./backlog";

/** Throws not_found unless every path is a file in study-materials. A GitHub
 *  failure becomes a ToolError naming its fix (PRD 02). */
/** The file entry at each path in study-materials, or a ToolError: not_found
 *  (with `missing` as the message), or the GitHub failure naming its fix. */
async function fileEntries(
  env: Env,
  db: D1Database,
  paths: readonly string[],
  missing: (path: string) => string,
): Promise<GitHubEntry[]> {
  try {
    const deps = githubDeps(env, db);
    const entries: GitHubEntry[] = [];
    for (const path of paths) {
      const meta = await getMetadata(deps, path).catch((error: unknown) => {
        if (error instanceof GitHubError && error.code === "not_found")
          throw new ToolError("not_found", missing(path));
        throw error;
      });
      if (Array.isArray(meta) || meta.type !== "file")
        throw new ToolError("not_found", `"${path}" is a folder, not a file.`);
      entries.push(meta);
    }
    return entries;
  } catch (error) {
    if (error instanceof GitHubError)
      throw new ToolError(
        error.code === "github_rate_limited"
          ? "github_rate_limited"
          : "github_token_invalid",
        error.message,
      );
    throw error;
  }
}

/** Throws not_found unless every path is a file in study-materials. */
async function ensureFiles(
  env: Env,
  db: D1Database,
  paths: readonly string[],
): Promise<void> {
  await fileEntries(
    env,
    db,
    paths,
    (path) =>
      `No file at "${path}" in study-materials. Push it first, then record it.`,
  );
}

async function liveTopicId(db: D1Database, code: string) {
  const row = await db
    .prepare(
      "SELECT id, status, started_on AS startedOn FROM learn_topic WHERE code = ? AND deleted_at IS NULL",
    )
    .bind(code)
    .first<{
      id: string;
      status: "not_started" | "in_progress" | "done";
      startedOn: string | null;
    }>();
  if (!row)
    throw new ToolError("not_found", `No topic ${code} in the backlog.`);
  return row;
}

export interface Course {
  courseId: string;
  topicId: string;
  level: CourseLevel;
  module: number;
  path: string;
  recordedAt: string;
}

const COURSE_SELECT = `
  SELECT c.id AS courseId, t.code AS topicId, c.level, c.module, c.path,
         c.recorded_at AS recordedAt
  FROM learn_course c JOIN learn_topic t ON t.id = c.topic_id`;

/**
 * Records a pushed course (PRD 11). The topic takes the course's level; a Not
 * started topic goes In progress with Started set once. Recording the same
 * file again changes nothing; the same file on another topic is a conflict.
 */
export async function recordCourse(
  env: Env,
  db: D1Database,
  input: { topicId: string; level: CourseLevel; module?: number; path: string },
  now: Date,
  timeZone: string,
): Promise<{
  courseId: string;
  topic: Pick<Topic, "id" | "status" | "startedOn">;
}> {
  const topic = await liveTopicId(db, input.topicId);
  await ensureFiles(env, db, [input.path]);

  const existing = await db
    .prepare(`${COURSE_SELECT} WHERE c.path = ?`)
    .bind(input.path)
    .first<Course>();
  if (existing && existing.topicId !== input.topicId)
    throw new ToolError(
      "conflict",
      `"${input.path}" is already recorded as a course of ${existing.topicId}.`,
    );

  const at = now.toISOString();
  const progress = afterCourseRecorded(
    { status: topic.status, startedOn: topic.startedOn },
    localDate(at, timeZone),
  );
  const courseId = existing?.courseId ?? crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `INSERT INTO learn_course (id, topic_id, level, module, path, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (path) DO NOTHING`,
      )
      .bind(courseId, topic.id, input.level, input.module ?? 1, input.path, at),
    db
      .prepare(
        `UPDATE learn_topic SET level = ?, status = ?, started_on = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(input.level, progress.status, progress.startedOn, at, topic.id),
  ]);
  return {
    courseId,
    topic: {
      id: input.topicId,
      status: progress.status,
      startedOn: progress.startedOn,
    },
  };
}

export async function listCourses(
  db: D1Database,
  topicId?: string,
): Promise<{ courses: Course[] }> {
  const { results } = await db
    .prepare(
      `${COURSE_SELECT} WHERE t.deleted_at IS NULL AND (?1 IS NULL OR t.code = ?1)
       ORDER BY c.recorded_at DESC, c.path`,
    )
    .bind(topicId ?? null)
    .all<Course>();
  return { courses: results };
}

export interface Exam {
  examId: string;
  topicId: string;
  level: CourseLevel;
  attempt: number;
  mdPath: string;
  pdfPath: string;
  createdAt: string;
  grade: number | null;
  gradedAt: string | null;
}

const EXAM_SELECT = `
  SELECT e.id AS examId, t.code AS topicId, e.level, e.attempt,
         e.md_path AS mdPath, e.pdf_path AS pdfPath, e.created_at AS createdAt,
         e.grade, e.graded_at AS gradedAt
  FROM learn_exam e JOIN learn_topic t ON t.id = e.topic_id`;

/**
 * Records a delivered exam (PRD 12): both files must exist and the attempt
 * must be the next at its level (S-14). The topic's status doesn't change.
 * Recording the identical exam again returns it.
 */
export async function recordExam(
  env: Env,
  db: D1Database,
  input: {
    topicId: string;
    level: CourseLevel;
    attempt: number;
    mdPath: string;
    pdfPath: string;
  },
  now: Date,
): Promise<{ examId: string; attempt: number }> {
  const topic = await liveTopicId(db, input.topicId);
  const same = await db
    .prepare(`${EXAM_SELECT} WHERE e.md_path = ?`)
    .bind(input.mdPath)
    .first<Exam>();
  if (
    same &&
    same.topicId === input.topicId &&
    same.level === input.level &&
    same.attempt === input.attempt &&
    same.pdfPath === input.pdfPath
  )
    return { examId: same.examId, attempt: same.attempt };

  await ensureFiles(env, db, [input.mdPath, input.pdfPath]);
  const examId = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        examId,
        topic.id,
        input.level,
        input.attempt,
        input.mdPath,
        input.pdfPath,
        now.toISOString(),
      )
      .run();
  } catch (error) {
    const message = String(error);
    if (message.includes("learn_exam_attempt_next")) {
      const next = await db
        .prepare(
          "SELECT COALESCE(MAX(attempt), 0) + 1 AS n FROM learn_exam WHERE topic_id = ? AND level = ?",
        )
        .bind(topic.id, input.level)
        .first<{ n: number }>();
      throw new ToolError(
        "conflict",
        `Attempt ${input.attempt} isn't next for ${input.topicId} at this level; the next is ${next?.n}.`,
      );
    }
    if (message.includes("UNIQUE constraint failed"))
      throw new ToolError(
        "conflict",
        "These exam files are already recorded as another exam.",
      );
    throw error;
  }
  return { examId, attempt: input.attempt };
}

/**
 * Records a grade in integer tenths (PRD 12) and moves the topic to Done.
 * Recording again for the same attempt corrects the grade and keeps the first
 * graded_at (S-16). The topic's grade is its most recently graded exam.
 */
export async function recordGrade(
  db: D1Database,
  input: {
    topicId: string;
    level: CourseLevel;
    attempt: number;
    grade: number;
  },
  now: Date,
  timeZone: string,
): Promise<{
  examId: string;
  grade: number;
  topic: Pick<Topic, "id" | "status" | "grade">;
}> {
  const topic = await liveTopicId(db, input.topicId);
  const exam = await db
    .prepare(
      "SELECT id FROM learn_exam WHERE topic_id = ? AND level = ? AND attempt = ?",
    )
    .bind(topic.id, input.level, input.attempt)
    .first<{ id: string }>();
  if (!exam)
    throw new ToolError(
      "not_found",
      `No exam #${input.attempt} for ${input.topicId} at that level. Record it with study_record_exam first.`,
    );
  const at = now.toISOString();
  const progress = afterGradeRecorded({
    status: topic.status,
    startedOn: topic.startedOn,
  });
  await db.batch([
    db
      .prepare(
        "UPDATE learn_exam SET grade = ?, graded_at = COALESCE(graded_at, ?) WHERE id = ?",
      )
      .bind(input.grade, at, exam.id),
    db
      .prepare("UPDATE learn_topic SET status = ?, updated_at = ? WHERE id = ?")
      .bind(progress.status, at, topic.id),
  ]);
  const updated = await getTopic(db, input.topicId, timeZone);
  return {
    examId: exam.id,
    grade: input.grade,
    topic: { id: updated.id, status: updated.status, grade: updated.grade },
  };
}

export async function listExams(
  db: D1Database,
  topicId?: string,
): Promise<{ exams: Exam[] }> {
  const { results } = await db
    .prepare(
      `${EXAM_SELECT} WHERE t.deleted_at IS NULL AND (?1 IS NULL OR t.code = ?1)
       ORDER BY COALESCE(e.graded_at, e.created_at) DESC, e.attempt DESC`,
    )
    .bind(topicId ?? null)
    .all<Exam>();
  return { exams: results };
}

export interface CourseToRead extends Course {
  skill: string;
  /** The file's blob SHA and name: read it at /api/study/content/<sha>/<name>. */
  sha: string;
  name: string;
  /** The course folder's `_img/` files by name → blob SHA (PRD 11). */
  images: Record<string, string>;
}

/** The `_img/` files beside a course, name → SHA; {} when there's no folder. */
async function courseImages(
  env: Env,
  db: D1Database,
  coursePath: string,
): Promise<Record<string, string>> {
  const folder = `${coursePath.slice(0, coursePath.lastIndexOf("/"))}/_img`;
  try {
    const listing = await getMetadata(githubDeps(env, db), folder);
    if (!Array.isArray(listing)) return {};
    return Object.fromEntries(
      listing.filter((e) => e.type === "file").map((e) => [e.name, e.sha]),
    );
  } catch (error) {
    if (error instanceof GitHubError && error.code === "not_found") return {};
    if (error instanceof GitHubError)
      throw new ToolError(
        error.code === "github_rate_limited"
          ? "github_rate_limited"
          : "github_token_invalid",
        error.message,
      );
    throw error;
  }
}

/**
 * A recorded course with its file's current blob SHA (PRD 11 § Reading). The
 * metadata comes through the ETag cache, so an unchanged file costs a 304.
 */
export async function courseToRead(
  env: Env,
  db: D1Database,
  courseId: string,
): Promise<{ course: CourseToRead }> {
  const row = await db
    .prepare(
      `SELECT c.id AS courseId, t.code AS topicId, s.name AS skill, c.level,
              c.module, c.path, c.recorded_at AS recordedAt
       FROM learn_course c
       JOIN learn_topic t ON t.id = c.topic_id
       JOIN skill s ON s.id = t.skill_id
       WHERE c.id = ?`,
    )
    .bind(courseId)
    .first<Course & { skill: string }>();
  if (!row) throw new ToolError("not_found", "No such course.");
  const [entry] = await fileEntries(
    env,
    db,
    [row.path],
    (path) => `This course file is no longer in study-materials: ${path}`,
  );
  return {
    course: {
      ...row,
      sha: (entry as GitHubEntry).sha,
      name: (entry as GitHubEntry).name,
      images: await courseImages(env, db, row.path),
    },
  };
}
