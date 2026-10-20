import { describe, expect, it } from "vitest";
import { FIT_MAX, type FitScores, isFitScores, scoreFit } from "./fit";

const scores = (overrides: Partial<FitScores> = {}): FitScores => ({
  constraints: 20,
  skills: 20,
  growth: 15,
  pay: 10,
  signal: 10,
  ...overrides,
});

describe("fit score", () => {
  it("has maxima 25/25/20/15/15, a total of 100", () => {
    expect(Object.values(FIT_MAX).reduce((a, b) => a + b, 0)).toBe(100);
    expect(scoreFit(FIT_MAX)).toEqual({ total: 100, decision: "apply" });
  });

  it("totals the dimensions", () => {
    expect(scoreFit(scores()).total).toBe(75);
  });

  it("decides at 75 and 55", () => {
    expect(scoreFit(scores()).decision).toBe("apply"); // 75
    expect(scoreFit(scores({ signal: 9 })).decision).toBe("maybe"); // 74
    expect(scoreFit(scores({ growth: 0, pay: 10, signal: 5 })).decision).toBe(
      "maybe",
    ); // 55
    expect(scoreFit(scores({ growth: 0, pay: 10, signal: 4 })).decision).toBe(
      "skip",
    ); // 54
  });

  it("skips below 15 on constraints, whatever the total", () => {
    const high = {
      constraints: 14,
      skills: 25,
      growth: 20,
      pay: 15,
      signal: 15,
    };
    expect(scoreFit(high)).toEqual({ total: 89, decision: "skip" });
    expect(scoreFit({ ...high, constraints: 15 }).decision).toBe("apply");
  });

  it("refuses scores outside their maxima or not integers", () => {
    for (const bad of [
      scores({ constraints: 26 }),
      scores({ growth: 21 }),
      scores({ pay: 16 }),
      scores({ signal: -1 }),
      scores({ skills: 12.5 }),
      scores({ pay: Number.NaN }),
    ]) {
      expect(isFitScores(bad)).toBe(false);
      expect(() => scoreFit(bad)).toThrow(RangeError);
    }
  });
});
