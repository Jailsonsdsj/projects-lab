// Anchors for course headings: Prose gives every H3 this id (deduplicated in
// document order), and a reader's outline links to the same ids.
import type { Element, Root, RootContent } from "hast";

/** "O(n log n) — Linearithmic time" → "on-log-n-linearithmic-time". */
export function headingSlug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-") || "section"
  );
}

/** Ids for a list of H3 titles, as Prose assigns them: repeats get -1, -2… */
export function headingIds(titles: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return titles.map((title) => {
    const base = headingSlug(title);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  });
}

function textOf(node: Root | RootContent): string {
  if (node.type === "text") return node.value;
  return "children" in node
    ? (node.children as RootContent[]).map(textOf).join("")
    : "";
}

/** rehype: an id on every H3, from its text. */
export function rehypeHeadingIds() {
  return (tree: Root) => {
    const h3s: Element[] = [];
    const walk = (node: Root | Element) => {
      for (const child of node.children) {
        if (child.type !== "element") continue;
        if (child.tagName === "h3") h3s.push(child);
        walk(child);
      }
    };
    walk(tree);
    const ids = headingIds(h3s.map((h) => textOf(h).trim()));
    h3s.forEach((h, i) => {
      h.properties.id = ids[i];
    });
  };
}
