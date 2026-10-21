import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Input } from "./Input";
import { Textarea } from "./Textarea";

describe("Input", () => {
  it("is labelled without an id (generated id links the label)", () => {
    render(<Input label="Job title" />);
    const input = screen.getByLabelText("Job title");
    expect(input.tagName).toBe("INPUT");
    expect(input.id).not.toBe("");
  });

  it("keeps a caller's id", () => {
    render(<Input label="Company" id="company" />);
    expect(screen.getByLabelText("Company")).toHaveAttribute("id", "company");
  });

  it("keeps focus and typed text when an error appears and goes away", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Input label="LinkedIn URL" />);
    const input = screen.getByLabelText("LinkedIn URL");
    await user.type(input, "linkedin/sam");

    rerender(<Input label="LinkedIn URL" error="Start with https://" />);
    expect(screen.getByLabelText("LinkedIn URL")).toBe(input);
    expect(input).toHaveFocus();

    rerender(<Input label="LinkedIn URL" />);
    expect(input).toHaveFocus();
    await user.type(input, "!");
    expect(input).toHaveValue("linkedin/sam!");
  });

  it("announces the error and the hint through aria-describedby", () => {
    render(
      <Input
        label="LinkedIn URL"
        hint="Your public profile."
        error="Start with https://"
      />,
    );
    const input = screen.getByLabelText("LinkedIn URL");
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription(
      "Your public profile. Start with https://",
    );
  });

  it("marks required without adding the asterisk to the accessible name", () => {
    render(<Input label="Email" required />);
    expect(screen.getByRole("textbox", { name: "Email" })).toBeRequired();
  });
});

describe("Textarea", () => {
  it("is labelled without an id and keeps focus when an error appears", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Textarea label="Why this company?" />);
    const textarea = screen.getByLabelText("Why this company?");
    await user.click(textarea);
    rerender(
      <Textarea label="Why this company?" error="Write one sentence." />,
    );
    expect(textarea).toHaveFocus();
    expect(textarea).toHaveAccessibleDescription("Write one sentence.");
  });

  describe("resizable", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** jsdom lays nothing out: the text's height is whatever the test says. */
    function measured(content: () => number, box = 96) {
      vi.spyOn(
        HTMLTextAreaElement.prototype,
        "scrollHeight",
        "get",
      ).mockImplementation(content);
      vi.spyOn(
        HTMLTextAreaElement.prototype,
        "clientHeight",
        "get",
      ).mockImplementation(function (this: HTMLTextAreaElement) {
        return this.style.height ? Number.parseInt(this.style.height, 10) : box;
      });
    }

    function Answer({ resizable }: { resizable: boolean }) {
      const [text, setText] = useState("");
      return (
        <Textarea
          label="Your answer"
          rows={3}
          resizable={resizable}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      );
    }

    it("can be dragged taller and grows to fit what's typed, never shrinking", async () => {
      let height = 40;
      measured(() => height);
      const user = userEvent.setup();
      render(<Answer resizable />);
      const box = screen.getByLabelText("Your answer");
      expect(box.parentElement).toHaveClass("input--resizable");
      await user.type(box, "a");
      expect(box.style.height).toBe(""); // fits: nothing to do
      height = 240;
      await user.type(box, "b");
      expect(box.style.height).toBe("240px");
      height = 120; // text deleted: it keeps its size
      await user.type(box, "{backspace}");
      expect(box.style.height).toBe("240px");
    });

    it("stays as it was without the prop", async () => {
      measured(() => 240);
      const user = userEvent.setup();
      render(<Answer resizable={false} />);
      const box = screen.getByLabelText("Your answer");
      await user.type(box, "long");
      expect(box.style.height).toBe("");
      expect(box.parentElement).not.toHaveClass("input--resizable");
    });

    it("still hands its ref on", () => {
      const ref = createRef<HTMLTextAreaElement>();
      render(<Textarea label="Notes" resizable ref={ref} />);
      expect(ref.current).toBe(screen.getByLabelText("Notes"));
    });
  });
});
