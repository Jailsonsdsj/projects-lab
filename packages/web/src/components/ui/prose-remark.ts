// Course Markdown conventions (study-course-builder's course-template.md) turned
// into elements Prose renders with the bundle's classes. Works on the Markdown
// syntax tree, so formatting inside a callout or an option survives.
//
//   > **Tip:** text        → <x-callout kind="tip" label="Tip">
//   > **In this lesson**    → <x-callout kind="note" label="In this lesson">
//   1. Stem                → <x-quiz kind="choice"> with <x-quiz-stem> and one
//      - A) option            <x-quiz-option> per A–E line (only when every
//                             sub-item is lettered)
//   ### ✅ Quick check     → the ordered list after it is the lesson's check, each
//   1. …                     item an <x-quiz n="1"> numbered as the answer key is:
//                             "choice" (A–E, code allowed before the options),
//                             "truefalse" (I–V statements, <x-quiz-statement>)
//                             or "open" (anything else)
//   ![alt](src "caption")  → <figure> (+ <figcaption> when there is a caption)
import type {
  Blockquote,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Text,
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

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const STATEMENT = /^(X|IX|IV|V?I{0,3})\.\s+/;

interface Mark {
  paragraph: Paragraph;
  head: Text;
  key: string;
}

/** Each sub-item's leading mark ("A)", "II."), or null when one has none. */
function marks(list: List, pattern: RegExp): Mark[] | null {
  const out: Mark[] = [];
  for (const option of list.children) {
    const paragraph = option.children[0];
    if (paragraph?.type !== "paragraph") return null;
    const head = paragraph.children[0];
    const key = head?.type === "text" ? pattern.exec(head.value)?.[1] : "";
    if (!key || head?.type !== "text") return null;
    out.push({ paragraph, head, key });
  }
  return out;
}

/** Marks that run in order from the first (A, B, C… or I, II, III…), two or more. */
function inOrder(found: Mark[] | null, keys: readonly string[]) {
  return found && found.length >= 2 && found.every((m, i) => m.key === keys[i])
    ? found
    : null;
}

function strip(found: Mark[], pattern: RegExp) {
  for (const { head } of found) head.value = head.value.replace(pattern, "");
}

/** A question: lettered options anywhere; numbered `n`, inside a quick check,
 *  also true/false statements and open questions. */
function quiz(item: ListItem, n?: number) {
  const [stem, ...rest] = item.children;
  if (stem?.type !== "paragraph" || stem.data?.hName) return;
  const list = rest.at(-1);
  const between = rest.slice(0, -1);
  const numbered: Record<string, string> =
    n === undefined ? {} : { n: String(n) };

  if (list?.type === "list" && !list.ordered) {
    // Outside a quick check, only the template's plain shape: stem, then options.
    const options =
      n === undefined && between.length > 0
        ? null
        : inOrder(marks(list, OPTION), "ABCDE".split(""));
    if (options) {
      strip(options, OPTION);
      item.children = [
        element(
          "x-quiz",
          [
            element("x-quiz-stem", stem.children),
            ...between,
            element(
              "x-quiz-options",
              options.map(({ paragraph, key }) =>
                element("x-quiz-option", paragraph.children, { letter: key }),
              ),
            ),
          ],
          { kind: "choice", ...numbered },
        ),
      ];
      return;
    }
    const statements =
      n === undefined ? null : inOrder(marks(list, STATEMENT), ROMAN);
    if (statements) {
      strip(statements, STATEMENT);
      item.children = [
        element(
          "x-quiz",
          [
            element("x-quiz-stem", stem.children),
            ...between,
            element(
              "x-quiz-statements",
              statements.map(({ paragraph, key }) =>
                element("x-quiz-statement", paragraph.children, {
                  numeral: key,
                }),
              ),
            ),
          ],
          { kind: "truefalse", ...numbered },
        ),
      ];
      return;
    }
  }
  if (n === undefined) return;
  item.children = [
    element("x-quiz", [element("x-quiz-stem", stem.children), ...rest], {
      kind: "open",
      ...numbered,
    }),
  ];
}

/** The ordered list after a "Quick check" heading: its questions, numbered. */
function quickChecks(tree: Root) {
  let inCheck = false;
  for (const node of tree.children) {
    if (node.type === "heading") inCheck = /quick check/i.test(textOf(node));
    else if (inCheck && node.type === "list" && node.ordered) {
      const first = node.start ?? 1;
      for (const [i, item] of node.children.entries()) quiz(item, first + i);
      inCheck = false;
    }
  }
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
    quickChecks(tree);
    visit(tree, "listItem", (item: ListItem) => quiz(item));
    visit(tree, "paragraph", figure);
  };
}
