#!/usr/bin/env bash
# Proves the lab boundary still holds (docs/architecture.md §4, CLAUDE.md):
# core never imports a lab, and a lab never imports another lab except through
# packages/shared/src/contracts/. Biome's noRestrictedImports enforces it in
# `biome check .`; this self-test makes sure those rules still fail when they
# should, so a Biome upgrade or a moved folder can't quietly open the boundary.
#
#   check-boundaries.sh --self-test
#
# Biome matches its overrides by path, and its stdin mode reports nothing
# useful, so each probe is a real file at the path being tested, linted alone
# and deleted on exit (along with any folder created for it).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROBE="__boundary_probe__.ts"
created_files=()
created_dirs=()
OUT="$(mktemp)"

cleanup() {
  rm -f "$OUT"
  for f in "${created_files[@]+"${created_files[@]}"}"; do rm -f "$f"; done
  for ((i = ${#created_dirs[@]} - 1; i >= 0; i--)); do
    rmdir "${created_dirs[$i]}" 2>/dev/null || true
  done
}
trap cleanup EXIT

# lint_probe <dir under packages/> <import specifier>: Biome's output goes to
# $OUT and its status is returned. Runs in this shell (never inside $(...)), so
# the files and folders it creates are recorded for cleanup.
lint_probe() {
  local dir="$ROOT/packages/$1" spec="$2" path missing=()
  local d="$dir"
  while [ ! -d "$d" ]; do missing=("$d" "${missing[@]+"${missing[@]}"}"); d="$(dirname "$d")"; done
  for d in "${missing[@]+"${missing[@]}"}"; do mkdir "$d"; created_dirs+=("$d"); done
  path="$dir/$PROBE"
  created_files+=("$path")
  printf 'import { probe } from "%s";\nexport const used = probe;\n' "$spec" >"$path"
  local status=0
  (cd "$ROOT" && pnpm exec biome lint --only=style/noRestrictedImports "$path") >"$OUT" 2>&1 || status=$?
  rm -f "$path"
  return "$status"
}

failures=0

# expect_blocked <dir> <import> <message fragment> <what>
expect_blocked() {
  if lint_probe "$1" "$2"; then
    echo "✗ self-test: $4 passed lint; the boundary is open." >&2
    failures=$((failures + 1))
  elif ! grep -q "$3" "$OUT"; then
    echo "✗ self-test: $4 failed, but not with \"$3\":" >&2
    cat "$OUT" >&2
    failures=$((failures + 1))
  fi
}

# expect_allowed <dir> <import> <what>
expect_allowed() {
  if ! lint_probe "$1" "$2"; then
    echo "✗ self-test: $3 was refused; the boundary is too tight:" >&2
    cat "$OUT" >&2
    failures=$((failures + 1))
  fi
}

CORE="core never imports a lab"
LAB="A lab never imports another lab"

expect_blocked api/src/core ../labs/study "$CORE" "api core → a lab"
expect_blocked web/src/core ../labs/career/index "$CORE" "web core → a lab"
expect_blocked api/src/labs/study ../career "$LAB" "api study → career"
expect_blocked web/src/labs/career ../study/screens "$LAB" "web career → study"
expect_blocked shared/src/career ../study/rules "$LAB" "shared career → study"
expect_blocked api/src/labs/career @projects-lab/shared/study "$LAB" "career → @projects-lab/shared/study"

expect_allowed api/src/labs/career @projects-lab/shared "a lab → the shared root (core + contracts)"
expect_allowed api/src/labs/career ../../../../shared/src/contracts/study "a lab → contracts by path"
expect_allowed api/src/core @projects-lab/shared "core → the shared root"
expect_allowed api/src ./labs/study "the API composition root → a lab"
expect_allowed web/src ./labs/career "the web composition root → a lab"

if [ "$failures" -gt 0 ]; then exit 1; fi
echo "✓ boundary self-test: 6 forbidden imports refused; contracts and the composition roots allowed"
