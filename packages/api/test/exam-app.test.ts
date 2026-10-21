// Writing an exam in the app (ST-13c): POST /api/study/courses/:courseId/exams
// through the real Worker, with GitHub and the Anthropic API stand-ins on the
// global fetch. Nothing here reaches either service or spends money.
import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import {
  EXAM_APP_FOOTER,
  EXAM_RULES_PATH,
  type ExamItem,
  emptyAnswers,
  examMarkdown,
  generatedExamResponseSchema,
} from "@projects-lab/shared/study";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { generateExam } from "../src/labs/study/exam-app";
import { writeExamFile } from "../src/labs/study/exam-files";
import { db } from "./db";
import { ORIGIN, seedOwner, sessionJwt, signInClaude } from "./oauth-flow";

const REPO = "https://api.github.com/repos/owner/study-materials";
const COURSE_PATH =
  "Study Lab/cs-fundamentals/big-o-notation/big-o-notation__fast-track.md";
const EXAM_2 =
  "Study Lab/cs-fundamentals/big-o-notation/big-o-notation__fast-track__exam-2.md";
const COURSE_TEXT =
  "# Big-O Notation\n\n## Lesson 1 · What Big-O measures\n\nGrowth.";
const RULES_TEXT =
  "# Final exam rules\n\nNever reveal answers before the learner submits.";

const items: ExamItem[] = [
  {
    question: {
      type: "MC",
      stem: "What is the cost of binary search?",
      options: ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n²)"],
    },
    key: { type: "MC", answer: "B", why: "SECRET-WHY-halves the range" },
  },
  {
    question: { type: "TF", statements: ["a", "b", "c", "d", "e"] },
    key: {
      type: "TF",
      answers: [true, false, true, false, true],
      why: "SECRET-TF-why",
    },
  },
  {
    question: { type: "OPEN", stem: "Why can O(n²) beat O(n log n)?" },
    key: {
      type: "OPEN",
      modelAnswer: "SECRET-MODEL-constants and small n",
      mustCover: ["SECRET-cover"],
    },
  },
];
const generated = { title: "Big-O Notation", items };

interface World {
  reply?: () => Response;
  put?: () => Response;
  onPut?: () => Promise<void>;
}
interface Call {
  url: string;
  method: string;
  body: string;
}

/** study-materials holds the course and the rules; the API answers with `generated`. */
function services(world: World = {}) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const body = init?.body ? String(init.body) : "";
    calls.push({ url: request.url, method: request.method, body });
    if (request.url === "https://api.anthropic.com/v1/messages")
      return (
        world.reply?.() ??
        Response.json({
          stop_reason: "tool_use",
          content: [{ type: "tool_use", name: "write_exam", input: generated }],
        })
      );
    if (request.url.startsWith(`${REPO}/contents/`)) {
      const path = decodeURIComponent(
        request.url.slice(`${REPO}/contents/`.length),
      );
      if (request.method === "PUT") {
        await world.onPut?.();
        return (
          world.put?.() ??
          Response.json({ content: { sha: "new-sha" } }, { status: 201 })
        );
      }
      if (request.method === "DELETE") return Response.json({});
      const sha =
        path === COURSE_PATH
          ? "course-sha"
          : path === EXAM_RULES_PATH
            ? "rules-sha"
            : null;
      if (!sha) return new Response("not found", { status: 404 });
      return Response.json({
        type: "file",
        name: path.split("/").pop(),
        path,
        sha,
        size: 10,
      });
    }
    if (request.url === `${REPO}/git/blobs/course-sha`)
      return new Response(COURSE_TEXT);
    if (request.url === `${REPO}/git/blobs/rules-sha`)
      return new Response(RULES_TEXT);
    return new Response("unexpected", { status: 500 });
  });
  const ai = () => calls.filter((c) => c.url.includes("anthropic"));
  const puts = () => calls.filter((c) => c.method === "PUT");
  const deletes = () => calls.filter((c) => c.method === "DELETE");
  return { calls, ai, puts, deletes };
}

let session: string;
let oauth: string;
beforeAll(async () => {
  oauth = (await signInClaude(await seedOwner())).tokens.access_token ?? "";
  session = await sessionJwt();
  await db().batch(
    [
      "INSERT INTO skill (id, name, created_at) VALUES ('sk1', 'Big-O notation', 't')",
      "INSERT INTO learn_topic (id, code, area_id, skill_id, level, status, created_at, updated_at) VALUES ('t1', 'CS-01', 'area-cs', 'sk1', 'fast_track', 'in_progress', 't', 't')",
      `INSERT INTO learn_course (id, topic_id, level, path, recorded_at) VALUES ('c1', 't1', 'fast_track', '${COURSE_PATH}', 't')`,
      // A Claude Code exam first: the app's is attempt 2 (numbering is shared).
      "INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at) VALUES ('cc1', 't1', 'fast_track', 1, 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__fast-track__exam-1.md', 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__fast-track__exam-1.pdf', 't')",
    ].map((sql) => db().prepare(sql)),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});

// Through the Worker itself (SELF), around the fetch stand-ins.
const post = (settings: unknown, key = crypto.randomUUID(), token = session) =>
  SELF.fetch(`${ORIGIN}/api/study/courses/c1/exams`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify(settings),
  });

const rows = async () =>
  (
    await db()
      .prepare(
        "SELECT id, attempt, source, pdf_path FROM learn_exam WHERE topic_id = 't1' ORDER BY attempt",
      )
      .all()
  ).results;

describe("writing an exam in the app", () => {
  it("commits the questions beside the course, records attempt 2, and never shows the key", async () => {
    const { ai, puts } = services();
    const key = crypto.randomUUID();
    const res = await post({ questions: 3, focus: "trade-offs" }, key);
    expect(res.status, await res.clone().text()).toBe(200);
    const { exam } = generatedExamResponseSchema.parse(await res.json());
    expect(exam).toMatchObject({
      topicId: "CS-01",
      level: "fast_track",
      attempt: 2,
      title: "Big-O Notation",
    });
    expect(exam.questions).toEqual(items.map((i) => i.question));

    // The model got the rules and the course, and what was asked.
    expect(ai()).toHaveLength(1);
    const request = JSON.parse(ai()[0]?.body ?? "{}");
    expect(request.system).toContain(RULES_TEXT);
    expect(request.messages[0].content).toContain(COURSE_TEXT);
    expect(request.messages[0].content).toContain("exactly 3 questions");
    expect(request.messages[0].content).toContain("focus on: trade-offs");

    // The file: questions only, in the exam format, with the app's footer.
    expect(puts()).toHaveLength(1);
    const put = puts()[0] as Call;
    expect(decodeURIComponent(put.url)).toBe(`${REPO}/contents/${EXAM_2}`);
    const sent = JSON.parse(put.body) as { message: string; content: string };
    expect(sent.message).toBe("exam(CS-01): final exam #2 (Projects Lab)");
    const file = new TextDecoder().decode(
      Uint8Array.from(atob(sent.content), (ch) => ch.charCodeAt(0)),
    );
    expect(file).toBe(
      examMarkdown(
        "Big-O Notation",
        items.map((i) => i.question),
        EXAM_APP_FOOTER,
      ),
    );

    // The key: kept in D1, never in the file or the response.
    for (const text of [file, JSON.stringify(exam)])
      expect(text).not.toMatch(/SECRET/);
    const paper = await db()
      .prepare(
        "SELECT key_json, draft_json, questions_json FROM learn_exam_paper WHERE exam_id = ?",
      )
      .bind(exam.examId)
      .first<{
        key_json: string;
        draft_json: string;
        questions_json: string;
      }>();
    expect(JSON.parse(paper?.key_json ?? "[]")).toEqual(
      items.map((i) => i.key),
    );
    expect(JSON.parse(paper?.draft_json ?? "[]")).toEqual(
      emptyAnswers(items.map((i) => i.question)),
    );
    expect(await rows()).toEqual([
      { id: "cc1", attempt: 1, source: "claude", pdf_path: expect.any(String) },
      { id: exam.examId, attempt: 2, source: "app", pdf_path: null },
    ]);

    // A retry with the same key gets the same exam: nothing spent twice.
    const again = await post({ questions: 3, focus: "trade-offs" }, key);
    expect(await again.json()).toEqual({ exam });
    expect(ai()).toHaveLength(1);
    expect(puts()).toHaveLength(1);
  });

  it("refuses an exam that doesn't fit the settings, committing and recording nothing", async () => {
    const before = await rows();
    const { puts } = services();
    const res = await post({ questions: 4 });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "ai_bad_reply" });
    expect(puts()).toHaveLength(0);
    expect(await rows()).toEqual(before);
  });

  it("names each AI failure, passing Retry-After on, with nothing committed", async () => {
    const { puts } = services({
      reply: () =>
        new Response(null, { status: 429, headers: { "retry-after": "30" } }),
    });
    const res = await post({ questions: 3 });
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(await res.json()).toMatchObject({ error: "ai_rate_limited" });
    expect(puts()).toHaveLength(0);
  });

  it("records nothing when GitHub refuses the file", async () => {
    const before = await rows();
    services({ put: () => new Response(null, { status: 422 }) });
    const res = await post({ questions: 3 });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "github_conflict" });
    expect(await rows()).toEqual(before);
  });

  it("takes the file back when the exam can't be recorded after the commit", async () => {
    const before = await rows();
    // Another exam takes the next attempt between the commit and the record.
    const next = before.length + 1;
    const { deletes } = services({
      onPut: async () => {
        await db()
          .prepare(
            `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at) VALUES ('race', 't1', 'fast_track', ?, ?, ?, 't')`,
          )
          .bind(
            next,
            `Study Lab/x/race/race__fast-track__exam-${next}.md`,
            `Study Lab/x/race/race__fast-track__exam-${next}.pdf`,
          )
          .run();
      },
    });
    const res = await post({ questions: 3 });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "conflict" });
    expect(deletes()).toHaveLength(1);
    const withdrawn = JSON.parse(deletes()[0]?.body ?? "{}");
    expect(withdrawn).toMatchObject({ sha: "new-sha" });
    expect(decodeURIComponent(deletes()[0]?.url ?? "")).toContain(
      `__fast-track__exam-${next}.md`,
    );
    const papers = await db()
      .prepare("SELECT COUNT(*) AS n FROM learn_exam_paper")
      .first<{ n: number }>();
    expect(papers?.n).toBe(1); // only the first test's
  });

  it("checks the secrets and the course before calling anything", async () => {
    for (const missing of [
      "GITHUB_WRITE_TOKEN",
      "ANTHROPIC_API_KEY",
    ] as const) {
      const { calls } = services();
      const error = await generateExam(
        { ...env, [missing]: undefined },
        db(),
        "c1",
        { questions: 3 },
        new Date(),
      ).then(
        () => null,
        (e: Error) => e,
      );
      expect(error?.message).toContain(missing);
      expect(error?.message).toContain(`wrangler secret put ${missing}`);
      expect(calls).toHaveLength(0);
      vi.restoreAllMocks();
    }
    const { calls } = services();
    const res = await SELF.fetch(`${ORIGIN}/api/study/courses/nope/exams`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ questions: 3 }),
    });
    expect(res.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("refuses bad settings, and an OAuth token", async () => {
    services();
    expect((await post({ questions: 0 })).status).toBe(400);
    expect((await post({ questions: 3, mix: { MC: 1 } })).status).toBe(400);
    expect(
      (await post({ questions: 3 }, crypto.randomUUID(), oauth)).status,
    ).toBe(401);
  });

  it("writes exam files only", async () => {
    const { calls } = services();
    const write = {
      token: "t",
      repo: "owner/study-materials",
      fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, n),
    };
    for (const path of [
      COURSE_PATH,
      "README.md",
      "Study Lab/cs-fundamentals/big-o-notation/big-o-notation__fast-track__exam-2.pdf",
    ])
      await expect(writeExamFile(write, path, "x", "m")).rejects.toThrow(
        "Not an exam file",
      );
    expect(calls).toHaveLength(0);
  });
});
