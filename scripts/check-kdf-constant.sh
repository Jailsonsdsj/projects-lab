#!/usr/bin/env bash
# Fails if the KDF iteration count is spelled anywhere but its home file
# (docs/prd/01-identity-and-access.md). Everything else imports KDF_ITERATIONS.
# The value is read from that file, so raising it never needs this script edited.
set -euo pipefail

cd "$(dirname "$0")/.."
HOME_FILE=packages/shared/src/core/kdf.ts

digits="$(sed -nE 's/^export const KDF_ITERATIONS = ([0-9_]+);.*/\1/p' "$HOME_FILE" | tr -d '_')"
if [[ -z $digits ]]; then
  echo "check-kdf-constant: no 'export const KDF_ITERATIONS = <n>;' in $HOME_FILE" >&2
  exit 1
fi

# Match the number with or without thousands separators: [_,]? between groups of three.
pattern=""
rest="$digits"
while ((${#rest} > 3)); do
  pattern="[_,]?${rest: -3}${pattern}"
  rest="${rest:0:${#rest}-3}"
done
pattern="${rest}${pattern}"

# Tracked and new files; git-ignored ones (node_modules, build output) are skipped.
offenders="$(git grep -lE --untracked "(^|[^0-9])${pattern}([^0-9]|$)" -- ":!$HOME_FILE" || true)"
if [[ -n $offenders ]]; then
  echo "check-kdf-constant: the KDF iteration count ($digits) is spelled outside $HOME_FILE." >&2
  echo "Import KDF_ITERATIONS instead in:" >&2
  echo "$offenders" | sed 's/^/  /' >&2
  exit 1
fi
