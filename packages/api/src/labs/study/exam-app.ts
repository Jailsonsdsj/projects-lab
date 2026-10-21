// Exams made in the app, writing one (ST-13c; docs/prd/12-study-exams.md §
// Exams in the app). Everything that can fail without cost is checked before
// the one AI call; nothing is recorded unless the file is committed, and a
// file committed for an exam that then can't be recorded is deleted again.
import {
  EXAM_APP_FOOTER,
  EXAM_RULES_PATH,
  type ExamSettings,
  emptyAnswers,
  examFitsSettings,
  examMarkdown,
  examPathFor,
  type GeneratedExamResponse,
  generatedExamSchema,
  QUESTION_TYPE_LABEL,
  QUESTION_TYPES,
} from "@projects-lab/shared/study";
import { AiError, aiDeps, askForJson } from "../../core/ai";
import { getText, githubDeps } from "../../core/github";
import { ToolError } from "../../core/lab";
import { examWriteDeps, removeExamFile, writeExamFile } from "./exam-files";

/** Generous for 20 questions with their keys and solutions. */
const MAX_TOKENS = 16_000;

const SYSTEM = (rules: string) =>
  `You write a final exam for a self-study course, following the learner's exam rules below exactly: the question types, covering the lessons proportionally, understanding and trade-offs over trivia, and never an answer or a hint in a question.

Return the exam only through the write_exam tool: the course's title, then one item per question with the question as the learner sees it and its key kept apart. MC and CODE_MC have exactly five options, in order A to E, one of them correct. TF has exactly five statements, I to V. A CODE snippet numbers its blanks ____(1)____, ____(2)____ in order, and its key gives one answer per blank plus the full solution. A CODE_MC snippet has exactly one blank, ____. Code uses the course's main language; set "language" to its code-fence name. Each key explains why, or gives the model answer and the points it must cover.

<exam-rules>
${rules}
</exam-rules>`;

function instructions(settings: ExamSettings): string {
  const parts = [
    `Write the exam with exactly ${settings.questions} questions.`,
  ];
  if (settings.mix)
    parts.push(
      `Use exactly these types: ${QUESTION_TYPES.filter(
        (t) => settings.mix?.[t],
      )
        .map((t) => `${settings.mix?.[t]} ${QUESTION_TYPE_LABEL[t]}`)
        .join(", ")}.`,
    );
  else
    parts.push(
      "Choose the types as the rules' default mix does, scaled to this many questions.",
    );
  if (settings.lessons)
    parts.push(`Cover only lessons ${settings.lessons.join(", ")}.`);
  if (settings.focus)
    parts.push(`The learner asks to focus on: ${settings.focus}`);
  return parts.join(" ");
}

interface CourseRow {
  courseId: string;
  topicRowId: string;
  topicId: string;
  skill: string;
  level: "fast_track" | "essential" | "specialized";
  path: string;
}

export async function generateExam(
  env: Env,
  db: D1Database,
  courseId: string,
  settings: ExamSettings,
  now: Date,
): Promise<GeneratedExamResponse> {
  const course = await db
    .prepare(
      `SELECT c.id AS courseId, t.id AS topicRowId, t.code AS topicId, s.name AS skill,
              c.level, c.path
       FROM learn_course c
       JOIN learn_topic t ON t.id = c.topic_id
       JOIN skill s ON s.id = t.skill_id
       WHERE c.id = ? AND t.deleted_at IS NULL`,
    )
    .bind(courseId)
    .first<CourseRow>();
  if (!course) throw new ToolError("not_found", "No such course.");

  // Every prerequisite, before anything is spent: the three secrets.
  const read = githubDeps(env, db);
  const write = examWriteDeps(env);
  const ai = aiDeps(env);

  const [rules, text] = await Promise.all([
    getText(read, EXAM_RULES_PATH),
    getText(read, course.path),
  ]);

  const exam = await askForJson(ai, {
    system: SYSTEM(rules),
    prompt: `${instructions(settings)}\n\nThe course (${course.topicId} · ${course.skill}):\n\n<course>\n${text}\n</course>`,
    schema: generatedExamSchema,
    tool: {
      name: "write_exam",
      description:
        "Returns the exam: its title and each question with its key.",
    },
    maxTokens: MAX_TOKENS,
  });
  const problems = examFitsSettings(exam, settings);
  if (problems.length)
    throw new AiError(
      "ai_bad_reply",
      `The AI's exam didn't match what you asked for (${problems.join(" ")}) Try again.`,
    );

  const last = await db
    .prepare(
      "SELECT COALESCE(MAX(attempt), 0) AS n FROM learn_exam WHERE topic_id = ? AND level = ?",
    )
    .bind(course.topicRowId, course.level)
    .first<{ n: number }>();
  const attempt = (last?.n ?? 0) + 1;
  const path = examPathFor(course.path, attempt);
  if (!path) throw new Error(`Not a course path: ${course.path}`);

  const questions = exam.items.map((item) => item.question);
  const committed = await writeExamFile(
    write,
    path,
    examMarkdown(exam.title, questions, EXAM_APP_FOOTER),
    `exam(${course.topicId}): final exam #${attempt} (Projects Lab)`,
  );

  const examId = crypto.randomUUID();
  const at = now.toISOString();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, source, created_at)
           VALUES (?, ?, ?, ?, ?, NULL, 'app', ?)`,
        )
        .bind(examId, course.topicRowId, course.level, attempt, path, at),
      db
        .prepare(
          `INSERT INTO learn_exam_paper (exam_id, title, settings_json, questions_json, key_json, draft_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          examId,
          exam.title,
          JSON.stringify(settings),
          JSON.stringify(questions),
          JSON.stringify(exam.items.map((item) => item.key)),
          JSON.stringify(emptyAnswers(questions)),
          at,
          at,
        ),
    ]);
  } catch (error) {
    // Recorded nothing: take the file back, then report why.
    await removeExamFile(
      write,
      path,
      committed.sha,
      `exam(${course.topicId}): withdraw final exam #${attempt} (not recorded)`,
    ).catch(() => undefined);
    if (String(error).includes("learn_exam_attempt_next"))
      throw new ToolError(
        "conflict",
        `Another exam took attempt ${attempt} meanwhile. Try again.`,
      );
    throw error;
  }

  return {
    exam: {
      examId,
      topicId: course.topicId,
      level: course.level,
      attempt,
      title: exam.title,
      questions,
    },
  };
}
