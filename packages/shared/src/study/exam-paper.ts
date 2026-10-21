// Exams in the app (ST-13; docs/prd/12-study-exams.md § Exams in the app):
// the settings the owner picks, the questions and the hidden key the model
// writes, the owner's answers, the model's grading of open and code answers,
// the scoring (study-materials' exam-rules.md, rule 4) and the exam file's
// text in the same formats Claude Code writes. Pure: no I/O, no floats in a
// grade (integer tenths, CLAUDE.md).
import { z } from "zod";

/** Where an exam was made: a Claude Code session (with a PDF) or the app (ST-13, none). */
export const EXAM_SOURCES = ["claude", "app"] as const;
export type ExamSource = (typeof EXAM_SOURCES)[number];

export const EXAM_MAX_QUESTIONS = 20;
export const EXAM_FOCUS_MAX_LENGTH = 500;
export const EXAM_OPEN_ANSWER_MAX_LENGTH = 4000;
export const EXAM_BLANK_ANSWER_MAX_LENGTH = 500;

export const QUESTION_TYPES = ["MC", "TF", "OPEN", "CODE", "CODE_MC"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
/** As the exam file and the rules write them. */
export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  MC: "MC",
  TF: "TF",
  OPEN: "OPEN",
  CODE: "CODE",
  CODE_MC: "CODE-MC",
};

export const LETTERS = ["A", "B", "C", "D", "E"] as const;
export type Letter = (typeof LETTERS)[number];
const ROMAN = ["I", "II", "III", "IV", "V"] as const;

// --- Settings (the "Take the test" form) ---

const count = z.number().int().min(0).max(EXAM_MAX_QUESTIONS);
export const examMixSchema = z
  .object({
    MC: count,
    TF: count,
    OPEN: count,
    CODE: count,
    CODE_MC: count,
  })
  .partial();
export type ExamMix = z.infer<typeof examMixSchema>;

const mixTotal = (mix: ExamMix) =>
  QUESTION_TYPES.reduce((n, type) => n + (mix[type] ?? 0), 0);

export const examSettingsSchema = z
  .object({
    questions: z.number().int().min(1).max(EXAM_MAX_QUESTIONS),
    /** How many of each type; when given, the counts add up to `questions`. */
    mix: examMixSchema.optional(),
    /** Lesson numbers to cover; every lesson when absent. */
    lessons: z.array(z.number().int().min(1).max(99)).min(1).max(30).optional(),
    focus: z.string().trim().max(EXAM_FOCUS_MAX_LENGTH).optional(),
  })
  .superRefine((settings, ctx) => {
    if (settings.mix && mixTotal(settings.mix) !== settings.questions)
      ctx.addIssue({
        code: "custom",
        path: ["mix"],
        message: `The types add up to ${mixTotal(settings.mix)}, not ${settings.questions} questions.`,
      });
    if (
      settings.lessons &&
      new Set(settings.lessons).size !== settings.lessons.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["lessons"],
        message: "A lesson is listed twice.",
      });
  });
export type ExamSettings = z.infer<typeof examSettingsSchema>;

// --- Questions and the key (what the model writes) ---

const stem = z.string().trim().min(1).max(2000);
const code = z.string().min(1).max(4000);
const option = z.string().trim().min(1).max(400);
const five = <T extends z.ZodType>(item: T) => z.array(item).length(5);
const language = z.string().trim().max(30).optional();

/** `____(1)____` … in order of appearance; [] when there are none. */
export function numberedBlanks(snippet: string): number[] {
  return [...snippet.matchAll(/_{2,}\((\d+)\)_{2,}/g)].map((m) => Number(m[1]));
}
/** Plain blanks (`____`, no number), as a CODE-MC snippet has exactly one of. */
export function plainBlanks(snippet: string): number {
  return snippet.replace(/_{2,}\(\d+\)_{2,}/g, "").match(/_{4,}/g)?.length ?? 0;
}

export const examQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("MC"),
    stem,
    code: code.optional(),
    language,
    options: five(option),
  }),
  z.object({
    type: z.literal("TF"),
    stem: stem.optional(),
    statements: five(option),
  }),
  z.object({ type: z.literal("OPEN"), stem }),
  z.object({ type: z.literal("CODE"), stem, code, language }),
  z.object({
    type: z.literal("CODE_MC"),
    stem,
    code,
    language,
    options: five(option),
  }),
]);
export type ExamQuestion = z.infer<typeof examQuestionSchema>;

const why = z.string().trim().min(1).max(1000);
export const examKeySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("MC"), answer: z.enum(LETTERS), why }),
  z.object({ type: z.literal("TF"), answers: five(z.boolean()), why }),
  z.object({
    type: z.literal("OPEN"),
    modelAnswer: z.string().trim().min(1).max(3000),
    mustCover: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
  }),
  z.object({
    type: z.literal("CODE"),
    blanks: z
      .array(z.string().min(1).max(EXAM_BLANK_ANSWER_MAX_LENGTH))
      .min(1)
      .max(10),
    solution: code,
  }),
  z.object({ type: z.literal("CODE_MC"), answer: z.enum(LETTERS), why }),
]);
export type ExamKey = z.infer<typeof examKeySchema>;

/** One question as written and its key, which only the server ever holds. */
export const examItemSchema = z
  .object({ question: examQuestionSchema, key: examKeySchema })
  .superRefine(({ question, key }, ctx) => {
    if (question.type !== key.type)
      return ctx.addIssue({
        code: "custom",
        path: ["key", "type"],
        message: `A ${key.type} key for a ${question.type} question.`,
      });
    if (question.type === "CODE" && key.type === "CODE") {
      const blanks = numberedBlanks(question.code);
      const inOrder = blanks.every((n, i) => n === i + 1);
      if (blanks.length === 0 || !inOrder)
        ctx.addIssue({
          code: "custom",
          path: ["question", "code"],
          message:
            "A CODE snippet numbers its blanks ____(1)____, ____(2)____… in order.",
        });
      else if (blanks.length !== key.blanks.length)
        ctx.addIssue({
          code: "custom",
          path: ["key", "blanks"],
          message: `${blanks.length} blanks in the snippet, ${key.blanks.length} in the key.`,
        });
    }
    if (question.type === "CODE_MC" && plainBlanks(question.code) !== 1)
      ctx.addIssue({
        code: "custom",
        path: ["question", "code"],
        message: "A CODE-MC snippet has exactly one blank (____).",
      });
  });
export type ExamItem = z.infer<typeof examItemSchema>;

/** The model's reply when writing an exam (AI-02's tool input). */
export const generatedExamSchema = z.object({
  title: z.string().trim().min(1).max(200),
  items: z.array(examItemSchema).min(1).max(EXAM_MAX_QUESTIONS),
});
export type GeneratedExam = z.infer<typeof generatedExamSchema>;

/** What a well-formed exam still owes the settings: the count and the mix. */
export function examFitsSettings(
  exam: GeneratedExam,
  settings: ExamSettings,
): string[] {
  const problems: string[] = [];
  if (exam.items.length !== settings.questions)
    problems.push(
      `${exam.items.length} questions, not the ${settings.questions} asked for.`,
    );
  if (settings.mix)
    for (const type of QUESTION_TYPES) {
      const want = settings.mix[type] ?? 0;
      const got = exam.items.filter(
        (item) => item.question.type === type,
      ).length;
      if (want !== got)
        problems.push(
          `${got} ${QUESTION_TYPE_LABEL[type]}, not the ${want} asked for.`,
        );
    }
  return problems;
}

// --- The owner's answers ---

const choice = z.enum(LETTERS).nullable();
export const examAnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("MC"), choice }),
  z.object({ type: z.literal("TF"), marks: five(z.boolean().nullable()) }),
  z.object({
    type: z.literal("OPEN"),
    text: z.string().max(EXAM_OPEN_ANSWER_MAX_LENGTH),
  }),
  z.object({
    type: z.literal("CODE"),
    blanks: z.array(z.string().max(EXAM_BLANK_ANSWER_MAX_LENGTH)).max(10),
  }),
  z.object({ type: z.literal("CODE_MC"), choice }),
]);
export type ExamAnswer = z.infer<typeof examAnswerSchema>;
export const examAnswersSchema = z
  .array(examAnswerSchema)
  .max(EXAM_MAX_QUESTIONS);

/** An unanswered paper, one empty answer per question. */
export function emptyAnswers(questions: readonly ExamQuestion[]): ExamAnswer[] {
  return questions.map((q): ExamAnswer => {
    if (q.type === "MC" || q.type === "CODE_MC")
      return { type: q.type, choice: null };
    if (q.type === "TF")
      return { type: "TF", marks: [null, null, null, null, null] };
    if (q.type === "OPEN") return { type: "OPEN", text: "" };
    return { type: "CODE", blanks: numberedBlanks(q.code).map(() => "") };
  });
}

/** True when the answers line up with the questions, one per question, same types. */
export function answersFit(
  questions: readonly ExamQuestion[],
  answers: readonly ExamAnswer[],
): boolean {
  return (
    answers.length === questions.length &&
    answers.every((a, i) => {
      const q = questions[i];
      if (!q || a.type !== q.type) return false;
      return (
        q.type !== "CODE" ||
        (a.type === "CODE" && a.blanks.length <= numberedBlanks(q.code).length)
      );
    })
  );
}

// --- Grading (the model, for OPEN and CODE) ---

/** The model's reply when grading the open and code answers (question numbers from 1). */
export const answerGradingSchema = z.object({
  results: z
    .array(
      z.object({
        number: z.number().int().min(1).max(EXAM_MAX_QUESTIONS),
        accuracy: z.number().int().min(0).max(100),
        feedback: z.string().trim().min(1).max(1500),
        missing: z.string().trim().max(1000).optional(),
      }),
    )
    .max(EXAM_MAX_QUESTIONS),
  /** Which lessons to revisit and why; shown only when the grade is below 7. */
  review: z.string().trim().max(1000),
});
export type AnswerGrading = z.infer<typeof answerGradingSchema>;

// --- Scoring (exam-rules.md, rule 4) ---

/** MC and CODE-MC: all or nothing. TF: a fifth per statement; unmarked is wrong. In percent. */
export function objectiveAccuracy(key: ExamKey, answer: ExamAnswer): number {
  if ((key.type === "MC" || key.type === "CODE_MC") && answer.type === key.type)
    return answer.choice === key.answer ? 100 : 0;
  if (key.type === "TF" && answer.type === "TF")
    return key.answers.reduce(
      (n, right, i) => n + (answer.marks[i] === right ? 20 : 0),
      0,
    );
  throw new Error(`Not scored without the model: ${key.type}`);
}

/** Round half up of a / b for non-negative integers, with integers only. */
const divRound = (a: number, b: number) => Math.floor((2 * a + b) / (2 * b));

/**
 * The grade in integer tenths from each question's accuracy (0–100): every
 * question is worth 10 / n points, so the grade is the mean accuracy over 10,
 * rounded to one decimal. 100, 80, 50 → 7.7 → 77.
 */
export function examGradeTenths(accuracies: readonly number[]): number {
  if (accuracies.length === 0) throw new RangeError("An exam has questions.");
  for (const a of accuracies)
    if (!Number.isInteger(a) || a < 0 || a > 100)
      throw new RangeError(`Not an accuracy: ${a}`);
  return divRound(
    accuracies.reduce((n, a) => n + a, 0),
    accuracies.length,
  );
}

/** Hundredths of a point → "3.33", "1.0", "0.5": two decimals only when needed. */
function points(hundredths: number): string {
  const whole = Math.floor(hundredths / 100);
  const rest = hundredths % 100;
  return rest % 10 === 0
    ? `${whole}.${rest / 10}`
    : `${whole}.${String(rest).padStart(2, "0")}`;
}
/** Each question's value, 10 / n, as the file shows it: "3.33", "1.0". */
export const questionValue = (n: number) => points(divRound(1000, n));
/** What an answer earned: accuracy × value, as "0.5 / 1.0". */
export const pointsEarned = (accuracy: number, n: number) =>
  `${points(divRound(accuracy * 10, n))} / ${questionValue(n)}`;

// --- The exam file (exam-rules.md § Exam output format) ---

const block = (snippet: string, lang?: string) =>
  `\`\`\`${lang ?? ""}\n${snippet}\n\`\`\``;
/** One table cell: no pipes or line breaks. */
const cell = (text: string) =>
  text
    .replace(/\|/g, "\\|")
    .replace(/\s*\n\s*/g, " ")
    .trim();
const shortStem = (text: string) => {
  const first = text.split(/(?<=[.?!])\s/)[0] ?? text;
  return first.length > 80 ? `${first.slice(0, 79)}…` : first;
};

/** Questions only, never the key: the file's whole content until the answers are in. */
export function examMarkdown(
  title: string,
  questions: readonly ExamQuestion[],
  footer: string,
): string {
  const n = questions.length;
  const value = questionValue(n);
  const parts = [
    `# Final exam · ${title}`,
    `\`${n} questions\` \`${value} points each\` \`Total: 10\``,
  ];
  questions.forEach((q, i) => {
    const head = `**${i + 1}. [${QUESTION_TYPE_LABEL[q.type]} · ${value} pt]**`;
    switch (q.type) {
      case "MC":
        parts.push(
          [
            `${head} ${q.stem}`,
            ...(q.code ? [block(q.code, q.language)] : []),
            q.options.map((o, j) => `${LETTERS[j]}) ${o}`).join("  "),
          ].join("\n\n"),
        );
        break;
      case "TF":
        parts.push(
          `${head} ${q.stem ?? "Mark each statement T or F."}\n\n${q.statements.map((s, j) => `${ROMAN[j]}. ${s}`).join("  \n")}`,
        );
        break;
      case "OPEN":
        parts.push(`${head} ${q.stem}`);
        break;
      case "CODE":
        parts.push(`${head} ${q.stem}\n\n${block(q.code, q.language)}`);
        break;
      case "CODE_MC":
        parts.push(
          `${head} ${q.stem}\n\n${block(q.code, q.language)}\n\n${q.options.map((o, j) => `${LETTERS[j]}) \`${o}\``).join("  ")}`,
        );
        break;
    }
  });
  parts.push(`---\n${footer}`);
  return `${parts.join("\n\n")}\n`;
}

// --- The Results section (exam-rules.md § Grading report format) ---

export interface GradedQuestion {
  question: ExamQuestion;
  key: ExamKey;
  answer: ExamAnswer;
  /** 0–100. */
  accuracy: number;
  /** From the model, for OPEN and CODE. */
  feedback?: string;
  missing?: string;
}

const tf = (marks: readonly (boolean | null)[]) =>
  marks
    .map((m, i) => `${ROMAN[i]}-${m === null ? "?" : m ? "T" : "F"}`)
    .join(", ");
const blanks = (values: readonly string[]) =>
  values.map((v, i) => `(${i + 1}) ${v.trim() || "—"}`).join(", ");
const excerpt = (text: string) => {
  const flat = text.trim().replace(/\s+/g, " ");
  return !flat ? "—" : flat.length > 60 ? `${flat.slice(0, 59)}…` : flat;
};

function yours(answer: ExamAnswer): string {
  switch (answer.type) {
    case "MC":
    case "CODE_MC":
      return answer.choice ?? "—";
    case "TF":
      return tf(answer.marks);
    case "OPEN":
      return excerpt(answer.text);
    case "CODE":
      return answer.blanks.length ? blanks(answer.blanks) : "—";
  }
}
function correct(key: ExamKey): string {
  switch (key.type) {
    case "MC":
    case "CODE_MC":
      return key.answer;
    case "TF":
      return tf(key.answers);
    case "OPEN":
      return "Model answer below";
    case "CODE":
      return blanks(key.blanks);
  }
}
function feedback(g: GradedQuestion, number: number): string {
  const { question: q, key, answer } = g;
  const lead = `**${number}.**`;
  switch (key.type) {
    case "MC":
    case "CODE_MC":
      return `${lead} ${shortStem(q.stem ?? "")} → **${key.answer}**. ${key.why}`;
    case "TF":
      return `${lead} ${shortStem(q.stem ?? "Mark each statement T or F.")} → **${tf(key.answers)}**. ${key.why}`;
    case "OPEN": {
      const text = answer.type === "OPEN" ? answer.text.trim() : "";
      return [
        `${lead} Accuracy ${g.accuracy}%. ${g.feedback ?? ""}${g.missing ? ` What was missing: ${g.missing}` : ""}`.trim(),
        `**Your answer:**\n\n> ${text ? text.replace(/\n/g, "\n> ") : "—"}`,
        `**Model answer:** ${key.modelAnswer}`,
      ].join("\n\n");
    }
    case "CODE":
      return [
        `${lead} Accuracy ${g.accuracy}%. ${g.feedback ?? ""}`.trim(),
        `**Your blanks:** ${answer.type === "CODE" && answer.blanks.length ? blanks(answer.blanks) : "—"}`,
        `**Reference solution:**\n\n${block(key.solution, q.type === "CODE" ? q.language : undefined)}`,
      ].join("\n\n");
  }
}

/** Appended to the exam file below a rule once the answers are in. */
export function resultsMarkdown(
  graded: readonly GradedQuestion[],
  gradeTenths: number,
  review: string,
): string {
  const n = graded.length;
  const rows = graded.map(
    (g, i) =>
      `| ${i + 1} | ${QUESTION_TYPE_LABEL[g.question.type]} | ${cell(yours(g.answer))} | ${cell(correct(g.key))} | ${g.accuracy}% | ${pointsEarned(g.accuracy, n)} |`,
  );
  const grade = `${Math.floor(gradeTenths / 10)}.${gradeTenths % 10}`;
  const parts = [
    "---",
    "## Results",
    [
      "| # | Type | Your answer | Correct | Accuracy | Points |",
      "|---|---|---|---|---|---|",
      ...rows,
    ].join("\n"),
    `**Final grade: ${grade} / 10**`,
    "## Feedback",
    graded.map((g, i) => feedback(g, i + 1)).join("\n\n"),
  ];
  if (gradeTenths < 70 && review.trim())
    parts.push("## Review suggestions", review.trim());
  return `\n${parts.join("\n\n")}\n`;
}
