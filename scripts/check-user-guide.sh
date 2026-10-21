#!/usr/bin/env bash
# Fails if docs/user-guide.md doesn't mention something the owner uses: every
# MCP tool registered in packages/api/src, every web route in packages/web/src,
# every root `pnpm` script, every slash command in .claude/commands/ and every
# script in scripts/. A change that adds one updates the guide in the same
# commit (CLAUDE.md). `--self-test` proves each kind of omission still fails.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
GUIDE="docs/user-guide.md"

tools() { grep -rhoE 'name: "(core|study|career)_[a-z_]+"' packages/api/src | sed -E 's/name: "(.*)"/\1/' | sort -u; }
routes() {
  grep -rhoE 'path: "/[^"]*"' packages/web/src --include='*.tsx' --exclude='*.test.tsx' |
    sed -E 's/path: "(.*)"/\1/' | sort -u
}
pnpm_scripts() { node -e 'console.log(Object.keys(require("./package.json").scripts).join("\n"))'; }
commands() { for f in .claude/commands/*.md; do basename "$f" .md; done; }
scripts() { for f in scripts/*.ts scripts/*.sh; do basename "$f"; done; }

# check <guide>: prints what the guide doesn't mention; fails if anything.
check() {
  local guide="$1" missing=()
  while read -r t; do grep -qF "\`$t\`" "$guide" || missing+=("MCP tool $t"); done < <(tools)
  while read -r r; do grep -qF "\`$r\`" "$guide" || missing+=("route $r"); done < <(routes)
  while read -r s; do grep -qE "pnpm ${s}([^a-z:-]|$)" "$guide" || missing+=("pnpm $s"); done < <(pnpm_scripts)
  while read -r c; do grep -qE "/${c}([^a-z-]|$)" "$guide" || missing+=("slash command /$c"); done < <(commands)
  while read -r f; do grep -qF "$f" "$guide" || missing+=("script $f"); done < <(scripts)
  if ((${#missing[@]})); then
    printf '  missing: %s\n' "${missing[@]}"
    return 1
  fi
}

if [[ "${1:-}" == "--self-test" ]]; then
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT
  caught=0
  # One of each kind, dropped from a copy of the guide: the check must fail.
  for drop in '`core_whoami`' '`/study/grades`' 'pnpm seed' '/ship' 'restore-backup.ts'; do
    grep -vF "$drop" "$GUIDE" >"$tmp"
    if check "$tmp" >/dev/null; then
      echo "✗ self-test: a guide without $drop passed" >&2
      exit 1
    fi
    caught=$((caught + 1))
  done
  echo "✓ user-guide self-test: $caught kinds of omission caught"
  exit 0
fi

if check "$GUIDE"; then
  echo "✓ docs/user-guide.md mentions every tool, route, pnpm script, slash command and script"
else
  echo "✗ docs/user-guide.md is out of date: add the above (CLAUDE.md: the guide changes in the same commit)" >&2
  exit 1
fi
