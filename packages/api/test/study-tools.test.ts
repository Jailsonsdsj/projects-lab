// Study backlog MCP tools (ST-04) through the real Worker with a real OAuth
// token: the same services as /api/study, audited and idempotent per PRD 02.
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

const STUDY_TOOLS = {
  study_list_backlog: "read",
  study_get_summary: "read",
  study_add_topics: "write",
  study_update_topic: "write",
  study_remove_topic: "write",
  study_add_area: "write",
} as const;

describe("tools/list", () => {
  it("lists every study tool with a description; only writes take idempotencyKey", async () => {
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
    for (const [name, kind] of Object.entries(STUDY_TOOLS)) {
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
  });
});

describe("the backlog over MCP", () => {
  it("adds, lists, edits, summarizes and removes, auditing each write once", async () => {
    const added = await callTool(token, "study_add_topics", {
      topics: [
        { skill: "Event loop", area: "BE", level: "essential", priority: 1 },
      ],
    });
    expect(added.isError).toBe(false);
    expect(added.value).toMatchObject({
      topics: [
        {
          created: true,
          topic: {
            id: "BE-01",
            skill: "Event loop",
            level: "essential",
            priority: 1,
          },
        },
      ],
    });

    const listed = await callTool(token, "study_list_backlog", { area: "BE" });
    expect(listed.value.topics.map((t: { id: string }) => t.id)).toEqual([
      "BE-01",
    ]);

    const updated = await callTool(token, "study_update_topic", {
      topicId: "BE-01",
      status: "in_progress",
      note: "m1 of 2",
    });
    expect(updated.value.topic).toMatchObject({
      status: "in_progress",
      note: "m1 of 2",
      startedOn: new Date().toISOString().slice(0, 10),
    });

    const summary = await callTool(token, "study_get_summary");
    expect(summary.value.total).toMatchObject({ inProgress: 1 });
    expect(summary.value.areas).toHaveLength(7);

    const removed = await callTool(token, "study_remove_topic", {
      topicId: "BE-01",
    });
    expect(removed.value).toEqual({ removed: "BE-01" });
    expect((await callTool(token, "study_list_backlog")).value.topics).toEqual(
      [],
    );

    expect(await audit("study_add_topics")).toEqual([1]);
    expect(await audit("study_update_topic")).toEqual([1]);
    expect(await audit("study_remove_topic")).toEqual([1]);
    expect(await audit("study_list_backlog")).toEqual([]); // reads aren't audited
    expect(await audit("study_get_summary")).toEqual([]);
  });

  it("runs an add once per idempotencyKey and replays the stored result", async () => {
    const args = {
      topics: [{ skill: "Terraform", area: "DO" }],
      idempotencyKey: "tf-once",
    };
    const first = await callTool(token, "study_add_topics", args);
    const second = await callTool(token, "study_add_topics", args);
    expect(second.value).toEqual(first.value);
    const rows = await db()
      .prepare("SELECT COUNT(*) AS n FROM learn_topic WHERE code LIKE 'DO-%'")
      .first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });

  it("reports refusals as { error, message } and audits them as failed", async () => {
    const unknown = await callTool(token, "study_update_topic", {
      topicId: "SE-42",
      priority: 1,
    });
    expect(unknown.isError).toBe(true);
    expect(unknown.value).toMatchObject({ error: "not_found" });

    const area = await callTool(token, "study_add_area", {
      name: "Mobile",
      prefix: "MO",
    });
    expect(area.value).toEqual({
      area: { prefix: "MO", name: "Mobile", position: 8 },
    });
    const taken = await callTool(token, "study_add_area", {
      name: "Mobile again",
      prefix: "MO",
    });
    expect(taken.isError).toBe(true);
    expect(taken.value).toMatchObject({ error: "conflict" });

    expect(await audit("study_add_area")).toEqual([1, 0]);
    expect((await audit("study_update_topic")).at(-1)).toBe(0);
  });
});
