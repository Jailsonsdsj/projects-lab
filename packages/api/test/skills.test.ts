// GET /api/skills?query= (ST-06c) through the Worker: the app's skill lookup.
import { SELF } from "cloudflare:test";
import { findSkillResponseSchema } from "@projects-lab/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { ORIGIN, seedOwner, sessionJwt, signInClaude } from "./oauth-flow";

let session: string;
let authKey: string;

beforeAll(async () => {
  authKey = await seedOwner();
  session = await sessionJwt();
  await db().batch([
    db().prepare(
      `INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('sk-pg', 'PostgreSQL', '["Postgres"]', 't')`,
    ),
    db().prepare(
      "INSERT INTO skill (id, name, created_at, deleted_at) VALUES ('sk-old', 'Perl', 't', 't')",
    ),
  ]);
});

const find = (query: string, token = session) =>
  SELF.fetch(`${ORIGIN}/api/skills?query=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

describe("GET /api/skills", () => {
  it("finds a skill by an alias in another case", async () => {
    const res = await find("postgres");
    expect(res.status).toBe(200);
    const body = findSkillResponseSchema.parse(await res.json());
    expect(body.skill).toEqual({
      id: "sk-pg",
      name: "PostgreSQL",
      aliases: ["Postgres"],
    });
  });

  it("answers null for an unknown or soft-deleted skill", async () => {
    expect(await (await find("Rust")).json()).toEqual({ skill: null });
    expect(await (await find("perl")).json()).toEqual({ skill: null });
  });

  it("refuses an empty query", async () => {
    expect((await find("   ")).status).toBe(400);
  });

  it("needs a session: no token or an OAuth token is a 401", async () => {
    expect((await SELF.fetch(`${ORIGIN}/api/skills?query=x`)).status).toBe(401);
    const claude = await signInClaude(authKey);
    expect(
      (await find("postgres", claude.tokens.access_token ?? "")).status,
    ).toBe(401);
  });
});
