// Study backlog (ST-03, docs/prd/10-study-backlog.md) through the real Worker
// with a session, plus the Study contract Career uses. Storage is shared by
// the tests in this file, so each test uses its own skills.
import { SELF } from "cloudflare:test";
import { labSummaryResponseSchema } from "@projects-lab/shared";
import { backlogResponseSchema } from "@projects-lab/shared/study";
import { beforeAll, describe, expect, it } from "vitest";
import { studyContract } from "../src/labs/study/contract";
import { db } from "./db";
import { ORIGIN, seedOwner, sessionJwt, signInClaude } from "./oauth-flow";

let session: string;
let authKey: string;

beforeAll(async () => {
  authKey = await seedOwner();
  session = await sessionJwt();
});

type Topic = {
  id: string;
  skill: string;
  area: string;
  level: string;
  priority: number;
  status: string;
  grade: number | null;
  startedOn: string | null;
  finishedOn: string | null;
  note: string;
};
type Added = { topic: Topic; created: boolean; restored: boolean };

const api = (
  path: string,
  init: { method?: string; body?: unknown; key?: string; token?: string } = {},
) =>
  SELF.fetch(`${ORIGIN}/api/study${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${init.token ?? session}`,
      "Content-Type": "application/json",
      ...(init.key ? { "Idempotency-Key": init.key } : {}),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

async function add(
  topics: { skill: string; area: string; level?: string; priority?: number }[],
): Promise<Added[]> {
  const res = await api("/topics", { method: "POST", body: { topics } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { topics: Added[] }).topics;
}

const backlog = async (query = "") =>
  (await (await api(`/backlog${query}`)).json()) as {
    areas: { prefix: string }[];
    topics: Topic[];
  };

const today = () => new Date().toISOString().slice(0, 10); // the owner is in UTC

/** A graded exam for a topic, through the same rows the app writes (S-14, S-16). */
async function gradeExam(code: string, grade: number, gradedAt: string) {
  const topic = await db()
    .prepare("SELECT id FROM learn_topic WHERE code = ?")
    .bind(code)
    .first<{ id: string }>();
  const next = await db()
    .prepare(
      "SELECT COALESCE(MAX(attempt), 0) + 1 AS n FROM learn_exam WHERE topic_id = ? AND level = 'essential'",
    )
    .bind(topic?.id)
    .first<{ n: number }>();
  const n = next?.n ?? 1;
  const path = `Study Lab/a/${code.toLowerCase()}/${code.toLowerCase()}__essential__exam-${n}`;
  const id = `${code}-exam-${n}`;
  await db().batch([
    db()
      .prepare(
        "INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at) VALUES (?, ?, 'essential', ?, ?, ?, 't')",
      )
      .bind(id, topic?.id, n, `${path}.md`, `${path}.pdf`),
    db()
      .prepare("UPDATE learn_exam SET grade = ?, graded_at = ? WHERE id = ?")
      .bind(grade, gradedAt, id),
  ]);
}

describe("access", () => {
  it("refuses no token and an OAuth access token", async () => {
    const none = await SELF.fetch(`${ORIGIN}/api/study/backlog`);
    expect(none.status).toBe(401);
    const claude = await signInClaude(authKey);
    const res = await api("/backlog", {
      token: claude.tokens.access_token ?? "",
    });
    expect(res.status).toBe(401);
  });
});

describe("an empty backlog", () => {
  it("has the seven areas, no topics, and an empty Home card", async () => {
    const { areas, topics } = await backlog();
    expect(areas.map((a) => a.prefix)).toEqual([
      "CS",
      "FE",
      "BE",
      "DB",
      "DO",
      "SA",
      "SE",
    ]);
    expect(topics).toEqual([]);
    expect(await (await api("/summary")).json()).toBeNull();
  });
});

describe("adding topics", () => {
  it("creates a topic with the area's next code and finds or creates its skill", async () => {
    const [added] = await add([
      { skill: "Big-O notation", area: "CS", level: "fast_track", priority: 1 },
    ]);
    expect(added).toMatchObject({
      created: true,
      restored: false,
      topic: {
        id: "CS-01",
        skill: "Big-O notation",
        area: "CS",
        level: "fast_track",
        priority: 1,
        status: "not_started",
        grade: null,
      },
    });
  });

  it("gives two concurrent adds in one area distinct codes", async () => {
    const [a, b] = await Promise.all([
      add([{ skill: "Graphs", area: "CS" }]),
      add([{ skill: "Heaps", area: "CS" }]),
    ]);
    const codes = [a?.[0]?.topic.id, b?.[0]?.topic.id].sort();
    expect(codes).toEqual(["CS-02", "CS-03"]);
  });

  it("returns the existing topic for a skill named by an alias, never a second one", async () => {
    await db()
      .prepare(
        `INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('sk-pg', 'PostgreSQL', '["Postgres"]', 't')`,
      )
      .run();
    const [first] = await add([{ skill: "postgres", area: "DB" }]);
    expect(first).toMatchObject({
      created: true,
      topic: { id: "DB-01", skill: "PostgreSQL" },
    });
    const [again] = await add([{ skill: "PostgreSQL", area: "FE" }]);
    expect(again).toMatchObject({
      created: false,
      restored: false,
      topic: { id: "DB-01", area: "DB" },
    });
  });

  it("restores a removed topic with its code when its skill is added again", async () => {
    expect((await api("/topics/CS-01", { method: "DELETE" })).status).toBe(204);
    expect((await backlog()).topics.map((t) => t.id)).not.toContain("CS-01");
    const [back] = await add([{ skill: "big-o notation", area: "CS" }]);
    expect(back).toMatchObject({
      created: false,
      restored: true,
      topic: { id: "CS-01" },
    });
    expect((await backlog()).topics.map((t) => t.id)).toContain("CS-01");
    expect((await api("/topics/CS-77", { method: "DELETE" })).status).toBe(404);
  });

  it("refuses an unknown area and bad input", async () => {
    const unknown = await api("/topics", {
      method: "POST",
      body: { topics: [{ skill: "Kotlin", area: "ZZ" }] },
    });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ error: "not_found" });
    const bad = await api("/topics", {
      method: "POST",
      body: { topics: [{ skill: "Kotlin", area: "CS", priority: 4 }] },
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "bad_request" });
  });

  it("replays an Idempotency-Key instead of adding twice", async () => {
    const send = () =>
      api("/topics", {
        method: "POST",
        key: "add-docker-once",
        body: { topics: [{ skill: "Docker", area: "DO" }] },
      });
    const first = await send();
    const second = await send();
    expect(second.headers.get("Idempotent-Replay")).toBe("true");
    expect(await second.json()).toEqual(await first.json());
    const count = await db()
      .prepare("SELECT COUNT(*) AS n FROM learn_topic WHERE code LIKE 'DO-%'")
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });
});

describe("editing a topic", () => {
  it("sets Started once, when it first goes In progress", async () => {
    const patch = (body: unknown) =>
      api("/topics/CS-02", { method: "PATCH", body });
    const started = (await (await patch({ status: "in_progress" })).json()) as {
      topic: Topic;
    };
    expect(started.topic).toMatchObject({
      status: "in_progress",
      startedOn: today(),
    });
    await db()
      .prepare(
        "UPDATE learn_topic SET started_on = '2026-01-05' WHERE code = 'CS-02'",
      )
      .run();
    await patch({ status: "done" });
    const again = (await (
      await patch({ status: "in_progress", priority: 3 })
    ).json()) as {
      topic: Topic;
    };
    expect(again.topic).toMatchObject({ startedOn: "2026-01-05", priority: 3 });
  });

  it("refuses a long note, an empty change and an unknown topic", async () => {
    const long = await api("/topics/CS-02", {
      method: "PATCH",
      body: { note: "x".repeat(121) },
    });
    expect(long.status).toBe(400);
    expect(
      (await api("/topics/CS-02", { method: "PATCH", body: {} })).status,
    ).toBe(400);
    expect(
      (await api("/topics/FE-99", { method: "PATCH", body: { priority: 1 } }))
        .status,
    ).toBe(404);
  });
});

describe("areas", () => {
  it("adds one after the others; a taken prefix or name is a conflict", async () => {
    const res = await api("/areas", {
      method: "POST",
      body: { name: "AI and Machine Learning", prefix: "AI" },
    });
    expect(await res.json()).toEqual({
      area: { prefix: "AI", name: "AI and Machine Learning", position: 8 },
    });
    const prefix = await api("/areas", {
      method: "POST",
      body: { name: "Another", prefix: "AI" },
    });
    expect(prefix.status).toBe(409);
    const name = await api("/areas", {
      method: "POST",
      body: { name: "frontend", prefix: "FX" },
    });
    expect(name.status).toBe(409);
  });
});

describe("summary", () => {
  it("counts per area and averages Done topics with a grade only", async () => {
    // FE: React Done 8.5, Vue Done 6.0, Svelte Done by hand (no exam), CSS In progress with an exam.
    await add([
      { skill: "React", area: "FE" },
      { skill: "Vue", area: "FE" },
      { skill: "Svelte", area: "FE" },
      { skill: "CSS", area: "FE" },
    ]);
    await gradeExam("FE-01", 85, "2026-10-01T10:00:00.000Z");
    await gradeExam("FE-02", 60, "2026-10-02T10:00:00.000Z");
    await gradeExam("FE-04", 20, "2026-10-03T10:00:00.000Z");
    await db()
      .prepare(
        "UPDATE learn_topic SET status = 'done' WHERE code IN ('FE-01', 'FE-02', 'FE-03')",
      )
      .run();
    await db()
      .prepare(
        "UPDATE learn_topic SET status = 'in_progress' WHERE code = 'FE-04'",
      )
      .run();

    const summary = (await (await api("/backlog/summary")).json()) as {
      areas: {
        prefix: string;
        done: number;
        inProgress: number;
        average: number | null;
      }[];
      next: { id: string } | null;
    };
    expect(summary.areas.find((a) => a.prefix === "FE")).toMatchObject({
      done: 3,
      inProgress: 1,
      average: 73, // (85 + 60) / 2 = 72.5 → 73; Svelte and CSS don't count
    });
    expect(summary.areas.map((a) => a.prefix)).toContain("SE"); // empty areas too
    expect(summary.next).toEqual(
      expect.objectContaining({ id: expect.stringMatching(/^(CS|DB|DO)-/) }),
    );

    const react = (await backlog("?area=FE")).topics.find(
      (t) => t.id === "FE-01",
    );

    // The web parses these with the shared schemas (ST-06a): the real output must pass.
    const full = await (await api("/backlog")).json();
    expect(backlogResponseSchema.safeParse(full).success).toBe(true);
    expect(react).toMatchObject({ grade: 85, finishedOn: "2026-10-01" });
  });

  it("gives Home its card, with Continue for the latest course in progress", async () => {
    await db()
      .prepare(
        `INSERT INTO learn_course (id, topic_id, level, path, recorded_at)
         SELECT 'course-css', id, 'essential', 'Study Lab/frontend/css/css__essential.md', '2026-10-04T00:00:00.000Z'
         FROM learn_topic WHERE code = 'FE-04'`,
      )
      .run();
    const card = (await (await api("/summary")).json()) as {
      stats: { label: string; value: string }[];
      foot?: { label: string; value: string };
    };
    expect(card.stats.map((s) => s.label)).toEqual([
      "In progress",
      "Not started",
      "Average grade",
    ]);
    expect(card.foot).toEqual({ label: "Continue", value: "CSS" });
    expect(labSummaryResponseSchema.safeParse(card).success).toBe(true);
  });
});

describe("the Study contract", () => {
  const contract = () => studyContract(db());
  const skill = (id: string, name: string) =>
    db()
      .prepare("INSERT INTO skill (id, name, created_at) VALUES (?, ?, 't')")
      .bind(id, name)
      .run();

  it("ensureTopics adds what's missing and returns existing topics as they are", async () => {
    await skill("sk-k8s", "Kubernetes");
    const [first] = await contract().ensureTopics([
      { skillId: "sk-k8s", area: "DO", priority: 1, note: "Gap in Acme" },
    ]);
    expect(first).toMatchObject({ skillId: "sk-k8s", created: true });
    expect(first?.topicId).toMatch(/^DO-\d\d$/);
    const [again] = await contract().ensureTopics([
      { skillId: "sk-k8s", area: "DO", priority: 3, note: "Gap in Other" },
    ]);
    expect(again).toEqual({ ...first, created: false });
  });

  it("skillStatus: verified only for Done with a grade of at least 70", async () => {
    // FE-01 React Done 85, FE-02 Vue Done 60, FE-03 Svelte Done without an exam,
    // FE-04 CSS In progress; a 90 on CSS doesn't verify it until it's Done.
    await gradeExam("FE-04", 90, "2026-10-05T10:00:00.000Z");
    const ids = await db()
      .prepare(
        "SELECT code, skill_id AS skillId FROM learn_topic WHERE code LIKE 'FE-%'",
      )
      .all<{ code: string; skillId: string }>();
    const skillOf = Object.fromEntries(
      ids.results.map((r) => [r.code, r.skillId]),
    );
    const status = await contract().skillStatus([
      skillOf["FE-01"] as string,
      skillOf["FE-02"] as string,
      skillOf["FE-03"] as string,
      skillOf["FE-04"] as string,
      "sk-unknown",
    ]);
    expect(status.map(({ verified, grade }) => ({ verified, grade }))).toEqual([
      { verified: true, grade: 85 },
      { verified: false, grade: 60 },
      { verified: false, grade: null },
      { verified: false, grade: 90 },
      { verified: false, grade: null },
    ]);
  });
});
