// Career profile MCP tools (CA-03b) through the real Worker with a real OAuth
// token: the same services as /api/career, audited and idempotent per PRD 02.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { callTool, mcp, seedOwner, signInClaude } from "./oauth-flow";

let token: string;

beforeAll(async () => {
  token = (await signInClaude(await seedOwner())).tokens.access_token ?? "";
});

const audit = async (tool: string) =>
  (
    await db()
      .prepare("SELECT ok FROM mcp_call WHERE tool = ? ORDER BY rowid")
      .bind(tool)
      .all<{ ok: number }>()
  ).results.map((row) => row.ok);

const CAREER_TOOLS = {
  career_get_profile: "read",
  career_update_person: "write",
  career_set_links: "write",
  career_save_experience: "write",
  career_save_education: "write",
  career_save_fact: "write",
  career_declare_skill: "write",
  career_remove_item: "write",
  career_remove_skill: "write",
} as const;

describe("tools/list", () => {
  it("lists every profile tool with a description; only writes take idempotencyKey", async () => {
    const { message } = await mcp(token, "tools/list");
    const tools = (
      (message?.result ?? { tools: [] }) as {
        tools: {
          name: string;
          description: string;
          inputSchema: { properties?: Record<string, unknown> };
        }[];
      }
    ).tools;
    for (const [name, kind] of Object.entries(CAREER_TOOLS)) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, name).toBeDefined();
      expect(tool?.description.length).toBeGreaterThan(40);
      expect(
        Object.keys(tool?.inputSchema.properties ?? {}).includes(
          "idempotencyKey",
        ),
        name,
      ).toBe(kind === "write");
    }
    const fact = tools.find((t) => t.name === "career_save_fact");
    expect(fact?.description).toMatch(/only after the owner confirms/);
    // No tool takes the photo: it's the app's only upload.
    expect(tools.some((t) => /photo/.test(t.name))).toBe(false);
  });
});

describe("the profile over MCP", () => {
  it("builds a profile, reads it back, and audits each write once", async () => {
    const person = await callTool(token, "career_update_person", {
      fullName: "Owner",
      timezone: "America/Recife",
    });
    expect(person.isError).toBe(false);
    expect(person.value.person).toMatchObject({ fullName: "Owner" });

    await callTool(token, "career_set_links", {
      links: [{ kind: "github", label: "GitHub", url: "https://github.com/o" }],
    });
    const job = await callTool(token, "career_save_experience", {
      organization: "Acme",
      title: "AI Engineer",
      kind: "contract",
      start: "2024-02",
    });
    const experienceId = job.value.experience.id as string;
    const fact = await callTool(token, "career_save_fact", {
      experienceId,
      text: "Cut eval runtime by 40%",
      skills: ["LLM evaluation"],
    });
    expect(fact.value.fact).toMatchObject({ verified: false });
    await callTool(token, "career_save_education", {
      institution: "UFPE",
      degree: "BSc",
      start: "2015",
      end: "2019",
    });
    await callTool(token, "career_declare_skill", {
      skill: "LLM evaluation",
      level: "working",
    });

    const read = await callTool(token, "career_get_profile", {});
    expect(read.isError).toBe(false);
    expect(read.value.person.fullName).toBe("Owner");
    expect(read.value.links).toHaveLength(1);
    expect(read.value.experiences[0]).toMatchObject({
      id: experienceId,
      facts: [{ text: "Cut eval runtime by 40%", verified: false }],
    });
    expect(read.value.skills).toMatchObject([
      { name: "LLM evaluation", level: "working" },
    ]);

    for (const name of [
      "career_update_person",
      "career_set_links",
      "career_save_experience",
      "career_save_fact",
      "career_save_education",
      "career_declare_skill",
    ])
      expect(await audit(name), name).toEqual([1]);
    expect(await audit("career_get_profile")).toEqual([]);
  });

  it("runs a fact once per idempotencyKey and replays the stored result", async () => {
    const args = {
      text: "Wrote the onboarding guide",
      idempotencyKey: "fact-once",
    };
    const first = await callTool(token, "career_save_fact", args);
    const second = await callTool(token, "career_save_fact", args);
    expect(second.value).toEqual(first.value);
    const rows = await db()
      .prepare("SELECT COUNT(*) AS n FROM career_fact WHERE text = ?")
      .bind(args.text)
      .first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });

  it("reports refusals as { error, message } and audits them as failed", async () => {
    const unknown = await callTool(token, "career_remove_item", {
      kind: "experience",
      id: "nope",
    });
    expect(unknown.isError).toBe(true);
    expect(unknown.value).toMatchObject({ error: "not_found" });
    expect(await audit("career_remove_item")).toEqual([0]);

    const undeclared = await callTool(token, "career_remove_skill", {
      skill: "Cobol",
    });
    expect(undeclared.value).toMatchObject({ error: "not_found" });

    const declared = await callTool(token, "career_declare_skill", {
      skill: "Go",
      level: "familiar",
    });
    expect(declared.isError).toBe(false);
    const removed = await callTool(token, "career_remove_skill", {
      skill: "go",
    });
    expect(removed.value).toEqual({ removed: "go" });
    expect(await audit("career_remove_skill")).toEqual([0, 1]);
  });
});
