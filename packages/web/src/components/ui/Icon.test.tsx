import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "./Icon";
import { ICONS, type IconName } from "./icons";

describe("Icon", () => {
  it("is hidden from assistive tech without a label", () => {
    const { container } = render(<Icon name="search" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("icon");
  });

  it("is an image named by its label", () => {
    render(<Icon name="copy" size="sm" label="Copy" />);
    const img = screen.getByRole("img", { name: "Copy" });
    expect(img).toHaveClass("icon", "icon--sm");
  });

  it("draws every icon in the set", () => {
    for (const name of Object.keys(ICONS) as IconName[]) {
      const { container, unmount } = render(<Icon name={name} />);
      expect(
        container.querySelectorAll("path, circle, rect").length,
      ).toBeGreaterThan(0);
      unmount();
    }
  });
});
