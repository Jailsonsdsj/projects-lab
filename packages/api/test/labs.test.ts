// The lab boundary on the API side (F-13, docs/architecture.md §4): every lab
// mounts at /api/<lab> behind a session, and its MCP tools carry its prefix.

import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { beforeAll, describe, expect, it } from "vitest";
import { signingKey } from "../src/core/auth/session";
import { type ApiLab, type LabEnv, mountLabs } from "../src/core/lab";
import { app } from "../src/index";
import { db } from "./db";

let token: string;

beforeAll(async () => {
  await db()
    .prepare(
      `INSERT INTO user (id, auth_key_hash, kdf_salt, kdf_iterations, timezone, created_at)
       VALUES ('owner', 'x', 'x', 1, 'UTC', '2026-01-01T00:00:00.000Z')`,
    )
    .run();
  const now = Math.floor(Date.now() / 1000);
  token = await sign(
    { sub: "owner", sv: 0, iat: now, exp: now + 60 },
    signingKey(env),
    "HS256",
  );
});

const get = (path: string, withSession = true) =>
  app.request(
    path,
    withSession ? { headers: { Authorization: `Bearer ${token}` } } : {},
    env,
  );

describe("labs in the Worker", () => {
  it.each(["study", "career"])(
    "mounts %s at /api/<lab>: its summary is null (no data yet)",
    async (lab) => {
      const res = await get(`/api/${lab}/summary`);
      expect(res.status).toBe(200);
      expect(await res.json()).toBeNull();
    },
  );

  it.each(["study", "career"])(
    "keeps /api/%s behind a session",
    async (lab) => {
      const res = await get(`/api/${lab}/summary`, false);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    },
  );

  it("answers an unknown lab with 404", async () => {
    expect((await get("/api/nolab/summary")).status).toBe(404);
  });
});

describe("mountLabs", () => {
  const lab = (tools: ApiLab["tools"]): ApiLab => ({
    id: "study",
    routes: new Hono<LabEnv>(),
    tools,
  });

  it("returns every lab's tools when each carries its lab's prefix", () => {
    const tools = mountLabs(new Hono<LabEnv>(), [
      lab([{ name: "study_list_backlog", description: "List the backlog" }]),
    ]);
    expect(tools.map((t) => t.name)).toEqual(["study_list_backlog"]);
  });

  it.each([
    "career_map_job", // another lab's prefix
    "list_backlog", // no prefix
    "study_ListBacklog", // not lowercase
    "study_", // nothing after the prefix
  ])("refuses a study tool named %s", (name) => {
    expect(() =>
      mountLabs(new Hono<LabEnv>(), [lab([{ name, description: "x" }])]),
    ).toThrow(name);
  });
});
