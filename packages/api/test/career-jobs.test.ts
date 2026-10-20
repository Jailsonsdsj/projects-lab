// Career jobs (CA-04a, docs/prd/21-career-jobs-and-skills.md) through the real
// Worker with a session and the real Study contract: readiness follows Study
// and the profile at read time, gaps reach the Study backlog once. Storage is
// shared by the tests in this file, so they run in order on one set of jobs.
import { SELF } from "cloudflare:test";
import { labSummaryResponseSchema } from "@projects-lab/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { ORIGIN, seedOwner, sessionJwt, signInClaude } from "./oauth-flow";

let session: string;
let authKey: string;

beforeAll(async () => {
  authKey = await seedOwner();
  session = await sessionJwt();
});

const call = (
  base: "career" | "study",
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
) =>
  SELF.fetch(`${ORIGIN}/api/${base}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${init.token ?? session}`,
      "Content-Type": "application/json",
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
const api = (path: string, init?: Parameters<typeof call>[2]) =>
  call("career", path, init);

async function ok<T>(res: Response): Promise<T> {
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as T;
}

type Req = {
  id: string;
  text: string;
  type: string;
  skill: string | null;
  readiness: string;
};
type Job = {
  id: string;
  company: string;
  status: string;
  fit: {
    total: number;
    decision: string;
    scores: Record<string, number>;
  } | null;
  readiness: {
    required: { ready: number; total: number };
    nice: { ready: number; total: number };
  };
  nextUp: { requirementId: string; skill: string }[];
  requirements: Req[];
  notMapped: { text: string }[];
  events: { status: string; note: string }[];
  silent: boolean;
};
const getJob = async (id: string) =>
  (await ok<{ job: Job }>(await api(`/jobs/${id}`))).job;
const listJobs = async (query = "") =>
  (await ok<{ jobs: Job[] }>(await api(`/jobs${query}`))).jobs;

const FIT = { constraints: 20, skills: 20, growth: 15, pay: 10, signal: 10 };
const posting = (company: string, requirements: unknown[], extra = {}) => ({
  company,
  role: "AI Engineer",
  language: "en",
  posting: `${company} needs an AI engineer.`,
  requirements,
  fit: FIT,
  ...extra,
});
const addJob = async (body: unknown) =>
  (await ok<{ job: Job }>(await api("/jobs", { method: "POST", body }))).job;
const req = (job: Job, skill: string) =>
  job.requirements.find((r) => r.skill === skill) as Req;

/** Makes Study verify a skill: a Done topic with an exam graded 7.0 (A-8). */
async function verifyInStudy(skill: string, area: string) {
  const added = await ok<{ topics: { topic: { id: string } }[] }>(
    await call("study", "/topics", {
      method: "POST",
      body: { topics: [{ skill, area }] },
    }),
  );
  const code = added.topics[0]?.topic.id as string;
  const topic = await db()
    .prepare("SELECT id FROM learn_topic WHERE code = ?")
    .bind(code)
    .first<{ id: string }>();
  const base = `Study Lab/x/${code.toLowerCase()}/${code.toLowerCase()}__essential__exam-1`;
  await db().batch([
    db()
      .prepare(
        "INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at) VALUES (?, ?, 'essential', 1, ?, ?, 't')",
      )
      .bind(`exam-${code}`, topic?.id, `${base}.md`, `${base}.pdf`),
    db()
      .prepare(
        "UPDATE learn_exam SET grade = 70, graded_at = '2026-10-01T12:00:00.000Z' WHERE id = ?",
      )
      .bind(`exam-${code}`),
    db()
      .prepare("UPDATE learn_topic SET status = 'done' WHERE id = ?")
      .bind(topic?.id),
  ]);
}

let acme: Job;

describe("access and Home", () => {
  it("refuses an OAuth access token", async () => {
    const claude = await signInClaude(authKey);
    const res = await api("/jobs", { token: claude.tokens.access_token ?? "" });
    expect(res.status).toBe(401);
  });

  it("shows Career's empty card with no jobs", async () => {
    const summary = labSummaryResponseSchema.parse(
      await ok(await api("/summary")),
    );
    expect(summary).toBeNull();
  });
});

describe("adding a job", () => {
  it("saves the posting, requirements in order, the scored fit and an evaluated event", async () => {
    acme = await addJob(
      posting("Acme", [
        { text: "TypeScript", type: "required", skill: "TypeScript" },
        { text: "LLM evals", type: "required", skill: "LLM evaluation" },
        { text: "Kubernetes", type: "nice", skill: "Kubernetes" },
        { text: "5+ years", type: "not_mapped" },
      ]),
    );
    expect(acme.status).toBe("evaluated");
    expect(acme.events.map((e) => e.status)).toEqual(["evaluated"]);
    expect(acme.fit).toMatchObject({ total: 75, decision: "apply" });
    expect(acme.requirements.map((r) => r.text)).toEqual([
      "TypeScript",
      "LLM evals",
      "Kubernetes",
    ]);
    expect(acme.notMapped.map((r) => r.text)).toEqual(["5+ years"]);
    expect(acme.readiness.required).toEqual({ ready: 0, total: 2 });
    expect(acme.nextUp.map((g) => g.skill)).toEqual([
      "TypeScript",
      "LLM evaluation",
      "Kubernetes",
    ]);
  });

  it("stores the sum as the total whatever else is sent, and refuses scores over their maxima", async () => {
    const job = await addJob(
      posting("Sum Co", [{ text: "Go", type: "required", skill: "Go" }], {
        fit: { ...FIT, total: 99, decision: "apply" },
      }),
    );
    expect(job.fit?.total).toBe(75);
    const over = await api("/jobs", {
      method: "POST",
      body: posting(
        "Over Co",
        [{ text: "Go", type: "required", skill: "Go" }],
        {
          fit: { ...FIT, growth: 21 },
        },
      ),
    });
    expect(over.status).toBe(400);
    const floor = await addJob(
      posting("Floor Co", [{ text: "Go", type: "required", skill: "Go" }], {
        fit: { constraints: 14, skills: 25, growth: 20, pay: 15, signal: 15 },
      }),
    );
    expect(floor.fit).toMatchObject({ total: 89, decision: "skip" });
  });
});

describe("readiness, computed at read time", () => {
  it("follows the profile's declarations and Study's grades", async () => {
    await ok(
      await api("/skills", {
        method: "PUT",
        body: { skill: "TypeScript", level: "strong" },
      }),
    );
    let job = await getJob(acme.id);
    expect(req(job, "TypeScript").readiness).toBe("declared");
    expect(job.readiness.required).toEqual({ ready: 1, total: 2 });

    await verifyInStudy("LLM evaluation", "SE");
    job = await getJob(acme.id);
    expect(req(job, "LLM evaluation").readiness).toBe("verified");
    expect(job.readiness.required).toEqual({ ready: 2, total: 2 });
    expect(job.nextUp.map((g) => g.skill)).toEqual(["Kubernetes"]);

    await api("/skills/TypeScript", { method: "DELETE" });
    job = await getJob(acme.id);
    expect(req(job, "TypeScript").readiness).toBe("gap");
  });

  it("lists the best-ready job first", async () => {
    const jobs = await listJobs();
    expect(jobs[0]?.id).toBe(acme.id);
    expect(jobs.every((j) => j.readiness.required.total > 0)).toBe(true);
  });
});

describe("status and fit", () => {
  it("appends an event per status change and re-scores the fit", async () => {
    const applied = (
      await ok<{ job: Job }>(
        await api(`/jobs/${acme.id}`, {
          method: "PATCH",
          body: { status: "applied", note: "Sent via form" },
        }),
      )
    ).job;
    expect(applied.status).toBe("applied");
    expect(applied.events.map((e) => [e.status, e.note])).toEqual([
      ["evaluated", ""],
      ["applied", "Sent via form"],
    ]);
    const rescored = (
      await ok<{ job: Job }>(
        await api(`/jobs/${acme.id}`, {
          method: "PATCH",
          body: { fit: { ...FIT, signal: 5 }, fitNotes: "Asks about evals" },
        }),
      )
    ).job;
    expect(rescored.fit).toMatchObject({ total: 70, decision: "maybe" });
    expect(rescored.events).toHaveLength(2);
    expect((await listJobs("?status=applied")).map((j) => j.id)).toEqual([
      acme.id,
    ]);
  });

  it("flags an application silent after 3 weeks of applied, from its history", async () => {
    // An old job and its history, as events can't be back-dated through the API.
    await db().batch([
      db().prepare(
        "INSERT INTO career_job (id, company, role, language, posting, created_at, updated_at) VALUES ('quiet', 'Quiet Co', 'AI Engineer', 'en', 'P', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z')",
      ),
      db().prepare(
        "INSERT INTO career_job_event (id, job_id, status, at) VALUES ('quiet-1', 'quiet', 'evaluated', '2026-01-01T00:00:00.000Z')",
      ),
      db().prepare(
        "INSERT INTO career_job_event (id, job_id, status, at) VALUES ('quiet-2', 'quiet', 'applied', '2026-01-02T00:00:00.000Z')",
      ),
    ]);
    const quiet = (await listJobs()).find((j) => j.id === "quiet");
    expect(quiet).toMatchObject({ status: "applied", silent: true });
    expect((await getJob(acme.id)).silent).toBe(false);
  });
});

describe("requirements", () => {
  it("unmaps and refuses a mapped type without a skill (K-9)", async () => {
    const k8s = req(acme, "Kubernetes");
    const unmapped = (
      await ok<{ job: Job }>(
        await api(`/requirements/${k8s.id}`, {
          method: "PATCH",
          body: { type: "not_mapped" },
        }),
      )
    ).job;
    expect(unmapped.notMapped.map((r) => r.text)).toContain("Kubernetes");
    const back = await api(`/requirements/${k8s.id}`, {
      method: "PATCH",
      body: { type: "nice" },
    });
    expect(back.status).toBe(400);
    const remapped = (
      await ok<{ job: Job }>(
        await api(`/requirements/${k8s.id}`, {
          method: "PATCH",
          body: { type: "nice", skill: "Kubernetes" },
        }),
      )
    ).job;
    expect(req(remapped, "Kubernetes").type).toBe("nice");
    expect(
      (
        await api("/requirements/nope", {
          method: "PATCH",
          body: { skill: "Go" },
        })
      ).status,
    ).toBe(404);
  });
});

describe("gaps to the Study backlog", () => {
  it("adds a topic once; sending again returns it", async () => {
    const k8s = req(await getJob(acme.id), "Kubernetes");
    const send = () =>
      api(`/jobs/${acme.id}/gaps`, {
        method: "POST",
        body: { gaps: [{ requirementId: k8s.id, area: "DO", priority: 3 }] },
      });
    const first = await ok<{ gaps: { topicId: string; created: boolean }[] }>(
      await send(),
    );
    expect(first.gaps[0]).toMatchObject({
      created: true,
      topicId: expect.stringMatching(/^DO-\d+$/),
    });
    const again = await ok<{ gaps: { topicId: string; created: boolean }[] }>(
      await send(),
    );
    expect(again.gaps[0]).toEqual({ ...first.gaps[0], created: false });
    const topics = await db()
      .prepare(
        "SELECT t.note, t.priority FROM learn_topic t JOIN skill s ON s.id = t.skill_id WHERE s.name = 'Kubernetes'",
      )
      .all<{ note: string; priority: number }>();
    expect(topics.results).toEqual([{ note: "Job: Acme", priority: 3 }]);
  });

  it("refuses a verified skill, a not-mapped requirement and another job's requirement", async () => {
    const job = await getJob(acme.id);
    const verified = await api(`/jobs/${acme.id}/gaps`, {
      method: "POST",
      body: {
        gaps: [
          {
            requirementId: req(job, "LLM evaluation").id,
            area: "SE",
            priority: 1,
          },
        ],
      },
    });
    expect(verified.status).toBe(400);
    expect(((await verified.json()) as { message: string }).message).toMatch(
      /already verified/,
    );

    const fiveYears = await db()
      .prepare(
        "SELECT id FROM career_requirement WHERE job_id = ? AND type = 'not_mapped'",
      )
      .bind(acme.id)
      .first<{ id: string }>();
    const unmapped = await api(`/jobs/${acme.id}/gaps`, {
      method: "POST",
      body: {
        gaps: [{ requirementId: fiveYears?.id, area: "SE", priority: 2 }],
      },
    });
    expect(unmapped.status).toBe(400);

    const other = (await listJobs()).find((j) => j.company === "Sum Co") as Job;
    const otherReq = (await getJob(other.id)).requirements[0] as Req;
    const elsewhere = await api(`/jobs/${acme.id}/gaps`, {
      method: "POST",
      body: { gaps: [{ requirementId: otherReq.id, area: "BE", priority: 2 }] },
    });
    expect(elsewhere.status).toBe(404);
  });
});

describe("openings and removal", () => {
  it("tracks an opening as a job, once", async () => {
    await db()
      .prepare(
        "INSERT INTO career_opening (id, url, company, role, lane, posting, why, created_at, updated_at) VALUES ('op1', 'https://jobs.example/op1', 'Open Co', 'AI Engineer', 'AI', 'Excerpt', 'Evals', 't', 't')",
      )
      .run();
    const body = posting(
      "Open Co",
      [{ text: "Go", type: "required", skill: "Go" }],
      {
        openingId: "op1",
      },
    );
    const job = await addJob(body);
    const opening = await db()
      .prepare(
        "SELECT status, job_id AS jobId FROM career_opening WHERE id = 'op1'",
      )
      .first();
    expect(opening).toEqual({ status: "tracked", jobId: job.id });
    expect((await api("/jobs", { method: "POST", body })).status).toBe(409);
    expect(
      (
        await api("/jobs", {
          method: "POST",
          body: { ...body, openingId: "nope" },
        })
      ).status,
    ).toBe(404);
  });

  it("stops tracking a job softly; its Study topics stay", async () => {
    const quiet = (await listJobs()).find(
      (j) => j.company === "Floor Co",
    ) as Job;
    expect((await api(`/jobs/${quiet.id}`, { method: "DELETE" })).status).toBe(
      204,
    );
    expect((await listJobs()).some((j) => j.id === quiet.id)).toBe(false);
    expect((await api(`/jobs/${quiet.id}`)).status).toBe(404);
    expect((await api(`/jobs/${quiet.id}`, { method: "DELETE" })).status).toBe(
      404,
    );
    const kept = await db()
      .prepare(
        "SELECT 1 FROM learn_topic t JOIN skill s ON s.id = t.skill_id WHERE s.name = 'Kubernetes' AND t.deleted_at IS NULL",
      )
      .first();
    expect(kept).not.toBeNull();
  });
});

describe("Home's Career card", () => {
  it("shows the best-ready job and opens it", async () => {
    const summary = labSummaryResponseSchema.parse(
      await ok(await api("/summary")),
    );
    const jobs = await listJobs();
    expect(summary).toEqual({
      stats: [
        { value: "1/2", label: "Required ready" },
        { value: "1", label: "Gaps" },
        { value: String(jobs.length), label: "Jobs tracked" },
      ],
      foot: { label: "Best match", value: "AI Engineer · Acme" },
      href: `/career/jobs/${acme.id}`,
    });
  });
});

describe("what the Job screen shows from Study", () => {
  it("names each requirement's Study topic, and the areas a gap can go to", async () => {
    const job = (
      await ok<{
        job: { requirements: { skill: string | null; study: unknown }[] };
      }>(await api(`/jobs/${acme.id}`))
    ).job;
    const study = (skill: string) =>
      job.requirements.find((r) => r.skill === skill)?.study;
    // LLM evaluation: Done and graded 7.0 in Study. Kubernetes: sent as a gap, Not started.
    expect(study("LLM evaluation")).toEqual({
      topicId: expect.stringMatching(/^SE-\d+$/),
      status: "done",
      grade: 70,
    });
    expect(study("Kubernetes")).toEqual({
      topicId: expect.stringMatching(/^DO-\d+$/),
      status: "not_started",
      grade: null,
    });
    expect(study("TypeScript")).toBeNull();

    const { areas } = await ok<{ areas: { prefix: string; name: string }[] }>(
      await api("/study-areas"),
    );
    expect(areas.map((a) => a.prefix)).toEqual([
      "CS",
      "FE",
      "BE",
      "DB",
      "DO",
      "SA",
      "SE",
    ]);
  });
});
