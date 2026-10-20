// The MCP endpoint through the real Worker (F-15, docs/prd/02-integration.md):
// a real OAuth token, the JSON-RPC a client sends, the platform tools.

import { SELF } from "cloudflare:test";
import { unboundedToolStrings } from "@projects-lab/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { callTool, mcp, seedOwner, signInClaude } from "./oauth-flow";

let token: string;

beforeAll(async () => {
  const authKey = await seedOwner();
  token = (await signInClaude(authKey)).tokens.access_token ?? "";
  await db().batch([
    db().prepare(
      `INSERT INTO skill (id, name, aliases_json, created_at)
         VALUES ('sk-pg', 'PostgreSQL', '["Postgres","psql"]', '2026-10-16T00:00:00.000Z')`,
    ),
    db().prepare(
      `INSERT INTO skill (id, name, aliases_json, created_at, deleted_at)
         VALUES ('sk-redis', 'Redis', '[]', '2026-10-16T00:00:00.000Z', '2026-10-16T01:00:00.000Z')`,
    ),
  ]);
});

const audited = async () =>
  (
    await db()
      .prepare("SELECT COUNT(*) AS n FROM mcp_call")
      .first<{ n: number }>()
  )?.n;

describe("/mcp", () => {
  it("refuses a call without a token", async () => {
    const { res } = await mcp(null, "tools/list");
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toMatch(/^Bearer /);
  });

  it("lists exactly the registered tools, each with its description and schema", async () => {
    const { res, message } = await mcp(token, "tools/list");
    expect(res.status).toBe(200);
    const tools = (
      (message?.result ?? { tools: [] }) as {
        tools: {
          name: string;
          description: string;
          inputSchema: { properties?: Record<string, unknown> };
        }[];
      }
    ).tools;
    expect(tools.map((t) => t.name).sort()).toEqual([
      "career_add_job",
      "career_declare_skill",
      "career_document_brief",
      "career_get_job",
      "career_get_profile",
      "career_list_jobs",
      "career_remove_item",
      "career_remove_job",
      "career_remove_skill",
      "career_save_education",
      "career_save_experience",
      "career_save_fact",
      "career_save_job_kit",
      "career_save_selection",
      "career_save_standard_answers",
      "career_send_gaps",
      "career_set_links",
      "career_update_job",
      "career_update_person",
      "career_update_requirement",
      "core_find_skill",
      "core_whoami",
      "study_add_area",
      "study_add_topics",
      "study_get_summary",
      "study_list_backlog",
      "study_list_courses",
      "study_list_exams",
      "study_record_course",
      "study_record_exam",
      "study_record_grade",
      "study_remove_topic",
      "study_update_topic",
    ]);
    for (const tool of tools)
      expect(tool.description.length).toBeGreaterThan(20);
    const find = tools.find((t) => t.name === "core_find_skill");
    expect(Object.keys(find?.inputSchema.properties ?? {})).toEqual(["query"]);
  });

  it("core_whoami names the owner, the client and the labs", async () => {
    const { isError, value } = await callTool(token, "core_whoami");
    expect(isError).toBe(false);
    expect(value).toEqual({
      owner: { id: "owner", timezone: "UTC" },
      client: "Claude Test",
      labs: ["study", "career"],
    });
  });

  it("core_find_skill finds by name or alias in any case, never a deleted skill", async () => {
    const pg = {
      id: "sk-pg",
      name: "PostgreSQL",
      aliases: ["Postgres", "psql"],
    };
    expect(
      (await callTool(token, "core_find_skill", { query: "POSTGRES" })).value,
    ).toEqual({ skill: pg });
    expect(
      (await callTool(token, "core_find_skill", { query: " postgresql " }))
        .value,
    ).toEqual({ skill: pg });
    expect(
      (await callTool(token, "core_find_skill", { query: "redis" })).value,
    ).toEqual({ skill: null });
    expect(
      (await callTool(token, "core_find_skill", { query: "cobol" })).value,
    ).toEqual({ skill: null });
  });

  it("refuses input that fails the schema with the field named, and audits no read", async () => {
    const before = await audited();
    const { message } = await mcp(token, "tools/call", {
      name: "core_find_skill",
      arguments: {},
    });
    // The MCP SDK validates before the tool runs and answers in its own words.
    const result = message?.result as {
      isError?: boolean;
      content: { text: string }[];
    };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/Input validation error.*query/);
    expect(await audited()).toBe(before);
  });
});

describe("no tool accepts file content as an argument", () => {
  it("every string any tool takes is short (≤ 1000), a named long field (≤ 20,000) or one of a fixed list", async () => {
    const { message } = await mcp(token, "tools/list");
    const tools = (
      (message?.result ?? { tools: [] }) as {
        tools: { name: string; inputSchema: unknown }[];
      }
    ).tools;
    const unbounded = tools.flatMap((tool) =>
      unboundedToolStrings(tool.inputSchema, tool.name),
    );
    expect(tools.length).toBeGreaterThanOrEqual(2);
    expect(unbounded).toEqual([]);
  });
});

// Signed uploads were retired by F-23 (R3-1: Claude's documents go straight to
// the owner and the app stores none).
describe("no upload path", () => {
  it("PUT /api/uploads/anything is 404", async () => {
    const res = await SELF.fetch("https://lab.example/api/uploads/anything", {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: new Uint8Array(16),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("nothing in the Worker signs, accepts or stores uploads", () => {
    const sources = import.meta.glob<string>("../src/**/*.ts", {
      eager: true,
      query: "?raw",
      import: "default",
    });
    const mentions = Object.entries(sources)
      .filter(([, source]) =>
        /UPLOAD_SIGNING_KEY|core_create_upload|uploads\//.test(source),
      )
      .map(([path]) => path);
    expect(mentions).toEqual([]);
  });
});
