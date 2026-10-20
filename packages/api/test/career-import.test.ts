// CA-14: the import SQL against every migration, through the real Worker: run
// twice it loads the synthetic resume once, an edit the owner made in between
// is kept, and the Profile reads what the parser found. (The real resume is
// proven the same way on a throwaway local D1, never committed.)
import { SELF } from "cloudflare:test";
import {
  profileResponseSchema,
  skillsResponseSchema,
} from "@projects-lab/shared/career";
import { beforeAll, describe, expect, it } from "vitest";
import { parseMasterResume, resumeSql } from "../../shared/src/career/import";
import resumeA from "../../shared/test/fixtures/master-resume-a.md?raw";
import { db } from "./db";
import { ORIGIN, seedOwner, sessionJwt } from "./oauth-flow";

let session: string;
beforeAll(async () => {
  await seedOwner();
  session = await sessionJwt();
});

const api = (path: string) =>
  SELF.fetch(`${ORIGIN}/api/career${path}`, {
    headers: { Authorization: `Bearer ${session}` },
  });
const run = (statements: string[]) =>
  db().batch(statements.map((sql) => db().prepare(sql)));

describe("the master-resume import", () => {
  const statements = resumeSql(
    parseMasterResume(resumeA),
    "2026-10-20T00:00:00.000Z",
  );

  it("loads the profile once, however many times it runs", async () => {
    await run(statements);
    // The owner edits the name in between: a second run keeps the edit.
    await db()
      .prepare(
        "UPDATE career_person SET full_name = 'Sam R.' WHERE id = 'person'",
      )
      .run();
    await run(statements);

    const profile = profileResponseSchema.parse(
      await (await api("/profile")).json(),
    );
    expect(profile.person).toMatchObject({
      fullName: "Sam R.",
      location: "Lisbon, Portugal",
      email: "sam.rivera@example.com",
    });
    expect(profile.links.map((l) => l.kind)).toEqual(["linkedin", "portfolio"]);
    expect(profile.education.map((e) => [e.degree, e.end])).toEqual([
      ["MSc", null],
      ["BSc", "2022"],
    ]);
    expect(profile.experiences.map((x) => [x.title, x.facts.length])).toEqual([
      ["Thesis research — Evaluating LLM judges", 2],
      ["Two-agent pipeline prototype — course project", 1],
      ["Front-End Engineer", 2],
      ["Project Lead", 1],
      ["Mobile Developer", 1],
    ]);
    const acme = profile.experiences[2];
    expect(
      acme?.facts.map((f) => [f.verified, f.skills.map((s) => s.name)]),
    ).toEqual([
      [false, ["Next.js"]],
      [true, ["React", "TypeScript"]],
    ]);
    const counts = await db()
      .prepare(
        "SELECT (SELECT COUNT(*) FROM career_fact) facts, (SELECT COUNT(*) FROM career_experience) experiences, (SELECT COUNT(*) FROM career_link) links",
      )
      .first();
    expect(counts).toEqual({ facts: 7, experiences: 5, links: 2 });
  });

  it("declares its skills at working level, ready to be set in the Skills tab", async () => {
    const { skills } = skillsResponseSchema.parse(
      await (await api("/skills")).json(),
    );
    expect(skills).toHaveLength(9);
    expect(
      skills.every((s) => s.level === "working" && s.readiness === "declared"),
    ).toBe(true);
    expect(skills.find((s) => s.name === "React")?.note).toBe("Frontend");
  });
});
