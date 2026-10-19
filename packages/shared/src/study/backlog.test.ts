import { describe, expect, it } from "vitest";
import {
  afterCourseRecorded,
  afterGradeRecorded,
  averageTenths,
  compareTopics,
  formatTopicCode,
  isValidPrefix,
  isVerified,
  parseTopicCode,
  sortBacklog,
  suggestNext,
  summarize,
  type TopicRef,
  withStatus,
} from "./backlog";

const topic = (code: string, over: Partial<TopicRef> = {}): TopicRef => ({
  code,
  areaId: code.slice(0, 2),
  priority: 2,
  status: "not_started",
  grade: null,
  ...over,
});
const areas = [
  { id: "FE", position: 2 },
  { id: "CS", position: 1 },
  { id: "SE", position: 7 },
];
const codes = (topics: TopicRef[]) => topics.map((t) => t.code);

describe("topic codes", () => {
  it("pads to two digits and grows past 99", () => {
    expect(formatTopicCode("FE", 1)).toBe("FE-01");
    expect(formatTopicCode("FE", 10)).toBe("FE-10");
    expect(formatTopicCode("FE", 100)).toBe("FE-100");
  });

  it("refuses a bad prefix or sequence", () => {
    for (const prefix of ["fe", "F", "FEE", "F1", ""])
      expect(() => formatTopicCode(prefix, 1)).toThrow(RangeError);
    for (const seq of [0, -1, 1.5, Number.NaN])
      expect(() => formatTopicCode("FE", seq)).toThrow(RangeError);
  });

  it("parses only what format would produce", () => {
    expect(parseTopicCode("FE-01")).toEqual({ prefix: "FE", seq: 1 });
    expect(parseTopicCode("FE-100")).toEqual({ prefix: "FE", seq: 100 });
    for (const code of [
      "FE-1",
      "FE-001",
      "FE-00",
      "fe-01",
      "FE01",
      "FE-01 ",
      "FEX-01",
    ])
      expect(parseTopicCode(code)).toBeNull();
  });

  it("validates prefixes", () => {
    expect(isValidPrefix("AI")).toBe(true);
    for (const prefix of ["ai", "A", "AIM", "A1", "Á B"])
      expect(isValidPrefix(prefix)).toBe(false);
  });
});

describe("backlog order", () => {
  it("status first: In progress, Not started, Done", () => {
    const sorted = [
      topic("FE-01", { status: "done" }),
      topic("FE-02"),
      topic("FE-03", { status: "in_progress" }),
    ].sort(compareTopics);
    expect(codes(sorted)).toEqual(["FE-03", "FE-02", "FE-01"]);
  });

  it("then priority, then the code's number, not its text", () => {
    // As text, "FE-100" < "FE-99": only the number gets this right.
    const sorted = [
      topic("FE-100"),
      topic("FE-99"),
      topic("FE-10"),
      topic("FE-02"),
      topic("FE-50", { priority: 1 }),
      topic("FE-03", { priority: 3 }),
    ].sort(compareTopics);
    expect(codes(sorted)).toEqual([
      "FE-50",
      "FE-02",
      "FE-10",
      "FE-99",
      "FE-100",
      "FE-03",
    ]);
  });

  it("groups by area position and drops removed topics", () => {
    const sorted = sortBacklog(areas, [
      topic("FE-01", { status: "in_progress" }),
      topic("CS-02"),
      topic("CS-01", { deletedAt: "2026-10-19T00:00:00.000Z" }),
      topic("SE-01", { status: "in_progress" }),
    ]);
    expect(codes(sorted)).toEqual(["CS-02", "FE-01", "SE-01"]);
  });
});

describe("summary", () => {
  it("averages rounding half-up to a whole tenth", () => {
    expect(averageTenths([])).toBeNull();
    expect(averageTenths([85, 84])).toBe(85); // 84.5 → 85
    expect(averageTenths([85, 83])).toBe(84);
    expect(averageTenths([70, 70, 71])).toBe(70); // 70.33 → 70
    expect(averageTenths([70, 71, 71])).toBe(71); // 70.67 → 71
  });

  it("counts per area and in total; every area appears, in position order", () => {
    const summary = summarize(areas, [
      topic("FE-01", { status: "done", grade: 80 }),
      topic("FE-02", { status: "in_progress" }),
      topic("CS-01"),
    ]);
    expect(summary.areas.map((a) => a.areaId)).toEqual(["CS", "FE", "SE"]);
    expect(summary.areas[1]).toEqual({
      areaId: "FE",
      notStarted: 0,
      inProgress: 1,
      done: 1,
      average: 80,
    });
    expect(summary.areas[2]).toEqual({
      areaId: "SE",
      notStarted: 0,
      inProgress: 0,
      done: 0,
      average: null,
    });
    expect(summary.total).toEqual({
      notStarted: 1,
      inProgress: 1,
      done: 1,
      average: 80,
    });
  });

  it("averages only Done topics that have a grade", () => {
    const summary = summarize(areas, [
      topic("FE-01", { status: "done", grade: 90 }),
      topic("FE-02", { status: "done", grade: null }), // marked Done by hand
      topic("FE-03", { status: "in_progress", grade: 20 }), // a retake under way
    ]);
    expect(summary.total.average).toBe(90);
    expect(summary.total.done).toBe(2);
  });

  it("leaves removed topics out", () => {
    const summary = summarize(areas, [
      topic("FE-01", { status: "done", grade: 40, deletedAt: "t" }),
      topic("FE-02", { status: "done", grade: 90 }),
    ]);
    expect(summary.total).toEqual({
      notStarted: 0,
      inProgress: 0,
      done: 1,
      average: 90,
    });
  });
});

describe("suggested next topic", () => {
  it("is the first Not started P1 in backlog order", () => {
    const next = suggestNext(areas, [
      topic("FE-01", { priority: 1 }),
      topic("CS-05", { priority: 2 }),
      topic("CS-07", { priority: 1 }),
      topic("CS-02", { priority: 1, status: "in_progress" }),
    ]);
    expect(next?.code).toBe("CS-07");
  });

  it("falls back to P2, never P3, and skips removed topics", () => {
    expect(
      suggestNext(areas, [
        topic("FE-01", { priority: 1, deletedAt: "t" }),
        topic("FE-02", { priority: 3 }),
        topic("FE-03", { priority: 2 }),
      ])?.code,
    ).toBe("FE-03");
    expect(suggestNext(areas, [topic("FE-02", { priority: 3 })])).toBeNull();
  });
});

describe("status transitions", () => {
  const today = "2026-10-19";
  const fresh = { status: "not_started" as const, startedOn: null };

  it("recording a course starts a Not started topic and sets Started", () => {
    expect(afterCourseRecorded(fresh, today)).toEqual({
      status: "in_progress",
      startedOn: today,
    });
  });

  it("recording another course changes nothing, and never moves Started", () => {
    const started = { status: "in_progress" as const, startedOn: "2026-09-01" };
    expect(afterCourseRecorded(started, today)).toEqual(started);
    const done = { status: "done" as const, startedOn: "2026-09-01" };
    expect(afterCourseRecorded(done, today)).toEqual(done);
  });

  it("by hand: In progress sets Started once; Done or back to Not started keeps it", () => {
    expect(withStatus(fresh, "in_progress", today).startedOn).toBe(today);
    const started = { status: "done" as const, startedOn: "2026-09-01" };
    expect(withStatus(started, "in_progress", today).startedOn).toBe(
      "2026-09-01",
    );
    expect(withStatus(started, "not_started", today).startedOn).toBe(
      "2026-09-01",
    );
    expect(withStatus(fresh, "done", today)).toEqual({
      status: "done",
      startedOn: null,
    });
  });

  it("a grade makes the topic Done", () => {
    expect(
      afterGradeRecorded({ status: "in_progress", startedOn: "2026-09-01" }),
    ).toEqual({ status: "done", startedOn: "2026-09-01" });
  });
});

describe("verified for Career", () => {
  it("needs Done and a grade of at least 70", () => {
    expect(isVerified({ status: "done", grade: 70 })).toBe(true);
    expect(isVerified({ status: "done", grade: 69 })).toBe(false);
    expect(isVerified({ status: "done", grade: null })).toBe(false);
    expect(isVerified({ status: "in_progress", grade: 95 })).toBe(false);
  });
});
