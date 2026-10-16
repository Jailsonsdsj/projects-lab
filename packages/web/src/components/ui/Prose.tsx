import type { Element, ElementContent } from "hast";
import {
  Children,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useState,
} from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "./Button";
import { cssDurationMs } from "./css-duration";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { highlight } from "./prose-highlight";
import { type CalloutKind, remarkCourse } from "./prose-remark";

export interface ProseProps {
  /** Course Markdown (study-course-builder's template). Raw HTML is not rendered. */
  markdown: string;
  /** Tablet and wider reading size (`.prose--lg`). */
  large?: boolean;
  className?: string;
}

/** Long-form course reading: the bundle's `.prose` with callouts, code, tables and quizzes. */
export function Prose({ markdown, large, className }: ProseProps) {
  return (
    <article className={cx("prose", large && "prose--lg", className)}>
      <Markdown
        remarkPlugins={[remarkGfm, remarkCourse]}
        components={COMPONENTS}
      >
        {markdown}
      </Markdown>
    </article>
  );
}

const CALLOUT_ICON: Record<CalloutKind, IconName> = {
  note: "info",
  tip: "lightbulb",
  warning: "warning",
  bridge: "code",
  world: "globe",
};

function textOf(node: ElementContent | Element): string {
  if (node.type === "text") return node.value;
  return "children" in node ? node.children.map(textOf).join("") : "";
}

function CodeBlock({ node }: { node?: Element }) {
  const code = node?.children.find(
    (child): child is Element =>
      child.type === "element" && child.tagName === "code",
  );
  const language = ((code?.properties.className as string[] | undefined) ?? [])
    .map(String)
    .find((c) => c.startsWith("language-"))
    ?.slice("language-".length);
  const text = (code ? textOf(code) : "").replace(/\n$/, "");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(
      () => setCopied(false),
      cssDurationMs("--duration-copied-hold") ?? 0,
    );
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="codeblock">
      <div className="codeblock__head">
        <span className="codeblock__lang">{language ?? "text"}</span>
        <Button
          variant="ghost"
          tone="neutral"
          size="sm"
          icon={copied ? "check" : "copy"}
          className={copied ? "btn--copied" : undefined}
          aria-label={copied ? "Copied" : "Copy code"}
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre>
        <code>{highlight(text, language)}</code>
      </pre>
    </div>
  );
}

function Callout({
  kind,
  label,
  children,
}: {
  kind: CalloutKind;
  label: string;
  children?: ReactNode;
}) {
  return (
    <blockquote
      className={cx("callout", kind !== "note" && `callout--${kind}`)}
    >
      <Icon name={CALLOUT_ICON[kind]} />
      <span className="callout__label">{label}</span>
      <div className="callout__body">{children}</div>
    </blockquote>
  );
}

interface QuizState {
  name: string;
  stemId: string;
  selected: string | null;
  select: (letter: string) => void;
}
const QuizContext = createContext<QuizState | null>(null);

/** A multiple-choice quick-check question. Checking answers arrives with the
 *  Study Lab, which owns the answer key. */
function Quiz({ children }: { children?: ReactNode }) {
  const id = useId();
  const [selected, select] = useState<string | null>(null);
  const [stem, ...options] = Children.toArray(children);
  const stemId = `${id}-q`;
  return (
    <QuizContext.Provider value={{ name: id, stemId, selected, select }}>
      <section className="quiz" aria-labelledby={stemId}>
        <span className="kicker">Quick check</span>
        {stem}
        <div className="quiz__opts" role="radiogroup" aria-labelledby={stemId}>
          {options}
        </div>
      </section>
    </QuizContext.Provider>
  );
}

function QuizStem({ children }: { children?: ReactNode }) {
  const quiz = useContext(QuizContext);
  return (
    <p className="quiz__q" id={quiz?.stemId}>
      {children}
    </p>
  );
}

function QuizOption({
  letter,
  children,
}: {
  letter: string;
  children?: ReactNode;
}) {
  const quiz = useContext(QuizContext);
  const checked = quiz?.selected === letter;
  return (
    <label className={cx("quiz__opt", checked && "is-selected")}>
      <input
        type="radio"
        name={quiz?.name}
        checked={checked}
        onChange={() => quiz?.select(letter)}
      />
      <span className="quiz__letter">{letter}</span>
      <span>{children}</span>
    </label>
  );
}

/** Right-aligned GFM columns are numbers: the bundle sets them in mono (`.num`). */
function cell(tag: "th" | "td") {
  return function Cell({
    node,
    children,
  }: {
    node?: Element;
    children?: ReactNode;
  }) {
    const Tag = tag;
    const numeric = node?.properties.align === "right";
    return <Tag className={numeric ? "num" : undefined}>{children}</Tag>;
  };
}

// Custom element names come from prose-remark.ts.
const COMPONENTS = {
  pre: CodeBlock,
  table: ({ children }: { children?: ReactNode }) => (
    <div className="tablewrap">
      <table>{children}</table>
    </div>
  ),
  th: cell("th"),
  td: cell("td"),
  img: ({ src, alt }: { src?: string; alt?: string }) => (
    <img src={src} alt={alt ?? ""} loading="lazy" />
  ),
  "x-callout": Callout,
  "x-quiz": Quiz,
  "x-quiz-stem": QuizStem,
  "x-quiz-option": QuizOption,
} as unknown as Components;
