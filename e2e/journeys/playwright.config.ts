import { defineConfig } from "@playwright/test";
import { PORT, STATE } from "./stack";

// The journeys (H-03, H-04): the real Worker, local D1 and the built app, in
// WebKit at the same four widths as e2e/. One stack per run, fresh each time,
// so the tests share it one at a time.
export default defineConfig({
  testDir: ".",
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}`, browserName: "webkit" },
  projects: [
    {
      name: "phone",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "tablet-portrait",
      use: { viewport: { width: 768, height: 1024 }, hasTouch: true },
    },
    {
      name: "tablet-landscape",
      use: { viewport: { width: 1024, height: 768 }, hasTouch: true },
    },
    { name: "wide", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "bash ../../scripts/e2e-stack.sh",
    url: `http://localhost:${PORT}/api/health`,
    env: { E2E_STATE: STATE, E2E_PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
