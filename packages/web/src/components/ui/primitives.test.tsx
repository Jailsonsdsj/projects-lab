import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { Chip } from "./Chip";
import { Tabs } from "./Tabs";

describe("Button", () => {
  it("maps variant, tone and size onto the bundle's classes", () => {
    render(
      <Button variant="ghost" tone="neutral" size="sm">
        Add
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Add" })).toHaveClass(
      "btn btn--ghost btn--neutral btn--sm",
    );
  });

  it("ignores clicks while loading without becoming disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Saving" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("names an icon-only button by its aria-label", () => {
    render(<Button iconOnly icon="more" aria-label="More options" />);
    expect(screen.getByRole("button", { name: "More options" })).toHaveClass(
      "btn--icon",
    );
  });
});

describe("Chip", () => {
  it("is a toggle whose state is aria-pressed", async () => {
    function Filter() {
      const [on, setOn] = useState(false);
      return (
        <Chip pressed={on} count={6} onClick={() => setOn(!on)}>
          Not started
        </Chip>
      );
    }
    render(<Filter />);
    const chip = screen.getByRole("button", { name: "Not started 6" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Checkbox", () => {
  it("toggles from anywhere on its label", async () => {
    render(<Checkbox>Keep me signed in</Checkbox>);
    const box = screen.getByRole("checkbox", { name: "Keep me signed in" });
    await userEvent.click(screen.getByText("Keep me signed in"));
    expect(box).toBeChecked();
  });

  it("reports the mixed state as indeterminate and aria-checked=mixed", () => {
    const { rerender } = render(<Checkbox mixed>Select all</Checkbox>);
    const box = screen.getByRole<HTMLInputElement>("checkbox");
    expect(box.indeterminate).toBe(true);
    expect(box).toHaveAttribute("aria-checked", "mixed");
    rerender(
      <Checkbox checked onChange={() => {}}>
        Select all
      </Checkbox>,
    );
    expect(box.indeterminate).toBe(false);
    expect(box).toBeChecked();
  });
});

describe("Badge", () => {
  it("gives every semantic tone an icon and leaves neutral plain", () => {
    const { container } = render(
      <>
        <Badge tone="verified">Verified</Badge>
        <Badge>Neutral</Badge>
      </>,
    );
    const [verified, neutral] = container.querySelectorAll(".badge");
    expect(verified).toHaveClass("badge--verified");
    expect(verified?.querySelector("svg.icon")).not.toBeNull();
    expect(neutral?.querySelector("svg")).toBeNull();
  });
});

describe("Tabs", () => {
  const items = [
    { id: "all", label: "All", count: 8 },
    { id: "todo", label: "Not started", count: 6 },
    { id: "archived", label: "Archived", disabled: true },
    { id: "done", label: "Done", count: 1 },
  ] as const;

  function Harness() {
    const [value, setValue] = useState<(typeof items)[number]["id"]>("all");
    return (
      <Tabs
        label="Filter by status"
        items={items}
        value={value}
        onChange={setValue}
      />
    );
  }

  it("has one tab stop and moves selection with arrows, skipping disabled tabs", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(
      screen.getByRole("tablist", { name: "Filter by status" }),
    ).toBeInTheDocument();
    const all = screen.getByRole("tab", { name: "All 8" });
    expect(all).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Not started 6" })).toHaveAttribute(
      "tabindex",
      "-1",
    );

    await user.tab();
    expect(all).toHaveFocus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    const done = screen.getByRole("tab", { name: "Done 1" });
    expect(done).toHaveFocus();
    expect(done).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowRight}");
    expect(all).toHaveFocus();
    await user.keyboard("{End}");
    expect(done).toHaveFocus();
    await user.keyboard("{Home}");
    expect(all).toHaveAttribute("aria-selected", "true");
  });
});
