// A course file split into the reader's pages (docs/prd/11-study-courses.md
// § The course file): the overview before the first lesson, one page per
// `## Lesson n · title`, and the wrap-up (the H2s after the lessons). The
// answer key, from the rule before `# Answer key`, is kept apart. Headings
// inside fenced code blocks don't count.
import { headingIds, type QuickCheckAnswer } from "../../components/ui";

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
  /** Each lesson's answers (its `## Lesson n` section of the key), by number. */
  answers: Record<number, string>;
  /** The same, read question by question for the quick checks: lesson → question → answer. */
  checks: Record<number, Record<number, QuickCheckAnswer>>;
}

const ITEM = /^(\d+)[.)]\s+/;
const CHOICE = /^\*\*([A-E])[.)]?\*\*[.):]?\s*|^([A-E])[.)]\s+/;
const NUMERAL = "(?:X|IX|IV|V?I{1,3}|V)";
const TRUTHS = new RegExp(
  `^\\**((?:${NUMERAL}\\s*[-–—:=]\\s*(?:T|F|True|False)\\b[\\s,;]*)+)\\**\\.?\\s*`,
);
const TRUTH = new RegExp(`(${NUMERAL})\\s*[-–—:=]\\s*(T|F|True|False)\\b`, "g");
const MODEL = /^\*\*Model answer:?\*\*:?\s*/i;

/** One lesson's answers, question by question: `1. **B.** why`,
 *  `2. I-F, II-T… why`, `3. **Model answer:** text`. Continuation lines
 *  (indented, code included) belong to the item above. */
export function parseChecks(
  markdown: string,
): Record<number, QuickCheckAnswer> {
  const items: { n: number; lines: string[] }[] = [];
  for (const { line, code } of scan(markdown)) {
    const start = code ? null : ITEM.exec(line);
    if (start) {
      items.push({ n: Number(start[1]), lines: [line.slice(start[0].length)] });
      continue;
    }
    const item = items.at(-1);
    if (!item) continue;
    // Indented under the item's marker: drop that indent.
    item.lines.push(line.replace(/^ {1,4}/, ""));
  }

  const checks: Record<number, QuickCheckAnswer> = {};
  for (const { n, lines } of items) {
    const body = lines.join("\n").trim();
    const choice = CHOICE.exec(body);
    if (choice) {
      checks[n] = {
        choice: choice[1] ?? choice[2],
        explanation: body.slice(choice[0].length).trim(),
      };
      continue;
    }
    const truths = TRUTHS.exec(body);
    if (truths) {
      const found: Record<string, boolean> = {};
      for (const [, numeral, value] of (truths[1] ?? "").matchAll(TRUTH))
        found[numeral as string] = value?.startsWith("T") ?? false;
      checks[n] = {
        truths: found,
        explanation: body.slice(truths[0].length).trim(),
      };
      continue;
    }
    checks[n] = { explanation: body.replace(MODEL, "").trim() };
  }
  return checks;
}

/** The answer key's `## Lesson n` sections by number, and what follows them
 *  (the template's "🏁 Final exam" hint), which belongs on the wrap-up page. */
function splitAnswers(key: string): {
  answers: Record<number, string>;
  rest: string;
} {
  const lines = scan(key);
  const starts = lines
    .map((l, i) => ({ ...l, i }))
    .filter(({ line, code }) => !code && line.startsWith("## "))
    .map(({ i }) => i);
  const answers: Record<number, string> = {};
  const rest: string[] = [];
  starts.forEach((start, k) => {
    const end = starts[k + 1] ?? lines.length;
    const chunk = trimEnd(lines.slice(start + 1, end));
    const lesson = /^## Lesson (\d+)\s*$/.exec(lines[start]?.line ?? "");
    if (lesson) answers[Number(lesson[1])] = text(chunk).trim();
    else rest.push(text(trimEnd(lines.slice(start, end))));
  });
  return { answers, rest: rest.join("\n\n").trim() };
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
  const { answers, rest } = answerKey
    ? splitAnswers(text(lines.slice(keyAt + 1)))
    : { answers: {}, rest: "" };

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
      answers,
      checks: checksOf(answers),
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
      // The key's closing hint ("🏁 Final exam") ends the wrap-up.
      markdown: rest ? `${text(wrap)}\n\n${rest}` : text(wrap),
      sections: sectionsOf(wrap),
    });
  }

  return {
    title: h1 ? h1.line.slice(2).trim() : null,
    pages,
    answerKey,
    answers,
    checks: checksOf(answers),
  };
}

function checksOf(answers: Record<number, string>) {
  return Object.fromEntries(
    Object.entries(answers).map(([n, markdown]) => [n, parseChecks(markdown)]),
  ) as Course["checks"];
}
