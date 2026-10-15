/** Joins truthy class names. Primitives own their classes; callers add, never override. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
