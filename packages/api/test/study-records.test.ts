// Recording courses, exams and grades (ST-05, PRDs 11 and 12). GitHub is a
// stand-in on the global fetch that knows which files study-materials holds.
import { env } from "cloudflare:workers";
import { courseReadResponseSchema } from "@projects-lab/shared/study";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/index";
import { db } from "./db";
import { callTool, seedOwner, sessionJwt, signInClaude } from "./oauth-flow";

const CONTENTS = "https://api.github.com/repos/owner/study-materials/contents/";
const BASE = "Study Lab/cs-fundamentals/big-o-notation/big-o-notation";
const COURSE = `${BASE}__fast-track.md`;
const exam = (level: string, n: number, ext: "md" | "pdf") =>
  `${BASE}__${level}__exam-${n}.${ext}`;

/** study-materials holds exactly these files; the token can be revoked. */
function github(files: string[], { tokenValid = true } = {}) {
  const held = new Set(files);
  const requests: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new Request(input).url;
    requests.push(url);
    if (!tokenValid) return new Response("Bad credentials", { status: 401 });
    const path = decodeURIComponent(url.slice(CONTENTS.length));
    if (!url.startsWith(CONTENTS) || !held.has(path))
      return new Response("not found", { status: 404 });
    return Response.json({
      type: "file",
      name: path.split("/").pop(),
      path,
      sha: "b".repeat(40),
      size: 100,
    });
  });
  return requests;
}

afterEach(() => {
  vi.restoreAllMocks();
});

let session: string;
let authKey: string;

beforeAll(async () => {
  authKey = await seedOwner();
  session = await sessionJwt();
  await db().batch(
    [
      "INSERT INTO skill (id, name, created_at) VALUES ('sk-bigo', 'Big-O notation', 't')",
      "INSERT INTO skill (id, name, created_at) VALUES ('sk-sort', 'Sorting', 't')",
      "INSERT INTO learn_topic (id, code, area_id, skill_id, created_at, updated_at) VALUES ('t-bigo', 'CS-01', 'area-cs', 'sk-bigo', 't', 't')",
      "INSERT INTO learn_topic (id, code, area_id, skill_id, created_at, updated_at) VALUES ('t-sort', 'CS-02', 'area-cs', 'sk-sort', 't', 't')",
    ].map((sql) => db().prepare(sql)),
  );
});

const post = (path: string, body: unknown) =>
  app.request(
    `/api/study${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    env,
  );
const get = (path: string) =>
  app.request(
    `/api/study${path}`,
    { headers: { Authorization: `Bearer ${session}` } },
    env,
  );

const topicRow = (code: string) =>
  db()
    .prepare(
      "SELECT status, level, started_on AS startedOn FROM learn_topic WHERE code = ?",
    )
    .bind(code)
    .first<{ status: string; level: string; startedOn: string | null }>();
const count = async (table: string) =>
  (
    await db()
      .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
      .first<{ n: number }>()
  )?.n;
const today = () => new Date().toISOString().slice(0, 10); // the owner is in UTC

describe("recording a course", () => {
  it("refuses a file that isn't in study-materials, storing nothing", async () => {
    github([]);
    const res = await post("/courses", {
      topicId: "CS-01",
      level: "fast_track",
      path: COURSE,
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not_found" });
    expect(await count("learn_course")).toBe(0);
    expect(await topicRow("CS-01")).toMatchObject({
      status: "not_started",
      level: "unset",
      startedOn: null,
    });
  });

  it("starts a Not started topic, sets its level and Started once", async () => {
    github([COURSE, `${BASE}__essential.md`]);
    const res = await post("/courses", {
      topicId: "CS-01",
      level: "fast_track",
      path: COURSE,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      topic: { id: "CS-01", status: "in_progress", startedOn: today() },
    });

    await db()
      .prepare(
        "UPDATE learn_topic SET started_on = '2026-09-01' WHERE code = 'CS-01'",
      )
      .run();
    await post("/courses", {
      topicId: "CS-01",
      level: "essential",
      path: `${BASE}__essential.md`,
    });
    expect(await topicRow("CS-01")).toMatchObject({
      status: "in_progress",
      level: "essential",
      startedOn: "2026-09-01",
    });
  });

  it("changes nothing when the same file is recorded again; another topic can't claim it", async () => {
    github([COURSE]);
    const before = await count("learn_course");
    expect(
      (
        await post("/courses", {
          topicId: "CS-01",
          level: "fast_track",
          path: COURSE,
        })
      ).status,
    ).toBe(200);
    expect(await count("learn_course")).toBe(before);
    const other = await post("/courses", {
      topicId: "CS-02",
      level: "fast_track",
      path: COURSE,
    });
    expect(other.status).toBe(409);
  });

  it("lists courses newest first, by topic", async () => {
    const { courses } = (await (
      await get("/courses?topicId=CS-01")
    ).json()) as {
      courses: { path: string; level: string }[];
    };
    expect(courses.map((c) => c.level)).toEqual(["essential", "fast_track"]);
    expect(
      ((await (await get("/courses?topicId=CS-02")).json()) as { courses: [] })
        .courses,
    ).toEqual([]);
  });
});

describe("recording an exam", () => {
  const record = (n: number) =>
    post("/exams", {
      topicId: "CS-01",
      level: "essential",
      attempt: n,
      mdPath: exam("essential", n, "md"),
      pdfPath: exam("essential", n, "pdf"),
    });

  it("needs both files", async () => {
    github([exam("essential", 1, "md")]);
    const res = await record(1);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { message: string }).message).toContain(
      ".pdf",
    );
    expect(await count("learn_exam")).toBe(0);
  });

  it("records the next attempt, returns it again unchanged, and refuses a skipped one", async () => {
    github([
      exam("essential", 1, "md"),
      exam("essential", 1, "pdf"),
      exam("essential", 3, "md"),
      exam("essential", 3, "pdf"),
    ]);
    const first = (await (await record(1)).json()) as {
      examId: string;
      attempt: number;
    };
    expect(first.attempt).toBe(1);
    expect(await (await record(1)).json()).toEqual(first);
    const skipped = await record(3);
    expect(skipped.status).toBe(409);
    expect(((await skipped.json()) as { message: string }).message).toContain(
      "the next is 2",
    );
    expect(await topicRow("CS-01")).toMatchObject({ status: "in_progress" });
  });
});

describe("recording a grade", () => {
  it("moves the topic to Done; a correction keeps graded_at", async () => {
    const graded = await post("/grades", {
      topicId: "CS-01",
      level: "essential",
      attempt: 1,
      grade: 85,
    });
    expect(await graded.json()).toMatchObject({
      grade: 85,
      topic: { id: "CS-01", status: "done", grade: 85 },
    });
    const first = await db()
      .prepare("SELECT graded_at AS at FROM learn_exam WHERE attempt = 1")
      .first<{ at: string }>();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const corrected = await post("/grades", {
      topicId: "CS-01",
      level: "essential",
      attempt: 1,
      grade: 90,
    });
    expect(await corrected.json()).toMatchObject({ topic: { grade: 90 } });
    const after = await db()
      .prepare("SELECT graded_at AS at FROM learn_exam WHERE attempt = 1")
      .first<{ at: string }>();
    expect(after?.at).toBe(first?.at);
  });

  it("takes the topic's grade from its most recently graded exam, at any level", async () => {
    github([exam("fast-track", 1, "md"), exam("fast-track", 1, "pdf")]);
    await post("/exams", {
      topicId: "CS-01",
      level: "fast_track",
      attempt: 1,
      mdPath: exam("fast-track", 1, "md"),
      pdfPath: exam("fast-track", 1, "pdf"),
    });
    const later = await post("/grades", {
      topicId: "CS-01",
      level: "fast_track",
      attempt: 1,
      grade: 60,
    });
    expect(await later.json()).toMatchObject({ topic: { grade: 60 } });
    const { exams } = (await (await get("/exams?topicId=CS-01")).json()) as {
      exams: { level: string; grade: number | null }[];
    };
    expect(exams.map((e) => [e.level, e.grade])).toEqual([
      ["fast_track", 60],
      ["essential", 90],
    ]);
  });

  it("refuses an exam that was never recorded", async () => {
    const res = await post("/grades", {
      topicId: "CS-01",
      level: "specialized",
      attempt: 1,
      grade: 70,
    });
    expect(res.status).toBe(404);
  });
});

describe("reading a course", () => {
  const courseIdOf = async (path: string) => {
    const { courses } = (await (
      await get("/courses?topicId=CS-01")
    ).json()) as {
      courses: { courseId: string; path: string }[];
    };
    return courses.find((c) => c.path === path)?.courseId ?? "";
  };

  it("gives the course with its file's blob SHA, for /content", async () => {
    github([COURSE]);
    const res = await get(`/courses/${await courseIdOf(COURSE)}`);
    expect(res.status).toBe(200);
    const { course } = courseReadResponseSchema.parse(await res.json());
    expect(course).toMatchObject({
      topicId: "CS-01",
      skill: "Big-O notation",
      level: "fast_track",
      path: COURSE,
      sha: "b".repeat(40),
      name: "big-o-notation__fast-track.md",
    });
  });

  it("names the path when the file is gone, and 404s an unknown course", async () => {
    github([]);
    const gone = await get(`/courses/${await courseIdOf(COURSE)}`);
    expect(gone.status).toBe(404);
    expect(((await gone.json()) as { message: string }).message).toBe(
      `This course file is no longer in study-materials: ${COURSE}`,
    );
    expect((await get("/courses/no-such-course")).status).toBe(404);
  });

  it("names the fix when GitHub refuses the token", async () => {
    github([COURSE], { tokenValid: false });
    const res = await get(`/courses/${await courseIdOf(COURSE)}`);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "github_token_invalid" });
  });
});

describe("study-materials unreachable", () => {
  it("names the fix: 502 on the route, an error on the tool", async () => {
    github([COURSE], { tokenValid: false });
    const res = await post("/courses", {
      topicId: "CS-02",
      level: "fast_track",
      path: "Study Lab/cs-fundamentals/sorting/sorting__fast-track.md",
    });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "github_token_invalid" });
  });
});

describe("over MCP", () => {
  it("records a course, an exam and a grade, each audited once and replayable", async () => {
    const token = (await signInClaude(authKey)).tokens.access_token ?? "";
    const path = "Study Lab/cs-fundamentals/sorting/sorting__essential.md";
    const md =
      "Study Lab/cs-fundamentals/sorting/sorting__essential__exam-1.md";
    const pdf =
      "Study Lab/cs-fundamentals/sorting/sorting__essential__exam-1.pdf";
    github([path, md, pdf]);

    const course = await callTool(token, "study_record_course", {
      topicId: "CS-02",
      level: "essential",
      path,
      idempotencyKey: "sorting-course",
    });
    expect(course.value).toMatchObject({
      topic: { id: "CS-02", status: "in_progress" },
    });
    const replay = await callTool(token, "study_record_course", {
      topicId: "CS-02",
      level: "essential",
      path,
      idempotencyKey: "sorting-course",
    });
    expect(replay.value).toEqual(course.value);

    const recorded = await callTool(token, "study_record_exam", {
      topicId: "CS-02",
      level: "essential",
      attempt: 1,
      mdPath: md,
      pdfPath: pdf,
    });
    expect(recorded.isError).toBe(false);
    const graded = await callTool(token, "study_record_grade", {
      topicId: "CS-02",
      level: "essential",
      attempt: 1,
      grade: 72,
    });
    expect(graded.value).toMatchObject({
      topic: { status: "done", grade: 72 },
    });

    const listed = await callTool(token, "study_list_exams", {
      topicId: "CS-02",
    });
    expect(listed.value.exams).toHaveLength(1);

    const audited = await db()
      .prepare(
        "SELECT tool, COUNT(*) AS n FROM mcp_call WHERE tool LIKE 'study_record_%' GROUP BY tool ORDER BY tool",
      )
      .all<{ tool: string; n: number }>();
    expect(audited.results).toEqual([
      { tool: "study_record_course", n: 2 }, // the replay is audited too (PRD 02)
      { tool: "study_record_exam", n: 1 },
      { tool: "study_record_grade", n: 1 },
    ]);
    expect(
      (
        await db()
          .prepare("SELECT COUNT(*) AS n FROM learn_course WHERE path = ?")
          .bind(path)
          .first<{ n: number }>()
      )?.n,
    ).toBe(1);
  });

  it("tells Claude when study-materials is unreachable", async () => {
    const token = (await signInClaude(authKey)).tokens.access_token ?? "";
    github([], { tokenValid: false });
    const res = await callTool(token, "study_record_course", {
      topicId: "CS-02",
      level: "fast_track",
      path: "Study Lab/cs-fundamentals/sorting/sorting__fast-track.md",
    });
    expect(res.isError).toBe(true);
    expect(res.value).toMatchObject({ error: "github_token_invalid" });
    expect(res.value.message).toContain("GITHUB_TOKEN");
  });
});
