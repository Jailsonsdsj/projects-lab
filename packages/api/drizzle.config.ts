import { defineConfig } from "drizzle-kit";

// Generates SQL only; wrangler applies it (`db:migrate:local`).
export default defineConfig({
  dialect: "sqlite",
  // Core, then each lab's tables (lab code lives in its lab, CLAUDE.md).
  schema: ["./src/db/schema.ts", "./src/labs/study/schema.ts"],
  out: "./migrations",
});
