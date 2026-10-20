// Career interview services (docs/prd/24-career-interviews.md): STAR stories
// resting on profile facts, answers with an optional Drive video (the file ID
// only; video never goes to R2), and the log of practice drills held in Claude.
// A story's verified state is derived at read time from its facts.
import {
  DRILLS_DEFAULT_LIMIT,
  type DrillMode,
  driveFileId,
  drivePreviewUrl,
  type listAnswersInputSchema,
  type logDrillInputSchema,
  type saveAnswerInputSchema,
  type saveStoryInputSchema,
} from "@projects-lab/shared/career";
import type { z } from "zod";
import { ToolError } from "../../core/lab";
import { findOrCreateSkill } from "../../core/skills";

const rows = <T>(result: D1Result | undefined): T[] =>
  (result?.results ?? []) as T[];

async function requireRow(
  db: D1Database,
  sql: string,
  id: string,
  what: string,
): Promise<void> {
  if (!(await db.prepare(sql).bind(id).first()))
    throw new ToolError("not_found", `No ${what} ${id}`);
}
const LIVE_EXPERIENCE =
  "SELECT 1 FROM career_experience WHERE id = ? AND deleted_at IS NULL";
const LIVE_JOB = "SELECT 1 FROM career_job WHERE id = ? AND deleted_at IS NULL";
const STORY = "SELECT 1 FROM career_story WHERE id = ?";

export interface Story {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  experienceId: string | null;
  /** The live facts it rests on. */
  facts: { id: string; text: string; verified: boolean }[];
  skills: { id: string; name: string }[];
  /** Every fact it cites is live and verified (and it cites at least one). */
  verified: boolean;
  updatedAt: string;
}

type StoryRow = Omit<Story, "facts" | "skills" | "verified">;

const STORY_SQL = `SELECT id, title, situation, task, action, result,
  experience_id AS experienceId, updated_at AS updatedAt FROM career_story`;

async function loadStories(db: D1Database, storyId?: string): Promise<Story[]> {
  const only = storyId ? " WHERE id = ?1" : "";
  const ofStory = storyId ? " WHERE sf.story_id = ?1" : "";
  const bind = (sql: string) =>
    storyId ? db.prepare(sql).bind(storyId) : db.prepare(sql);
  const [stories, facts, skills] = await db.batch([
    bind(`${STORY_SQL}${only} ORDER BY updated_at DESC`),
    bind(
      `SELECT sf.story_id AS storyId, f.id, f.text, f.verified, f.deleted_at AS deletedAt
       FROM career_story_fact sf JOIN career_fact f ON f.id = sf.fact_id${ofStory}
       ORDER BY f.position`,
    ),
    bind(
      `SELECT sf.story_id AS storyId, s.id, s.name
       FROM career_story_skill sf JOIN skill s ON s.id = sf.skill_id${ofStory}
       ORDER BY s.name COLLATE NOCASE`,
    ),
  ]);
  const cited = rows<{
    storyId: string;
    id: string;
    text: string;
    verified: number;
    deletedAt: string | null;
  }>(facts);
  const named = rows<{ storyId: string; id: string; name: string }>(skills);
  return rows<StoryRow>(stories).map((story) => {
    const own = cited.filter((f) => f.storyId === story.id);
    return {
      ...story,
      facts: own
        .filter((f) => f.deletedAt === null)
        .map((f) => ({ id: f.id, text: f.text, verified: f.verified === 1 })),
      skills: named
        .filter((s) => s.storyId === story.id)
        .map(({ id, name }) => ({ id, name })),
      verified:
        own.length > 0 &&
        own.every((f) => f.verified === 1 && f.deletedAt === null),
    };
  });
}

/** The story bank, most recently edited first. */
export async function listStories(db: D1Database): Promise<Story[]> {
  return loadStories(db);
}

/**
 * Adds a story (no `id`) or edits one. Its facts must exist and be live; its
 * skills are found or created in the registry; each list replaces the saved
 * one when given. On an edit, an omitted experience is kept, `null` clears it.
 */
export async function saveStory(
  db: D1Database,
  input: z.infer<typeof saveStoryInputSchema>,
  now: Date,
): Promise<Story> {
  const stamp = now.toISOString();
  if (input.id) await requireRow(db, STORY, input.id, "story");
  if (input.experienceId)
    await requireRow(db, LIVE_EXPERIENCE, input.experienceId, "experience");
  if (input.factIds?.length) {
    const { results } = await db
      .prepare(
        "SELECT id FROM career_fact WHERE deleted_at IS NULL AND id IN (SELECT value FROM json_each(?))",
      )
      .bind(JSON.stringify(input.factIds))
      .all<{ id: string }>();
    const live = new Set(results.map((r) => r.id));
    const missing = input.factIds.find((id) => !live.has(id));
    if (missing)
      throw new ToolError("not_found", `No fact ${missing} in the profile`);
  }
  const skillIds = input.skills && [
    ...new Set(
      (
        await Promise.all(
          input.skills.map((name) => findOrCreateSkill(db, name, stamp)),
        )
      ).map((s) => s.id),
    ),
  ];

  const id = input.id ?? crypto.randomUUID();
  const parts = [
    input.title,
    input.situation,
    input.task,
    input.action,
    input.result,
  ];
  const statements: D1PreparedStatement[] = [
    input.id
      ? db
          .prepare(
            `UPDATE career_story SET title = ?, situation = ?, task = ?, action = ?, result = ?,
               updated_at = ?${input.experienceId !== undefined ? ", experience_id = ?" : ""} WHERE id = ?`,
          )
          .bind(
            ...parts,
            stamp,
            ...(input.experienceId !== undefined ? [input.experienceId] : []),
            id,
          )
      : db
          .prepare(
            `INSERT INTO career_story (id, title, situation, task, action, result, experience_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(id, ...parts, input.experienceId ?? null, stamp, stamp),
  ];
  if (input.factIds)
    statements.push(
      db.prepare("DELETE FROM career_story_fact WHERE story_id = ?").bind(id),
      ...input.factIds.map((factId) =>
        db
          .prepare(
            "INSERT INTO career_story_fact (story_id, fact_id) VALUES (?, ?)",
          )
          .bind(id, factId),
      ),
    );
  if (skillIds)
    statements.push(
      db.prepare("DELETE FROM career_story_skill WHERE story_id = ?").bind(id),
      ...skillIds.map((skillId) =>
        db
          .prepare(
            "INSERT INTO career_story_skill (story_id, skill_id) VALUES (?, ?)",
          )
          .bind(id, skillId),
      ),
    );
  await db.batch(statements);
  const [story] = await loadStories(db, id);
  if (!story) throw new Error(`Story ${id} vanished after it was saved`);
  return story;
}

export interface Answer {
  id: string;
  question: string;
  answer: string;
  /** Drive's own player, embedded in a sandboxed iframe (R2-13). */
  video: { fileId: string; previewUrl: string } | null;
  storyId: string | null;
  /** Null: a general answer. */
  jobId: string | null;
  updatedAt: string;
}

type AnswerRow = Omit<Answer, "video"> & { driveFileId: string | null };

const ANSWER_SQL = `SELECT id, question, answer, drive_file_id AS driveFileId,
  story_id AS storyId, job_id AS jobId, updated_at AS updatedAt FROM career_answer`;

const toAnswer = ({ driveFileId: fileId, ...row }: AnswerRow): Answer => ({
  ...row,
  video: fileId ? { fileId, previewUrl: drivePreviewUrl(fileId) } : null,
});

/**
 * A job's answers (with its self-introduction, shown as that job's "Tell me
 * about yourself"), the general ones, or all of them.
 */
export async function listAnswers(
  db: D1Database,
  { jobId, general }: z.infer<typeof listAnswersInputSchema>,
): Promise<{ answers: Answer[]; intro?: string }> {
  if (jobId) {
    await requireRow(db, LIVE_JOB, jobId, "job");
    const [answers, kit] = await db.batch([
      db
        .prepare(`${ANSWER_SQL} WHERE job_id = ? ORDER BY created_at`)
        .bind(jobId),
      db
        .prepare("SELECT intro FROM career_job_kit WHERE job_id = ?")
        .bind(jobId),
    ]);
    return {
      answers: rows<AnswerRow>(answers).map(toAnswer),
      intro: rows<{ intro: string }>(kit)[0]?.intro ?? "",
    };
  }
  const { results } = await db
    .prepare(
      general
        ? `${ANSWER_SQL} WHERE job_id IS NULL ORDER BY created_at`
        : `${ANSWER_SQL} ORDER BY job_id IS NOT NULL, created_at`,
    )
    .all<AnswerRow>();
  return { answers: results.map(toAnswer) };
}

/**
 * Adds an answer (no `id`) or edits one. A pasted Drive link is stored as its
 * file ID (only `drive.google.com/file/d/<id>` and `open?id=<id>`); `null`
 * removes the video. On an edit, an omitted link, story or job is kept.
 */
export async function saveAnswer(
  db: D1Database,
  input: z.infer<typeof saveAnswerInputSchema>,
  now: Date,
): Promise<Answer> {
  const stamp = now.toISOString();
  if (input.id)
    await requireRow(
      db,
      "SELECT 1 FROM career_answer WHERE id = ?",
      input.id,
      "answer",
    );
  if (input.storyId) await requireRow(db, STORY, input.storyId, "story");
  if (input.jobId) await requireRow(db, LIVE_JOB, input.jobId, "job");
  const fileId =
    input.driveLink === undefined || input.driveLink === null
      ? input.driveLink
      : driveFileId(input.driveLink);
  if (fileId === null && input.driveLink)
    throw new ToolError("bad_request", "Not a Google Drive file link");

  const id = input.id ?? crypto.randomUUID();
  if (input.id) {
    const set: [string, unknown][] = [
      ["question", input.question],
      ["answer", input.answer],
      ["drive_file_id", fileId],
      ["story_id", input.storyId],
      ["job_id", input.jobId],
      ["updated_at", stamp],
    ];
    const given = set.filter(([, value]) => value !== undefined);
    await db
      .prepare(
        `UPDATE career_answer SET ${given.map(([name]) => `${name} = ?`).join(", ")} WHERE id = ?`,
      )
      .bind(...given.map(([, value]) => value), id)
      .run();
  } else
    await db
      .prepare(
        `INSERT INTO career_answer (id, question, answer, drive_file_id, story_id, job_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.question,
        input.answer,
        fileId ?? null,
        input.storyId ?? null,
        input.jobId ?? null,
        stamp,
        stamp,
      )
      .run();
  const row = await db
    .prepare(`${ANSWER_SQL} WHERE id = ?`)
    .bind(id)
    .first<AnswerRow>();
  if (!row) throw new Error(`Answer ${id} vanished after it was saved`);
  return toAnswer(row);
}

export interface Drill {
  id: string;
  at: string;
  mode: DrillMode;
  topic: string;
  weakest: string[];
  fix: string;
}

const DRILL_SQL =
  "SELECT id, at, mode, topic, weakest_json AS weakestJson, fix FROM career_drill";
const toDrill = ({
  weakestJson,
  ...row
}: Omit<Drill, "weakest"> & { weakestJson: string }): Drill => ({
  ...row,
  weakest: JSON.parse(weakestJson),
});

/** Logs a practice session held in Claude: its weakest answers and what to fix. */
export async function logDrill(
  db: D1Database,
  input: z.infer<typeof logDrillInputSchema>,
  now: Date,
): Promise<Drill> {
  const drill = {
    id: crypto.randomUUID(),
    at: now.toISOString(),
    mode: input.mode,
    topic: input.topic,
    weakest: input.weakest,
    fix: input.fix,
  };
  await db
    .prepare(
      "INSERT INTO career_drill (id, at, mode, topic, weakest_json, fix) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      drill.id,
      drill.at,
      drill.mode,
      drill.topic,
      JSON.stringify(drill.weakest),
      drill.fix,
    )
    .run();
  return drill;
}

/** The latest drills first, so the next session starts from the weak areas. */
export async function listDrills(
  db: D1Database,
  { limit }: { limit?: number },
): Promise<Drill[]> {
  const { results } = await db
    .prepare(`${DRILL_SQL} ORDER BY at DESC, rowid DESC LIMIT ?`)
    .bind(limit ?? DRILLS_DEFAULT_LIMIT)
    .all<Omit<Drill, "weakest"> & { weakestJson: string }>();
  return results.map(toDrill);
}
