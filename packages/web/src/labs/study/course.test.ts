import { describe, expect, it } from "vitest";
import bigO from "../../../test/fixtures/big-o-notation__fast-track.md?raw";
import { headingSlug } from "../../components/ui";
import { parseChecks, splitCourse } from "./course";

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

  it("splits the answer key by lesson; the final-exam hint ends the wrap-up", () => {
    expect(Object.keys(course.answers)).toEqual(["1", "2", "3"]);
    expect(course.answers[1]?.startsWith("1. **B.** As n grows large")).toBe(
      true,
    );
    expect(course.answers[2]).toContain("Binary search halves");
    expect(course.answers[3]).not.toContain("Final exam");
    expect(course.pages[4]?.markdown).toContain("## 🏁 Final exam");
    for (const page of course.pages)
      expect(page.markdown).not.toContain(
        "Binary search halves the search space",
      );
  });
});

describe("parseChecks", () => {
  it("reads the real key question by question: letter, truths, model answer", () => {
    const lesson1 = splitCourse(bigO).checks[1];
    expect(lesson1?.[1]?.choice).toBe("B");
    expect(lesson1?.[1]?.explanation).toMatch(/^As n grows large/);
    expect(lesson1?.[2]?.truths).toEqual({
      I: false,
      II: true,
      III: false,
      IV: true,
      V: true,
    });
    expect(lesson1?.[2]?.explanation).toMatch(/^I: Big-O describes/);
    expect(lesson1?.[3]?.choice).toBeUndefined();
    expect(lesson1?.[3]?.truths).toBeUndefined();
    expect(lesson1?.[3]?.explanation).toMatch(/^"O\(n\)" only says/);
    expect(Object.keys(splitCourse(bigO).checks)).toEqual(["1", "2", "3"]);
  });

  it("takes other spellings, and keeps an item's indented code", () => {
    const checks = parseChecks(
      [
        "1. C) Because it halves.",
        "2. **I: True, II: False**",
        "3. **Model answer:** Use a Set:",
        "   ```js",
        "   1. not a new item",
        "   ```",
      ].join("\n"),
    );
    expect(checks[1]).toEqual({
      choice: "C",
      explanation: "Because it halves.",
    });
    expect(checks[2]?.truths).toEqual({ I: true, II: false });
    expect(checks[3]?.explanation).toBe(
      "Use a Set:\n```js\n1. not a new item\n```",
    );
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
