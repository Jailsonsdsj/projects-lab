import { defineConfig } from "drizzle-kit";

// Generates SQL only; wrangler applies it (`db:migrate:local`).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
});
