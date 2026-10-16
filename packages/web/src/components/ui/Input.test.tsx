import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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
});
