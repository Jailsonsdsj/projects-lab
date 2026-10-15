import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The Worker serves exactly these paths (wrangler.jsonc `run_worker_first`);
// in dev, Vite forwards them to `wrangler dev` and serves everything else itself.
const WORKER = "http://localhost:8787";
const workerPaths = ["/api", "/mcp", "/oauth", "/.well-known"];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: Object.fromEntries(workerPaths.map((p) => [p, WORKER])),
  },
});
