import { describe, expect, it } from "vitest";
import {
  deriveGrade,
  type ExamGrade,
  formatGrade,
  isGradeTenths,
  localDate,
  parseGrade,
} from "./grades";

describe("grade tenths", () => {
  it("formats with one decimal", () => {
    expect(formatGrade(85)).toBe("8.5");
    expect(formatGrade(100)).toBe("10.0");
    expect(formatGrade(0)).toBe("0.0");
    expect(formatGrade(70)).toBe("7.0");
    expect(formatGrade(7)).toBe("0.7");
  });

  it("refuses anything that isn't an integer 0..100", () => {
    for (const bad of [-1, 101, 8.5, Number.NaN])
      expect(() => formatGrade(bad)).toThrow(RangeError);
    expect(isGradeTenths("85")).toBe(false);
  });

  it("parses without floats", () => {
    expect(parseGrade("8.5")).toBe(85);
    expect(parseGrade("10")).toBe(100);
    expect(parseGrade("10.0")).toBe(100);
    expect(parseGrade(" 0.7 ")).toBe(7);
    expect(parseGrade("0.3")).toBe(3); // 0.1 + 0.2 trouble can't happen
    for (const bad of ["8.55", "10.5", "11", "-1", "8,5", "", "abc", ".5"])
      expect(parseGrade(bad)).toBeNull();
  });
});

describe("owner-local date", () => {
  it("uses the owner's day, not UTC's", () => {
    // 01:30 UTC on the 20th is still the 19th in Recife (UTC-3).
    expect(localDate("2026-10-20T01:30:00.000Z", "America/Recife")).toBe(
      "2026-10-19",
    );
    expect(localDate("2026-10-20T01:30:00.000Z", "UTC")).toBe("2026-10-20");
  });
});

describe("a topic's grade and Finished date", () => {
  const exam = (over: Partial<ExamGrade>): ExamGrade => ({
    level: "essential",
    attempt: 1,
    grade: null,
    gradedAt: null,
    ...over,
  });

  it("is null until an exam is graded", () => {
    expect(deriveGrade([], "UTC")).toEqual({ grade: null, finishedOn: null });
    expect(deriveGrade([exam({})], "UTC")).toEqual({
      grade: null,
      finishedOn: null,
    });
  });

  it("is the most recently graded exam, even with a lower grade or attempt", () => {
    const result = deriveGrade(
      [
        exam({ attempt: 2, grade: 90, gradedAt: "2026-09-10T12:00:00.000Z" }),
        // A later Fast track exam #1 was graded after Essential #2.
        exam({
          level: "fast_track",
          attempt: 1,
          grade: 60,
          gradedAt: "2026-10-01T12:00:00.000Z",
        }),
        exam({ attempt: 3, grade: null, gradedAt: null }), // awaiting a grade
      ],
      "UTC",
    );
    expect(result).toEqual({ grade: 60, finishedOn: "2026-10-01" });
  });

  it("gives Finished as the owner's local day", () => {
    expect(
      deriveGrade(
        [exam({ grade: 85, gradedAt: "2026-10-20T01:30:00.000Z" })],
        "America/Recife",
      ).finishedOn,
    ).toBe("2026-10-19");
  });

  it("breaks a tie on the instant by the higher attempt", () => {
    const at = "2026-10-01T12:00:00.000Z";
    expect(
      deriveGrade(
        [
          exam({ attempt: 2, grade: 80, gradedAt: at }),
          exam({ attempt: 1, grade: 50, gradedAt: at }),
        ],
        "UTC",
      ).grade,
    ).toBe(80);
  });
});
