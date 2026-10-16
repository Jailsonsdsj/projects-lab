import { describe, expect, it } from "vitest";
import doc from "../../../../docs/design-system.md?raw";
import { UI_COMPONENTS, UI_HELPERS } from "./ui-exports";

// docs/design-system.md is the inventory of components/ui. Every runtime export
// is listed exactly once, as a table row (components) or on the Helpers line,
// and nothing listed there is gone from the code.

const DOC = "docs/design-system.md";
const inventory = doc.split(/^## Inventory$/m)[1]?.split(/^## /m)[0] ?? "";

const codeNames = (text: string) =>
  [...text.matchAll(/`([A-Za-z_]\w*)`/g)].map((m) => m[1] as string);

/** First cell of each inventory row, e.g. | `Button` | … */
const rows = [...inventory.matchAll(/^\| `(\w+)` \|/gm)]
  .map((m) => m[1] as string)
  .sort();

const helpers = codeNames(
  inventory.match(/^Helpers \(no UI\):(.*)$/m)?.[1] ?? "",
).sort();

/** "**In the bundle, not built yet:** Select (…), SearchField (…), …, Banner. …" */
const notBuilt = (
  inventory.match(/^\*\*In the bundle, not built yet:\*\*(.*)$/m)?.[1] ?? ""
)
  .replace(/\([^)]*\)/g, "")
  .split(".")[0]
  ?.split(",")
  .map((name) => name.trim())
  .filter(Boolean);

const missing = (from: readonly string[], listed: readonly string[]) =>
  from.filter((name) => !listed.includes(name));

describe(`${DOC} inventory`, () => {
  it("is found where the check expects it", () => {
    expect(rows.length, "inventory table rows").toBeGreaterThan(10);
    expect(helpers.length, "the Helpers (no UI): line").toBeGreaterThan(0);
    expect(notBuilt?.length, "the not-built-yet line").toBeGreaterThan(0);
  });

  it("has a row for every component components/ui exports, and no other", () => {
    expect(
      missing(UI_COMPONENTS, rows),
      `exported but not in the Inventory table of ${DOC}: add a row`,
    ).toEqual([]);
    expect(
      missing(rows, UI_COMPONENTS),
      `in the Inventory table of ${DOC} but not exported from components/ui`,
    ).toEqual([]);
  });

  it("lists every other export on the Helpers line, and no other", () => {
    expect(
      missing(UI_HELPERS, helpers),
      `exported but not on the Helpers (no UI): line of ${DOC}`,
    ).toEqual([]);
    expect(
      missing(helpers, UI_HELPERS),
      `on the Helpers (no UI): line of ${DOC} but not exported from components/ui`,
    ).toEqual([]);
  });

  it("doesn't call a built component unbuilt", () => {
    expect(
      notBuilt?.filter((name) => UI_COMPONENTS.includes(name)),
      `exported, so move it from "not built yet" to a row in ${DOC}`,
    ).toEqual([]);
  });
});
