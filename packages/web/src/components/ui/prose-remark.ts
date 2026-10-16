// Course Markdown conventions (study-course-builder's course-template.md) turned
// into elements Prose renders with the bundle's classes. Works on the Markdown
// syntax tree, so formatting inside a callout or an option survives.
//
//   > **Tip:** text        → <x-callout kind="tip" label="Tip">
//   > **In this lesson**    → <x-callout kind="note" label="In this lesson">
//   1. Stem                → <x-quiz> with <x-quiz-stem> and one <x-quiz-option>
//      - A) option            per A–E line (only when every sub-item is lettered)
//   ![alt](src "caption")  → <figure> (+ <figcaption> when there is a caption)
import type {
  Blockquote,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
} from "mdast";
import { visit } from "unist-util-visit";

export type CalloutKind = "note" | "tip" | "warning" | "bridge" | "world";

const CALLOUT_LABELS: Record<string, CalloutKind> = {
  Note: "note",
  Tip: "tip",
  Warning: "warning",
  "Frontend bridge": "bridge",
  "In the real world": "world",
  // The template's objectives boxes read as notes.
  "In this course": "note",
  "In this lesson": "note",
};

const OPTION = /^([A-E])\)\s*/;

function textOf(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map(textOf).join("");
  }
  return "";
}

/** A node mdast doesn't know, rendered as `tagName` with these properties. */
function element(
  tagName: string,
  children: RootContent[] | PhrasingContent[],
  properties: Record<string, string> = {},
): Paragraph {
  return {
    type: "paragraph",
    children: children as PhrasingContent[],
    data: { hName: tagName, hProperties: properties },
  };
}

function callout(node: Blockquote) {
  const first = node.children[0];
  if (first?.type !== "paragraph") return;
  const lead = first.children[0];
  if (lead?.type !== "strong") return;
  const label = textOf(lead).trim().replace(/:$/, "");
  const kind = CALLOUT_LABELS[label];
  if (!kind) return;

  first.children.shift();
  const next = first.children[0];
  if (next?.type === "text") next.value = next.value.replace(/^[:\s]+/, "");
  if (next?.type === "break") first.children.shift();
  if (first.children.length === 0) node.children.shift();

  node.data = { hName: "x-callout", hProperties: { kind, label } };
}

function quiz(item: ListItem) {
  const [stem, options, ...rest] = item.children;
  if (stem?.type !== "paragraph" || options?.type !== "list") return;
  if (options.ordered || rest.length > 0) return;

  const parsed = options.children.map((option) => {
    const paragraph = option.children[0];
    const head =
      paragraph?.type === "paragraph" ? paragraph.children[0] : undefined;
    const letter =
      head?.type === "text" ? OPTION.exec(head.value)?.[1] : undefined;
    return { option, paragraph, head, letter };
  });
  const letters = parsed.map((p) => p.letter).join("");
  if (!"ABCDE".startsWith(letters) || letters.length < 2) return;

  item.children = [
    element("x-quiz", [
      element("x-quiz-stem", stem.children),
      ...parsed.map(({ paragraph, head, letter = "" }) => {
        if (head?.type === "text") head.value = head.value.replace(OPTION, "");
        return element("x-quiz-option", (paragraph as Paragraph).children, {
          letter,
        });
      }),
    ]),
  ];
}

function figure(paragraph: Paragraph) {
  const [image, ...rest] = paragraph.children;
  if (image?.type !== "image" || rest.some((n) => textOf(n).trim() !== ""))
    return;
  paragraph.children = image.title
    ? [
        image,
        element("figcaption", [
          { type: "text", value: image.title },
        ]) as never as PhrasingContent,
      ]
    : [image];
  paragraph.data = { hName: "figure" };
}

export function remarkCourse() {
  return (tree: Root) => {
    visit(tree, "blockquote", callout);
    visit(tree, "listItem", quiz);
    visit(tree, "paragraph", figure);
  };
}
