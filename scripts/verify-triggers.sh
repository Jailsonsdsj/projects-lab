#!/usr/bin/env bash
# Applies every migration to a throwaway local D1 and checks each core invariant
# (docs/prd/99-data-model.md): permitted writes succeed, every violation and every
# NULL in a NOT NULL column is rejected. Local only; there is no remote mode.
set -euo pipefail

for arg in "$@"; do
  if [[ $arg == --remote* ]]; then
    echo "verify-triggers: refuses --remote; it only runs against a throwaway local D1." >&2
    exit 2
  fi
done

API="$(cd "$(dirname "$0")/../packages/api" && pwd)"
WRANGLER="$API/node_modules/.bin/wrangler"
DB=projects-lab
PERSIST="$(mktemp -d)"
OUT="$PERSIST/last.out"
trap 'rm -rf "$PERSIST"' EXIT
cd "$API"

passed=0
failed=0

ok() { passed=$((passed + 1)); printf '  ok    %s\n' "$1"; }
bad() { failed=$((failed + 1)); printf '  FAIL  %s: %s\n' "$1" "$2"; }

run() {
  "$WRANGLER" d1 execute "$DB" --local --persist-to "$PERSIST" --command "$1" >"$OUT" 2>&1
}

# accept <name> <sql>
accept() {
  if run "$2"; then ok "$1"; else bad "$1" "expected success, got: $(grep -m1 -o 'ERROR.*' "$OUT" || tail -1 "$OUT")"; fi
}

# reject <name> <text the error must contain> <sql>
reject() {
  if run "$3"; then
    bad "$1" "was accepted"
  elif grep -qF "$2" "$OUT"; then
    ok "$1"
  else
    bad "$1" "rejected, but not by '$2': $(grep -m1 -o 'ERROR.*' "$OUT" || tail -1 "$OUT")"
  fi
}

echo "Applying migrations to a fresh local D1"
CI=true "$WRANGLER" d1 migrations apply "$DB" --local --persist-to "$PERSIST" >"$OUT" 2>&1 \
  || { cat "$OUT"; exit 1; }

echo "Permitted writes"
accept "user" "INSERT INTO user (id, auth_key_hash, kdf_salt, kdf_iterations, timezone, created_at) VALUES ('u1', 'h', 's', 600000, 'Europe/Lisbon', 't')"
accept "mutation" "INSERT INTO mutation (key, scope, response_json, created_at) VALUES ('k1', 'POST /api/x', '{}', 't')"
accept "auth_attempt" "INSERT INTO auth_attempt (ip_hash, window_start, count) VALUES ('ip1', 1, 1)"
accept "skill with aliases" "INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('s1', 'PostgreSQL', '[\"Postgres\"]', 't')"
accept "skill with default aliases" "INSERT INTO skill (id, name, created_at) VALUES ('s2', 'Go', 't')"
accept "skill alias added" "UPDATE skill SET aliases_json = '[\"Postgres\", \"PG\"]' WHERE id = 's1'"
accept "skill soft delete" "UPDATE skill SET deleted_at = 't' WHERE id = 's2'"
accept "C-8 ignores soft-deleted skills" "INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('s3', 'Golang', '[\"Go\"]', 't')"
accept "C-7 fixture, live" "INSERT INTO skill (id, name, created_at) VALUES ('d1', 'Elixir', 't')"
accept "C-7 fixture, soft-deleted" "INSERT INTO skill (id, name, created_at, deleted_at) VALUES ('d2', 'Erlang', 't', 't')"
accept "mcp_call ok" "INSERT INTO mcp_call (id, tool, client_name, ok, created_at) VALUES ('m1', 'core_create_upload', 'claude', 1, 't')"
accept "mcp_call failed write" "INSERT INTO mcp_call (id, tool, client_name, ok, created_at) VALUES ('m2', 'career_add_job', 'claude', 0, 't')"

echo "C-1 to C-6 (CHECK and unique index)"
reject "C-1 name differing only in case" "UNIQUE constraint failed" "INSERT INTO skill (id, name, created_at) VALUES ('x1', 'postgresql', 't')"
reject "C-2 empty name" "skill_name_not_blank" "INSERT INTO skill (id, name, created_at) VALUES ('x2', '', 't')"
reject "C-2 blank name" "skill_name_not_blank" "INSERT INTO skill (id, name, created_at) VALUES ('x3', '   ', 't')"
reject "C-3 aliases not an array" "skill_aliases_json_array" "INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('x4', 'Rust', '{}', 't')"
reject "C-3 aliases not JSON" "skill_aliases_json_array" "INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('x5', 'Rust', 'nope', 't')"
for tool in 'study_' 'Study_add' 'core-x' 'lab_x' 'core_x1' 'xcore_x'; do
  reject "C-4 tool '$tool'" "mcp_call_tool_prefix" "INSERT INTO mcp_call (id, tool, client_name, ok, created_at) VALUES ('t-$tool', '$tool', 'claude', 1, 't')"
done
reject "C-5 ok = 2" "mcp_call_ok_bool" "INSERT INTO mcp_call (id, tool, client_name, ok, created_at) VALUES ('m3', 'core_x', 'claude', 2, 't')"
reject "C-6 count = 0" "auth_attempt_count_min" "INSERT INTO auth_attempt (ip_hash, window_start, count) VALUES ('ip2', 1, 0)"

echo "C-7 (no hard delete)"
reject "C-7 delete live skill" "skill_no_hard_delete" "DELETE FROM skill WHERE id = 'd1'"
reject "C-7 delete soft-deleted skill" "skill_no_hard_delete" "DELETE FROM skill WHERE id = 'd2'"

echo "C-8 (aliases unique among live skills)"
reject "C-8 alias = other alias, other case" "skill_alias_conflict" "INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('x6', 'MySQL', '[\"postgres\"]', 't')"
reject "C-8 alias = other name" "skill_alias_conflict" "INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('x7', 'PG Tools', '[\"postgresql\"]', 't')"
reject "C-8 name = other alias" "skill_alias_conflict" "INSERT INTO skill (id, name, created_at) VALUES ('x8', 'pg', 't')"
reject "C-8 update to a taken alias" "skill_alias_conflict" "UPDATE skill SET aliases_json = '[\"Go\", \"POSTGRES\"]' WHERE id = 's3'"
reject "C-8 restore into a conflict" "skill_alias_conflict" "UPDATE skill SET deleted_at = NULL WHERE id = 's2'"

echo "NULL in every NOT NULL column"
# null_each <table> <column list> <values list, same order>
null_each() {
  local table=$1
  IFS=',' read -ra cols <<<"$2"
  IFS=',' read -ra vals <<<"$3"
  local i j
  for i in "${!cols[@]}"; do
    local row=()
    for j in "${!vals[@]}"; do
      if [[ $i == "$j" ]]; then row+=("NULL"); else row+=("${vals[$j]}"); fi
    done
    reject "$table.${cols[$i]} NULL" "NOT NULL constraint failed: $table.${cols[$i]}" \
      "INSERT INTO $table ($2) VALUES ($(IFS=','; echo "${row[*]}"))"
  done
}
null_each user "id,auth_key_hash,kdf_salt,kdf_iterations,timezone,created_at" "'n1','h','s',1,'UTC','t'"
null_each mutation "key,scope,response_json,created_at" "'n1','POST /api/x','{}','t'"
null_each auth_attempt "ip_hash,window_start,count" "'n1',9,1"
null_each skill "id,name,aliases_json,created_at" "'n1','Kotlin','[]','t'"
null_each mcp_call "id,tool,client_name,ok,created_at" "'n1','core_x','claude',1,'t'"

echo
echo "$passed passed, $failed failed"
[[ $failed == 0 ]]
