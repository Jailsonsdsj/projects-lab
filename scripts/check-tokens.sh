#!/usr/bin/env bash
# Fails if a literal colour, size, duration, curve or z-index escaped the tokens.
#
# Colours, type, spacing, border widths, breakpoints and motion come from
# packages/web/src/styles/tokens.css only (CLAUDE.md, docs/design-system.md).
# Nobody remembers --space-3 at the end of a long session unless something
# forces them to look. This is that something.
#
#   check-tokens.sh [dir]        scan dir (default packages/web/src)
#   check-tokens.sh --self-test  prove the guard can still fail
#
# The self-test exists because a broken guard exits 0 forever and CI stays green
# while drift accumulates. `pnpm lint` and CI run it before the real scan.
#
# Not scanned: tokens.css (the one home of literals), components.css
# (generated from the design bundle, which is the authority), and tests, which
# set token values on purpose.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOKENS="styles/tokens.css"
GENERATED="styles/components.css"

scan() {
  local src="$1"
  local fail=0

  # report <label> <pattern> <include globs…>
  report() {
    local label="$1" pattern="$2"
    shift 2
    local includes=()
    for glob in "$@"; do includes+=(--include="$glob"); done
    local hits
    hits=$(grep -rInE "$pattern" "$src" "${includes[@]}" \
      | grep -vE "/($TOKENS|$GENERATED):|\.test\.tsx?:|/test/" || true)
    if [ -n "$hits" ]; then
      echo "✗ $label: use a token from $TOKENS instead:"
      echo "$hits" | sed 's/^/    /'
      fail=1
    fi
  }

  report "literal hex colour" '#[0-9a-fA-F]{3,8}\b' '*.ts' '*.tsx' '*.css'
  report "literal colour function" '\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(' '*.ts' '*.tsx' '*.css'
  report "literal size (px or rem): font size, spacing, border width, breakpoint" \
    '(^|[^-a-zA-Z0-9_.])[0-9]*\.?[0-9]+(px|rem)\b' '*.ts' '*.tsx' '*.css'
  report "numeric size in a React style object" \
    '\b(fontSize|lineHeight|letterSpacing|border\w*Width|borderRadius|padding\w*|margin\w*|gap|top|right|bottom|left|width|height|minWidth|maxWidth|minHeight|maxHeight)\s*:\s*-?[0-9]' \
    '*.tsx'
  report "literal duration" '(^|[^-a-zA-Z0-9_.])[0-9]*\.?[0-9]+m?s\b' '*.css'
  report "literal easing curve" '\b(cubic-bezier|steps)\(' '*.ts' '*.tsx' '*.css'
  report "z-index (the design uses the top layer, not z-index)" '\bz-?[iI]ndex\s*:' '*.ts' '*.tsx' '*.css'

  if [ "$fail" -eq 0 ]; then
    echo "✓ no literal colours, sizes, durations, curves or z-index outside $TOKENS"
  fi
  return "$fail"
}

self_test() {
  local tmp status out
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  # expect_fail <file name> <content> <what it proves>
  expect_fail() {
    local name="$1" content="$2" what="$3"
    printf '%s\n' "$content" >"$tmp/$name"
    set +e
    out="$(scan "$tmp" 2>&1)"
    status=$?
    set -e
    rm "$tmp/$name"
    if [ "$status" -eq 0 ]; then
      echo "✗ self-test: the guard passed $what; it is not guarding." >&2
      return 1
    fi
    if ! printf '%s' "$out" | grep -q "$name"; then
      echo "✗ self-test: the guard failed on $what but did not name $name." >&2
      printf '%s\n' "$out" >&2
      return 1
    fi
  }

  expect_fail colour.ts 'const c = "#ff0000";' "#ff0000"
  expect_fail font.css '.x { font-size: 14px; }' "a px font-size"
  expect_fail border.css '.x { border: 1px solid var(--color-border); }' "a px border width"
  expect_fail breakpoint.css '@media (min-width: 768px) { .x { display: none; } }' "a px breakpoint"
  expect_fail rgb.css '.x { color: rgba(0, 0, 0, 0.5); }' "an rgba() colour"
  expect_fail motion.css '.x { transition: opacity 200ms ease; }' "a literal duration"
  expect_fail curve.css '.x { transition-timing-function: cubic-bezier(0.2, 0, 0, 1); }' "a cubic-bezier()"
  expect_fail style.tsx 'export const X = () => <p style={{ fontSize: 14 }} />;' "fontSize: 14 in a style object"
  expect_fail layer.css '.x { z-index: 10; }' "a z-index"

  # Token-only code must pass, or the guard is unusable.
  printf '%s\n' \
    '.x { font-size: var(--text-sm); border: var(--border-thin) solid var(--color-border); }' \
    '.y { transition: opacity var(--duration-fast) var(--ease-standard); padding: calc(var(--space-2) * 2); }' \
    '.z { width: 100%; opacity: 0.5; aspect-ratio: 16 / 9; }' >"$tmp/clean.css"
  printf '%s\n' \
    'export const href = "#backlog"; const c = "var(--color-lab-accent)";' \
    'export const P = () => <p className="text-ink-muted p-3" style={{ width: "75%" }} />;' >"$tmp/clean.tsx"
  set +e
  out="$(scan "$tmp" 2>&1)"
  status=$?
  set -e
  if [ "$status" -ne 0 ]; then
    echo "✗ self-test: the guard rejected a file that only uses tokens:" >&2
    printf '%s\n' "$out" >&2
    return 1
  fi

  # tokens.css, the generated components.css and tests are allowed literals.
  mkdir -p "$tmp/styles"
  printf '%s\n' ':root { --x: #ff0000; --y: 14px; }' >"$tmp/styles/tokens.css"
  printf '%s\n' '.btn { border: 1px solid; }' >"$tmp/styles/components.css"
  printf '%s\n' 'setToken("--breakpoint-tablet", "768px");' >"$tmp/shell.test.tsx"
  set +e
  scan "$tmp" >/dev/null 2>&1
  status=$?
  set -e
  if [ "$status" -ne 0 ]; then
    echo "✗ self-test: the guard flagged tokens.css, components.css or a test." >&2
    return 1
  fi

  echo "✓ self-test: 9 kinds of literal rejected; tokens, generated CSS and tests accepted"
}

if [ "${1:-}" = "--self-test" ]; then
  self_test
else
  scan "${1:-$ROOT/packages/web/src}"
fi
