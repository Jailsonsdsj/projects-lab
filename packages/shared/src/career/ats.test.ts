import { describe, expect, it } from "vitest";
import {
  ATS_MIN_SCORE,
  atsCeiling,
  atsKeywords,
  atsMentions,
  atsScore,
} from "./ats";

const REQUIREMENTS = [
  {
    text: "Strong TypeScript",
    type: "required",
    skillId: "ts",
    skill: "TypeScript",
  },
  {
    text: "PostgreSQL in production",
    type: "required",
    skillId: "pg",
    skill: "PostgreSQL",
  },
  {
    text: "Kubernetes a plus",
    type: "nice",
    skillId: "k8s",
    skill: "Kubernetes",
  },
  {
    text: "Great communication",
    type: "not_mapped",
    skillId: null,
    skill: null,
  },
  { text: "Clear writing", type: "required", skillId: null, skill: null },
];
const ALIASES = new Map([
  ["pg", ["Postgres", "PG"]],
  ["k8s", ["K8s"]],
]);
const keywords = atsKeywords(REQUIREMENTS, ALIASES);

describe("atsKeywords", () => {
  it("has one per mapped requirement, weighted by type, with the skill's name and aliases", () => {
    expect(keywords).toEqual([
      {
        requirement: "Strong TypeScript",
        type: "required",
        weight: 2,
        skillId: "ts",
        terms: ["TypeScript"],
      },
      {
        requirement: "PostgreSQL in production",
        type: "required",
        weight: 2,
        skillId: "pg",
        terms: ["PostgreSQL", "Postgres", "PG"],
      },
      {
        requirement: "Kubernetes a plus",
        type: "nice",
        weight: 1,
        skillId: "k8s",
        terms: ["Kubernetes", "K8s"],
      },
    ]);
  });
});

describe("atsMentions", () => {
  it("finds whole words, ignoring case and accents", () => {
    expect(atsMentions("Built APIs in typescript.", "TypeScript")).toBe(true);
    expect(atsMentions("Pós-graduação em IA", "pos-graduacao")).toBe(true);
    expect(atsMentions("Wrote JavaScript daily", "Java")).toBe(false);
    expect(atsMentions("Java, Kotlin", "Java")).toBe(true);
    expect(atsMentions("Shipped C++ and Node.js services", "C++")).toBe(true);
    expect(atsMentions("Shipped C++ and Node.js services", "Node.js")).toBe(
      true,
    );
    expect(atsMentions("CI/CD pipelines", "CI/CD")).toBe(true);
    expect(atsMentions("PGP keys", "PG")).toBe(false);
    expect(atsMentions("anything", "  ")).toBe(false);
  });
});

describe("atsScore", () => {
  it("weighs what's covered over all, rounded down, and names what's missing", () => {
    const result = atsScore(
      "Summary: TypeScript engineer. Ran Postgres at scale.",
      keywords,
    );
    // 2 + 2 of 5.
    expect(result.score).toBe(80);
    expect(result.missing.map((k) => k.skillId)).toEqual(["k8s"]);
    // 2 of 5 is 40; 2 of 3 is 66.7, rounded down to 66 (so 79.9 fails 80).
    expect(atsScore("TypeScript", keywords).score).toBe(40);
    expect(atsScore("Postgres", keywords.slice(1)).score).toBe(66);
    expect(atsScore("TypeScript, PG, K8s", keywords).score).toBe(100);
  });

  it("passes everything when the job has no scored keywords", () => {
    expect(atsScore("", []).score).toBe(100);
    expect(ATS_MIN_SCORE).toBe(80);
  });
});

describe("atsCeiling", () => {
  it("counts only what the owner has evidence for", () => {
    const ceiling = atsCeiling(keywords, new Set(["ts", "k8s"]));
    expect(ceiling.score).toBe(60);
    expect(ceiling.missing.map((k) => k.requirement)).toEqual([
      "PostgreSQL in production",
    ]);
    expect(atsCeiling(keywords, new Set(["ts", "pg"])).score).toBe(80);
  });
});
