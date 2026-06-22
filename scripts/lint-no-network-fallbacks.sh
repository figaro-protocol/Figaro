#!/usr/bin/env bash
#
# lint-no-network-fallbacks.sh — OPEN-WORLD FLOOR: no fabricated network state.
#
# A surface renders what the network says — a resolved-empty read is ABSENCE,
# never a synthesized stand-in (feedback_network_is_ssot, the NO-FALLBACKS
# corollary). This guard catches the class the existing guards never covered:
#   1. a NETWORK-derived value defaulting to a bundled constant: `?? CONTRACTS.x`
#   2. a COINED placeholder the protocol never says: 🍽️ / "Kernel-direct" / …
#
# Two things make this different from the guards that "didn't work for weeks":
#   - it matches a SHAPE (a fallback expression), not a stale literal that silently
#     stops matching after a rename;
#   - DUAL MODE — args ⇒ check those files (pre-commit diff); NO args ⇒ sweep the
#     WHOLE tracked frontend tree (certification of STATE, not just the diff). The
#     diff-only scoping is exactly why dead guards went unnoticed.
#
# Exit: 0 clean, 1 on any violation.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "$#" -gt 0 ]]; then
    files="$*"
else
    files=$(git ls-files frontend 2>/dev/null | grep -E '\.tsx?$')
fi

# (1) a chain/IPFS-derived value coalesced to a bundled constant.
PAT_DEFAULT='(\?\?|\|\|)[[:space:]]*CONTRACTS\.'
# (2) coined stand-ins minted by the frontend (placeholder emoji / labels).
PAT_COINED='🍽️|🍣|🍕|🛍️|Kernel-direct'

violations=0
for f in $files; do
    [[ -f "$f" ]] || continue
    case "$f" in *.ts|*.tsx) ;; *) continue ;; esac
    # contracts.ts is where the CONTRACTS constants legitimately live (deployment
    # config sourced from env vars) — reading them there is not a fallback. Tests
    # supply FIXTURE data, not network renders — the roster guard covers tests.
    case "$f" in
        *"lib/core/contracts.ts"|*"lib/mechanisms/contracts.ts") continue ;;
        */tests/*|*.test.ts|*.test.tsx|*.spec.ts) continue ;;
    esac
    # Defaulting a protocol ADDRESS to its configured constant is config
    # resolution, not fabricated content — only token/content fallbacks fabricate
    # what the network should say (a seller's currency, a catalogue image, …).
    ADDR='CONTRACTS\.(core|figaroCore|attestationCoordinator|clauseRegistry|clauseRegistrationHelper|sellerRegistry|assemblyRegistry|dutchAuction)'
    hits=$(grep -nE "$PAT_DEFAULT|$PAT_COINED" "$f" | grep -vE "$ADDR" || true)
    if [[ -n "$hits" ]]; then
        echo "[no-network-fallbacks] $f — fabricates network state (resolved-empty must render as ABSENCE):"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
done

if [[ "$violations" -gt 0 ]]; then
    echo ""
    echo "Render what the network says: a missing value is ABSENCE (no pill, no row, no"
    echo "stand-in), never a coined default/emoji or a bundled CONTRACTS constant."
    exit 1
fi
exit 0
