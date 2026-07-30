#!/usr/bin/env bash
#
# lint-desurfacing-event.sh — MemberWithdrawn is NOT the de-surfacing signal.
#
# MembersRegistry splits leaving into two calls:
#   requestWithdrawal()  clears the guard NOW  -> emits MemberWithdrawalRequested
#   withdraw()           releases the ETH later -> emits MemberWithdrawn
#
# A member is gone from the surface at the REQUEST. `MemberWithdrawn` is the
# custody event and can land a whole cooldown afterwards. Any reader that folds
# it to decide "is this address currently registered?" keeps a departed member
# listed in discovery — and, because the RPGF gate reads the same liveness,
# reports them as still reward-eligible for that entire window.
#
# This mistake was made THREE times in one migration (SDK discovery reducer,
# frontend membersRegistryIndexer, e2e discovery helper), which is why it is a
# guard and not a code comment. Whole-tree, not diff-scoped.
#
# The rule: a line that names `MemberWithdrawn` as an eventName/getAbiItem
# target must not also be a liveness fold. We approximate that structurally —
# `MemberWithdrawn` may appear only in (a) the canonical ABI declarations,
# (b) comments, and (c) tests that assert it does NOT de-surface.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

fail=0

# Any *executable* reference that selects the event by name for log reading.
# git grep over TRACKED files only. Do NOT use `grep -r --exclude-dir=lib` here:
# that excludes every directory named `lib` at any depth, which silently blinds
# the guard to the whole of `frontend/lib/` — where two of the three original
# instances lived. The pathspec below excludes only the vendored root `lib/`.
# Three shapes select the event in practice, and all three were used somewhere in
# the original migration:
#   eventName: "MemberWithdrawn"          (viem getContractEvents / local ABI)
#   name: "MemberWithdrawn"               (getAbiItem)
#   decoded.eventName === "MemberWithdrawn"  (decodeEventLog branch)
hits=$(git grep -nE "eventName:[[:space:]]*[\"']MemberWithdrawn[\"']|name:[[:space:]]*[\"']MemberWithdrawn[\"']|eventName[[:space:]]*===[[:space:]]*[\"']MemberWithdrawn[\"']" \
    -- '*.ts' '*.tsx' '*.mjs' ':!lib/*' ':!**/node_modules/*' ':!**/dist/*' 2>/dev/null || true)

if [[ -n "$hits" ]]; then
    # Allow it only where the surrounding test proves the negative.
    while IFS= read -r line; do
        file="${line%%:*}"
        case "$file" in
            ./sdk/tests/discovery.test.ts) continue ;;   # asserts it de-surfaces NOBODY
        esac
        echo "[desurfacing-event] $line"
        fail=1
    done <<< "$hits"
fi

if [[ $fail -ne 0 ]]; then
    cat <<'MSG'

[desurfacing-event] MemberWithdrawn is the CUSTODY event, not the de-surfacing signal.
    Liveness ("is this address currently registered/surfaced?") folds
    MemberWithdrawalRequested — emitted when the member asks to leave, while the
    deposit is still locked for the cooldown. Folding MemberWithdrawn instead
    keeps a departed member in discovery, and reward-eligible, until they claim.

    Fix: read `MemberWithdrawalRequested`. If you genuinely need the custody
    event (e.g. accounting for released ETH), say so at the call site and add
    the file to this guard's allowlist.
MSG
    exit 1
fi

echo "[desurfacing-event] clean — liveness folds MemberWithdrawalRequested"
