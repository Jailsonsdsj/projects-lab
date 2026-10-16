declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}

/** Vite's import.meta.glob, which Vitest provides; only the form tests use. */
interface ImportMeta {
  glob<T>(
    pattern: string | string[],
    options: { eager: true; query: "?raw"; import: "default" },
  ): Record<string, T>;
}
