import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { pwaOptions, themeColorTags, WORKER_FIRST } from "./pwa.config";

// The Worker serves exactly WORKER_FIRST (wrangler.jsonc `run_worker_first`);
// in dev, Vite forwards them to `wrangler dev` and serves everything else itself.
const WORKER = "http://localhost:8787";
const workerPaths = WORKER_FIRST.map((glob) => glob.replace(/\/\*$/, ""));

// Manifest and theme colours come from the tokens, never a literal here.
const tokensCss = readFileSync(
  new URL("./src/styles/tokens.css", import.meta.url),
  "utf8",
);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA(pwaOptions(tokensCss)),
    {
      name: "theme-color",
      transformIndexHtml: () => themeColorTags(tokensCss),
    },
  ],
  server: {
    proxy: Object.fromEntries(workerPaths.map((p) => [p, WORKER])),
  },
});
