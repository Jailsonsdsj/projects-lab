// Deleting an exam (ST-14a, PRD 12): it leaves every read and the grade is
// derived without it; Undo brings it back until the nightly run, through the
// Worker's real `scheduled` export, removes its files from study-materials.
import { createScheduledController } from "cloudflare:test";
import { env } from "cloudflare:workers";
import {
  backlogResponseSchema,
  examDeletionResponseSchema,
  examsResponseSchema,
} from "@projects-lab/shared/study";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker, { app } from "../src/index";
import { studyContract } from "../src/labs/study/contract";
import { removeExamFile } from "../src/labs/study/exam-files";
import { db } from "./db";
import { callTool, seedOwner, sessionJwt, signInClaude } from "./oauth-flow";

const CONTENTS = "https://api.github.com/repos/owner/study-materials/contents/";
const path = (slug: string, n: number, ext: "md" | "pdf") =>
  `Study Lab/cs-fundamentals/${slug}/${slug}__essential__exam-${n}.${ext}`;
const HOUR = 60 * 60_000;

let session: string;
let authKey: string;

beforeAll(async () => {
  authKey = await seedOwner();
  session = await sessionJwt();
  const exam = (
    id: string,
    topic: string,
    slug: string,
    n: number,
    grade?: number,
  ) => [
    `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at) VALUES ('${id}', '${topic}', 'essential', ${n}, '${path(slug, n, "md")}', '${path(slug, n, "pdf")}', 't')`,
    ...(grade === undefined
      ? []
      : [
          `UPDATE learn_exam SET grade = ${grade}, graded_at = '2026-10-0${n}T10:00:00.000Z' WHERE id = '${id}'`,
        ]),
  ];
  await db().batch(
    [
      "INSERT INTO skill (id, name, created_at) VALUES ('sk-a', 'Big-O notation', 't')",
      "INSERT INTO skill (id, name, created_at) VALUES ('sk-b', 'Sorting', 't')",
      "INSERT INTO skill (id, name, created_at) VALUES ('sk-c', 'Hashing', 't')",
      "INSERT INTO learn_topic (id, code, area_id, skill_id, status, created_at, updated_at) VALUES ('ta', 'CS-01', 'area-cs', 'sk-a', 'done', 't', 't')",
      "INSERT INTO learn_topic (id, code, area_id, skill_id, status, created_at, updated_at) VALUES ('tb', 'CS-02', 'area-cs', 'sk-b', 'done', 't', 't')",
      "INSERT INTO learn_topic (id, code, area_id, skill_id, status, created_at, updated_at) VALUES ('tc', 'CS-03', 'area-cs', 'sk-c', 'in_progress', 't', 't')",
      // CS-01: #1 60, #2 85 (its grade). CS-02: only #1, 80 (verified).
      // CS-03: #1 ungraded, for numbering.
      ...exam("a1", "ta", "big-o", 1, 60),
      ...exam("a2", "ta", "big-o", 2, 85),
      ...exam("b1", "tb", "sorting", 1, 80),
      ...exam("c1", "tc", "hashing", 1),
      // An exam made in the app, with its paper (a draft).
      `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, source, created_at) VALUES ('p1', 'tc', 'fast_track', 1, 'Study Lab/cs-fundamentals/hashing/hashing__fast-track__exam-1.md', NULL, 'app', 't')`,
      `INSERT INTO learn_exam_paper (exam_id, title, settings_json, questions_json, key_json, draft_json, created_at, updated_at) VALUES ('p1', 'Hashing', '{"questions":1}', '[{"type":"OPEN","stem":"Why?"}]', '[{"type":"OPEN","modelAnswer":"Because.","mustCover":["because"]}]', '[{"type":"OPEN","text":""}]', 't', 't')`,
    ].map((sql) => db().prepare(sql)),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const call = (method: string, path: string, body?: unknown) =>
  app.request(
    `/api/study${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${session}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    env,
  );
const del = async (examId: string) => {
  const res = await call("DELETE", `/exams/${examId}`);
  expect(res.status).toBe(200);
  return examDeletionResponseSchema.parse(await res.json()).exam;
};
const restore = (examId: string) => call("POST", `/exams/${examId}/restore`);
const topic = async (code: string) =>
  backlogResponseSchema
    .parse(await (await call("GET", "/backlog")).json())
    .topics.find((t) => t.id === code);
const listed = async () =>
  examsResponseSchema
    .parse(await (await call("GET", "/exams")).json())
    .exams.map((e) => e.examId)
    .sort();

describe("deleting an exam", () => {
  it("leaves every read, and the topic's grade falls back to the exam before", async () => {
    expect((await topic("CS-01"))?.grade).toBe(85);
    expect(await del("a2")).toMatchObject({
      examId: "a2",
      topicId: "CS-01",
      level: "essential",
      attempt: 2,
      deletedAt: expect.any(String),
    });
    expect(await topic("CS-01")).toMatchObject({ grade: 60, status: "done" });
    expect(await listed()).not.toContain("a2");
    expect((await call("GET", "/exams/a2")).status).toBe(404);

    // Undo: it's back, and so is its grade. Both calls are idempotent.
    expect((await restore("a2")).status).toBe(200);
    expect((await restore("a2")).status).toBe(200);
    expect((await topic("CS-01"))?.grade).toBe(85);
    expect(await listed()).toContain("a2");
  });

  it("deleting the only graded exam leaves no grade and the topic Done; Career no longer counts it", async () => {
    const contract = studyContract(db());
    expect(await contract.skillStatus(["sk-b"])).toMatchObject([
      { skillId: "sk-b", verified: true, grade: 80 },
    ]);
    const first = await del("b1");
    // Deleting again changes nothing.
    expect(await del("b1")).toEqual(first);
    expect(await topic("CS-02")).toMatchObject({
      grade: null,
      finishedOn: null,
      status: "done",
    });
    expect(await contract.skillStatus(["sk-b"])).toMatchObject([
      { skillId: "sk-b", verified: false, grade: null },
    ]);
    expect(await contract.verifiedSkills()).not.toContainEqual(
      expect.objectContaining({ skillId: "sk-b" }),
    );
    await restore("b1");
  });

  it("keeps counting it: the next attempt is #2, and recording the deleted one again is refused", async () => {
    await del("c1");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const p = decodeURIComponent(
        new Request(input).url.slice(CONTENTS.length),
      );
      return Response.json({
        type: "file",
        name: p.split("/").pop(),
        path: p,
        sha: "b".repeat(40),
        size: 1,
      });
    });
    const record = (n: number) =>
      call("POST", "/exams", {
        topicId: "CS-03",
        level: "essential",
        attempt: n,
        mdPath: path("hashing", n, "md"),
        pdfPath: path("hashing", n, "pdf"),
      });
    const again = await record(1);
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({
      message: expect.stringContaining("deleted in the app"),
    });
    const next = await record(2);
    expect(next.status).toBe(200);
    expect(await next.json()).toMatchObject({ attempt: 2 });
  });

  it("isn't graded, through the app or Claude, and Claude doesn't list it", async () => {
    await del("a1");
    const grade = await call("POST", "/grades", {
      topicId: "CS-01",
      level: "essential",
      attempt: 1,
      grade: 90,
    });
    expect(grade.status).toBe(409);
    const token = (await signInClaude(authKey)).tokens.access_token ?? "";
    const refused = await callTool(token, "study_record_grade", {
      topicId: "CS-01",
      level: "essential",
      attempt: 1,
      grade: 90,
    });
    expect(refused).toMatchObject({
      isError: true,
      value: { error: "conflict", message: expect.stringContaining("deleted") },
    });
    const list = await callTool(token, "study_list_exams", {
      topicId: "CS-01",
    });
    expect(
      (list.value as { exams: { examId: string }[] }).exams.map(
        (e) => e.examId,
      ),
    ).toEqual(["a2"]);
    // The grade it had stays as it was.
    expect(
      await db()
        .prepare("SELECT grade FROM learn_exam WHERE id = 'a1'")
        .first("grade"),
    ).toBe(60);
    await restore("a1");
  });

  it("closes an app exam's paper: no reading it, no saving its draft", async () => {
    expect((await call("GET", "/exams/p1/paper")).status).toBe(200);
    await del("p1");
    expect((await call("GET", "/exams/p1/paper")).status).toBe(404);
    const draft = await call("PUT", "/exams/p1/draft", {
      answers: [{ type: "OPEN", text: "x" }],
    });
    expect(draft.status).toBe(404);
    await restore("p1");
    expect((await call("GET", "/exams/p1/paper")).status).toBe(200);
  });

  it("answers 404 for an exam that doesn't exist", async () => {
    expect((await call("DELETE", "/exams/nope")).status).toBe(404);
    expect((await restore("nope")).status).toBe(404);
  });
});

describe("the nightly run", () => {
  /** study-materials holds `files`; records every write; `failOn` paths answer 500. */
  function github(files: string[], failOn: string[] = []) {
    const held = new Set(files);
    const writes: { method: string; path: string; body: unknown }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      const p = decodeURIComponent(request.url.slice(CONTENTS.length));
      if (request.method === "DELETE") {
        const body = await request.json();
        writes.push({ method: "DELETE", path: p, body });
        if (failOn.includes(p)) return new Response("boom", { status: 500 });
        held.delete(p);
        return Response.json({ commit: { sha: "c".repeat(40) } });
      }
      if (!held.has(p)) return new Response("not found", { status: 404 });
      return Response.json({
        type: "file",
        name: p.split("/").pop(),
        path: p,
        sha: `${p.length}`.padStart(40, "a"),
        size: 1,
      });
    });
    return { held, writes };
  }
  const run = (at: number) =>
    worker.scheduled(
      createScheduledController({ scheduledTime: at, cron: "0 3 * * *" }),
      env,
    );
  const stamps = (id: string) =>
    db()
      .prepare(
        "SELECT deleted_at AS deletedAt, files_removed_at AS filesRemovedAt FROM learn_exam WHERE id = ?",
      )
      .bind(id)
      .first<{ deletedAt: string | null; filesRemovedAt: string | null }>();
  const NOW = Date.parse("2026-10-23T03:00:00.000Z");
  const deletedAgo = (id: string, ms: number) =>
    db()
      .prepare("UPDATE learn_exam SET deleted_at = ? WHERE id = ?")
      .bind(new Date(NOW - ms).toISOString(), id)
      .run();

  beforeAll(async () => {
    await db().batch(
      [
        "INSERT INTO skill (id, name, created_at) VALUES ('sk-n', 'Graphs', 't')",
        "INSERT INTO learn_topic (id, code, area_id, skill_id, created_at, updated_at) VALUES ('tn', 'CS-09', 'area-cs', 'sk-n', 't', 't')",
        ...[1, 2, 3].map(
          (n) =>
            `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at) VALUES ('n${n}', 'tn', 'essential', ${n}, '${path("graphs", n, "md")}', '${path("graphs", n, "pdf")}', 't')`,
        ),
        `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, source, created_at) VALUES ('n4', 'tn', 'essential', 4, '${path("graphs", 4, "md")}', NULL, 'app', 't')`,
      ].map((sql) => db().prepare(sql)),
    );
  });

  it("removes the files of exams deleted over an hour ago, then they stay deleted", async () => {
    await deletedAgo("n1", 2 * HOUR); // a Claude Code exam: .md and .pdf
    await deletedAgo("n2", 10 * 60_000); // too recent: an Undo may still come
    await deletedAgo("n4", 2 * HOUR); // an app exam whose .md is already gone
    const { held, writes } = github([
      path("graphs", 1, "md"),
      path("graphs", 1, "pdf"),
      path("graphs", 2, "md"),
      path("graphs", 2, "pdf"),
      path("graphs", 3, "md"),
    ]);
    await run(NOW);

    expect(writes.map((w) => w.path)).toEqual([
      path("graphs", 1, "md"),
      path("graphs", 1, "pdf"),
    ]);
    expect(writes[0]?.body).toEqual({
      message: "remove(CS-09): exam #1, deleted in Projects Lab",
      sha: `${path("graphs", 1, "md").length}`.padStart(40, "a"),
    });
    // The live exam's and the recent one's files are untouched.
    expect([...held].sort()).toEqual(
      [
        path("graphs", 2, "md"),
        path("graphs", 2, "pdf"),
        path("graphs", 3, "md"),
      ].sort(),
    );
    expect((await stamps("n1"))?.filesRemovedAt).toBe(
      new Date(NOW).toISOString(),
    );
    expect((await stamps("n4"))?.filesRemovedAt).toBe(
      new Date(NOW).toISOString(),
    );
    expect((await stamps("n2"))?.filesRemovedAt).toBeNull();
    expect((await stamps("n3"))?.deletedAt).toBeNull();

    // Gone for good: Undo is refused, and the next run leaves it alone.
    const undo = await restore("n1");
    expect(undo.status).toBe(409);
    expect(await undo.json()).toMatchObject({
      message: expect.stringContaining("stays deleted"),
    });
    // n2 can still come back.
    expect((await restore("n2")).status).toBe(200);
    const next = github([]);
    await run(NOW + 24 * HOUR);
    expect(next.writes).toEqual([]);
  });

  it("tries a failed removal again the next night; the others go ahead", async () => {
    await deletedAgo("n2", 2 * HOUR);
    await deletedAgo("n3", 2 * HOUR);
    github(
      [
        path("graphs", 2, "md"),
        path("graphs", 2, "pdf"),
        path("graphs", 3, "md"),
        path("graphs", 3, "pdf"),
      ],
      [path("graphs", 2, "pdf")],
    );
    await expect(run(NOW + 48 * HOUR)).rejects.toThrow(
      "a lab's nightly work failed",
    );
    expect((await stamps("n2"))?.filesRemovedAt).toBeNull();
    expect((await stamps("n3"))?.filesRemovedAt).not.toBeNull();

    // The next night: n2's .md is gone already, its .pdf goes now.
    const { writes } = github([path("graphs", 2, "pdf")]);
    await run(NOW + 72 * HOUR);
    expect(writes.map((w) => w.path)).toEqual([path("graphs", 2, "pdf")]);
    expect((await stamps("n2"))?.filesRemovedAt).not.toBeNull();
  });

  it("reads no write token when nothing is due", async () => {
    const { writes } = github([]);
    // Unset locally, say: the run still succeeds while no exam is due.
    await worker.scheduled(
      createScheduledController({
        scheduledTime: NOW + 96 * HOUR,
        cron: "0 3 * * *",
      }),
      { ...env, GITHUB_WRITE_TOKEN: undefined as unknown as string },
    );
    expect(writes).toEqual([]);
  });
});

describe("the write token's reach", () => {
  it("removes an exam's .md or .pdf, never a course or another file", async () => {
    const calls: string[] = [];
    const deps = {
      token: "t",
      repo: "owner/study-materials",
      fetch: (async (input: RequestInfo | URL) => {
        calls.push(new Request(input).url);
        return Response.json({});
      }) as typeof fetch,
    };
    for (const p of [
      "Study Lab/cs-fundamentals/big-o/big-o__fast-track.md",
      "README.md",
      "Study Lab/cs-fundamentals/big-o/notes.md",
    ])
      await expect(removeExamFile(deps, p, "s", "m")).rejects.toThrow(
        "Not an exam file the app may remove",
      );
    expect(calls).toHaveLength(0);
    await removeExamFile(deps, path("big-o", 1, "pdf"), "s", "m");
    await removeExamFile(deps, path("big-o", 1, "md"), "s", "m");
    expect(calls).toHaveLength(2);
  });
});
