// The MCP endpoint through the real Worker (F-15, docs/prd/02-integration.md):
// a real OAuth token, the JSON-RPC a client sends, the platform tools.

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
      "core_create_upload",
      "core_find_skill",
      "core_whoami",
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
