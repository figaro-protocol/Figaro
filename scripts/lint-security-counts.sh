#!/usr/bin/env bash
# lint-security-counts.sh — /security's verification-layer counts are DERIVED
# facts, never prose. The page cites concrete counts per harness (Foundry
# test+invariant functions, Halmos check-properties, Certora rules and spec
# files, Echidna properties); 299 drifted to 301 unnoticed before this guard
# existed. Each count is recomputed from the tree here and the page must cite
# it exactly — a mismatch fails the commit with the number to update.
#
# TLA+ is deliberately absent: the page's TLA+ claim ("four protocol state
# machines") names models, not a function count, and model membership changes
# by ruling, not by drift.

set -euo pipefail
cd "$(dirname "$0")/.."
PAGE="frontend/app/(marketing)/(spec)/security/page.tsx"
[ -f "$PAGE" ] || { echo "❌ lint-security-counts: $PAGE missing"; exit 1; }

fail=0
require() { # label, derived count, page pattern (must contain the count)
    local label="$1" derived="$2" pattern="$3"
    if ! grep -qE "$pattern" "$PAGE"; then
        echo "❌ /security drift: the tree derives $label = $derived, but the page has no match for /$pattern/"
        echo "   → update $PAGE to the derived number (or fix the derivation here if the counting rule changed)"
        fail=1
    fi
}

foundry=$(grep -rhE '^\s*function (test|invariant)' test --include='*.t.sol' | wc -l | tr -d ' ')
halmos=$(grep -rhE '^\s*function (check_|prove_)' test --include='*.sol' | wc -l | tr -d ' ')
certora=$(grep -hE '^\s*(rule|invariant) ' certora/*.spec | wc -l | tr -d ' ')
specs=$(ls certora/*.spec | wc -l | tr -d ' ')
echidna=$(grep -rhE '^\s*function echidna_' src/echidna --include='*.sol' | wc -l | tr -d ' ')

# The spec-file count appears spelled out ("across six CVL specs").
case "$specs" in
    1) specs_word=one ;; 2) specs_word=two ;; 3) specs_word=three ;; 4) specs_word=four ;;
    5) specs_word=five ;; 6) specs_word=six ;; 7) specs_word=seven ;; 8) specs_word=eight ;;
    9) specs_word=nine ;; *) specs_word="$specs" ;;
esac

require "Foundry test+invariant functions" "$foundry" "$foundry test and invariant functions"
require "Halmos properties" "$halmos" "$halmos symbolic-execution properties"
require "Certora rules" "$certora" "$certora formal rules"
require "Certora spec files" "$specs_word" "across $specs_word CVL specs"
require "Echidna properties" "$echidna" "$echidna property-based fuzzing targets"

if [ "$fail" -ne 0 ]; then exit 1; fi
echo "[security-counts] clean — page counts match the tree ($foundry/$halmos/$certora/$specs_word/$echidna)"
