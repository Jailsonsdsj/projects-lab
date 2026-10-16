import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Component tests render in jsdom and assert behaviour only: no snapshots.
// asyncUtilTimeout (test/setup.ts) stays below testTimeout, so a waitFor that
// never resolves fails with its own message instead of a bare test timeout.
export const TEST_TIMEOUT_MS = 5000;

export default defineConfig({
  plugins: [react()],
  // vite-plugin-pwa's virtual module exists only in a real build.
  resolve: {
    alias: {
      "virtual:pwa-register/react": new URL(
        "./test/pwa-register.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
    testTimeout: TEST_TIMEOUT_MS,
    // CSS imports are stubbed in tests; the style files a test reads with ?raw
    // (to check tokens it can't evaluate in jsdom) are let through.
    css: { include: [/styles\/(tokens|components)\.css/] },
  },
});
