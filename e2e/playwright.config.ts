import { defineConfig } from "@playwright/test";

// WebKit only: the app runs on an iPhone and an iPad, so Safari's engine is the
// one that matters. Viewports follow the design brief (phone 390 × 844, tablet
// 1024 × 768 landscape) plus the two layout edges (compact rail, wide).
const PORT = 4173;

export default defineConfig({
  testDir: ".",
  // The journeys run on the real stack: their own config (pnpm e2e:journeys).
  testIgnore: "journeys/**",
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
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
  // The built app, served statically: the shell needs no API.
  webServer: {
    command: `cd ../packages/web && ./node_modules/.bin/vite build && ./node_modules/.bin/vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
