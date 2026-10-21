import { describe, expect, it } from "vitest";
import { toJSONSchema } from "zod";
import {
  answerGradingSchema,
  answersFit,
  type ExamAnswer,
  type ExamItem,
  emptyAnswers,
  examFitsSettings,
  examGradeTenths,
  examMarkdown,
  examSettingsSchema,
  type GradedQuestion,
  generatedExamSchema,
  numberedBlanks,
  objectiveAccuracy,
  pointsEarned,
  questionValue,
  resultsMarkdown,
} from "./exam-paper";

const opts = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n²)"];
const MC: ExamItem = {
  question: {
    type: "MC",
    stem: "What is the cost of binary search?",
    options: opts,
  },
  key: { type: "MC", answer: "B", why: "It halves the range each step." },
};
const TF: ExamItem = {
  question: {
    type: "TF",
    statements: [
      "O(2n) is O(n).",
      "O(n²) is O(n³).",
      "includes is O(1).",
      "push is O(1) amortized.",
      "Merge sort uses O(1) space.",
    ],
  },
  key: {
    type: "TF",
    answers: [true, true, false, true, false],
    why: "Constants drop; upper bounds stack; includes scans.",
  },
};
const OPEN: ExamItem = {
  question: {
    type: "OPEN",
    stem: "Why can an O(n²) sort beat an O(n log n) one?",
  },
  key: {
    type: "OPEN",
    modelAnswer: "Constants and small n: insertion sort wins below ~20 items.",
    mustCover: ["hidden constants", "small inputs"],
  },
};
const CODE: ExamItem = {
  question: {
    type: "CODE",
    stem: "Fill in the blanks so the loop is O(log n).",
    code: "for (let i = 1; i < n; i ____(1)____ 2) {\n  count += ____(2)____;\n}",
    language: "ts",
  },
  key: {
    type: "CODE",
    blanks: ["*=", "1"],
    solution: "for (let i = 1; i < n; i *= 2) {\n  count += 1;\n}",
  },
};
const CODE_MC: ExamItem = {
  question: {
    type: "CODE_MC",
    stem: "Which line makes this O(1)?",
    code: "const seen = new Set(items);\nreturn ____;",
    language: "ts",
    options: [
      "seen.has(x)",
      "items.includes(x)",
      "items.indexOf(x) > -1",
      "[...seen].includes(x)",
      "items.some((y) => y === x)",
    ],
  },
  key: {
    type: "CODE_MC",
    answer: "A",
    why: "Set lookups are O(1) on average.",
  },
};
const exam = { title: "Big-O Notation", items: [MC, TF, OPEN, CODE, CODE_MC] };

describe("exam settings", () => {
  it("take 1 to 20 questions, an optional mix that adds up, lessons and a focus", () => {
    expect(examSettingsSchema.safeParse({ questions: 3 }).success).toBe(true);
    expect(
      examSettingsSchema.safeParse({
        questions: 3,
        mix: { MC: 1, TF: 1, OPEN: 1 },
        lessons: [1, 3],
        focus: "trade-offs",
      }).success,
    ).toBe(true);
    for (const bad of [
      { questions: 0 },
      { questions: 21 },
      { questions: 3, mix: { MC: 1, TF: 1 } },
      { questions: 2, lessons: [1, 1] },
      { questions: 2, focus: "x".repeat(501) },
    ])
      expect(
        examSettingsSchema.safeParse(bad).success,
        JSON.stringify(bad).slice(0, 40),
      ).toBe(false);
    const wrongSum = examSettingsSchema.safeParse({
      questions: 3,
      mix: { MC: 1, TF: 1 },
    });
    expect(wrongSum.error?.issues[0]?.message).toBe(
      "The types add up to 2, not 3 questions.",
    );
  });
});

describe("the model's exam", () => {
  it("accepts one of each type, and becomes a tool schema", () => {
    expect(generatedExamSchema.parse(exam)).toEqual(exam);
    const schema = toJSONSchema(generatedExamSchema, { io: "input" }) as {
      type: string;
    };
    expect(schema.type).toBe("object");
  });

  it("refuses a malformed reply", () => {
    const withItem = (item: unknown) => ({ title: "x", items: [item] });
    const refused = [
      withItem({
        ...MC,
        question: { ...MC.question, options: opts.slice(0, 4) },
      }),
      withItem({
        ...CODE_MC,
        question: { ...CODE_MC.question, code: "a = ____;\nb = ____;" },
      }),
      withItem({
        ...CODE,
        question: { ...CODE.question, code: "x ____(2)____ y ____(1)____" },
      }),
      withItem({
        ...CODE,
        question: { ...CODE.question, code: "no blanks at all" },
      }),
      withItem({ ...CODE, key: { ...CODE.key, blanks: ["*="] } }),
      withItem({ question: MC.question, key: TF.key }),
      withItem({ ...TF, key: { ...TF.key, answers: [true, false] } }),
      withItem({ ...MC, key: { ...MC.key, answer: "F" } }),
      { title: "x", items: [] },
    ];
    for (const reply of refused)
      expect(
        generatedExamSchema.safeParse(reply).success,
        JSON.stringify(reply).slice(0, 80),
      ).toBe(false);
  });

  it("is checked against the settings: count and mix", () => {
    expect(examFitsSettings(exam, { questions: 5 })).toEqual([]);
    expect(examFitsSettings(exam, { questions: 6 })).toEqual([
      "5 questions, not the 6 asked for.",
    ]);
    expect(
      examFitsSettings(exam, {
        questions: 5,
        mix: { MC: 2, TF: 1, OPEN: 1, CODE: 1 },
      }),
    ).toEqual([
      "1 MC, not the 2 asked for.",
      "1 CODE-MC, not the 0 asked for.",
    ]);
  });

  it("numbers CODE blanks in order of appearance", () => {
    expect(
      numberedBlanks(CODE.question.type === "CODE" ? CODE.question.code : ""),
    ).toEqual([1, 2]);
  });
});

describe("answers", () => {
  const questions = exam.items.map((i) => i.question);

  it("start empty, one per question, and must line up with the questions", () => {
    const empty = emptyAnswers(questions);
    expect(empty).toEqual([
      { type: "MC", choice: null },
      { type: "TF", marks: [null, null, null, null, null] },
      { type: "OPEN", text: "" },
      { type: "CODE", blanks: ["", ""] },
      { type: "CODE_MC", choice: null },
    ]);
    expect(answersFit(questions, empty)).toBe(true);
    expect(answersFit(questions, empty.slice(1))).toBe(false);
    expect(
      answersFit(questions, [
        ...empty.slice(0, 4),
        { type: "MC", choice: "A" },
      ]),
    ).toBe(false);
    expect(
      answersFit(questions, [
        ...empty.slice(0, 3),
        { type: "CODE", blanks: ["a", "b", "c"] },
        empty[4] as ExamAnswer,
      ]),
    ).toBe(false);
  });
});

describe("scoring (exam-rules.md, rule 4)", () => {
  it("scores MC and CODE-MC all or nothing, TF a fifth per statement with unmarked wrong", () => {
    expect(objectiveAccuracy(MC.key, { type: "MC", choice: "B" })).toBe(100);
    expect(objectiveAccuracy(MC.key, { type: "MC", choice: "C" })).toBe(0);
    expect(objectiveAccuracy(MC.key, { type: "MC", choice: null })).toBe(0);
    expect(
      objectiveAccuracy(CODE_MC.key, { type: "CODE_MC", choice: "A" }),
    ).toBe(100);
    expect(
      objectiveAccuracy(TF.key, {
        type: "TF",
        marks: [true, true, false, true, false],
      }),
    ).toBe(100);
    expect(
      objectiveAccuracy(TF.key, {
        type: "TF",
        marks: [true, false, false, null, false],
      }),
    ).toBe(60);
    // Unmarked is wrong even where the answer is False (V is False).
    expect(
      objectiveAccuracy(TF.key, {
        type: "TF",
        marks: [true, true, false, true, null],
      }),
    ).toBe(80);
    expect(() =>
      objectiveAccuracy(OPEN.key, { type: "OPEN", text: "x" }),
    ).toThrow();
  });

  it("averages accuracy into integer tenths, rounding half up", () => {
    expect(examGradeTenths([100, 80, 50])).toBe(77); // 7.67 → 7.7
    // The rules' example: 10 questions, 50% on one earns 0.5.
    expect(examGradeTenths([50, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(5);
    expect(examGradeTenths([85, 86])).toBe(86); // 8.55 → 8.6
    expect(examGradeTenths([100])).toBe(100);
    expect(examGradeTenths([0, 0])).toBe(0);
    for (const bad of [[], [101], [-1], [1.5]])
      expect(() => examGradeTenths(bad)).toThrow();
  });

  it("shows each question's value and what it earned, as the file does", () => {
    expect([1, 3, 4, 6, 10].map(questionValue)).toEqual([
      "10.0",
      "3.33",
      "2.5",
      "1.67",
      "1.0",
    ]);
    expect(pointsEarned(50, 10)).toBe("0.5 / 1.0");
    expect(pointsEarned(80, 3)).toBe("2.67 / 3.33");
    expect(pointsEarned(0, 10)).toBe("0.0 / 1.0");
  });
});

describe("the exam file", () => {
  const questions = exam.items.map((i) => i.question);
  const md = examMarkdown(
    exam.title,
    questions,
    "Answer this exam in Projects Lab.",
  );

  it("follows the rules' exam output format, questions only", () => {
    expect(
      md.startsWith(
        "# Final exam · Big-O Notation\n\n`5 questions` `2.0 points each` `Total: 10`\n\n",
      ),
    ).toBe(true);
    expect(md).toContain(
      "**1. [MC · 2.0 pt]** What is the cost of binary search?\n\nA) O(1)  B) O(log n)  C) O(n)  D) O(n log n)  E) O(n²)",
    );
    expect(md).toContain(
      "**2. [TF · 2.0 pt]** Mark each statement T or F.\n\nI. O(2n) is O(n).  \nII. O(n²) is O(n³).",
    );
    expect(md).toContain(
      "**4. [CODE · 2.0 pt]** Fill in the blanks so the loop is O(log n).\n\n```ts\nfor (let i = 1;",
    );
    expect(md).toContain(
      "**5. [CODE-MC · 2.0 pt]** Which line makes this O(1)?",
    );
    expect(md).toContain("A) `seen.has(x)`  B) `items.includes(x)`");
    expect(md.endsWith("---\nAnswer this exam in Projects Lab.\n")).toBe(true);
    // Never the key.
    for (const item of exam.items)
      for (const secret of Object.entries(item.key)
        .filter(([field]) => field !== "type")
        .map(([, v]) => v)
        .filter((v) => typeof v === "string" && v.length > 3))
        expect(md, String(secret)).not.toContain(secret);
    expect(md).not.toContain("insertion sort");
  });

  it("appends Results in the rules' report format, review suggestions only below 7", () => {
    const answers: ExamAnswer[] = [
      { type: "MC", choice: "C" },
      { type: "TF", marks: [true, false, false, null, false] },
      { type: "OPEN", text: "Constants | small inputs\nmatter." },
      { type: "CODE", blanks: ["*=", "1"] },
      { type: "CODE_MC", choice: "A" },
    ];
    const graded: GradedQuestion[] = exam.items.map((item, i) => ({
      ...item,
      answer: answers[i] as ExamAnswer,
      accuracy: [0, 60, 50, 100, 100][i] as number,
      ...(item.key.type === "OPEN"
        ? { feedback: "Half there.", missing: "small inputs" }
        : {}),
      ...(item.key.type === "CODE" ? { feedback: "Correct." } : {}),
    }));
    const grade = examGradeTenths(graded.map((g) => g.accuracy)); // 310 / 5 = 62
    const results = resultsMarkdown(
      graded,
      grade,
      "Revisit lesson 2: the classes.",
    );
    expect(results).toContain(
      "\n---\n\n## Results\n\n| # | Type | Your answer | Correct | Accuracy | Points |\n|---|---|---|---|---|---|\n",
    );
    expect(results).toContain("| 1 | MC | C | B | 0% | 0.0 / 2.0 |");
    expect(results).toContain(
      "| 2 | TF | I-T, II-F, III-F, IV-?, V-F | I-T, II-T, III-F, IV-T, V-F | 60% | 1.2 / 2.0 |",
    );
    expect(results).toContain(
      "| 3 | OPEN | Constants \\| small inputs matter. | Model answer below | 50% | 1.0 / 2.0 |",
    );
    expect(results).toContain("**Final grade: 6.2 / 10**");
    expect(results).toContain(
      "**1.** What is the cost of binary search? → **B**. It halves the range each step.",
    );
    expect(results).toContain(
      "**3.** Accuracy 50%. Half there. What was missing: small inputs",
    );
    expect(results).toContain(
      "**Your answer:**\n\n> Constants | small inputs\n> matter.",
    );
    expect(results).toContain("**Model answer:** Constants and small n");
    expect(results).toContain(
      "**Reference solution:**\n\n```ts\nfor (let i = 1; i < n; i *= 2)",
    );
    expect(results).toContain(
      "## Review suggestions\n\nRevisit lesson 2: the classes.",
    );
    expect(resultsMarkdown(graded, 70, "Revisit lesson 2.")).not.toContain(
      "Review suggestions",
    );
  });
});

describe("the model's grading", () => {
  it("takes integer accuracy 0–100 per question number, and a review", () => {
    expect(
      answerGradingSchema.safeParse({
        results: [{ number: 3, accuracy: 50, feedback: "Half." }],
        review: "",
      }).success,
    ).toBe(true);
    for (const accuracy of [101, -1, 50.5])
      expect(
        answerGradingSchema.safeParse({
          results: [{ number: 3, accuracy, feedback: "x" }],
          review: "",
        }).success,
      ).toBe(false);
  });
});
