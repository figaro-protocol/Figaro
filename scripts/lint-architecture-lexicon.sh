#!/usr/bin/env bash
#
# lint-architecture-lexicon.sh — pre-commit gate on the Figaro ARCHITECTURE
# BLUEPRINT lexicon. One canonical name per concept; retired / banned synonyms
# cannot reappear on tracked surfaces.
#
# This is the enforced half of the architecture blueprint. It grows tier by
# tier (kernel → on-chain composition → off-chain composition → …); folding in
# a tier means adding rows to the rule table below, never a new script.
#
# Complements — does not duplicate — the existing single-concept guards:
#   - lint-no-product-party-terms.sh      (buyer/seller vs merchant/operator…)
#   - lint-no-clause-grouping-synonyms.sh (article vs category/family)
# Do not re-cover a term those already own.
#
# Severity (per the escalate-to-lint convention):
#   FAIL — the canonical decision is settled AND the live tree is already clean,
#          so any occurrence is fresh drift. Blocks the commit.
#   WARN — the term is mid-retirement (occurrences still exist, or the doctrine
#          reword is pending). Prints for review; does NOT block. Promote to
#          FAIL once the retire-sweep lands.
#
# lint-staged passes the staged files as args (so only files you touch are
# checked — existing occurrences in untouched files do not block; they surface
# on next edit). Run manually:
#   bash scripts/lint-architecture-lexicon.sh path/to/file [more…]
#
# Exit: 0 on clean or WARN-only, 1 on any FAIL violation.

set -euo pipefail

# Paths the lexicon never gates (vendored, generated, archived, history).
is_excluded() {
    case "$1" in
        # This file is the lexicon definition — it names every banned term by
        # necessity, so it must never be checked against itself.
        *lint-architecture-lexicon.sh) return 0 ;;
        */node_modules/*|*/.git/*|*/dist/*|*/.next/*) return 0 ;;
        archive-*|*/archive-*) return 0 ;;
    esac
    return 1
}

fail=0

# check FILE SEVERITY PATTERN FILE_EXEMPT LINE_EXEMPT MESSAGE
#   PATTERN    — case-insensitive ERE; an occurrence is a violation
#   FILE_EXEMPT— file paths matching this ERE are skipped ("" = none); for the
#                curated doc(s) that legitimately NAME a term to forbid it
#   LINE_EXEMPT— hit LINES matching this ERE are dropped ("" = none); for
#                carve-out phrases (e.g. "JSON schema") that contain the term in
#                a legitimate, different sense
check() {
    local file="$1" sev="$2" pat="$3" exempt="$4" line_exempt="$5" msg="$6" hits
    [[ -n "$exempt" && "$file" =~ $exempt ]] && return 0
    hits=$(grep -nEi "$pat" "$file" || true)
    [[ -n "$line_exempt" && -n "$hits" ]] && hits=$(echo "$hits" | grep -vEi "$line_exempt" || true)
    [[ -z "$hits" ]] && return 0
    echo "[lexicon:$sev] $file — $msg"
    echo "$hits" | sed 's/^/      /'
    [[ "$sev" == FAIL ]] && fail=1
    return 0
}

for file in "$@"; do
    [[ -f "$file" ]] || continue
    is_excluded "$file" && continue

    # ── KERNEL tier ────────────────────────────────────────────────
    # Canonical: a 'process chain' (linear, kernel) — the off-chain topology is
    # a 'DAG'. The kernel 'commit' IS order arrival + acceptance (core-owned),
    # so there is no 'order-received' / 'accepted' clause event. The bonding
    # mechanism is 'asymmetric bonding'.
    check "$file" FAIL "[\"']order-received[\"']" "" "" \
        "'order-received' is not a clause event — the kernel commit IS arrival + acceptance (core-owned)."
    check "$file" FAIL "process tree" '(^|/)(CLAUDE\.md|docs/v5/LEXICON\.md)$' "" \
        "retired: use 'process chain' (kernel, linear) or 'DAG' (off-chain topology)."
    check "$file" FAIL "progressive[ -]collateral" '(^|/)(docs/v5/LEXICON\.md)$' "" \
        "retired: 'asymmetric bonding' is the mechanism; its N-party scaling face is 'cumulative upstream bonding' (each seller bonds against cumulative upstream value)."

    # ── clause vocabulary (cross-tier) ─────────────────────────────
    # Canonical: the protocol artifact family is the 'clause' (`ClauseRegistry`,
    # `IClauseValidator`, `clauseId`). The 'schema'→'clause' rename shipped, so
    # any new 'schema' is drift. Carve-outs (legitimate, different sense): IETF
    # "JSON Schema" (the spec format) and the frozen kernel's "commitment
    # schema" / "schema version" (struct layout).
    check "$file" FAIL "\\bschema" '(^|/)(CLAUDE\.md|docs/v5/LEXICON\.md)$' \
        'json[ -]schema|commitment schema|schema version|schema\.org' \
        "retired: the protocol artifact family is the 'clause' (ClauseRegistry / clauseId), not the 'schema'."

    # ── clause attestation tier + 'manifest' (2026 rename) ─────────
    # Canonical tiers (block.tier): 'cross-checked' / 'runtime' / 'agreement-only'.
    # 'manifest' is dead — use 'off-chain agreement' / 'pinned content' / 'sealed
    # payload'. Carve-outs: Cargo's own names (CARGO_MANIFEST_DIR / --manifest-path),
    # the English VERB (manifestation / will|would manifest), and the FROZEN kernel
    # (src/FigaroCore.sol keeps its original comments untouched).
    check "$file" FAIL "category-1\\b|category-2\\b|manifest-only|manifestOnly" \
        '(^|/)docs/v5/LEXICON\.md$' "" \
        "retired clause tier: use 'cross-checked' / 'runtime' / 'agreement-only' (block.tier)."
    check "$file" FAIL "\\bmanifest" \
        '(^|/)(docs/v5/LEXICON\.md|src/FigaroCore\.sol)$' \
        'CARGO_MANIFEST|--manifest-path|manifestation|will manifest|would manifest' \
        "retired: 'manifest' is dead — use 'off-chain agreement' / 'pinned content' / 'sealed payload'."
done

if (( fail > 0 )); then
    echo ""
    echo "[lexicon] FAIL — a retired/banned term reappeared. Canonical names live in the"
    echo "          architecture blueprint; see scripts/lint-architecture-lexicon.sh."
    exit 1
fi
exit 0
