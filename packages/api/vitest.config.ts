import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run inside workerd with the bindings from wrangler.jsonc. The real
// migrations are read here (Node) and applied to env.DB by test/apply-migrations.ts.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(
        path.join(import.meta.dirname, "migrations"),
      );
      return {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // Test-only values; real ones come from .dev.vars or `wrangler secret put`.
            TOKEN_SIGNING_KEY: "test-token-signing-key",
            GITHUB_TOKEN: "test-github-token",
            PUBLIC_ORIGIN: "https://lab.example",
            STUDY_MATERIALS_REPO: "owner/study-materials",
          },
        },
      };
    }),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
    // Vitest 5 enables this by default, but the workerd test runner (vitest-plugin
    // 1.4.1) can't read node_modules/.vitest-cache. Re-check when the plugin moves.
    fsModuleCache: false,
  },
});
