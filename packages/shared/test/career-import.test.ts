// CA-14: the master-resume parser, on synthetic fixtures in both layouts the
// real files use (study-materials' and career-os'). The real files hold
// personal data, so they're never committed; the script runs on them locally.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compareResumes,
  parseMasterResume,
  resumeDate,
  resumeSql,
} from "../src/career/import";
import { isProfileDate } from "../src/career/profile";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const a = parseMasterResume(fixture("master-resume-a.md"));
const b = parseMasterResume(fixture("master-resume-b.md"));

describe("resume dates", () => {
  it("reads months and years as profile dates", () => {
    expect(resumeDate("Oct 2023")).toBe("2023-10");
    expect(resumeDate("January 2024")).toBe("2024-01");
    expect(resumeDate("2026")).toBe("2026");
    expect(resumeDate("Spring 2024")).toBeNull();
    expect(resumeDate("23")).toBeNull();
  });
});

describe("parseMasterResume", () => {
  it("reads the contact line: name, location, email, phone, links", () => {
    expect(a.person).toEqual({
      fullName: "Sam Rivera",
      location: "Lisbon, Portugal",
      email: "sam.rivera@example.com",
      phone: "+351 91 234-5678",
    });
    expect(a.links).toEqual([
      {
        kind: "linkedin",
        label: "LinkedIn",
        url: "https://linkedin.com/in/sam-rivera",
      },
      {
        kind: "portfolio",
        label: "Website",
        url: "https://sam-rivera.github.io/site",
      },
    ]);
    expect(b.person).toEqual(a.person);
    expect(b.links).toEqual(a.links);
  });

  it("reads education, an in-progress degree with no end", () => {
    expect(a.education).toEqual([
      {
        degree: "MSc",
        field: "Computer Science",
        institution: "Example University",
        start: "2025",
        end: null,
        notes: "Expected 2027. Research area: evaluation of LLM systems.",
      },
      {
        degree: "BSc",
        field: "Information Systems",
        institution: "Example University",
        start: "2018",
        end: "2022",
        notes: "",
      },
    ]);
  });

  it("reads experiences: kind, title, organization, dates, location", () => {
    expect(
      a.experiences.map((x) => [
        x.kind,
        x.title,
        x.organization,
        x.start,
        x.end,
        x.location,
      ]),
    ).toEqual([
      [
        "research",
        "Thesis research — Evaluating LLM judges",
        "Example University",
        "2025",
        null,
        "",
      ],
      [
        "project",
        "Two-agent pipeline prototype — course project",
        "Example University",
        "2025",
        "2025",
        "",
      ],
      [
        "job",
        "Front-End Engineer",
        "Acme",
        "2023-10",
        null,
        "Porto, Portugal (remote)",
      ],
      [
        "contract",
        "Project Lead",
        "Freelance client",
        "2024-01",
        "2025-01",
        "Lisbon, Portugal",
      ],
      [
        "job",
        "Mobile Developer",
        "Example Agency",
        "2022-03",
        "2022-09",
        "Lisbon, Portugal",
      ],
    ]);
    for (const x of a.experiences) {
      expect(isProfileDate(x.start)).toBe(true);
      if (x.end) expect(isProfileDate(x.end)).toBe(true);
    }
    expect(a.warnings).toContain(
      '"Project Lead (contract)" names no organization: imported as "Freelance client"; rename it in the profile.',
    );
  });

  it("imports [UNVERIFIED] bullets as unverified facts, the note kept to confirm", () => {
    const acme = a.experiences[2];
    expect(acme?.facts).toEqual([
      {
        text: "Built a checkout in Next.js handling millions of orders.",
        verified: false,
        toConfirm: "the real order count.",
        skills: ["Next.js"],
      },
      {
        text: "Ran a design system in TypeScript and React used by five teams.",
        verified: true,
        toConfirm: null,
        skills: ["React", "TypeScript"],
      },
    ]);
    // A wrapped [UNVERIFIED: …] tag (career-os layout) is read whole.
    expect(b.experiences[0]?.facts[0]).toMatchObject({
      verified: false,
      toConfirm: "the real order count.",
    });
  });

  it("keeps guidance bullets out of the facts, in the experience's summary", () => {
    const lead = a.experiences[3];
    expect(lead?.facts.map((f) => f.text)).toEqual([
      "Led a WordPress site for a musician; delivered two weeks early with Scrum.",
    ]);
    expect(lead?.summary).toBe(
      "Internal context only: never mention the overlap with Acme in outbound material.",
    );
    expect(a.experiences[4]?.summary).toBe(
      'Temporary role. Research-to-product transfer — use this story for "can you productize research?".',
    );
  });

  it("declares each skill once, leaving out the ones claimed but thin", () => {
    expect(a.skills.map((s) => s.name)).toEqual([
      "LLMs",
      "prompt engineering",
      "Python",
      "data analysis (Krippendorff's α, ICC)",
      "React",
      "Next.js",
      "TypeScript",
      "Node.js",
      "Scrum",
    ]);
    expect(a.skills[0]?.group).toBe("AI & data");
    expect(a.skills.some((s) => s.name === "ML")).toBe(false);
  });

  it("reports what it doesn't import", () => {
    expect(a.notImported).toEqual([
      'Note under "Two-agent pipeline prototype — course project": Positioning note: not public yet.',
      'Skills "Claimed but thin — do not lead with these" (not declared): ML, cloud platforms.',
      "Not yet true: First public AI artifact.",
      "Not yet true: English certificate.",
    ]);
  });
});

describe("compareResumes", () => {
  it("lists facts only one copy has, and guidance that differs", () => {
    const diff = compareResumes(a, b);
    expect(diff.onlyInSecond).toEqual([
      "Front-End Engineer: Mentored two junior engineers through their first year.",
    ]);
    expect(diff.onlyInFirst).toContain(
      "Thesis research — Evaluating LLM judges: Metrics used: Krippendorff's α, ICC.",
    );
    expect(diff.guidanceDiffers.map((g) => g.title)).toEqual([
      "Project Lead",
      "Mobile Developer",
    ]);
  });
});

describe("resumeSql", () => {
  it("only inserts and updates, every insert guarded", () => {
    const statements = resumeSql(a, "2026-10-20T00:00:00.000Z");
    const inserts = statements.filter((s) => s.startsWith("INSERT"));
    expect(inserts.length).toBeGreaterThan(20);
    for (const s of inserts)
      expect(s, s.slice(0, 60)).toMatch(
        /WHERE NOT EXISTS|WHERE \(SELECT id FROM skill|ON CONFLICT \(id\) DO NOTHING/,
      );
    expect(statements.join("\n")).not.toMatch(
      /\b(DELETE|DROP|ALTER|PRAGMA)\b/i,
    );
  });

  it("refuses to emit a statement that deletes", () => {
    const evil = {
      ...a,
      person: { ...a.person, fullName: "x'); DROP TABLE skill; --" },
    };
    expect(() => resumeSql(evil, "t")).toThrow(/only insert and update/);
  });
});
