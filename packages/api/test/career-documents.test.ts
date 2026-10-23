// Career documents (CA-05, docs/prd/22-career-documents.md) through the real
// Worker and over MCP: the brief never carries an unverified fact outside
// askFirst, a selection keeps live verified IDs only, the kit and the standard
// answers replace what they're given. Storage is shared by the tests in this
// file, so they run in order on one profile and one job.
import { SELF } from "cloudflare:test";
import {
  jobKitResponseSchema,
  jobResponseSchema,
  jobsResponseSchema,
  profileResponseSchema,
  standardAnswersResponseSchema,
} from "@projects-lab/shared/career";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  callTool,
  ORIGIN,
  seedOwner,
  sessionJwt,
  signInClaude,
} from "./oauth-flow";

let session: string;
let token: string;

const call = (
  base: "career" | "study",
  path: string,
  init: { method?: string; body?: unknown } = {},
) =>
  SELF.fetch(`${ORIGIN}/api/${base}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${session}`,
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
const post = async <T>(path: string, body: unknown, method = "POST") =>
  ok<T>(await api(path, { method, body }));

const ids: Record<string, string> = {};

/** Study verifies a skill: a Done topic with an exam graded 7.0 (A-8). */
async function verifyInStudy(skill: string, area: string) {
  const added = await ok<{ topics: { topic: { id: string } }[] }>(
    await call("study", "/topics", {
      method: "POST",
      body: { topics: [{ skill, area }] },
    }),
  );
  const code = added.topics[0]?.topic.id as string;
  const base = `Study Lab/x/${code.toLowerCase()}/${code.toLowerCase()}__essential__exam-1`;
  await db().batch([
    db()
      .prepare(
        "INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at) SELECT ?, id, 'essential', 1, ?, ?, 't' FROM learn_topic WHERE code = ?",
      )
      .bind(`exam-${code}`, `${base}.md`, `${base}.pdf`, code),
    db()
      .prepare(
        "UPDATE learn_exam SET grade = 70, graded_at = '2026-10-01T12:00:00.000Z' WHERE id = ?",
      )
      .bind(`exam-${code}`),
    db()
      .prepare("UPDATE learn_topic SET status = 'done' WHERE code = ?")
      .bind(code),
  ]);
}

beforeAll(async () => {
  const authKey = await seedOwner();
  session = await sessionJwt();
  token = (await signInClaude(authKey)).tokens.access_token ?? "";

  await post("/person", { fullName: "Owner", email: "o@example.com" }, "PATCH");
  const exp = async (organization: string, start: string) =>
    (
      await post<{ experience: { id: string } }>("/experiences", {
        organization,
        title: "Engineer",
        kind: "job",
        start,
      })
    ).experience.id;
  ids.older = await exp("Older Co", "2018");
  ids.acme = await exp("Acme", "2022");
  ids.edu = (
    await post<{ education: { id: string } }>("/education", {
      institution: "UFPE",
      degree: "BSc",
      start: "2014",
      end: "2018",
    })
  ).education.id;
  const fact = async (key: string, body: Record<string, unknown>) => {
    ids[key] = (await post<{ fact: { id: string } }>("/facts", body)).fact.id;
  };
  await fact("both", {
    experienceId: ids.acme,
    text: "Built the eval harness in TypeScript",
    skills: ["TypeScript", "LLM evaluation"],
    verified: true,
  });
  await fact("python", {
    experienceId: ids.acme,
    text: "Wrote data pipelines",
    skills: ["Python"],
    verified: true,
  });
  await fact("ts", {
    experienceId: ids.older,
    text: "Maintained a TypeScript SDK",
    skills: ["TypeScript"],
    verified: true,
  });
  await fact("unverifiedNeeded", {
    experienceId: ids.acme,
    text: "Cut eval runtime by 40%",
    skills: ["LLM evaluation"],
  });
  await fact("unverifiedOther", {
    experienceId: ids.older,
    text: "Led a team of 12",
    skills: ["Leadership"],
  });
  await fact("thesis", {
    educationId: ids.edu,
    text: "Thesis on retrieval",
    verified: true,
  });
  await fact("own", { text: "Speaker at a local meetup", verified: true });
  await post("/skills", { skill: "TypeScript", level: "strong" }, "PUT");
  await post("/skills", { skill: "Python", level: "working" }, "PUT");
  await verifyInStudy("LLM evaluation", "SE");

  ids.job = (
    await post<{ job: { id: string } }>("/jobs", {
      company: "Evalco",
      role: "AI Engineer",
      language: "pt-BR",
      posting: "Evalco precisa de evals.",
      requirements: [
        { text: "TypeScript", type: "required", skill: "TypeScript" },
        {
          text: "Avaliação de LLMs",
          type: "required",
          skill: "LLM evaluation",
        },
        { text: "Docker", type: "nice", skill: "Docker" },
      ],
      fit: { constraints: 20, skills: 20, growth: 15, pay: 10, signal: 10 },
    })
  ).job.id;
});

type BriefFact = { id: string; text: string; matches: number };
type Brief = {
  kind: string;
  job: { language: string; company: string };
  experiences: { id: string; matches: number; facts: BriefFact[] }[];
  education: { id: string; facts: BriefFact[] }[];
  otherFacts: BriefFact[];
  askFirst: (BriefFact & { where: { kind: string; id: string } | null })[];
  skills: {
    name: string;
    level: string | null;
    verified: boolean;
    inPosting: boolean;
  }[];
  selection: { variant: string; items: { kind: string; id: string }[] } | null;
  rules: string[];
  layout: string[];
  ats: {
    minScore: number;
    scoring: string;
    keywords: {
      requirement: string;
      type: string;
      weight: number;
      terms: string[];
    }[];
    ceiling: { score: number; missing: string[] };
    rules: string[];
  } | null;
};
const brief = async (kind = "resume") =>
  ok<Brief>(await api(`/jobs/${ids.job}/brief?kind=${kind}`));

describe("the document brief", () => {
  it("never carries an unverified fact outside askFirst", async () => {
    const b = await brief();
    const listed = [
      ...b.experiences.flatMap((e) => e.facts),
      ...b.education.flatMap((e) => e.facts),
      ...b.otherFacts,
    ].map((f) => f.id);
    expect(listed.sort()).toEqual(
      [ids.both, ids.python, ids.ts, ids.thesis, ids.own].sort(),
    );
    expect(b.askFirst.map((f) => f.id)).toEqual([ids.unverifiedNeeded]);
    expect(b.askFirst[0]?.where).toEqual({ kind: "experience", id: ids.acme });
    // The unverified fact this job doesn't need isn't mentioned at all.
    expect(JSON.stringify(b)).not.toContain("Led a team of 12");
  });

  it("ranks facts and experiences by the job's skills, skills posting-first", async () => {
    const b = await brief("cover_letter");
    expect(b.kind).toBe("cover_letter");
    expect(b.job).toMatchObject({ company: "Evalco", language: "pt-BR" });
    expect(b.experiences.map((e) => [e.id, e.matches])).toEqual([
      [ids.acme, 2],
      [ids.older, 1],
    ]);
    expect(b.experiences[0]?.facts.map((f) => f.id)).toEqual([
      ids.both,
      ids.python,
    ]);
    expect(b.skills.map((s) => [s.name, s.inPosting])).toEqual([
      ["LLM evaluation", true],
      ["TypeScript", true],
      ["Python", false],
    ]);
    expect(b.skills[0]).toMatchObject({ verified: true, level: null });
    expect(b.skills[1]).toMatchObject({ verified: false, level: "strong" });
  });

  it("returns the writing rules and the layout as text", async () => {
    const b = await brief();
    expect(b.rules.join(" ")).toMatch(
      /never add an experience, a skill or a number/,
    );
    expect(b.layout.join(" ")).toMatch(/<Name>__<company>__<kind>/);
    expect(b.selection).toBeNull();
    expect((await api(`/jobs/${ids.job}/brief?kind=poem`)).status).toBe(400);
    expect((await api("/jobs/nope/brief?kind=resume")).status).toBe(404);
  });
});

describe("the ATS check (CA-17)", () => {
  it("gives a resume's brief the keywords, the formula and the ceiling; a cover letter's none", async () => {
    await db()
      .prepare(
        "UPDATE skill SET aliases_json = '[\"Docker Engine\"]' WHERE name = 'Docker'",
      )
      .run();
    const b = await brief();
    expect(b.ats).toEqual({
      minScore: 80,
      scoring: expect.stringContaining("whole word"),
      keywords: [
        {
          requirement: "TypeScript",
          type: "required",
          weight: 2,
          terms: ["TypeScript"],
        },
        {
          requirement: "Avaliação de LLMs",
          type: "required",
          weight: 2,
          terms: ["LLM evaluation"],
        },
        {
          requirement: "Docker",
          type: "nice",
          weight: 1,
          terms: ["Docker", "Docker Engine"],
        },
      ],
      // TypeScript: a declared skill and verified facts. LLM evaluation:
      // verified in Study. Docker: nothing. 4 of 5.
      ceiling: { score: 80, missing: ["Docker"] },
      rules: expect.arrayContaining([
        expect.stringMatching(
          /^Before writing: if ceiling.score is below 80, stop/,
        ),
      ]),
    });
    expect((await brief("cover_letter")).ats).toBeNull();
    expect((await brief("other")).ats).toBeNull();
  });

  it("shows when the owner's evidence can't reach 80%: the ceiling and what holds it down", async () => {
    const job = (
      await post<{ job: { id: string } }>("/jobs", {
        company: "Kubeco",
        role: "Platform Engineer",
        language: "en",
        posting: "We run Kubernetes in Go.",
        requirements: [
          {
            text: "Kubernetes in production",
            type: "required",
            skill: "Kubernetes",
          },
          { text: "Go", type: "required", skill: "Go" },
          { text: "TypeScript tooling", type: "nice", skill: "TypeScript" },
          { text: "Calm under pressure", type: "not_mapped" },
        ],
        fit: { constraints: 20, skills: 5, growth: 15, pay: 10, signal: 10 },
      })
    ).job.id;
    const ceiling = async () =>
      (await ok<Brief>(await api(`/jobs/${job}/brief?kind=resume`))).ats;
    const before = await ceiling();
    expect(before?.keywords.map((k) => k.requirement)).toEqual([
      "Kubernetes in production",
      "Go",
      "TypeScript tooling",
    ]);
    // Only TypeScript (nice) has evidence: 1 of 5.
    expect(before?.ceiling).toEqual({
      score: 20,
      missing: ["Kubernetes in production", "Go"],
    });
    // A skill Study verified counts as evidence on its own: 3 of 5.
    await verifyInStudy("Go", "BE");
    expect((await ceiling())?.ceiling).toEqual({
      score: 60,
      missing: ["Kubernetes in production"],
    });
  });

  it("keeps a resume's score on the job's kit; a selection saved without one leaves it", async () => {
    const kit = async () =>
      (await ok<{ kit: { ats: unknown } }>(await api(`/jobs/${ids.job}/kit`)))
        .kit.ats;
    expect(await kit()).toBeNull();
    const save = (ats?: unknown) =>
      api(`/jobs/${ids.job}/selection`, {
        method: "PUT",
        body: { items: [{ kind: "fact", id: ids.both }], variant: "ai", ats },
      });
    await ok(await save({ score: 86, missing: ["Docker"] }));
    expect(await kit()).toEqual({
      score: 86,
      missing: ["Docker"],
      scoredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    await ok(await save());
    expect(await kit()).toMatchObject({ score: 86, missing: ["Docker"] });

    for (const bad of [
      { score: 101, missing: [] },
      { score: 85.5, missing: [] },
      { score: 80, missing: [""] },
      { score: 80, missing: Array.from({ length: 51 }, (_, i) => `k${i}`) },
    ])
      expect((await save(bad)).status).toBe(400);
    expect(await kit()).toMatchObject({ score: 86 });
  });
});

describe("the selection", () => {
  const save = (items: unknown[], variant = "ai") =>
    api(`/jobs/${ids.job}/selection`, {
      method: "PUT",
      body: { items, variant },
    });

  it("keeps the IDs a document used, replacing the last ones", async () => {
    await ok(
      await save([
        { kind: "fact", id: ids.both },
        { kind: "experience", id: ids.acme },
      ]),
    );
    await ok(await save([{ kind: "fact", id: ids.ts }], "frontend"));
    const b = await brief();
    expect(b.selection).toEqual({
      variant: "frontend",
      items: [{ kind: "fact", id: ids.ts }],
    });
  });

  it("refuses an unverified fact, and a removed or unknown item", async () => {
    const unverified = await save([{ kind: "fact", id: ids.unverifiedNeeded }]);
    expect(unverified.status).toBe(400);
    expect(((await unverified.json()) as { message: string }).message).toMatch(
      /confirm it with the owner/,
    );
    await api(`/items/fact/${ids.own}`, { method: "DELETE" });
    expect((await save([{ kind: "fact", id: ids.own }])).status).toBe(404);
    expect((await save([{ kind: "education", id: ids.acme }])).status).toBe(
      404,
    );
    expect((await save([{ kind: "skill", id: "nope" }])).status).toBe(404);
    const missingJob = await api("/jobs/nope/selection", {
      method: "PUT",
      body: { items: [{ kind: "fact", id: ids.ts }], variant: "ai" },
    });
    expect(missingJob.status).toBe(404);
  });
});

type Kit = {
  intro: string;
  salary: { min: number; max: number; currency: string; period: string } | null;
  answers: { question: string; answer: string }[];
  selection: {
    variant: string;
    items: { kind: string; label: string }[];
  } | null;
};

describe("the application kit", () => {
  const put = (body: unknown) =>
    api(`/jobs/${ids.job}/kit`, { method: "PUT", body });

  it("saves the intro, the salary range and the form answers; each part replaces its own", async () => {
    await ok(
      await put({
        intro: "I build evals.",
        salary: { min: 40, max: 60, currency: "USD", period: "hour" },
        answers: [
          { question: "Why us?", answer: "Your eval problem." },
          { question: "Start?", answer: "Two weeks." },
        ],
      }),
    );
    await ok(
      await put({ answers: [{ question: "Why us?", answer: "Evals." }] }),
    );
    const { kit } = await ok<{ kit: Kit }>(await api(`/jobs/${ids.job}/kit`));
    expect(kit).toMatchObject({
      intro: "I build evals.",
      salary: { min: 40, max: 60, currency: "USD", period: "hour" },
      answers: [{ question: "Why us?", answer: "Evals." }],
    });
    expect(kit.selection).toEqual({
      variant: "frontend",
      items: [
        { kind: "fact", id: ids.ts, label: "Maintained a TypeScript SDK" },
      ],
    });
  });

  it("refuses a minimum above the maximum, and clears the salary with null", async () => {
    const backwards = await put({
      salary: { min: 70, max: 60, currency: "USD", period: "hour" },
    });
    expect(backwards.status).toBe(400);
    expect(
      (
        await put({
          salary: { min: 40, max: 60.5, currency: "USD", period: "hour" },
        })
      ).status,
    ).toBe(400);
    const { kit } = await ok<{ kit: Kit }>(await put({ salary: null }));
    expect(kit.salary).toBeNull();
    expect(kit.intro).toBe("I build evals.");
  });
});

describe("standard answers", () => {
  it("replaces the list in order; labels unique ignoring case", async () => {
    const put = (answers: unknown[]) =>
      api("/standard-answers", { method: "PUT", body: { answers } });
    await ok(
      await put([
        { label: "Notice period", value: "30 days" },
        { label: "Earliest start", value: "November" },
      ]),
    );
    await ok(
      await put([
        { label: "Earliest start", value: "December" },
        { label: "Work authorization", value: "Brazil, remote contracts" },
      ]),
    );
    const { answers } = await ok<{
      answers: { label: string; value: string }[];
    }>(await api("/standard-answers"));
    expect(answers).toEqual([
      { label: "Earliest start", value: "December" },
      { label: "Work authorization", value: "Brazil, remote contracts" },
    ]);
    expect(
      (
        await put([
          { label: "Notice period", value: "30 days" },
          { label: "notice PERIOD", value: "2 weeks" },
        ])
      ).status,
    ).toBe(400);
  });
});

describe("over MCP", () => {
  const audit = async (tool: string) =>
    (
      await db()
        .prepare("SELECT ok FROM mcp_call WHERE tool = ? ORDER BY rowid")
        .bind(tool)
        .all<{ ok: number }>()
    ).results.map((row) => row.ok);

  it("reads the brief and saves what a document used, auditing writes", async () => {
    const b = await callTool(token, "career_document_brief", {
      jobId: ids.job,
      kind: "resume",
    });
    expect(b.isError).toBe(false);
    expect(b.value.askFirst.map((f: { id: string }) => f.id)).toEqual([
      ids.unverifiedNeeded,
    ]);
    expect(b.value.ats).toMatchObject({ minScore: 80, ceiling: { score: 80 } });
    const selection = await callTool(token, "career_save_selection", {
      jobId: ids.job,
      variant: "ai",
      items: [{ kind: "fact", id: ids.both }],
      ats: { score: 91, missing: [] },
    });
    expect(
      (await ok<{ kit: { ats: unknown } }>(await api(`/jobs/${ids.job}/kit`)))
        .kit.ats,
    ).toMatchObject({ score: 91, missing: [] });
    expect(selection.value).toEqual({
      selection: { variant: "ai", items: [{ kind: "fact", id: ids.both }] },
    });
    const refused = await callTool(token, "career_save_selection", {
      jobId: ids.job,
      variant: "ai",
      items: [{ kind: "fact", id: ids.unverifiedNeeded }],
    });
    expect(refused.value).toMatchObject({ error: "bad_request" });
    const kit = await callTool(token, "career_save_job_kit", {
      jobId: ids.job,
      intro: "Olá, eu construo avaliações.",
    });
    expect(kit.value.kit.intro).toBe("Olá, eu construo avaliações.");
    const answers = await callTool(token, "career_save_standard_answers", {
      answers: [{ label: "Notice period", value: "30 days" }],
    });
    expect(answers.value.answers).toHaveLength(1);

    expect(await audit("career_document_brief")).toEqual([]);
    expect(await audit("career_save_selection")).toEqual([1, 0]);
    expect(await audit("career_save_job_kit")).toEqual([1]);
    expect(await audit("career_save_standard_answers")).toEqual([1]);
  });
});

// The web parses these reads with the shared schemas: the real output must fit.
describe("responses the web reads", () => {
  it("parse with @projects-lab/shared/career's schemas", async () => {
    profileResponseSchema.parse(await ok(await api("/profile")));
    jobsResponseSchema.parse(await ok(await api("/jobs")));
    jobResponseSchema.parse(await ok(await api(`/jobs/${ids.job}`)));
    jobKitResponseSchema.parse(await ok(await api(`/jobs/${ids.job}/kit`)));
    standardAnswersResponseSchema.parse(
      await ok(await api("/standard-answers")),
    );
  });
});
