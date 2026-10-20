import { describe, expect, it } from "vitest";
import { isStale } from "./search";

describe("stale openings", () => {
  const createdAt = "2026-09-19T10:00:00.000Z";

  it("are new ones 30 days old", () => {
    expect(
      isStale({ status: "new", createdAt }, "2026-10-19T10:00:00.000Z"),
    ).toBe(true);
    expect(
      isStale({ status: "new", createdAt }, "2026-10-19T09:59:59.999Z"),
    ).toBe(false);
  });

  it("never kept, dismissed or tracked ones", () => {
    for (const status of ["kept", "dismissed", "tracked"] as const)
      expect(isStale({ status, createdAt }, "2027-01-01T00:00:00.000Z")).toBe(
        false,
      );
  });
});
