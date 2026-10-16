#!/usr/bin/env bash
# Resets the local D1 and R2 and loads sample data (`pnpm seed`). Local only;
# there is no remote mode. Stop `wrangler dev` first: this deletes its state.
#
# Reset = delete the local D1 and R2 state and re-apply every migration. Local
# KV (OAuth sessions) is left alone. The owner row comes from owner.ts (dev
# passphrase: projects-lab-dev). Every file under scripts/seed/r2/ is uploaded
# with its path as the object key.
set -euo pipefail

for arg in "$@"; do
  if [[ $arg == --remote* ]]; then
    echo "seed: refuses --remote; it only resets local D1 and R2." >&2
    exit 2
  fi
done

SEED="$(cd "$(dirname "$0")/seed" && pwd)"
API="$(cd "$(dirname "$0")/../packages/api" && pwd)"
WRANGLER="$API/node_modules/.bin/wrangler"
TSX="$(cd "$(dirname "$0")/.." && pwd)/node_modules/.bin/tsx"
DB=projects-lab
BUCKET=projects-lab-images
STATE="$API/.wrangler/state/v3"
LOG="$(mktemp)"
OWNER_SQL="$(mktemp)"
trap 'rm -f "$LOG" "$OWNER_SQL"' EXIT
cd "$API"

quiet() { "$@" >"$LOG" 2>&1 || { cat "$LOG" >&2; exit 1; }; }

echo "Resetting local D1 and R2"
rm -rf "$STATE/d1" "$STATE/r2"
CI=true quiet "$WRANGLER" d1 migrations apply "$DB" --local

echo "Loading D1 sample data"
echo "  owner.ts"
"$TSX" "$SEED/owner.ts" >"$OWNER_SQL"
quiet "$WRANGLER" d1 execute "$DB" --local --file "$OWNER_SQL"
for file in "$SEED"/*.sql; do
  echo "  $(basename "$file")"
  quiet "$WRANGLER" d1 execute "$DB" --local --file "$file"
done

echo "Loading R2 sample objects"
(cd "$SEED/r2" && find . -type f | sed 's|^\./||' | sort) | while read -r key; do
  echo "  $key"
  quiet "$WRANGLER" r2 object put "$BUCKET/$key" --local --file "$SEED/r2/$key"
done

echo "Done"
