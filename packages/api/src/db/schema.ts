// Core tables (docs/prd/99-data-model.md). `drizzle-kit generate` turns this into
// migrations/; never hand-edit the output. Triggers (C-7) live in their own
// custom migration. Every column a CHECK references is NOT NULL.
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  authKeyHash: text("auth_key_hash").notNull(),
  kdfSalt: text("kdf_salt").notNull(),
  kdfIterations: integer("kdf_iterations").notNull(),
  timezone: text("timezone").notNull(),
  createdAt: text("created_at").notNull(),
  lastExportedAt: text("last_exported_at"),
  // Every session JWT carries it as `sv`; bumping it ends every session.
  // C-9 (never negative) is a trigger, not check(): a table-level check() on an
  // existing table makes drizzle-kit rebuild it, and its rebuild copies a new
  // column as the quoted name, which SQLite stores as a text literal.
  sessionVersion: integer("session_version").notNull().default(0),
});

export const mutation = sqliteTable("mutation", {
  key: text("key").primaryKey(),
  scope: text("scope").notNull(),
  responseJson: text("response_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const authAttempt = sqliteTable(
  "auth_attempt",
  {
    ipHash: text("ip_hash").notNull(),
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ipHash, t.windowStart] }),
    // C-6
    check("auth_attempt_count_min", sql`${t.count} >= 1`),
  ],
);

export const skill = sqliteTable(
  "skill",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    aliasesJson: text("aliases_json").notNull().default("[]"),
    createdAt: text("created_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (t) => [
    // C-1: Drizzle has no column COLLATE, so uniqueness is an expression index.
    // Lookups must say `COLLATE NOCASE` to use it.
    uniqueIndex("skill_name_nocase").on(sql`${t.name} COLLATE NOCASE`),
    // C-2
    check("skill_name_not_blank", sql`length(trim(${t.name})) > 0`),
    // C-3
    check(
      "skill_aliases_json_array",
      sql`json_valid(${t.aliasesJson}) AND json_type(${t.aliasesJson}) = 'array'`,
    ),
  ],
);

export const mcpCall = sqliteTable(
  "mcp_call",
  {
    id: text("id").primaryKey(),
    tool: text("tool").notNull(),
    clientName: text("client_name").notNull(),
    ok: integer("ok").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    // C-4: ^(core|study|career)_[a-z_]+$ as GLOB, since D1 has no REGEXP.
    check(
      "mcp_call_tool_prefix",
      sql`(${t.tool} GLOB 'core_?*' OR ${t.tool} GLOB 'study_?*' OR ${t.tool} GLOB 'career_?*') AND ${t.tool} NOT GLOB '*[^a-z_]*'`,
    ),
    // C-5
    check("mcp_call_ok_bool", sql`${t.ok} IN (0, 1)`),
  ],
);

// GitHub metadata by path, with its ETag, so the next read can send
// If-None-Match and take a 304 that costs no rate limit (F-17, PRD 02). A copy
// of GitHub's answer for that path, replaced whenever GitHub sends a new one.
export const githubCache = sqliteTable("github_cache", {
  path: text("path").primaryKey(),
  etag: text("etag").notNull(),
  bodyJson: text("body_json").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});
