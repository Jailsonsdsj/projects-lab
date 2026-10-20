// Career interviews (CA-07, docs/prd/24-career-interviews.md) through the real
// Worker and over MCP: a story reads unverified until every fact it cites is
// verified (derived, never stored), only Drive links become videos, and the
// drill log keeps the weak spots. Storage is shared; tests run in order.
import { SELF } from "cloudflare:test";
import {
  answersResponseSchema,
  drillsResponseSchema,
  storiesResponseSchema,
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
const ids: Record<string, string> = {};

const api = (path: string, init: { method?: string; body?: unknown } = {}) =>
  SELF.fetch(`${ORIGIN}/api/career${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${session}`,
      "Content-Type": "application/json",
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
async function ok<T>(res: Response): Promise<T> {
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as T;
}
const post = <T>(path: string, body: unknown, method = "POST") =>
  api(path, { method, body }).then((res) => ok<T>(res));
const audit = async (tool: string) =>
  (
    await db()
      .prepare("SELECT ok FROM mcp_call WHERE tool = ? ORDER BY rowid")
      .bind(tool)
      .all<{ ok: number }>()
  ).results.map((row) => row.ok);

const DRIVE_ID = "1aBcD_eFgHiJ-kLmNoPqRsTuVwXyZ012";

beforeAll(async () => {
  const authKey = await seedOwner();
  session = await sessionJwt();
  token = (await signInClaude(authKey)).tokens.access_token ?? "";
  ids.exp = (
    await post<{ experience: { id: string } }>("/experiences", {
      organization: "Acme",
      title: "Engineer",
      kind: "job",
      start: "2022",
    })
  ).experience.id;
  const fact = async (text: string, verified: boolean) =>
    (
      await post<{ fact: { id: string } }>("/facts", {
        experienceId: ids.exp,
        text,
        verified,
      })
    ).fact.id;
  ids.confirmed = await fact("Shipped the eval harness", true);
  ids.claimed = await fact("Cut eval runtime by 40%", false);
  ids.job = (
    await post<{ job: { id: string } }>("/jobs", {
      company: "Evalco",
      role: "AI Engineer",
      language: "en",
      posting: "Evals.",
      requirements: [
        { text: "Evals", type: "required", skill: "LLM evaluation" },
      ],
      fit: { constraints: 20, skills: 20, growth: 15, pay: 10, signal: 10 },
    })
  ).job.id;
  await post(
    `/jobs/${ids.job}/kit`,
    { intro: "I build evals that ship." },
    "PUT",
  );
});

type Story = {
  id: string;
  verified: boolean;
  facts: { id: string; verified: boolean }[];
  skills: { name: string }[];
};
const STAR = {
  title: "Faster evals",
  situation: "Evals took 2 hours",
  task: "Make them usable in CI",
  action: "Parallelized and cached",
  result: "Runtime cut",
};
const stories = async () =>
  (await ok<{ stories: Story[] }>(await api("/stories"))).stories;

describe("stories", () => {
  it("read unverified until every cited fact is verified, derived at read time", async () => {
    const { story } = await post<{ story: Story }>("/stories", {
      ...STAR,
      experienceId: ids.exp,
      factIds: [ids.confirmed, ids.claimed],
      skills: ["LLM evaluation", "Caching"],
    });
    ids.story = story.id;
    expect(story.verified).toBe(false);
    expect(story.skills.map((s) => s.name)).toEqual([
      "Caching",
      "LLM evaluation",
    ]);

    await post("/facts", {
      id: ids.claimed,
      text: "Cut eval runtime by 40%",
      verified: true,
    });
    expect((await stories()).find((s) => s.id === story.id)?.verified).toBe(
      true,
    );

    await api(`/items/fact/${ids.claimed}`, { method: "DELETE" });
    const after = (await stories()).find((s) => s.id === story.id);
    expect(after?.verified).toBe(false);
    expect(after?.facts.map((f) => f.id)).toEqual([ids.confirmed]);
  });

  it("reads unverified with no facts, and replaces facts when given", async () => {
    const { story } = await post<{ story: Story }>("/stories", STAR);
    expect(story.verified).toBe(false);
    const edited = await post<{ story: Story }>("/stories", {
      ...STAR,
      id: story.id,
      factIds: [ids.confirmed],
    });
    expect(edited.story).toMatchObject({
      verified: true,
      facts: [{ id: ids.confirmed }],
    });
    const kept = await post<{ story: Story }>("/stories", {
      ...STAR,
      id: story.id,
      title: "Renamed",
    });
    expect(kept.story.facts.map((f) => f.id)).toEqual([ids.confirmed]);
  });

  it("refuses an unknown or removed fact, an unknown story and a part over 600", async () => {
    const removed = await api("/stories", {
      method: "POST",
      body: { ...STAR, factIds: [ids.claimed] },
    });
    expect(removed.status).toBe(404);
    expect(
      (await api("/stories", { method: "POST", body: { ...STAR, id: "nope" } }))
        .status,
    ).toBe(404);
    expect(
      (
        await api("/stories", {
          method: "POST",
          body: { ...STAR, result: "x".repeat(601) },
        })
      ).status,
    ).toBe(400);
  });
});

type Answer = {
  id: string;
  video: { fileId: string; previewUrl: string } | null;
  jobId: string | null;
  storyId: string | null;
};

describe("answers", () => {
  it("store a Drive link as its file ID, from either accepted shape", async () => {
    const { answer } = await post<{ answer: Answer }>("/answers", {
      question: "Tell me about a hard deadline",
      answer: "At Acme…",
      driveLink: `https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`,
      storyId: ids.story,
      jobId: ids.job,
    });
    ids.answer = answer.id;
    expect(answer.video).toEqual({
      fileId: DRIVE_ID,
      previewUrl: `https://drive.google.com/file/d/${DRIVE_ID}/preview`,
    });
    const row = await db()
      .prepare("SELECT drive_file_id AS id FROM career_answer WHERE id = ?")
      .bind(answer.id)
      .first();
    expect(row).toEqual({ id: DRIVE_ID });
    const open = await post<{ answer: Answer }>("/answers", {
      question: "Why AI evaluation?",
      answer: "Because…",
      driveLink: `https://drive.google.com/open?id=${DRIVE_ID}`,
    });
    expect(open.answer.video?.fileId).toBe(DRIVE_ID);
    expect(open.answer.jobId).toBeNull();
  });

  it("refuse any other video link", async () => {
    for (const link of [
      "https://youtu.be/dQw4w9WgXcQ",
      `https://drive.google.com.evil.example/file/d/${DRIVE_ID}/view`,
      `http://drive.google.com/file/d/${DRIVE_ID}/view`,
      `https://drive.google.com/drive/folders/${DRIVE_ID}`,
    ]) {
      const res = await api("/answers", {
        method: "POST",
        body: { question: "Q", answer: "A", driveLink: link },
      });
      expect(res.status, link).toBe(400);
    }
  });

  it("keep what an edit omits, and remove the video with null", async () => {
    const kept = await post<{ answer: Answer }>("/answers", {
      id: ids.answer,
      question: "Tell me about a hard deadline",
      answer: "At Acme, in 2023…",
    });
    expect(kept.answer).toMatchObject({ jobId: ids.job, storyId: ids.story });
    expect(kept.answer.video?.fileId).toBe(DRIVE_ID);
    const cleared = await post<{ answer: Answer }>("/answers", {
      id: ids.answer,
      question: "Tell me about a hard deadline",
      answer: "At Acme, in 2023…",
      driveLink: null,
    });
    expect(cleared.answer.video).toBeNull();
    expect(
      (
        await api("/answers", {
          method: "POST",
          body: { question: "Q", answer: "A", jobId: "nope" },
        })
      ).status,
    ).toBe(404);
  });

  it("list a job's answers with its self-introduction, or the general ones", async () => {
    const forJob = await ok<{ answers: Answer[]; intro: string }>(
      await api(`/answers?jobId=${ids.job}`),
    );
    expect(forJob.answers.map((a) => a.id)).toEqual([ids.answer]);
    expect(forJob.intro).toBe("I build evals that ship.");
    const general = await ok<{ answers: Answer[]; intro?: string }>(
      await api("/answers?general=true"),
    );
    expect(general.answers.every((a) => a.jobId === null)).toBe(true);
    expect(general.intro).toBeUndefined();
    const all = await ok<{ answers: Answer[] }>(await api("/answers"));
    expect(all.answers.at(-1)?.jobId).toBe(ids.job);
    expect((await api(`/answers?jobId=${ids.job}&general=true`)).status).toBe(
      400,
    );
  });
});

describe("drills", () => {
  it("log sessions and list the latest first, within the limit", async () => {
    for (const topic of ["Acme", "Evalco", "Rate talk"])
      await post("/drills", {
        mode: topic === "Rate talk" ? "negotiation" : "behavioral",
        topic,
        weakest: ["No number in the result"],
        fix: "Quantify the result",
      });
    const latest = await ok<{ drills: { topic: string; weakest: string[] }[] }>(
      await api("/drills?limit=2"),
    );
    expect(latest.drills.map((d) => d.topic)).toEqual(["Rate talk", "Evalco"]);
    expect(latest.drills[0]?.weakest).toEqual(["No number in the result"]);
    const three = await api("/drills", {
      method: "POST",
      body: {
        mode: "technical",
        topic: "T",
        weakest: ["a", "b", "c"],
        fix: "f",
      },
    });
    expect(three.status).toBe(400);
  });
});

describe("over MCP", () => {
  it("drills from the weak areas and saves what improved, auditing writes", async () => {
    const before = await callTool(token, "career_list_drills", {});
    expect(before.value.drills.length).toBeGreaterThan(0);
    const story = await callTool(token, "career_save_story", {
      ...STAR,
      title: "Rate anchoring",
      factIds: [ids.confirmed],
    });
    expect(story.value.story.verified).toBe(true);
    const answer = await callTool(token, "career_save_answer", {
      question: "What's your rate?",
      answer: "USD 50 an hour for this scope.",
      jobId: ids.job,
      storyId: story.value.story.id,
    });
    expect(answer.isError).toBe(false);
    const drill = await callTool(token, "career_log_drill", {
      mode: "negotiation",
      topic: "Evalco",
      weakest: ["Conceded the floor too early"],
      fix: "Hold the range; trade scope, not rate",
    });
    expect(drill.value.drill.mode).toBe("negotiation");
    const listed = await callTool(token, "career_list_answers", {
      jobId: ids.job,
    });
    expect(listed.value.answers).toHaveLength(2);
    const bank = await callTool(token, "career_list_stories", {});
    expect(bank.value.stories.length).toBeGreaterThanOrEqual(3);

    expect(await audit("career_save_story")).toEqual([1]);
    expect(await audit("career_save_answer")).toEqual([1]);
    expect(await audit("career_log_drill")).toEqual([1]);
    expect(await audit("career_list_drills")).toEqual([]);
  });
});

// The web parses these reads with the shared schemas: the real output must fit.
describe("responses the web reads", () => {
  it("parse with @projects-lab/shared/career's schemas", async () => {
    answersResponseSchema.parse(await ok(await api("/answers")));
    answersResponseSchema.parse(
      await ok(await api(`/answers?jobId=${ids.job}`)),
    );
    storiesResponseSchema.parse(await ok(await api("/stories")));
    drillsResponseSchema.parse(await ok(await api("/drills?limit=50")));
  });
});
