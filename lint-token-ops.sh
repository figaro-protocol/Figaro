#!/bin/bash
# lint-token-ops.sh — Gate: every ERC20 token-moving call site in production
# `src/` must be tracked in `certora/token-ops.inventory`.
#
# Rationale: FigaroCore's economic security depends on every token movement
# being accounted for by a formal-verification rule. A new `transfer` /
# `transferFrom` call merged without a matching spec entry is a silent
# surface expansion. This script compares the actual call-site set against
# the inventory and refuses on any mismatch.
#
# Exit codes:
#   0 — inventory matches source exactly
#   1 — mismatch (new untracked call, or stale inventory entry)
#   2 — tooling error (missing inventory, grep/awk unavailable)

set -u

INVENTORY="certora/token-ops.inventory"
SRC_ROOT="src"

if [ ! -f "$INVENTORY" ]; then
    echo "❌ inventory not found: $INVENTORY" >&2
    exit 2
fi

# Extract actual call-site set from src/ (excluding mocks and fuzz harnesses).
# Normalized form: `<path>:<line>` — file path relative to repo root + line number.
actual=$(grep -rnE '\.safeTransfer(From)?\s*\(|\.transfer(From)?\s*\(' \
    "$SRC_ROOT" --include='*.sol' 2>/dev/null \
    | grep -v 'src/mocks/\|src/echidna/' \
    | awk -F: '{print $1 ":" $2}' \
    | sort -u)

# Extract declared call-site set from inventory.
# Pick the leading `<path>:<line>` token of each non-comment, non-blank line.
declared=$(grep -vE '^\s*(#|$)' "$INVENTORY" \
    | awk '{print $1}' \
    | sort -u)

# Diff: anything present in actual but not declared is a new untracked site;
# anything present in declared but not actual is a stale entry (line moved
# or site deleted without cleaning up the inventory).
untracked=$(comm -23 <(echo "$actual") <(echo "$declared"))
stale=$(comm -13 <(echo "$actual") <(echo "$declared"))

status=0

if [ -n "$untracked" ]; then
    status=1
    echo "❌ Untracked token-moving call site(s) — add to $INVENTORY:"
    while IFS= read -r line; do
        [ -n "$line" ] && echo "   + $line"
    done <<< "$untracked"
    echo ""
fi

if [ -n "$stale" ]; then
    status=1
    echo "❌ Stale inventory entry(ies) — line moved or call deleted without update:"
    while IFS= read -r line; do
        [ -n "$line" ] && echo "   - $line"
    done <<< "$stale"
    echo ""
fi

if [ $status -eq 0 ]; then
    count=$(echo "$actual" | wc -l | tr -d ' ')
    echo "✅ token-ops inventory in sync ($count call site(s) tracked)"
fi

exit $status
