#!/usr/bin/env bash
#
# lint-no-closed-world-vocab.sh — pre-commit guard against re-introducing
# closed-world vocabulary in code.
#
# The recurring base-model failure on this project is closing an open set to
# make it enumerable: a stored role/archetype/category field where meaning is
# DERIVED from clauses + event state. Each banned identifier below was added,
# corrected, and excised at least once (roleKind: 37 commits, archetypeId: 13,
# fulfilment: 119). Memories advise, guards enforce — this guard makes the
# excision permanent.
#
# FAIL — verified at zero in live code; any reappearance is the old model
# coming back:
#   roleKind, archetypeId, clauseCategories, documentKind
#   fulfilment / fulfillment (any casing) — promoted WARN→FAIL 2026-06-11
#   when the figaro-fulfilment-v2 retirement landed (split into the
#   single-select modalities + coordination clauses) and the word swept to
#   zero. The replacement vocabulary is modality / coordination / method.
#
# Scope: code files only (.ts/.tsx/.sol/.rs). Docs and CLAUDE.md narrate the
# history of these words and are exempt, as are the /papers pages
# (frontend/app/(marketing)/papers/ — historical prose rendered as .tsx).
#
# Wired into the root package.json lint-staged block under
# `**/*.{ts,tsx,sol,rs}`. Run manually over the whole repo:
#   git ls-files '*.ts' '*.tsx' '*.sol' '*.rs' | xargs bash scripts/lint-no-closed-world-vocab.sh
#
# Exit code: 0 on clean (warnings allowed), 1 on any FAIL violation.

set -euo pipefail

FAIL_TERMS='roleKind|archetypeId|clauseCategories|documentKind'
FAIL_WORD='[Ff]ulfil+ment'

violations=0

for file in "$@"; do
    [[ -f "$file" ]] || continue
    case "$file" in
        *.ts | *.tsx | *.sol | *.rs) ;;
        *) continue ;;
    esac
    # Papers narrate the project's history (incl. retired vocabulary) — exempt.
    case "$file" in
        *"(marketing)/papers/"*) continue ;;
    esac

    hits=$(grep -nE "\b($FAIL_TERMS)\b" "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[closed-world] $file — banned closed-world identifier (meaning is derived from clauses + events, never stored)"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi

    hits=$(grep -nE "$FAIL_WORD" "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[closed-world] $file — 'fulfilment' is RETIRED vocabulary (the v2 clause split into modalities + coordination; say modality / coordination / method)"
        echo "$hits" | head -3 | sed 's/^/    /'
        violations=$((violations + 1))
    fi
done

if (( violations > 0 )); then
    echo ""
    echo "[closed-world] $violations violation(s). There is no stored role/archetype/"
    echo "               category/modality field in Figaro: what a party or node does"
    echo "               is a clause/state lookup. Derive it; don't store it."
    exit 1
fi

exit 0
