#!/usr/bin/env bash
#
# lint-builder-doc-claims.sh — tree guard for two builder-surface claims that
# aged silently before the 2026-08-24 hygiene audit caught them. Both cite
# paths that resolve while saying something FALSE about them, which is why
# lint-agent-surface-refs (existence-only) cannot catch this class.
#
#   1. SEQUENCER ROUTES — every route registered in prover/sequencer/src/api.rs
#      must be named on the surfaces that document the relay's HTTP surface
#      (/spec and sdk/README). The publication routes shipped 2026-07-31 and
#      were documented as nonexistent for two weeks.
#   2. RPGF EXCLUSION — no doc surface may claim commerce or topology are
#      excluded from the reward. The deploy scripts exclude ONLY
#      figaro-assembly-provenance ("the mandatory clauses EARN", ruled
#      2026-08-13); three surfaces taught the pre-ruling floor.
#
# Tree guard (no per-file args): run from repo root, wired into
# .husky/pre-commit's parallel tree-guard block.
#
# Exit code: 0 clean, 1 on any violation.

set -euo pipefail

API_RS="prover/sequencer/src/api.rs"
SPEC_PAGE="frontend/app/(marketing)/(spec)/spec/page.tsx"
SDK_README="sdk/README.md"

violations=0

# ── 1. Sequencer routes ─────────────────────────────────────────────
# First path segment of every axum .route() registration. /spec documents the
# raw HTTP surface; sdk/README documents it through the SequencerClient, so a
# route counts as documented there when its client method appears.
segments=$(grep -oE '\.route\("/[A-Za-z_-]+' "$API_RS" | sed 's|.*"/||' | sort -u)
if [[ -z "$segments" ]]; then
    echo "[builder-claims] $API_RS — no .route() registrations found; the guard's extraction is broken, fix the guard"
    violations=$((violations + 1))
fi
client_form() {
    case "$1" in
        submit) echo 'seq\.submit(Commit|Resolve|Attest)' ;;
        submit-usage) echo 'seq\.submitUsageClaim\(' ;;
        health) echo 'seq\.(isAvailable|health)\(' ;;
        status) echo 'seq\.status\(' ;;
        orders) echo 'seq\.order\(' ;;
        processes) echo 'seq\.process\(' ;;
        batches) echo 'seq\.batches\(' ;;
        *) echo "___no_client_form___" ;;
    esac
}
for seg in $segments; do
    if ! grep -q "/$seg" "$SPEC_PAGE"; then
        echo "[builder-claims] $SPEC_PAGE — relay route /$seg (registered in $API_RS) is undocumented; the relay's HTTP surface must be documented in full"
        violations=$((violations + 1))
    fi
    if ! grep -qE "/$seg|$(client_form "$seg")" "$SDK_README"; then
        echo "[builder-claims] $SDK_README — relay route /$seg has neither its path nor its SequencerClient method in the README; document it (or teach client_form its new method name)"
        violations=$((violations + 1))
    fi
done

# ── 2. RPGF exclusion set ───────────────────────────────────────────
# The excluded set is assembly-provenance alone; a doc line tying commerce or
# topology to exclusion is the pre-2026-08-13 floor coming back.
while IFS= read -r doc; do
    hits=$(grep -inE 'exclu[a-z]*[^.]{0,80}\b(commerce|topology)\b|\b(commerce|topology)\b[^.]{0,80}exclu' "$doc" || true)
    if [[ -n "$hits" ]]; then
        echo "[builder-claims] $doc — claims commerce/topology are RPGF-excluded; only assembly-provenance is (mandatory clauses EARN, ruled 2026-08-13)"
        echo "$hits" | head -3 | sed 's/^/    /'
        violations=$((violations + 1))
    fi
done < <(printf '%s\n' "$SPEC_PAGE" "$SDK_README" ecosystem-agents/*.md)

if (( violations > 0 )); then
    echo ""
    echo "[builder-claims] $violations violation(s). A doc that cites a real path"
    echo "                 while describing it falsely ages worse than a broken link."
    exit 1
fi

echo "[builder-claims] clean — relay routes documented, exclusion set stated as deployed"
exit 0
