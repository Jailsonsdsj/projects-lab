// Syntax colours for Prose code blocks: highlight.js grammars through lowlight,
// with its token classes mapped onto the bundle's six (`tk-*` in components.css).
// A chosen set of languages keeps the bundle small; anything else is plain text.
import type { Element, RootContent } from "hast";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";
import type { ReactNode } from "react";

const lowlight = createLowlight({
  bash,
  css,
  go,
  java,
  javascript,
  json,
  python,
  sql,
  typescript,
  xml,
  yaml,
});
lowlight.registerAlias({
  bash: ["sh", "shell", "zsh"],
  javascript: ["js", "jsx", "mjs", "cjs"],
  typescript: ["ts", "tsx", "mts"],
  xml: ["html", "svg"],
  yaml: ["yml"],
});

/** highlight.js scope → the bundle's token class. Unlisted scopes stay plain ink. */
function tokenClass(classes: string[]): string | undefined {
  const scopes = new Set(classes.map((c) => c.replace(/^hljs-/, "")));
  if (scopes.has("comment") || scopes.has("doctag")) return "tk-c";
  if (scopes.has("string") || scopes.has("regexp")) return "tk-s";
  if (scopes.has("number")) return "tk-n";
  if (scopes.has("keyword") || scopes.has("literal")) return "tk-k";
  if (scopes.has("title") && scopes.has("function_")) return "tk-f";
  if (
    scopes.has("type") ||
    scopes.has("built_in") ||
    (scopes.has("title") && scopes.has("class_"))
  ) {
    return "tk-t";
  }
  return undefined;
}

function render(nodes: readonly RootContent[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}.${i}`;
    if (node.type === "text") return node.value;
    if (node.type !== "element") return null;
    const children = render((node as Element).children, key);
    const className = tokenClass(
      ((node.properties.className as string[] | undefined) ?? []).map(String),
    );
    return className ? (
      <span key={key} className={className}>
        {children}
      </span>
    ) : (
      children
    );
  });
}

export function highlight(
  code: string,
  language: string | undefined,
): ReactNode {
  if (!language || !lowlight.registered(language)) return code;
  return render(lowlight.highlight(language, code).children, "t");
}
