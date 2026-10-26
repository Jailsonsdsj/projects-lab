#!/usr/bin/env bash
# Guards the CI/CD rules (playbook §9, CLAUDE.md):
#   - ci.yml uses no secret, no Cloudflare credential and no --remote;
#   - deploy.yml sets the Cloudflare secrets on steps only, never job-wide;
#   - every wrangler d1/deploy call in a workflow names --env="" (the top-level
#     Worker: an env added to wrangler.jsonc later must not change the target);
#   - deploy.yml's health check hits wrangler.jsonc's PUBLIC_ORIGIN.
#
#   check-workflows.sh              check .github/workflows
#   check-workflows.sh --self-test  prove each rule can still fail
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# check <ci.yml> <deploy.yml> <wrangler.jsonc>: prints each violation, returns 1 if any.
check() {
  local ci="$1" deploy="$2" wrangler="$3" fail=0
  # Comment lines don't count: they may name the rule.
  if grep -nE 'secrets\.|CLOUDFLARE_|--remote' "$ci" | grep -vE '^[0-9]+:[[:space:]]*#'; then
    echo "✗ $ci: PR CI must use no secret, no Cloudflare credential and no --remote" >&2
    fail=1
  fi
  # Job-wide or workflow-wide env holding a Cloudflare secret (steps indent deeper).
  if awk '/^(env:|    env:)/{block=1; next} /^[^ ]|^    [^ ]/{block=0} block && /CLOUDFLARE_/{print FILENAME": "FNR": "$0; found=1} END{exit !found}' "$deploy"; then
    echo "✗ $deploy: set Cloudflare secrets on the steps that need them, not job-wide" >&2
    fail=1
  fi
  local file
  for file in "$ci" "$deploy"; do
    if grep -nE 'wrangler (d1 |deploy)' "$file" | grep -vE '^[0-9]+:[[:space:]]*#' | grep -v -- '--env=""'; then
      echo "✗ $file: every wrangler d1/deploy call names --env=\"\"" >&2
      fail=1
    fi
  done
  local origin
  origin="$(grep -oE '"PUBLIC_ORIGIN": *"[^"]*"' "$wrangler" | sed -E 's/.*: *"([^"]*)"/\1/')"
  if [[ -z "$origin" ]] || ! grep -qF "curl -fsS --retry 5 --retry-delay 3 $origin/api/health" "$deploy"; then
    echo "✗ $deploy: the health check must hit PUBLIC_ORIGIN ($origin)/api/health" >&2
    fail=1
  fi
  return "$fail"
}

self_test() {
  local tmp ci deploy wrangler
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  ci="$ROOT/.github/workflows/ci.yml"
  deploy="$ROOT/.github/workflows/deploy.yml"
  wrangler="$ROOT/packages/api/wrangler.jsonc"

  # expect_fail <what> <file to break: ci|deploy|wrangler> <perl substitution> <the rule's message>
  # perl, not sed: the same newline handling on macOS and Linux.
  expect_fail() {
    local what="$1" which="$2" expr="$3" rule="$4" out
    cp "$ci" "$tmp/ci.yml"; cp "$deploy" "$tmp/deploy.yml"; cp "$wrangler" "$tmp/wrangler.jsonc"
    local target="$tmp/$which.yml"
    [[ $which == wrangler ]] && target="$tmp/wrangler.jsonc"
    perl -0pi -e "$expr" "$target"
    if cmp -s "$target" "$([[ $which == wrangler ]] && echo "$wrangler" || echo "$ROOT/.github/workflows/$which.yml")"; then
      echo "✗ self-test: the probe for $what changed nothing; fix the probe." >&2
      exit 1
    fi
    if out="$(check "$tmp/ci.yml" "$tmp/deploy.yml" "$tmp/wrangler.jsonc" 2>&1)"; then
      echo "✗ self-test: $what passed; the guard is not guarding." >&2
      exit 1
    fi
    if ! grep -qF -- "$rule" <<<"$out"; then
      echo "✗ self-test: $what failed, but not by the rule \"$rule\":" >&2
      echo "$out" >&2
      exit 1
    fi
  }

  expect_fail "a secret in ci.yml" ci 's|      - run: pnpm test\n|      - run: pnpm test\n        env:\n          T: \$\{\{ secrets.X \}\}\n|' "no secret, no Cloudflare credential"
  expect_fail "--remote in ci.yml" ci 's|wrangler deploy --dry-run|wrangler d1 migrations apply projects-lab --remote --env="" && wrangler deploy --dry-run|' "no secret, no Cloudflare credential"
  expect_fail "a job-wide Cloudflare secret" deploy 's|(    runs-on: [^\n]*\n)|\1    env:\n      CLOUDFLARE_API_TOKEN: x\n|' "not job-wide"
  expect_fail "a wrangler deploy without --env" deploy 's|wrangler deploy --env=""|wrangler deploy|' 'names --env'
  expect_fail "a health check on another origin" wrangler 's|"PUBLIC_ORIGIN": *"[^"]*"|"PUBLIC_ORIGIN": "https://elsewhere.example"|' "health check must hit"

  # The real workflows must pass, or the guard is unusable.
  check "$ci" "$deploy" "$wrangler" >/dev/null || {
    echo "✗ self-test: the current workflows fail their own guard" >&2
    exit 1
  }
  echo "✓ workflow self-test: 5 kinds of violation caught; current workflows pass"
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test
else
  check "$ROOT/.github/workflows/ci.yml" "$ROOT/.github/workflows/deploy.yml" "$ROOT/packages/api/wrangler.jsonc"
  echo "✓ CI uses no secret or --remote; deploy secrets are per step; wrangler names --env=\"\"; health check on PUBLIC_ORIGIN"
fi
