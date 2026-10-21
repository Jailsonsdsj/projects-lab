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

  it("makes every quick-check question a quiz: A–E choice, I–V true/false, open", () => {
    const root = renderCourse();
    const quizzes = [...root.querySelectorAll("section.quiz")];
    const lessons = (course.match(/^### ✅ Quick check/gm) ?? []).length;
    expect(quizzes).toHaveLength(lessons * 3);
    const choice = quizzes.filter((q) => q.querySelector(".quiz__opts"));
    const truefalse = quizzes.filter((q) => q.querySelector(".quiz__stmts"));
    expect(choice).toHaveLength(lessons);
    expect(truefalse).toHaveLength(lessons);
    for (const quiz of choice) {
      const letters = [...quiz.querySelectorAll(".quiz__letter")].map(
        (l) => l.textContent,
      );
      expect(letters).toEqual(["A", "B", "C", "D", "E"]);
      expect(
        within(quiz as HTMLElement).getByRole("radiogroup"),
      ).toBeInTheDocument();
    }
    for (const quiz of truefalse)
      expect(
        [...quiz.querySelectorAll(".quiz__letter")].map((l) => l.textContent),
      ).toEqual(["I", "II", "III", "IV", "V"]);
    expect(root.textContent).toContain("Big-O measures exact running time");
    // Lists outside a quick check stay lists.
    expect(root.querySelectorAll("li").length).toBeGreaterThan(20);
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

  const CHECK = [
    "### ✅ Quick check",
    "",
    "1. Pick one",
    "   - A) First",
    "   - B) Second",
    "   - C) Third",
    "2. True or false?",
    "   - I. Sky is blue",
    "   - II. Fire is cold",
    "3. Which one runs?",
    "   ```js",
    "   run();",
    "   ```",
    "   - A) This",
    "   - B) That",
    "4. Explain why.",
  ].join("\n");
  const ANSWERS = {
    1: { choice: "B", explanation: "Because **second**." },
    2: { truths: { I: true, II: false }, explanation: "II: it burns." },
    3: { choice: "A", explanation: "" },
    4: { explanation: "Because it is." },
  };

  it("checks a choice as soon as it's picked: right green, wrong red, why", async () => {
    const user = userEvent.setup();
    render(<Prose markdown={CHECK} answers={ANSWERS} />);
    const group = screen.getByRole("radiogroup", { name: "Pick one" });
    const options = group.querySelectorAll(".quiz__opt");
    await user.click(within(group).getByLabelText(/Third/));
    expect(options[2]).toHaveClass("is-wrong");
    expect(options[1]).toHaveClass("is-correct");
    expect(screen.getByText("Not quite: the answer is B.")).toBeInTheDocument();
    expect(screen.getByText("second").tagName).toBe("STRONG");
    // Answered: it stays as answered until Try again.
    await user.click(within(group).getByLabelText(/First/));
    expect(options[0]).not.toHaveClass("is-wrong");
    expect(options[2]).toHaveClass("is-wrong");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(group.querySelector(".is-wrong, .is-correct")).toBeNull();
    await user.click(within(group).getByLabelText(/Second/));
    expect(options[1]).toHaveClass("is-correct");
    expect(screen.getByText("Correct.")).toBeInTheDocument();
  });

  it("checks a code question with options after the code", async () => {
    const user = userEvent.setup();
    render(<Prose markdown={CHECK} answers={ANSWERS} />);
    const group = screen.getByRole("radiogroup", { name: "Which one runs?" });
    const quiz = group.closest("section") as HTMLElement;
    expect(quiz.querySelector(".codeblock")).not.toBeNull();
    await user.click(within(group).getByLabelText(/This/));
    expect(within(quiz).getByText("Correct.")).toBeInTheDocument();
  });

  it("checks each true/false statement when marked, then scores and explains", async () => {
    const user = userEvent.setup();
    render(<Prose markdown={CHECK} answers={ANSWERS} />);
    const sky = screen.getByRole("radiogroup", { name: "Sky is blue" });
    const fire = screen.getByRole("radiogroup", { name: "Fire is cold" });
    await user.click(within(sky).getByLabelText("True"));
    expect(sky).toHaveClass("is-correct");
    expect(screen.queryByText("II: it burns.")).toBeNull();
    await user.click(within(fire).getByLabelText("True"));
    expect(fire).toHaveClass("is-wrong");
    expect(within(fire).getByText("It's false")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 right.")).toBeInTheDocument();
    expect(screen.getByText("II: it burns.")).toBeInTheDocument();
    // A marked statement can't be changed to the answer just shown.
    await user.click(within(fire).getByLabelText("False"));
    expect(fire).toHaveClass("is-wrong");
  });

  it("shows an open question's model answer, then marks it as the reader judges", async () => {
    const user = userEvent.setup();
    render(<Prose markdown={CHECK} answers={ANSWERS} />);
    expect(screen.queryByText("Because it is.")).toBeNull();
    await user.type(screen.getByLabelText(/Your answer/), "No idea");
    await user.click(screen.getByRole("button", { name: "Show model answer" }));
    expect(screen.getByText("Because it is.")).toBeInTheDocument();
    expect(screen.getByText("Did you get it?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Missed it" }));
    expect(
      screen.getByText("Because it is.").closest(".quiz__answer"),
    ).toHaveClass("is-wrong");
  });

  it("without answers, takes a selection but checks nothing", async () => {
    const user = userEvent.setup();
    render(<Prose markdown={CHECK} />);
    const sky = screen.getByRole("radiogroup", { name: "Sky is blue" });
    await user.click(within(sky).getByLabelText("False"));
    expect(sky).not.toHaveClass("is-wrong");
    expect(within(sky).getByLabelText("False")).toBeChecked();
    expect(
      screen.queryByRole("button", { name: "Show model answer" }),
    ).toBeNull();
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
