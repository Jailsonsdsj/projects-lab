import { describe, expect, it } from "vitest";
import { jobReadiness, type RequirementRef, skillReadiness } from "./readiness";

const req = (
  id: string,
  type: RequirementRef["type"],
  skillId: string | null,
  position: number,
): RequirementRef => ({ id, type, skillId, position });

describe("skill readiness", () => {
  it("prefers Verified over Declared, else Gap", () => {
    const verified = new Set(["ts"]);
    const declared = new Set(["ts", "react"]);
    expect(skillReadiness("ts", verified, declared)).toBe("verified");
    expect(skillReadiness("react", verified, declared)).toBe("declared");
    expect(skillReadiness("go", verified, declared)).toBe("gap");
  });
});

describe("job readiness", () => {
  const verified = new Set(["ts"]);
  const declared = new Set(["react"]);

  it("counts required skills only, nice-to-haves apart", () => {
    const result = jobReadiness(
      [
        req("r1", "required", "ts", 1),
        req("r2", "required", "react", 2),
        req("r3", "required", "go", 3),
        req("r4", "nice", "k8s", 4),
        req("r5", "nice", "ts", 5),
      ],
      verified,
      declared,
    );
    expect(result.required).toEqual({ ready: 2, total: 3 });
    expect(result.nice).toEqual({ ready: 1, total: 2 });
  });

  it("counts a skill named twice once", () => {
    const result = jobReadiness(
      [
        req("r1", "required", "go", 1),
        req("r2", "required", "go", 2),
        req("r3", "required", "ts", 3),
      ],
      verified,
      declared,
    );
    expect(result.required).toEqual({ ready: 1, total: 2 });
    expect(result.nextUp.map((r) => r.id)).toEqual(["r1"]);
  });

  it("is 0 of 0 with no required skills, not 100%", () => {
    const result = jobReadiness(
      [req("r1", "nice", "ts", 1)],
      verified,
      declared,
    );
    expect(result.required).toEqual({ ready: 0, total: 0 });
  });

  it("lists up to three gaps, required before nice, in posting order", () => {
    const result = jobReadiness(
      [
        req("n1", "nice", "a", 1),
        req("r1", "required", "b", 4),
        req("r2", "required", "c", 2),
        req("r3", "required", "ts", 3),
        req("r4", "required", "d", 5),
        req("r5", "required", "e", 6),
      ],
      verified,
      declared,
    );
    expect(result.nextUp.map((r) => r.id)).toEqual(["r2", "r1", "r4"]);
  });

  it("falls back to nice gaps when every required skill is ready", () => {
    const result = jobReadiness(
      [req("r1", "required", "ts", 1), req("n1", "nice", "go", 2)],
      verified,
      declared,
    );
    expect(result.nextUp.map((r) => r.id)).toEqual(["n1"]);
  });

  it("keeps not-mapped requirements apart, out of every count", () => {
    const result = jobReadiness(
      [
        req("x", "not_mapped", null, 2),
        req("r1", "required", "ts", 1),
        req("y", "not_mapped", null, 0),
      ],
      verified,
      declared,
    );
    expect(result.notMapped.map((r) => r.id)).toEqual(["y", "x"]);
    expect(result.requirements.map((r) => r.id)).toEqual(["r1"]);
    expect(result.required).toEqual({ ready: 1, total: 1 });
  });

  it("tags each mapped requirement with its status in posting order", () => {
    const result = jobReadiness(
      [req("b", "nice", "go", 2), req("a", "required", "react", 1)],
      verified,
      declared,
    );
    expect(result.requirements.map((r) => [r.id, r.readiness])).toEqual([
      ["a", "declared"],
      ["b", "gap"],
    ]);
  });
});
