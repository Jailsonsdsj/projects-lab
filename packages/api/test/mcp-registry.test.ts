// The MCP tool registry's rules (F-15, docs/prd/02-integration.md), at the
// handler with test-only tools: idempotent and audited writes, error shapes,
// and no SQL in any tool file.

import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool, type LabTool, ToolError } from "../src/core/lab";
import { mcpApiHandler } from "../src/mcp/server";
import { db } from "./db";

let runs = 0;

const testTools: LabTool[] = [
  defineTool({
    name: "core_test_write",
    kind: "write",
    description: "Test-only write tool that counts its runs.",
    input: z.object({ value: z.string() }),
    async run({ value }) {
      runs += 1;
      return { value, run: runs };
    },
  }),
  defineTool({
    name: "core_test_refuse",
    kind: "write",
    description: "Test-only write tool that a rule refuses.",
    input: z.object({}),
    async run() {
      throw new ToolError("conflict", "That already exists.");
    },
  }),
  defineTool({
    name: "core_test_crash",
    kind: "write",
    description: "Test-only write tool that hits a bug.",
    input: z.object({}),
    async run() {
      throw new Error("boom: secret internals");
    },
  }),
  defineTool({
    name: "core_test_read",
    kind: "read",
    description: "Test-only read tool.",
    input: z.object({}),
    async run() {
      return { read: true };
    },
  }),
];

const handler = mcpApiHandler(testTools);

/** As OAuthProvider calls it: a verified grant's props on the context. */
async function rpc(method: string, params: Record<string, unknown> = {}) {
  const ctx = {
    props: { userId: "owner", clientName: "Test Client" },
    waitUntil() {},
    passThroughOnException() {},
  } as unknown as ExecutionContext;
  const res = await handler.fetch(
    new Request("https://lab.example/mcp", {
      method: "POST",
      headers: {
        Host: "lab.example",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
    env,
    ctx,
  );
  const text = await res.text();
  const data = text.startsWith("{")
    ? text
    : (text.match(/^data: (.*)$/m)?.[1] ?? "null");
  return JSON.parse(data) as { result?: unknown; error?: unknown };
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const { result } = await rpc("tools/call", { name, arguments: args });
  const r = result as { isError?: boolean; content: { text: string }[] };
  return {
    isError: Boolean(r.isError),
    value: JSON.parse(r.content[0]?.text ?? "null"),
  };
}

const auditRows = () =>
  db()
    .prepare("SELECT tool, client_name, ok FROM mcp_call ORDER BY rowid")
    .all<{ tool: string; client_name: string; ok: number }>()
    .then((r) => r.results);

beforeEach(async () => {
  runs = 0;
  await db().prepare("DELETE FROM mcp_call").run();
});

describe("write tools", () => {
  it("leave one mcp_call row per call: ok, refused and crashed", async () => {
    expect((await call("core_test_write", { value: "a" })).value).toEqual({
      value: "a",
      run: 1,
    });

    const refused = await call("core_test_refuse");
    expect(refused).toEqual({
      isError: true,
      value: { error: "conflict", message: "That already exists." },
    });

    const crashed = await call("core_test_crash");
    expect(crashed.isError).toBe(true);
    expect(crashed.value.error).toBe("internal");
    expect(JSON.stringify(crashed.value)).not.toContain("boom");

    expect(await auditRows()).toEqual([
      { tool: "core_test_write", client_name: "Test Client", ok: 1 },
      { tool: "core_test_refuse", client_name: "Test Client", ok: 0 },
      { tool: "core_test_crash", client_name: "Test Client", ok: 0 },
    ]);
  });

  it("replay a stored result for the same idempotencyKey, running once and auditing each call", async () => {
    const key = crypto.randomUUID();
    const first = await call("core_test_write", {
      value: "a",
      idempotencyKey: key,
    });
    const again = await call("core_test_write", {
      value: "a",
      idempotencyKey: key,
    });
    expect(again).toEqual(first);
    expect(runs).toBe(1);
    expect((await auditRows()).map((r) => r.ok)).toEqual([1, 1]);
  });

  it("refuse a key already used by another tool, without running", async () => {
    const key = crypto.randomUUID();
    await call("core_test_write", { value: "a", idempotencyKey: key });
    const reused = await call("core_test_refuse", { idempotencyKey: key });
    expect(reused.value.error).toBe("idempotency_key_reused");
    expect((await auditRows()).map((r) => r.ok)).toEqual([1, 0]);
  });

  it("let a failed call's key go, so the retry runs again", async () => {
    const key = crypto.randomUUID();
    await call("core_test_refuse", { idempotencyKey: key });
    const stored = await db()
      .prepare("SELECT COUNT(*) AS n FROM mutation WHERE key = ?")
      .bind(key)
      .first<{ n: number }>();
    expect(stored?.n).toBe(0);
  });

  it("offer idempotencyKey in their schema; reads don't, and aren't audited", async () => {
    const { result } = await rpc("tools/list");
    const tools = (
      result as {
        tools: { name: string; inputSchema: { properties?: object } }[];
      }
    ).tools;
    const props = (name: string) =>
      Object.keys(
        tools.find((t) => t.name === name)?.inputSchema.properties ?? {},
      );
    expect(props("core_test_write")).toEqual(["value", "idempotencyKey"]);
    expect(props("core_test_read")).toEqual([]);
    expect((await call("core_test_read")).value).toEqual({ read: true });
    expect(await auditRows()).toEqual([]);
  });
});

describe("tool files", () => {
  it("contain no SQL: tools are adapters over services", () => {
    const sources = import.meta.glob<string>(
      [
        "../src/mcp/tools/**/*.ts",
        "../src/labs/*/tools*.ts",
        "../src/labs/*/tools/**/*.ts",
      ],
      { eager: true, query: "?raw", import: "default" },
    );
    expect(Object.keys(sources).length).toBeGreaterThan(0);
    const SQL = /\.(prepare|batch|exec)\(|\b(SELECT|INSERT|UPDATE|DELETE)\s/;
    const offenders = Object.entries(sources)
      .filter(([, source]) => SQL.test(source))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
