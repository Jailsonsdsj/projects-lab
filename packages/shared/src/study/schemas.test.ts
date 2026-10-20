import { describe, expect, it } from "vitest";
import { toJSONSchema, type ZodType } from "zod";
import { unboundedToolStrings } from "../core/tool-strings";
import {
  addAreaInputSchema,
  addTopicsInputSchema,
  getSummaryInputSchema,
  listBacklogInputSchema,
  listCoursesInputSchema,
  listExamsInputSchema,
  parseCoursePath,
  parseExamPath,
  recordCourseInputSchema,
  recordExamInputSchema,
  recordGradeInputSchema,
  removeTopicInputSchema,
  updateTopicInputSchema,
} from "./schemas";

const BASE = "Study Lab/cs-fundamentals/big-o-notation/big-o-notation";
const issues = (schema: ZodType, input: unknown) => {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
};

describe("study-materials paths", () => {
  it("reads a course path, with the hyphenated level slug", () => {
    expect(parseCoursePath(`${BASE}__fast-track.md`)).toEqual({
      areaSlug: "cs-fundamentals",
      topicSlug: "big-o-notation",
      level: "fast_track",
      module: null,
    });
    expect(parseCoursePath(`${BASE}__specialized_m2.md`)?.module).toBe(2);
  });

  it("refuses anything off the layout", () => {
    for (const path of [
      `${BASE}__fast_track.md`, // database spelling, not the file's
      `${BASE}__fast-track.pdf`,
      "Study Lab/cs-fundamentals/big-o-notation/other-topic__essential.md",
      "courses/cs-fundamentals/big-o-notation__fast-track.md", // cs-learning-lab layout
      "Study Lab/CS/Big-O/Big-O__essential.md",
      `${BASE}__essential__exam-1.md`,
    ])
      expect(parseCoursePath(path)).toBeNull();
  });

  it("reads an exam path and its stem", () => {
    const md = parseExamPath(`${BASE}__essential__exam-2.md`);
    expect(md).toMatchObject({
      level: "essential",
      attempt: 2,
      extension: "md",
    });
    expect(parseExamPath(`${BASE}__essential__exam-2.pdf`)?.stem).toBe(
      md?.stem,
    );
    expect(parseExamPath(`${BASE}__essential.md`)).toBeNull();
  });
});

describe("study_record_course input", () => {
  it("accepts a course that matches its level and module", () => {
    expect(
      issues(recordCourseInputSchema, {
        topicId: "CS-01",
        level: "fast_track",
        path: `${BASE}__fast-track.md`,
      }),
    ).toEqual([]);
    expect(
      issues(recordCourseInputSchema, {
        topicId: "CS-01",
        level: "specialized",
        module: 3,
        path: `${BASE}__specialized_m3.md`,
      }),
    ).toEqual([]);
  });

  it("refuses a level, module or path that disagree", () => {
    expect(
      issues(recordCourseInputSchema, {
        topicId: "CS-01",
        level: "essential",
        path: `${BASE}__fast-track.md`,
      }),
    ).toEqual(["level"]);
    expect(
      issues(recordCourseInputSchema, {
        topicId: "CS-01",
        level: "specialized",
        module: 2,
        path: `${BASE}__specialized_m3.md`,
      }),
    ).toEqual(["module"]);
    expect(
      issues(recordCourseInputSchema, {
        topicId: "CS-01",
        level: "specialized",
        path: `${BASE}__specialized_m1.md`,
      }),
    ).toEqual(["module"]);
    expect(
      issues(recordCourseInputSchema, {
        topicId: "CS-01",
        level: "essential",
        module: 2,
        path: `${BASE}__essential.md`,
      }),
    ).toEqual(["module"]);
    expect(
      issues(recordCourseInputSchema, {
        topicId: "CS-01",
        level: "essential",
        path: "courses/x.md",
      }),
    ).toEqual(["path"]);
  });
});

describe("study_record_exam input", () => {
  const exam = {
    topicId: "CS-01",
    level: "essential",
    attempt: 2,
    mdPath: `${BASE}__essential__exam-2.md`,
    pdfPath: `${BASE}__essential__exam-2.pdf`,
  };

  it("accepts the exam's .md and .pdf for that level and attempt", () => {
    expect(issues(recordExamInputSchema, exam)).toEqual([]);
  });

  it("refuses a wrong attempt, level, extension or a PDF of another exam", () => {
    expect(issues(recordExamInputSchema, { ...exam, attempt: 1 })).toEqual([
      "attempt",
    ]);
    expect(
      issues(recordExamInputSchema, { ...exam, level: "fast_track" }),
    ).toEqual(["attempt"]);
    expect(
      issues(recordExamInputSchema, { ...exam, pdfPath: exam.mdPath }),
    ).toEqual(["pdfPath"]);
    expect(
      issues(recordExamInputSchema, {
        ...exam,
        pdfPath: `${BASE}__essential__exam-1.pdf`,
      }),
    ).toEqual(["pdfPath"]);
    expect(
      issues(recordExamInputSchema, { ...exam, mdPath: exam.pdfPath }),
    ).toContain("mdPath");
  });
});

describe("other inputs", () => {
  it("topic IDs and prefixes are canonical", () => {
    expect(issues(removeTopicInputSchema, { topicId: "FE-01" })).toEqual([]);
    for (const topicId of ["FE-1", "fe-01", "FE-001"])
      expect(issues(removeTopicInputSchema, { topicId })).toEqual(["topicId"]);
    expect(issues(addAreaInputSchema, { name: "AI", prefix: "ai" })).toEqual([
      "prefix",
    ]);
  });

  it("a grade is integer tenths 0..100, with its level", () => {
    const grade = { topicId: "FE-01", level: "essential", attempt: 1 };
    expect(issues(recordGradeInputSchema, { ...grade, grade: 85 })).toEqual([]);
    for (const bad of [8.5, -1, 101])
      expect(issues(recordGradeInputSchema, { ...grade, grade: bad })).toEqual([
        "grade",
      ]);
    expect(
      issues(recordGradeInputSchema, {
        topicId: "FE-01",
        attempt: 1,
        grade: 85,
      }),
    ).toEqual(["level"]);
  });

  it("a note is at most 120 characters; an update must change something", () => {
    expect(
      issues(updateTopicInputSchema, {
        topicId: "FE-01",
        note: "x".repeat(120),
      }),
    ).toEqual([]);
    expect(
      issues(updateTopicInputSchema, {
        topicId: "FE-01",
        note: "x".repeat(121),
      }),
    ).toEqual(["note"]);
    expect(issues(updateTopicInputSchema, { topicId: "FE-01" })).toEqual([""]);
  });

  it("adding topics: 1 to 50, levels never unset, priority 1..3", () => {
    const one = { skill: "Postgres", area: "DB" };
    expect(issues(addTopicsInputSchema, { topics: [one] })).toEqual([]);
    expect(issues(addTopicsInputSchema, { topics: [] })).toEqual(["topics"]);
    expect(
      issues(addTopicsInputSchema, { topics: [{ ...one, level: "unset" }] }),
    ).toEqual(["topics.0.level"]);
    expect(
      issues(addTopicsInputSchema, { topics: [{ ...one, priority: 4 }] }),
    ).toEqual(["topics.0.priority"]);
  });
});

// The MCP tool-string rule (02-integration, core/tool-strings.ts): every
// string a tool takes is bounded or an enum, so no tool can carry file content.
describe("every study_* input is bounded", () => {
  const schemas = {
    listBacklogInputSchema,
    getSummaryInputSchema,
    addTopicsInputSchema,
    updateTopicInputSchema,
    removeTopicInputSchema,
    addAreaInputSchema,
    recordCourseInputSchema,
    listCoursesInputSchema,
    recordExamInputSchema,
    recordGradeInputSchema,
    listExamsInputSchema,
  };

  it("has no unbounded string anywhere in its JSON Schema", () => {
    const unbounded = Object.entries(schemas).flatMap(([name, schema]) =>
      unboundedToolStrings(toJSONSchema(schema, { io: "input" }), name),
    );
    expect(unbounded).toEqual([]);
  });
});
