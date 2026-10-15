import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Component tests render in jsdom and assert behaviour only: no snapshots.
// asyncUtilTimeout (test/setup.ts) stays below testTimeout, so a waitFor that
// never resolves fails with its own message instead of a bare test timeout.
export const TEST_TIMEOUT_MS = 5000;

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
    testTimeout: TEST_TIMEOUT_MS,
  },
});
