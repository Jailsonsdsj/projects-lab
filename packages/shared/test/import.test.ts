import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLearningBacklog } from "../src/study/import";

// The real cs-learning-lab backlog, copied as it was on 2026-10-19.
const REAL = readFileSync(
  new URL("./fixtures/learning-backlog.md", import.meta.url),
  "utf8",
);

const table = (rows: string[]) =>
  [
    "# Learning Backlog",
    "## Summary",
    "| Area | Not started | In progress | Done | Avg grade |",
    "|---|---|---|---|---|",
    "| Frontend | 1 | 0 | 0 | — |",
    "## Frontend",
    "| ID | Topic | Level | Priority | Status | Grade | Started | Finished | Notes |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");

describe("parseLearningBacklog", () => {
  it("reads the real backlog: exactly CS-01, with its fields", () => {
    const { topics, warnings } = parseLearningBacklog(REAL);
    expect(topics).toEqual([
      {
        code: "CS-01",
        prefix: "CS",
        areaName: "CS Fundamentals",
        skill: "Big-O notation",
        level: "fast_track",
        priority: 2,
        status: "not_started",
        startedOn: null,
        note: "",
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("skips the summary and empty areas' placeholder rows", () => {
    expect(
      parseLearningBacklog(table(["| — | _No topics yet_ | | | | | | | |"]))
        .topics,
    ).toEqual([]);
  });

  it("keeps a grade in the note, with a warning: there's no exam record behind it", () => {
    const { topics, warnings } = parseLearningBacklog(
      table([
        "| FE-03 | Next.js | Essential | P1 | Done | 8.5 | 2026-09-10 | 2026-09-20 | Retake; previous 6.5 |",
      ]),
    );
    expect(topics[0]).toMatchObject({
      code: "FE-03",
      status: "done",
      level: "essential",
      priority: 1,
      startedOn: "2026-09-10",
      note: "Imported grade 8.5; Retake; previous 6.5",
    });
    expect(warnings).toEqual([
      "FE-03: grade 8.5 kept in the note (no exam record to import)",
    ]);
  });

  it("refuses what it can't map, naming the row", () => {
    expect(() =>
      parseLearningBacklog(
        table(["| FE-1 | X | Essential | P2 | Done | — | — | — | |"]),
      ),
    ).toThrow(/Not a topic ID \(FE-1\)/);
    expect(() =>
      parseLearningBacklog(
        table(["| FE-01 | X | Expert | P2 | Done | — | — | — | |"]),
      ),
    ).toThrow(/Unknown level "Expert"/);
    expect(() =>
      parseLearningBacklog(
        table(["| FE-01 | X | Essential | P9 | Done | — | — | — | |"]),
      ),
    ).toThrow(/Unknown priority/);
    expect(() =>
      parseLearningBacklog(
        table(["| FE-01 | X | Essential | P2 | Paused | — | — | — | |"]),
      ),
    ).toThrow(/Unknown status/);
    expect(() =>
      parseLearningBacklog(
        table([
          "| FE-01 | X | Essential | P2 | Done | — | — | — | |",
          "| BE-02 | Y | Essential | P2 | Done | — | — | — | |",
        ]),
      ),
    ).toThrow(/BE-02 doesn't match its area's prefix FE/);
  });
});
