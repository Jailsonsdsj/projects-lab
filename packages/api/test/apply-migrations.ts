import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { db } from "./db";

// Storage is isolated per test file, so every file starts from the real migrations.
await applyD1Migrations(db(), env.TEST_MIGRATIONS);
