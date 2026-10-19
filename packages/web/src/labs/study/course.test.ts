import { describe, expect, it } from "vitest";
import bigO from "../../../test/fixtures/big-o-notation__fast-track.md?raw";
import { headingSlug } from "../../components/ui";
import { splitCourse } from "./course";

describe("splitCourse on the real Big-O course", () => {
  const course = splitCourse(bigO);

  it("finds the title and the pages: overview, three lessons, wrap-up", () => {
    expect(course.title).toBe("Big-O Notation");
    expect(course.pages.map((p) => p.kind)).toEqual([
      "overview",
      "lesson",
      "lesson",
      "lesson",
      "wrapup",
    ]);
    expect(course.pages[4]?.title).toBe("Course wrap-up");
  });

  it("reads each lesson's number, title, minutes and H3 sections", () => {
    const lessons = course.pages.filter((p) => p.kind === "lesson");
    expect(lessons.map((l) => [l.n, l.title, l.minutes])).toEqual([
      [1, "What Big-O measures and why", 12],
      [2, "The common complexity classes", 15],
      [3, "Analyzing your own code", 13],
    ]);
    expect(lessons[0]?.sections.map((s) => s.title)).toEqual([
      "What is Big-O?",
      "Why we ignore constants",
      "Worst case, average case, best case",
      "Lesson reflection",
      "✅ Quick check",
    ]);
    expect(lessons[0]?.markdown.startsWith("## Lesson 1 · What Big-O")).toBe(
      true,
    );
    // No separator left dangling at the end of a page.
    expect(lessons[0]?.markdown.trimEnd().endsWith("---")).toBe(false);
  });

  it("keeps the overview and the wrap-up whole, and the answer key apart", () => {
    expect(course.pages[0]?.markdown).toContain("## Course map");
    expect(course.pages[0]?.markdown).not.toContain("## Lesson 1");
    const wrap = course.pages[4]?.markdown ?? "";
    expect(wrap).toContain("## References");
    expect(wrap).toContain("## Related and interesting content");
    expect(wrap).not.toContain("Answer key");
    expect(course.answerKey?.startsWith("# Answer key")).toBe(true);
    for (const page of course.pages)
      expect(page.markdown).not.toContain("# Answer key");
  });
});

describe("splitCourse rules", () => {
  it("ignores headings inside fenced code", () => {
    const md = [
      "# T",
      "## Lesson 1 · Real",
      "```markdown",
      "## Lesson 2 · Fake",
      "### Not a section",
      "```",
      "### Real section",
    ].join("\n");
    const course = splitCourse(md);
    expect(course.pages.filter((p) => p.kind === "lesson")).toHaveLength(1);
    expect(course.pages[1]?.sections.map((s) => s.title)).toEqual([
      "Real section",
    ]);
  });

  it("gives repeated section titles distinct anchors", () => {
    const md =
      "## Lesson 1 · A\n### Common pitfalls\n## Lesson 2 · B\n### Common pitfalls\n### Common pitfalls";
    const second = splitCourse(md).pages[2];
    expect(second?.sections.map((s) => s.id)).toEqual([
      "common-pitfalls",
      "common-pitfalls-1",
    ]);
  });

  it("makes one overview page of a file without lessons", () => {
    const course = splitCourse("# Notes\n\nJust text.");
    expect(course.pages).toHaveLength(1);
    expect(course.answerKey).toBeNull();
  });

  it("slugs headings as anchors", () => {
    expect(headingSlug("O(n log n) — Linearithmic time")).toBe(
      "on-log-n-linearithmic-time",
    );
    expect(headingSlug("✅ Quick check")).toBe("quick-check");
  });
});
