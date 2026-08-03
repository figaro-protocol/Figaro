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
        # Generated lockfiles: third-party package names ('object-schema', …)
        # are not Figaro vocabulary.
        *package-lock.json|*Cargo.lock) return 0 ;;
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
    # Exempt = the files that STATE the prohibition (they must name the banned
    # term to ban it). The paper-authorship ruleset moved out of CLAUDE.md into
    # its owning agent 2026-07-27; the exemption follows the rule's home.
    check "$file" FAIL "process tree" '(^|/)(CLAUDE\.md|docs/LEXICON\.md|\.claude/agents/figaro-papers-editor\.md)$' "" \
        "retired: use 'process chain' (kernel, linear) or 'DAG' (off-chain topology)."
    check "$file" FAIL "progressive[ -]collateral" '(^|/)(docs/LEXICON\.md)$' "" \
        "retired: 'asymmetric bonding' is the mechanism; its N-party scaling face is 'cumulative upstream bonding' (each seller bonds against cumulative upstream value)."
    # 'core' is the KERNEL's reserved tier-word (FigaroCore, frozen). The SDK is
    # the protocol/runtime client and MUST NOT wear it — the package renamed
    # @figaro/core → @figaro/sdk (98bf52d3) precisely so an agent can't
    # pattern-match "import from core ⇒ kernel-tier code" (the layer-collapse
    # gradient). Any reappearance as an import specifier / package name is drift.
    # Exempt = the doc that STATES the prohibition (LEXICON.md's Verifiers list
    # names the banned term to ban it, same as the sibling checks above).
    check "$file" FAIL "@figaro/core" '(^|/)(docs/LEXICON\.md)$' "" \
        "retired package name: the SDK is '@figaro/sdk' — '@figaro/core' misapplies the kernel tier-word 'core' to the runtime client."

    # ── clause vocabulary (cross-tier) ─────────────────────────────
    # Canonical: the protocol artifact family is the 'clause' (`ClauseRegistry`,
    # `IClauseValidator`, `clauseId`). The 'schema'→'clause' rename shipped, so
    # any new 'schema' is drift. Carve-outs (legitimate, different sense): IETF
    # "JSON Schema" (the spec format) and the frozen kernel's "commitment
    # schema" / "schema version" (struct layout).
    # Carve-out: a *.schema.json artifact (and its conformance test) IS an IETF
    # JSON Schema — the published format definition of a clause spec — a homonym
    # of the retired Figaro 'schema' (the clause artifact family), not drift.
    check "$file" FAIL "\\bschema" '(^|/)(CLAUDE\.md|docs/LEXICON\.md)$|\.schema\.json$|schema-conformance\.test' \
        'json[ -]schema|commitment schema|schema version|schema\.org|\.schema\.json|\$schema' \
        "retired: the protocol artifact family is the 'clause' (ClauseRegistry / clauseId), not the 'schema'."

    # ── retired clause vocabulary ('tier' / 'manifest', 2026) ──────
    # block.tier is DEAD — ripped from the block model. There is NO per-clause
    # "verification tier": every clause section is a merkle leaf under the signed
    # agreementHash, and that uniform keccak binding IS the cross-check (security
    # is the whole reason for the merkle tree). 'cross-checked' and 'runtime'
    # named the SAME object; the real, DERIVED distinction is agreement-only
    # (committed, never attested) vs runtime-attested (clauseIsProcessLog — an
    # empty anchor at commit, content filed later). 'manifest' is dead — use
    # 'off-chain agreement' / 'pinned content' / 'sealed payload'. Carve-outs:
    # Cargo's own names (CARGO_MANIFEST_DIR / --manifest-path), the English VERB
    # (manifestation / will|would manifest), and the FROZEN kernel
    # (src/kernel/FigaroCore.sol keeps its original comments untouched).
    check "$file" FAIL "category-1\\b|category-2\\b|manifest-only|manifestOnly" \
        '(^|/)docs/LEXICON\.md$' "" \
        "retired clause tier: block.tier is dead — clauses are uniformly merkle-committed; lifecycle (agreement-only vs runtime-attested) is derived in code, not a stored tier."
    check "$file" FAIL "\\bmanifest" \
        '(^|/)(docs/LEXICON\.md|src/kernel/FigaroCore\.sol)$' \
        'CARGO_MANIFEST|--manifest-path|manifestation|will manifest|would manifest' \
        "retired: 'manifest' is dead — use 'off-chain agreement' / 'pinned content' / 'sealed payload'."

    # ── token concepts (three distinct; operator ruling 2026-07-17) ──
    # The florin is a PURE SCHELLING POINT — nothing structural anywhere is
    # conditioned on it (its only couplings are its own issuance: genesis +
    # RpgfMinter). figaro-denomination is a GENERIC pin: the designer names ANY
    # ERC-20; the clause carries no economics. The privileged token (VISION
    # § "Value Capture After the Firm") is an ASSEMBLY-AUTHOR's own token.
    # Assimilating any two is the thrice-recurring drift (reverted 2026-07-17);
    # same-line coupling is the tell. LEXICON.md documents the distinction.
    check "$file" FAIL "florin.*figaro-denomination|figaro-denomination.*florin" \
        '(^|/)docs/LEXICON\.md$' "" \
        "florin ≠ figaro-denomination: the pin is generic (any ERC-20); the florin has no structural role."
    check "$file" FAIL "florin.*privileged token|privileged token.*florin" \
        '(^|/)docs/LEXICON\.md$' "" \
        "florin ≠ privileged token: the privileged token is an assembly-author's OWN token (VISION doctrine), never the protocol's."
    check "$file" FAIL "florin-pinned|florin.*structural demand|structural demand.*florin" \
        '(^|/)docs/LEXICON\.md$' "" \
        "the florin has NO structural demand mechanism — it is a pure Schelling point."
    check "$file" FAIL "privileged token.*figaro-denomination|figaro-denomination.*privileged token|PRIVILEGED TOKEN.*pin|pin.*PRIVILEGED TOKEN" \
        '(^|/)(docs/LEXICON\.md|docs/VISION\.md)$' "" \
        "privileged token ≠ figaro-denomination: the pin is a generic slot (any ERC-20, no economics); the privileged token is VISION doctrine — an author's STRATEGY that may use the slot. The denomination birth commit carried this conflation; do not reintroduce it."
done

if (( fail > 0 )); then
    echo ""
    echo "[lexicon] FAIL — a retired/banned term reappeared. Canonical names live in the"
    echo "          architecture blueprint; see scripts/lint-architecture-lexicon.sh."
    exit 1
fi
exit 0
