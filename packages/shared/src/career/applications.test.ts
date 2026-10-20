import { describe, expect, it } from "vitest";
import { currentEvent, isSilent, type JobEvent } from "./applications";

const event = (status: JobEvent["status"], at: string): JobEvent => ({
  status,
  at,
});

describe("current status", () => {
  it("is the latest event, whatever the row order", () => {
    expect(
      currentEvent([
        event("applied", "2026-10-02T10:00:00.000Z"),
        event("interviewing", "2026-10-09T10:00:00.000Z"),
        event("evaluated", "2026-10-01T10:00:00.000Z"),
      ])?.status,
    ).toBe("interviewing");
  });

  it("keeps the later row on a tie, and is null with no events", () => {
    const at = "2026-10-02T10:00:00.000Z";
    expect(
      currentEvent([event("evaluated", at), event("applied", at)])?.status,
    ).toBe("applied");
    expect(currentEvent([])).toBeNull();
  });
});

describe("closed silent", () => {
  const applied = [
    event("evaluated", "2026-09-01T10:00:00.000Z"),
    event("applied", "2026-09-28T10:00:00.000Z"),
  ];

  it("happens 21 days after applying, not before", () => {
    expect(isSilent(applied, "2026-10-19T10:00:00.000Z")).toBe(true);
    expect(isSilent(applied, "2026-10-19T09:59:59.999Z")).toBe(false);
  });

  it("reads the latest event, not the last row", () => {
    const rows = [...applied].reverse();
    expect(isSilent(rows, "2026-10-19T10:00:00.000Z")).toBe(true);
  });

  it("applies only to an application that is still applied", () => {
    const late = "2026-12-01T10:00:00.000Z";
    for (const status of [
      "evaluated",
      "interviewing",
      "offer",
      "rejected",
      "withdrawn",
      "closed_silent",
    ] as const)
      expect(
        isSilent([...applied, event(status, "2026-09-29T10:00:00.000Z")], late),
      ).toBe(false);
    expect(isSilent([], late)).toBe(false);
  });
});
