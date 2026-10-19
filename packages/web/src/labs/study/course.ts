// A course file split into the reader's pages (docs/prd/11-study-courses.md
// § The course file): the overview before the first lesson, one page per
// `## Lesson n · title`, and the wrap-up (the H2s after the lessons). The
// answer key, from the rule before `# Answer key`, is kept apart. Headings
// inside fenced code blocks don't count.
import { headingIds } from "../../components/ui";

export interface Section {
  /** The H3's text, and its anchor in the page. */
  title: string;
  id: string;
}

export type CoursePage =
  | { kind: "overview"; title: string; markdown: string; sections: Section[] }
  | {
      kind: "lesson";
      n: number;
      title: string;
      /** From the lesson's `⏱ 12 min` badge, when it has one. */
      minutes: number | null;
      markdown: string;
      sections: Section[];
    }
  | { kind: "wrapup"; title: string; markdown: string; sections: Section[] };

export interface Course {
  /** The H1, else null. */
  title: string | null;
  pages: CoursePage[];
  /** From `# Answer key` to the end; null when the file has none. */
  answerKey: string | null;
}

const LESSON = /^## Lesson (\d+)\s*[·:—-]\s*(.+?)\s*$/;
const FENCE = /^\s*(```|~~~)/;
const MINUTES = /⏱\s*(\d+)\s*min/;

/** Each line, with whether it sits inside a fenced code block. */
function scan(markdown: string): { line: string; code: boolean }[] {
  let fence: string | null = null;
  return markdown.split("\n").map((line) => {
    const open = FENCE.exec(line);
    if (fence) {
      if (open && open[1] === fence) fence = null;
      return { line, code: true };
    }
    if (open) {
      fence = open[1] ?? null;
      return { line, code: true };
    }
    return { line, code: false };
  });
}

/** A page's H3s with the ids Prose gives them (the same helper). */
function sectionsOf(lines: { line: string; code: boolean }[]): Section[] {
  const titles = lines
    .filter(({ line, code }) => !code && line.startsWith("### "))
    .map(({ line }) => plain(line.slice(4)));
  const ids = headingIds(titles);
  return titles.map((title, i) => ({ title, id: ids[i] as string }));
}

/** A heading's text as Prose shows it: inline code and emphasis marks dropped. */
function plain(markdown: string): string {
  return markdown.replace(/[`*_]/g, "").trim();
}

/** Drops trailing blank lines and horizontal rules (the template's separators). */
function trimEnd(lines: { line: string; code: boolean }[]) {
  const out = [...lines];
  while (out.length && /^\s*(---+)?\s*$/.test(out.at(-1)?.line ?? ""))
    out.pop();
  return out;
}

const text = (lines: { line: string }[]) => lines.map((l) => l.line).join("\n");

export function splitCourse(markdown: string): Course {
  const lines = scan(markdown.replace(/\r\n/g, "\n"));

  // The answer key: from the `# Answer key` H1 (outside code) to the end.
  const keyAt = lines.findIndex(
    ({ line, code }) => !code && /^# Answer key\s*$/.test(line),
  );
  const body = trimEnd(keyAt === -1 ? lines : lines.slice(0, keyAt));
  const answerKey = keyAt === -1 ? null : text(lines.slice(keyAt)).trim();

  const h1 = body.find(({ line, code }) => !code && line.startsWith("# "));
  const lessonStarts = body
    .map((l, i) => ({ ...l, i }))
    .filter(({ line, code }) => !code && LESSON.test(line))
    .map(({ i }) => i);

  if (lessonStarts.length === 0) {
    const all = trimEnd(body);
    return {
      title: h1 ? h1.line.slice(2).trim() : null,
      pages: [
        {
          kind: "overview",
          title: "Overview",
          markdown: text(all),
          sections: sectionsOf(all),
        },
      ],
      answerKey,
    };
  }

  const pages: CoursePage[] = [];
  const overview = trimEnd(body.slice(0, lessonStarts[0]));
  pages.push({
    kind: "overview",
    title: "Overview",
    markdown: text(overview),
    sections: sectionsOf(overview),
  });

  // The wrap-up starts at the first H2 after the last lesson that isn't a lesson.
  const lastLesson = lessonStarts.at(-1) as number;
  const afterLast = body.findIndex(
    ({ line, code }, i) =>
      i > lastLesson && !code && line.startsWith("## ") && !LESSON.test(line),
  );

  lessonStarts.forEach((start, k) => {
    const end =
      lessonStarts[k + 1] ?? (afterLast === -1 ? body.length : afterLast);
    const chunk = trimEnd(body.slice(start, end));
    const [, n, title] = LESSON.exec(chunk[0]?.line ?? "") ?? [];
    const minutes = MINUTES.exec(text(chunk.slice(1, 4)));
    pages.push({
      kind: "lesson",
      n: Number(n),
      title: title ?? "",
      minutes: minutes ? Number(minutes[1]) : null,
      markdown: text(chunk),
      sections: sectionsOf(chunk),
    });
  });

  if (afterLast !== -1) {
    const wrap = trimEnd(body.slice(afterLast));
    pages.push({
      kind: "wrapup",
      title: (wrap[0]?.line ?? "## Wrap-up").slice(3).trim(),
      markdown: text(wrap),
      sections: sectionsOf(wrap),
    });
  }

  return { title: h1 ? h1.line.slice(2).trim() : null, pages, answerKey };
}
