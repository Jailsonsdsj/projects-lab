// Career job search (CA-06a, docs/prd/23-career-job-search.md) through the
// real Worker and over MCP: the criteria are the app's to write, a saved URL
// is never saved twice, openings are kept or dismissed, a tracked one follows
// its job. Storage is shared by the tests in this file; they run in order.
import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  callTool,
  mcp,
  ORIGIN,
  seedOwner,
  sessionJwt,
  signInClaude,
} from "./oauth-flow";

let session: string;
let token: string;

beforeAll(async () => {
  const authKey = await seedOwner();
  session = await sessionJwt();
  token = (await signInClaude(authKey)).tokens.access_token ?? "";
});

const api = (
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
) =>
  SELF.fetch(`${ORIGIN}/api/career${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${init.token ?? session}`,
      "Content-Type": "application/json",
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
async function ok<T>(res: Response): Promise<T> {
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as T;
}
const audit = async (tool: string) =>
  (
    await db()
      .prepare("SELECT ok FROM mcp_call WHERE tool = ? ORDER BY rowid")
      .bind(tool)
      .all<{ ok: number }>()
  ).results.map((row) => row.ok);

const CRITERIA = {
  queries: ['"AI engineer" contract remote', '"LLM evaluation"'],
  lanes: ["AI engineering", "AI evaluation", "Front-end (fallback)"],
  shapes: ["contract", "part-time"],
  maxHours: 20,
  timezoneNote: "Overlap with UTC−3, async-friendly",
  rateFloor: { amount: 35, currency: "USD", period: "hour" },
  autoReject: ["crypto", "gambling"],
  maxAgeDays: 14,
  sources: ["RemoteOK", "Wellfound"],
};

const opening = (n: number, extra = {}) => ({
  url: `https://jobs.example/${n}`,
  company: `Company ${n}`,
  role: "AI Engineer",
  lane: "AI engineering",
  posting: "We need evals.",
  postedOn: "2026-10-15",
  rateText: "USD 50/h",
  why: "Evals-heavy, async",
  ...extra,
});

type Opening = {
  id: string;
  url: string;
  status: string;
  jobId: string | null;
  stale: boolean;
};

describe("search criteria", () => {
  it("are null until the owner saves them, then round-trip whole", async () => {
    expect(await ok(await api("/search-criteria"))).toEqual({ criteria: null });
    const read = await callTool(token, "career_get_search_criteria", {});
    expect(read.value).toEqual({ criteria: null });

    const saved = await ok<{ criteria: unknown }>(
      await api("/search-criteria", { method: "PUT", body: CRITERIA }),
    );
    expect(saved.criteria).toMatchObject(CRITERIA);
    const again = await ok<{ criteria: unknown }>(
      await api("/search-criteria", {
        method: "PUT",
        body: { ...CRITERIA, rateFloor: null, maxHours: 15 },
      }),
    );
    expect(again.criteria).toMatchObject({ rateFloor: null, maxHours: 15 });
    const { results } = await db()
      .prepare("SELECT id FROM career_search_criteria")
      .all();
    expect(results).toEqual([{ id: "criteria" }]);
    const viaTool = await callTool(token, "career_get_search_criteria", {});
    expect(viaTool.value.criteria).toMatchObject({
      maxHours: 15,
      lanes: CRITERIA.lanes,
    });
  });

  it("are written by the app only: no tool, and the OAuth token is refused", async () => {
    const res = await api("/search-criteria", {
      method: "PUT",
      body: CRITERIA,
      token,
    });
    expect(res.status).toBe(401);
    const { message } = await mcp(token, "tools/list");
    const names = (
      (message?.result ?? { tools: [] }) as { tools: { name: string }[] }
    ).tools.map((t) => t.name);
    expect(names).toContain("career_get_search_criteria");
    expect(names.filter((n) => /criteria/.test(n))).toEqual([
      "career_get_search_criteria",
    ]);
    const bad = await api("/search-criteria", {
      method: "PUT",
      body: { ...CRITERIA, lanes: [] },
    });
    expect(bad.status).toBe(400);
  });
});

describe("openings", () => {
  it("saves a batch over MCP, and skips any URL already saved", async () => {
    const first = await callTool(token, "career_save_openings", {
      openings: [opening(1), opening(2), opening(3)],
    });
    expect(first.value).toEqual({
      saved: [1, 2, 3].map((n) => `https://jobs.example/${n}`),
      skipped: [],
    });
    const second = await callTool(token, "career_save_openings", {
      openings: [opening(2), opening(4)],
    });
    expect(second.value).toEqual({
      saved: ["https://jobs.example/4"],
      skipped: ["https://jobs.example/2"],
    });
    expect(await audit("career_save_openings")).toEqual([1, 1]);
  });

  it("is kept or dismissed; a dismissed URL never comes back", async () => {
    const list = (await ok<{ openings: Opening[] }>(await api("/openings")))
      .openings;
    const one = list.find((o) => o.url.endsWith("/1")) as Opening;
    const two = list.find((o) => o.url.endsWith("/2")) as Opening;
    await ok(
      await api(`/openings/${one.id}`, {
        method: "PATCH",
        body: { status: "kept" },
      }),
    );
    const dismissed = await callTool(token, "career_update_opening", {
      openingId: two.id,
      status: "dismissed",
    });
    expect(dismissed.value.opening.status).toBe("dismissed");
    const resaved = await callTool(token, "career_save_openings", {
      openings: [opening(2, { why: "Second look" })],
    });
    expect(resaved.value).toEqual({
      saved: [],
      skipped: ["https://jobs.example/2"],
    });

    const ordered = (await ok<{ openings: Opening[] }>(await api("/openings")))
      .openings;
    expect(ordered.map((o) => o.status)).toEqual([
      "new",
      "new",
      "kept",
      "dismissed",
    ]);
    const kept = await ok<{ openings: Opening[] }>(
      await api("/openings?status=kept"),
    );
    expect(kept.openings.map((o) => o.id)).toEqual([one.id]);
    expect(
      (
        await api(`/openings/${one.id}`, {
          method: "PATCH",
          body: { status: "tracked" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api("/openings/nope", {
          method: "PATCH",
          body: { status: "kept" },
        })
      ).status,
    ).toBe(404);
  });

  it("is tracked through career_add_job, and then follows its job", async () => {
    const three = (
      await ok<{ openings: Opening[] }>(await api("/openings"))
    ).openings.find((o) => o.url.endsWith("/3")) as Opening;
    const job = await callTool(token, "career_add_job", {
      openingId: three.id,
      company: "Company 3",
      role: "AI Engineer",
      language: "en",
      posting: "We need evals.",
      requirements: [
        { text: "Evals", type: "required", skill: "LLM evaluation" },
      ],
      fit: { constraints: 20, skills: 20, growth: 15, pay: 10, signal: 10 },
    });
    expect(job.isError).toBe(false);
    const tracked = (
      await ok<{ openings: Opening[] }>(await api("/openings?status=tracked"))
    ).openings;
    expect(tracked).toMatchObject([{ id: three.id, jobId: job.value.job.id }]);
    const moved = await callTool(token, "career_update_opening", {
      openingId: three.id,
      status: "dismissed",
    });
    expect(moved.value).toMatchObject({ error: "conflict" });
  });

  it("is stale when still new 30 days on", async () => {
    await db()
      .prepare(
        "UPDATE career_opening SET created_at = '2026-01-01T00:00:00.000Z' WHERE url = 'https://jobs.example/4'",
      )
      .run();
    const list = (await ok<{ openings: Opening[] }>(await api("/openings")))
      .openings;
    expect(list.find((o) => o.url.endsWith("/4"))?.stale).toBe(true);
    expect(list.filter((o) => o.stale)).toHaveLength(1);
  });
});

describe("paging", () => {
  it("pages through every opening in the same order, by its cursor", async () => {
    await callTool(token, "career_save_openings", {
      openings: [5, 6, 7, 8, 9].map((n) => opening(n)),
    });
    const whole = await ok<{ openings: Opening[]; nextCursor?: string }>(
      await api("/openings?limit=200"),
    );
    expect(whole.nextCursor).toBeUndefined();
    expect(whole.openings).toHaveLength(9);

    const paged: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await ok<{ openings: Opening[]; nextCursor?: string }>(
        await api(
          `/openings?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        ),
      );
      paged.push(...page.openings.map((o) => o.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(5);
    expect(paged).toEqual(whole.openings.map((o) => o.id));

    const viaTool = await callTool(token, "career_list_openings", {
      status: "new",
      limit: 3,
    });
    expect(viaTool.value.openings).toHaveLength(3);
    expect(
      viaTool.value.openings.every((o: Opening) => o.status === "new"),
    ).toBe(true);
    const rest = await callTool(token, "career_list_openings", {
      status: "new",
      limit: 3,
      cursor: viaTool.value.nextCursor,
    });
    expect(rest.value.openings).toHaveLength(3);
    expect(rest.value.nextCursor).toBeUndefined();
  });

  it("refuses a limit over 200 and a cursor it didn't hand out", async () => {
    expect((await api("/openings?limit=201")).status).toBe(400);
    expect((await api("/openings?limit=0")).status).toBe(400);
    const forged = await api(
      `/openings?cursor=${encodeURIComponent("x|2026-01-01T00:00:00.000Z|abc")}`,
    );
    expect(forged.status).toBe(400);
    const bad = await api("/openings?cursor=nonsense");
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { message: string }).message).toMatch(
      /nextCursor/,
    );
  });
});
