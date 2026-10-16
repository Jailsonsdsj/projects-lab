import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import course from "../../../test/fixtures/big-o-notation__fast-track.md?raw";
import { Prose } from "./Prose";

// The real Big-O course from cs-learning-lab, written to course-template.md.
// Fences may be indented inside list items.
const COURSE_FENCES = (course.match(/^\s*```/gm) ?? []).length / 2;
const COURSE_CALLOUTS = (course.match(/^> \*\*/gm) ?? []).length;

afterEach(() => {
  document.documentElement.removeAttribute("style");
  vi.useRealTimers();
});

describe("Prose with a real course", () => {
  const renderCourse = () => render(<Prose markdown={course} />).container;

  it("renders headings, and nothing with an inline style (tokens only)", () => {
    const root = renderCourse();
    expect(
      screen.getByRole("heading", { level: 1, name: "Big-O Notation" }),
    ).toBeInTheDocument();
    expect(root.querySelectorAll("h2").length).toBeGreaterThan(3);
    expect(root.querySelectorAll("h3").length).toBeGreaterThan(5);
    expect(root.querySelectorAll("[style]")).toHaveLength(0);
  });

  it("turns every bold-labelled blockquote into a callout", () => {
    const root = renderCourse();
    const callouts = root.querySelectorAll("blockquote.callout");
    expect(callouts).toHaveLength(COURSE_CALLOUTS);
    const labels = [...callouts].map(
      (c) => c.querySelector(".callout__label")?.textContent,
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        "Note",
        "Tip",
        "Frontend bridge",
        "In this lesson",
      ]),
    );
    const bridge = [...callouts].find((c) =>
      c.textContent?.includes("Frontend bridge"),
    );
    expect(bridge).toHaveClass("callout--bridge");
    expect(bridge?.querySelector(".callout__body p")?.textContent).toMatch(
      /^You already reason/,
    );
    expect(root.textContent).not.toMatch(/\*\*Note:\*\*|Frontend bridge:/);
  });

  it("renders each fenced block as a labelled code block with token colours", () => {
    const root = renderCourse();
    const blocks = root.querySelectorAll(".codeblock");
    expect(blocks).toHaveLength(COURSE_FENCES);
    const langs = [...blocks].map(
      (b) => b.querySelector(".codeblock__lang")?.textContent,
    );
    expect(langs).toContain("javascript");
    expect(langs).toContain("mermaid");
    const js = [...blocks].find(
      (b) => b.querySelector(".codeblock__lang")?.textContent === "javascript",
    );
    expect(js?.querySelector("pre .tk-k")).not.toBeNull();
    const mermaid = [...blocks].find(
      (b) => b.querySelector(".codeblock__lang")?.textContent === "mermaid",
    );
    expect(mermaid?.querySelector("[class^='tk-']")).toBeNull();
  });

  it("wraps every table in .tablewrap", () => {
    const root = renderCourse();
    const tables = root.querySelectorAll("table");
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables)
      expect(table.parentElement).toHaveClass("tablewrap");
  });

  it("turns lettered A–E options into quick-check questions; other lists stay lists", () => {
    const root = renderCourse();
    const quizzes = root.querySelectorAll("section.quiz");
    expect(quizzes.length).toBe((course.match(/^ {3}- A\) /gm) ?? []).length);
    for (const quiz of quizzes) {
      const letters = [...quiz.querySelectorAll(".quiz__letter")].map(
        (l) => l.textContent,
      );
      expect(letters).toEqual(["A", "B", "C", "D", "E"]);
      expect(
        within(quiz as HTMLElement).getByRole("radiogroup"),
      ).toBeInTheDocument();
    }
    expect(root.textContent).toContain("I. Big-O measures exact running time");
  });
});

describe("Prose details", () => {
  it("selects one quiz option at a time", async () => {
    const user = userEvent.setup();
    render(
      <Prose
        markdown={"1. Pick one\n   - A) First\n   - B) Second\n   - C) Third"}
      />,
    );
    const group = screen.getByRole("radiogroup", { name: "Pick one" });
    await user.click(within(group).getByLabelText(/Second/));
    const options = group.querySelectorAll(".quiz__opt");
    expect(options[1]).toHaveClass("is-selected");
    await user.click(within(group).getByLabelText(/Third/));
    expect(options[1]).not.toHaveClass("is-selected");
    expect(options[2]).toHaveClass("is-selected");
  });

  it("copies a code block and says so for --duration-copied-hold", async () => {
    document.documentElement.style.setProperty(
      "--duration-copied-hold",
      "2000ms",
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    vi.useFakeTimers();
    render(<Prose markdown={"```ts\nconst x = 1;\n```"} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    });
    expect(writeText).toHaveBeenCalledWith("const x = 1;");
    const copied = screen.getByRole("button", { name: "Copied" });
    expect(copied).toHaveClass("btn--copied");
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("button", { name: "Copy code" })).not.toHaveClass(
      "btn--copied",
    );
  });

  it("sets right-aligned columns as numbers and puts a captioned image in a figure", () => {
    const { container } = render(
      <Prose
        markdown={
          '| Class | n = 1,000 |\n|---|---:|\n| `O(1)` | 1 |\n\n![Growth curves](/growth.svg "Growth as n increases")'
        }
      />,
    );
    expect(container.querySelector("td:last-child")).toHaveClass("num");
    expect(container.querySelector("td:first-child")).not.toHaveClass("num");
    const figure = container.querySelector("figure");
    expect(figure?.querySelector("img")).toHaveAttribute(
      "alt",
      "Growth curves",
    );
    expect(figure?.querySelector("figcaption")).toHaveTextContent(
      "Growth as n increases",
    );
    expect(container.querySelector("p > figure")).toBeNull();
  });

  it("never renders raw HTML from the Markdown", () => {
    const { container } = render(
      <Prose
        markdown={'<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">'}
      />,
    );
    expect(container.querySelector("script, img[onerror]")).toBeNull();
  });
});
