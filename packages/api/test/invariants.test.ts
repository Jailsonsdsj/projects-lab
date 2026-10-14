// Core invariants (docs/prd/99-data-model.md), attempted through the D1 binding.
// Storage is shared by the tests in this file, so the seed runs once and every
// write below uses its own ids and names. Rejected writes leave no trace.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";

const run = (sql: string) => db().prepare(sql).run();

beforeAll(async () => {
  await db().batch(
    [
      `INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('s1', 'PostgreSQL', '["Postgres", "PG"]', 't')`,
      `INSERT INTO skill (id, name, created_at, deleted_at) VALUES ('s2', 'Go', 't', 't')`,
      `INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('s3', 'Golang', '["Go"]', 't')`,
      // Only the C-7 tests touch these, so a missing C-7 can't disturb the others.
      `INSERT INTO skill (id, name, created_at) VALUES ('d1', 'Elixir', 't')`,
      `INSERT INTO skill (id, name, created_at, deleted_at) VALUES ('d2', 'Erlang', 't', 't')`,
      `INSERT INTO user (id, auth_key_hash, kdf_salt, kdf_iterations, timezone, created_at) VALUES ('v1', 'h', 's', 1, 'UTC', 't')`,
    ].map((sql) => db().prepare(sql)),
  );
});

describe("permitted writes succeed", () => {
  it.each([
    [
      "user",
      `INSERT INTO user (id, auth_key_hash, kdf_salt, kdf_iterations, timezone, created_at) VALUES ('u1', 'h', 's', 1, 'UTC', 't')`,
    ],
    [
      "mutation",
      `INSERT INTO mutation (key, scope, response_json, created_at) VALUES ('k1', 'POST /api/x', '{}', 't')`,
    ],
    [
      "auth_attempt",
      `INSERT INTO auth_attempt (ip_hash, window_start, count) VALUES ('ip1', 1, 1)`,
    ],
    [
      "skill with default aliases",
      `INSERT INTO skill (id, name, created_at) VALUES ('p1', 'Rust', 't')`,
    ],
    ["skill soft delete", `UPDATE skill SET deleted_at = 't' WHERE id = 'p1'`],
    [
      "alias of a soft-deleted skill's name (C-8 ignores it)",
      `INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('p2', 'Rust Lang', '["Rust"]', 't')`,
    ],
    [
      "mcp_call ok",
      `INSERT INTO mcp_call (id, tool, client_name, ok, created_at) VALUES ('m1', 'core_create_upload', 'claude', 1, 't')`,
    ],
    [
      "mcp_call failed write",
      `INSERT INTO mcp_call (id, tool, client_name, ok, created_at) VALUES ('m2', 'career_add_job', 'claude', 0, 't')`,
    ],
    [
      "session_version bump",
      `UPDATE user SET session_version = session_version + 1 WHERE id = 'v1'`,
    ],
  ])("%s", async (_, sql) => {
    await expect(run(sql)).resolves.toBeDefined();
  });
});

// [name, error the write must fail with, sql]
const forbidden: [string, string, string][] = [
  [
    "C-1 name differing only in case",
    "UNIQUE constraint failed",
    `INSERT INTO skill (id, name, created_at) VALUES ('x1', 'postgresql', 't')`,
  ],
  [
    "C-2 empty name",
    "skill_name_not_blank",
    `INSERT INTO skill (id, name, created_at) VALUES ('x2', '', 't')`,
  ],
  [
    "C-2 blank name",
    "skill_name_not_blank",
    `INSERT INTO skill (id, name, created_at) VALUES ('x3', '   ', 't')`,
  ],
  [
    "C-3 aliases not an array",
    "skill_aliases_json_array",
    `INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('x4', 'Zig', '{}', 't')`,
  ],
  [
    "C-3 aliases not JSON",
    "skill_aliases_json_array",
    `INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('x5', 'Zig', 'nope', 't')`,
  ],
  ...["study_", "Study_add", "core-x", "lab_x", "core_x1", "xcore_x"].map(
    (tool): [string, string, string] => [
      `C-4 tool '${tool}'`,
      "mcp_call_tool_prefix",
      `INSERT INTO mcp_call (id, tool, client_name, ok, created_at) VALUES ('t-${tool}', '${tool}', 'claude', 1, 't')`,
    ],
  ),
  [
    "C-5 ok = 2",
    "mcp_call_ok_bool",
    `INSERT INTO mcp_call (id, tool, client_name, ok, created_at) VALUES ('m3', 'core_x', 'claude', 2, 't')`,
  ],
  [
    "C-6 count = 0",
    "auth_attempt_count_min",
    `INSERT INTO auth_attempt (ip_hash, window_start, count) VALUES ('ip2', 1, 0)`,
  ],
  [
    "C-7 delete a live skill",
    "skill_no_hard_delete",
    `DELETE FROM skill WHERE id = 'd1'`,
  ],
  [
    "C-7 delete a soft-deleted skill",
    "skill_no_hard_delete",
    `DELETE FROM skill WHERE id = 'd2'`,
  ],
  [
    "C-8 alias = another alias, other case",
    "skill_alias_conflict",
    `INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('x6', 'MySQL', '["postgres"]', 't')`,
  ],
  [
    "C-8 alias = another name",
    "skill_alias_conflict",
    `INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('x7', 'PG Tools', '["postgresql"]', 't')`,
  ],
  [
    "C-8 name = another alias",
    "skill_alias_conflict",
    `INSERT INTO skill (id, name, created_at) VALUES ('x8', 'pg', 't')`,
  ],
  [
    "C-8 update to a taken alias",
    "skill_alias_conflict",
    `UPDATE skill SET aliases_json = '["Go", "POSTGRES"]' WHERE id = 's3'`,
  ],
  [
    "C-8 restore into a conflict",
    "skill_alias_conflict",
    `UPDATE skill SET deleted_at = NULL WHERE id = 's2'`,
  ],
  [
    "C-9 negative session_version on insert",
    "user_session_version_min",
    `INSERT INTO user (id, auth_key_hash, kdf_salt, kdf_iterations, timezone, created_at, session_version) VALUES ('v2', 'h', 's', 1, 'UTC', 't', -1)`,
  ],
  [
    "C-9 text session_version on insert",
    "user_session_version_min",
    `INSERT INTO user (id, auth_key_hash, kdf_salt, kdf_iterations, timezone, created_at, session_version) VALUES ('v3', 'h', 's', 1, 'UTC', 't', 'session_version')`,
  ],
  [
    "C-9 negative session_version on update",
    "user_session_version_min",
    `UPDATE user SET session_version = -1 WHERE id = 'v1'`,
  ],
];

// One NULL per NOT NULL column: [table, columns, a valid row in the same order]
const notNull: [string, string[], string[]][] = [
  [
    "user",
    [
      "id",
      "auth_key_hash",
      "kdf_salt",
      "kdf_iterations",
      "timezone",
      "created_at",
      "session_version",
    ],
    ["'n1'", "'h'", "'s'", "1", "'UTC'", "'t'", "0"],
  ],
  [
    "mutation",
    ["key", "scope", "response_json", "created_at"],
    ["'n1'", "'POST /api/x'", "'{}'", "'t'"],
  ],
  ["auth_attempt", ["ip_hash", "window_start", "count"], ["'n1'", "9", "1"]],
  [
    "skill",
    ["id", "name", "aliases_json", "created_at"],
    ["'n1'", "'Kotlin'", "'[]'", "'t'"],
  ],
  [
    "mcp_call",
    ["id", "tool", "client_name", "ok", "created_at"],
    ["'n1'", "'core_x'", "'claude'", "1", "'t'"],
  ],
];
for (const [table, columns, row] of notNull) {
  columns.forEach((column, i) => {
    const values = row.map((v, j) => (i === j ? "NULL" : v));
    forbidden.push([
      `${table}.${column} NULL`,
      `NOT NULL constraint failed: ${table}.${column}`,
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")})`,
    ]);
  });
}

describe("forbidden writes fail", () => {
  it.each(forbidden)("%s", async (_, error, sql) => {
    await expect(run(sql)).rejects.toThrow(error);
  });
});
