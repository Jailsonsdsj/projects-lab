// The MCP tool-string rule (02-integration): no tool can carry file content,
// so every string a tool takes is an enum or at most TOOL_STRING_MAX. A few
// named prose fields may be longer, each with its own cap in its schema, never
// above TOOL_TEXT_MAX: a 100 KB PDF in base64 is about 133,000 characters.
// Both tool-string tests (shared and the API's tools/list) read this list, so
// a new long field fails CI until it's named here.

export const TOOL_STRING_MAX = 1_000;
export const TOOL_TEXT_MAX = 20_000;

/** `<tool>.<path>` as the tests walk JSON Schema: `.key` for a property, `[]` for items. */
export const LONG_TOOL_STRINGS: readonly string[] = [
  "career_add_job.posting",
  "career_add_job.fitNotes",
  "career_update_job.fitNotes",
  "career_save_openings.openings[].posting",
  "career_save_job_kit.intro",
  "career_save_job_kit.answers[].answer",
  "career_save_answer.answer",
];

/**
 * Walks a tool's input JSON Schema and returns where a string breaks the rule:
 * not an enum, and no maxLength within TOOL_STRING_MAX (or TOOL_TEXT_MAX for a
 * named long field). `where` starts as the tool's name.
 */
export function unboundedToolStrings(schema: unknown, where: string): string[] {
  if (!schema || typeof schema !== "object") return [];
  const s = schema as Record<string, unknown>;
  const cap = LONG_TOOL_STRINGS.includes(where)
    ? TOOL_TEXT_MAX
    : TOOL_STRING_MAX;
  const found =
    s.type === "string" &&
    !Array.isArray(s.enum) &&
    !(typeof s.maxLength === "number" && s.maxLength <= cap)
      ? [where]
      : [];
  for (const [key, value] of Object.entries(
    (s.properties ?? {}) as Record<string, unknown>,
  ))
    found.push(...unboundedToolStrings(value, `${where}.${key}`));
  if (s.items) found.push(...unboundedToolStrings(s.items, `${where}[]`));
  // A union (nullable, optional) keeps the path: the long-field list names fields, not branches.
  for (const branch of ["anyOf", "oneOf", "allOf"] as const)
    for (const sub of (s[branch] as unknown[] | undefined) ?? [])
      found.push(...unboundedToolStrings(sub, where));
  return found;
}
