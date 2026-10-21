import type { Element, ElementContent } from "hast";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
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
import { MermaidDiagram } from "./prose-mermaid";
import {
  type QuickCheckAnswer,
  QuickCheckContext,
  Quiz,
  QuizOption,
  QuizOptions,
  QuizStatement,
  QuizStatements,
  QuizStem,
} from "./prose-quiz";
import { type CalloutKind, remarkCourse } from "./prose-remark";
import { type HeadingLevel, rehypeHeadingIds } from "./prose-slug";

export interface ProseProps {
  /** Course Markdown (study-course-builder's template). Raw HTML is not rendered. */
  markdown: string;
  /** Tablet and wider reading size (`.prose--lg`). */
  large?: boolean;
  /** Where a relative image (`_img/x.png`) loads from; null when the reader
   *  has no such file, which then shows as its alt text. Absolute URLs are
   *  used as they are. */
  resolveImage?: (src: string) => string | null;
  /** Which headings get an id, for in-page links. Courses: H3 (the default). */
  headingLevels?: readonly HeadingLevel[];
  /** Where a link goes. An `http(s)` result opens in a new tab; anything else
   *  is an in-app path handed to `onNavigate`. Without it, links are as written. */
  resolveLink?: (href: string) => string;
  onNavigate?: (path: string) => void;
  /** The page's quick-check answers by question number: each question then
   *  checks itself when answered. */
  answers?: Record<number, QuickCheckAnswer>;
  className?: string;
}

const ImageContext = createContext<ProseProps["resolveImage"]>(undefined);
const LinkContext = createContext<
  Pick<ProseProps, "resolveLink" | "onNavigate"> | undefined
>(undefined);
const EXTERNAL = /^https?:/i;

function Link({
  href = "",
  title,
  children,
}: {
  href?: string;
  title?: string;
  children?: ReactNode;
}) {
  const links = useContext(LinkContext);
  if (!links?.resolveLink)
    return (
      <a href={href} title={title}>
        {children}
      </a>
    );
  const to = links.resolveLink(href);
  if (EXTERNAL.test(to))
    return (
      <a href={to} title={title} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  return (
    <a
      href={to}
      title={title}
      onClick={(event) => {
        // A modified click keeps the browser's own behaviour (a new tab).
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button)
          return;
        event.preventDefault();
        links.onNavigate?.(to);
      }}
    >
      {children}
    </a>
  );
}
const ABSOLUTE = /^(https?:|data:|\/)/i;

function Image({ src = "", alt = "" }: { src?: string; alt?: string }) {
  const resolve = useContext(ImageContext);
  const url = ABSOLUTE.test(src) || !resolve ? src : resolve(src);
  if (!url) return <span className="text-ink-muted">[{alt || src}]</span>;
  return <img src={url} alt={alt} loading="lazy" />;
}

/** Long-form course reading: the bundle's `.prose` with callouts, code, tables and quizzes. */
export function Prose({
  markdown,
  large,
  resolveImage,
  headingLevels,
  resolveLink,
  onNavigate,
  answers,
  className,
}: ProseProps) {
  return (
    <ImageContext.Provider value={resolveImage}>
      <LinkContext.Provider value={{ resolveLink, onNavigate }}>
        <QuickCheckContext.Provider value={{ answers, render: explanation }}>
          <article className={cx("prose", large && "prose--lg", className)}>
            <Markdown
              remarkPlugins={[remarkGfm, remarkCourse]}
              rehypePlugins={[[rehypeHeadingIds, { levels: headingLevels }]]}
              components={COMPONENTS}
            >
              {markdown}
            </Markdown>
          </article>
        </QuickCheckContext.Provider>
      </LinkContext.Provider>
    </ImageContext.Provider>
  );
}

/** An answer key's explanation, in the same Markdown (no heading ids). */
function explanation(markdown: string) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
      {markdown}
    </Markdown>
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
  const listing = <CodeListing language={language} text={text} />;
  // A diagram is drawn in the browser; its code shows until then, or if it can't be.
  return language === "mermaid" ? (
    <MermaidDiagram code={text} fallback={listing} />
  ) : (
    listing
  );
}

/** The labelled code block with Copy. */
function CodeListing({
  language,
  text,
}: {
  language: string | undefined;
  text: string;
}) {
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
  img: Image,
  a: Link,
  "x-callout": Callout,
  "x-quiz": Quiz,
  "x-quiz-stem": QuizStem,
  "x-quiz-options": QuizOptions,
  "x-quiz-option": QuizOption,
  "x-quiz-statements": QuizStatements,
  "x-quiz-statement": QuizStatement,
} as unknown as Components;
