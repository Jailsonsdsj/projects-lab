import { describe, expect, it } from "vitest";
import { formatSalaryRange, isSalaryRange } from "./salary";

const range = { min: 40, max: 60, currency: "USD", period: "hour" };

describe("salary range", () => {
  it("accepts whole units with min ≤ max, a known currency and period", () => {
    expect(isSalaryRange(range)).toBe(true);
    expect(isSalaryRange({ ...range, min: 60 })).toBe(true);
    expect(isSalaryRange({ ...range, min: 0 })).toBe(true);
  });

  it("refuses min > max, floats, negatives, unknown codes", () => {
    for (const bad of [
      { ...range, min: 61 },
      { ...range, min: 40.5 },
      { ...range, max: 60.01 },
      { ...range, min: -1 },
      { ...range, currency: "usd" },
      { ...range, currency: "XYZ" },
      { ...range, period: "week" },
      { ...range, max: Number.MAX_SAFE_INTEGER + 1 },
    ])
      expect(isSalaryRange(bad)).toBe(false);
  });

  it("formats one figure when min = max", () => {
    expect(formatSalaryRange(range)).toBe("USD 40–60 / hour");
    expect(
      formatSalaryRange({
        min: 8000,
        max: 8000,
        currency: "BRL",
        period: "month",
      }),
    ).toBe("BRL 8000 / month");
    expect(() => formatSalaryRange({ ...range, min: 70 })).toThrow(RangeError);
  });
});
