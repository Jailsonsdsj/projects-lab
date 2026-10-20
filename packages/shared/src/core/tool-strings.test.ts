import { describe, expect, it } from "vitest";
import {
  LONG_TOOL_STRINGS,
  TOOL_STRING_MAX,
  TOOL_TEXT_MAX,
  unboundedToolStrings,
} from "./tool-strings";

const tool = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
});

describe("the tool-string rule", () => {
  it("accepts enums and strings within 1,000", () => {
    expect(
      unboundedToolStrings(
        tool({
          kind: { type: "string", enum: ["a", "b"] },
          note: { type: "string", maxLength: TOOL_STRING_MAX },
          list: { type: "array", items: { type: "string", maxLength: 10 } },
        }),
        "t",
      ),
    ).toEqual([]);
  });

  it("finds unbounded or long strings, nested in items and unions", () => {
    expect(
      unboundedToolStrings(
        tool({
          a: { type: "string" },
          b: { type: "string", maxLength: TOOL_STRING_MAX + 1 },
          c: { type: "array", items: tool({ d: { type: "string" } }) },
          e: { anyOf: [{ type: "string" }, { type: "null" }] },
        }),
        "t",
      ),
    ).toEqual(["t.a", "t.b", "t.c[].d", "t.e"]);
  });

  it("lets a named long field reach 20,000, never more", () => {
    const long = (maxLength: number) =>
      tool({ posting: { type: "string", maxLength } });
    expect(unboundedToolStrings(long(TOOL_TEXT_MAX), "career_add_job")).toEqual(
      [],
    );
    expect(
      unboundedToolStrings(long(TOOL_TEXT_MAX + 1), "career_add_job"),
    ).toEqual(["career_add_job.posting"]);
    expect(unboundedToolStrings(long(2_000), "career_get_job")).toEqual([
      "career_get_job.posting",
    ]);
    expect(LONG_TOOL_STRINGS.every((path) => path.startsWith("career_"))).toBe(
      true,
    );
  });
});
