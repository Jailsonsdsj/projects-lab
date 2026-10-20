import { describe, expect, it } from "vitest";
import {
  DOCUMENT_LAYOUT,
  type FactRef,
  rankExperiences,
  rankFacts,
  rankSkills,
  WRITING_RULES,
} from "./brief";

const fact = (
  id: string,
  skillIds: string[],
  position: number,
  verified = true,
  experienceId: string | null = null,
): FactRef => ({ id, skillIds, position, verified, experienceId });

const job = new Set(["ts", "react", "evals"]);

describe("ranking facts for a job", () => {
  it("puts verified facts with more of the job's skills first, ties in profile order", () => {
    const { facts } = rankFacts(
      [
        fact("a", ["ts"], 1),
        fact("b", ["ts", "react"], 2),
        fact("c", ["go"], 0),
        fact("d", ["react"], 0),
      ],
      job,
    );
    expect(facts.map((f) => [f.id, f.matches])).toEqual([
      ["b", 2],
      ["d", 1],
      ["a", 1],
      ["c", 0],
    ]);
  });

  it("never mixes unverified facts in; asks only about the ones the job needs", () => {
    const { facts, askFirst } = rankFacts(
      [
        fact("v", ["ts"], 1),
        fact("u1", ["evals"], 2, false),
        fact("u2", ["go"], 3, false),
      ],
      job,
    );
    expect(facts.map((f) => f.id)).toEqual(["v"]);
    expect(askFirst.map((f) => f.id)).toEqual(["u1"]);
  });

  it("counts a skill listed twice on a fact once", () => {
    const { facts } = rankFacts([fact("a", ["ts", "ts"], 1)], job);
    expect(facts[0]?.matches).toBe(1);
  });
});

describe("ranking experiences and skills", () => {
  it("orders experiences by their verified facts' matches", () => {
    const { facts, askFirst } = rankFacts(
      [
        fact("f1", ["ts"], 1, true, "old"),
        fact("f2", ["ts", "react"], 2, true, "new"),
        fact("f3", ["evals", "ts", "react"], 3, false, "old"),
      ],
      job,
    );
    const ranked = rankExperiences(
      [
        { id: "old", position: 1 },
        { id: "new", position: 2 },
        { id: "side", position: 0 },
      ],
      [...facts, ...askFirst], // an unverified fact's matches never count
    );
    expect(ranked.map((e) => [e.id, e.matches])).toEqual([
      ["new", 2],
      ["old", 1],
      ["side", 0],
    ]);
  });

  it("puts the posting's skills first, keeping each group's order", () => {
    const skills = ["go", "react", "sql", "ts"].map((skillId) => ({ skillId }));
    expect(rankSkills(skills, job).map((s) => s.skillId)).toEqual([
      "react",
      "ts",
      "go",
      "sql",
    ]);
  });
});

describe("rules and layout", () => {
  it("carry the non-negotiables as text", () => {
    const rules = WRITING_RULES.join(" ");
    expect(rules).toMatch(/never add an experience, a skill or a number/);
    expect(rules).toMatch(/posting's language/);
    expect(rules).toMatch(/ask_first/);
    expect(DOCUMENT_LAYOUT.join(" ")).toMatch(/<Name>__<company>__<kind>/);
  });
});
