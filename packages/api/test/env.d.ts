declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    /** H-02's restore target: an empty database and bucket. */
    RESTORE_DB: D1Database;
    RESTORE_FILES: R2Bucket;
  }
}

/** As src/env.d.ts declares it: the optional key of the AI integrations (AI-02). */
interface Env {
  ANTHROPIC_API_KEY?: string;
  GITHUB_WRITE_TOKEN?: string;
}

/** Vite's import.meta.glob, which Vitest provides; only the form tests use. */
interface ImportMeta {
  glob<T>(
    pattern: string | string[],
    options: { eager: true; query: "?raw"; import: "default" },
  ): Record<string, T>;
}

/** A fixture's text, imported with Vite's ?raw (the resume import test). */
declare module "*.md?raw" {
  const text: string;
  export default text;
}
