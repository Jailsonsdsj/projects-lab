#!/usr/bin/env bash
# The real stack for the e2e journeys (H-03, H-04): builds the web app, makes a
# fresh local D1 in $E2E_STATE (every migration, then the seed owner, dev
# passphrase projects-lab-dev), and runs the Worker serving it on $E2E_PORT.
# Started by e2e/journeys/playwright.config.ts. Local only: the secrets are
# fixed test values, and there is no remote mode.
set -euo pipefail

for arg in "$@"; do
  if [[ $arg == --remote* ]]; then
    echo "e2e-stack: refuses --remote; it only runs a throwaway local Worker." >&2
    exit 2
  fi
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="$ROOT/packages/api"
WRANGLER="$API/node_modules/.bin/wrangler"
TSX="$ROOT/node_modules/.bin/tsx"
STATE="${E2E_STATE:?set by e2e/journeys/playwright.config.ts}"
PORT="${E2E_PORT:?set by e2e/journeys/playwright.config.ts}"
LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

quiet() { "$@" >"$LOG" 2>&1 || { cat "$LOG" >&2; exit 1; }; }

(cd "$ROOT/packages/web" && quiet ./node_modules/.bin/vite build)

rm -rf "$STATE"
mkdir -p "$STATE"
cd "$API"
CI=true quiet "$WRANGLER" d1 migrations apply projects-lab --local --persist-to "$STATE"
"$TSX" "$ROOT/scripts/seed/owner.ts" >"$STATE/owner.sql"
quiet "$WRANGLER" d1 execute projects-lab --local --persist-to "$STATE" --file "$STATE/owner.sql"

# GitHub is never reached: the journeys answer the two reads that need it in
# the browser (the Worker may only fetch public addresses, so no local stub).
exec "$WRANGLER" dev --port "$PORT" --persist-to "$STATE" \
  --show-interactive-dev-session=false \
  --var "TOKEN_SIGNING_KEY:e2e-token-signing-key" \
  --var "GITHUB_TOKEN:e2e-no-github" \
  --var "PUBLIC_ORIGIN:http://localhost:$PORT"
