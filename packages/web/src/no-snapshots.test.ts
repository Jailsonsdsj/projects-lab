import { describe, expect, it } from "vitest";

// Component tests assert behaviour only (vitest.config.ts): a snapshot records
// markup, not behaviour, and gets re-recorded whenever it fails.
const SNAPSHOT =
  /\.toMatch(Inline|File)?Snapshot\(|toThrowErrorMatching(Inline)?Snapshot\(/;

const TESTS = import.meta.glob<string>(
  ["./**/*.test.{ts,tsx}", "../test/**/*.{ts,tsx}", "!./no-snapshots.test.ts"],
  { eager: true, query: "?raw", import: "default" },
);

describe("test policy", () => {
  it("finds the test files", () => {
    expect(Object.keys(TESTS).length).toBeGreaterThan(5);
  });

  it("has no snapshot assertions", () => {
    const offenders = Object.entries(TESTS)
      .filter(([, source]) => SNAPSHOT.test(source))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
