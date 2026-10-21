// The Guide tab (docs/user-guide.md, rendered as it is). The file is bundled
// at build time, so the app and the document never differ and it reads
// offline. Its H2s are the parts, shown as tabs; "Contents" is the file's own
// list of them, so the app leaves it out.

import source from "../../../../docs/user-guide.md?raw";
import { headingIds } from "../components/ui";

export interface GuidePart {
  /** The part's anchor in the file, and its `?view=` in the app. */
  id: string;
  title: string;
  /** Its sections, one heading level up (### → ##), as the app renders them. */
  markdown: string;
  /** Every heading id Prose gives it (H2 and H3 after the shift). */
  anchors: string[];
}

export interface Guide {
  /** The text before the first part (the file's H1 left out: the page has its title). */
  intro: string;
  parts: GuidePart[];
}

/** Where the file's links to other repo files open: the public repository. */
export const GUIDE_REPO =
  "https://github.com/Jailsonsdsj/projects-lab/blob/main/docs/";

const HEADING = /^(#{1,6})\s+(.*)$/;
/** A heading's text as Prose sees it: inline code kept, emphasis marks dropped. */
const plainText = (text: string) => text.replace(/[`*_]/g, "").trim();

export function parseGuide(markdown: string): Guide {
  const intro: string[] = [];
  const parts: { title: string; lines: string[] }[] = [];
  for (const line of markdown.split("\n")) {
    const heading = HEADING.exec(line);
    if (heading?.[1] === "#") continue;
    if (heading?.[1] === "##") {
      parts.push({ title: plainText(heading[2] ?? ""), lines: [] });
      continue;
    }
    const target = parts.at(-1)?.lines ?? intro;
    // One level up: a part's ### sections render as the page's H2s.
    target.push(heading ? `${heading[1]?.slice(1)} ${heading[2]}` : line);
  }
  const clean = (lines: string[]) =>
    lines
      .join("\n")
      .replace(/(\n\s*---\s*)+\s*$/, "")
      .trim();
  return {
    intro: clean(intro),
    parts: parts
      .filter((part) => part.title !== "Contents")
      .map((part) => {
        const body = clean(part.lines);
        const titles = body
          .split("\n")
          .map((line) => HEADING.exec(line))
          .filter(
            (h): h is RegExpExecArray => h?.[1] === "##" || h?.[1] === "###",
          )
          .map((h) => plainText(h[2] ?? ""));
        return {
          id: headingIds([part.title])[0] ?? "",
          title: part.title,
          markdown: body,
          anchors: headingIds(titles),
        };
      }),
  };
}

export const GUIDE = parseGuide(source);

/** The in-app path for a part, and a heading in it. The first part is the bare tab. */
export function guidePath(partId: string, anchor?: string): string {
  const first = GUIDE.parts[0]?.id;
  const query = partId === first ? "" : `?view=${partId}`;
  return `/guide${query}${anchor ? `#${anchor}` : ""}`;
}

/**
 * A link in the file, made to work in the app: `#anchor` opens the part that
 * has it; another repo file opens on GitHub; web links stay as they are.
 */
export function resolveGuideLink(href: string, guide: Guide = GUIDE): string {
  if (href.startsWith("#")) {
    const anchor = href.slice(1);
    const part = guide.parts.find(
      (p) => p.id === anchor || p.anchors.includes(anchor),
    );
    if (!part) return href;
    return guidePath(part.id, part.id === anchor ? undefined : anchor);
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("/")) return href;
  return new URL(href, GUIDE_REPO).href;
}
