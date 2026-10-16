import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as ui from "../components/ui";
import { CATALOG } from "./catalog";
import { KitchenSink } from "./KitchenSink";

/** Visual components: PascalCase function exports (constants like ICONS are all caps). */
const exported = Object.entries(ui)
  .filter(
    ([name, value]) => /^[A-Z][a-z]/.test(name) && typeof value === "function",
  )
  .map(([name]) => (name === "ToastProvider" ? "Toast" : name))
  .sort();

describe("/dev/ui catalog", () => {
  it("has exactly one entry per component exported from components/ui", () => {
    expect(CATALOG.map((entry) => entry.name).sort()).toEqual(exported);
  });

  it("labels every example uniquely within its component", () => {
    for (const entry of CATALOG) {
      const labels = entry.examples.map((e) => e.label);
      expect(new Set(labels).size, entry.name).toBe(labels.length);
      expect(labels.length, entry.name).toBeGreaterThan(0);
    }
  });

  it("renders every component and every example", () => {
    const { container } = render(
      <ui.ToastProvider>
        <KitchenSink />
      </ui.ToastProvider>,
    );
    for (const entry of CATALOG) {
      const section = screen.getByRole("region", { name: entry.name });
      expect(section.querySelectorAll(".ks-cell")).toHaveLength(
        entry.examples.length,
      );
    }
    const cells = container.querySelectorAll(".ks-cell");
    for (const cell of cells) {
      expect(cell.children.length, cell.textContent ?? "").toBeGreaterThan(1);
    }
  });
});
