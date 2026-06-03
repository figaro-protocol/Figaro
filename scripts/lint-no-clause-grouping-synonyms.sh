#!/usr/bin/env bash
#
# lint-no-clause-grouping-synonyms.sh — pre-commit gate on the clause-GROUPING
# lexicon. There is exactly ONE word for "the group a clause is read under":
# **article** (spec-resident as `block.drawerArticle`, the canonical source).
#
# The synonym machine kept minting names for this one concept — `category`
# (abandoned 2026-06-01), `family` (CLAUSE_FAMILY_MAP), a misnamed
# `clauseCategories.ts` file — and the rename never finished. This guard closes
# the loop the way lint-no-product-party-terms.sh did for buyer/seller: the dead
# synonyms cannot reappear on permanent frontend surfaces.
#
# BANNED (frontend `lib/`, `app/`, `components/`):
#   - identifiers containing CLAUSE_FAMILY / CLAUSES_BY_FAMILY / ClauseFamily /
#     getClauseFamily / CLAUSE_CATEGOR (the dead grouping vocabulary)
#   - a file or import path named `clauseCategories`
#
# NOT banned (legitimate, distinct concepts — each its own single word):
#   - `block.tier` / ClauseTier (WHEN a clause is attested — a different axis)
#   - `LensId` (the ProcessGraphCanvas overlay — a different concept)
#   - `block.drawerArticle` / `article` (the CANONICAL grouping source itself)
#   - `category-1` / `category-2` (tier VALUES — a separate lexicon, gate later)
#
# Wired into the root package.json lint-staged block under
# `frontend/**/*.{ts,tsx}`. Run manually:
#   bash scripts/lint-no-clause-grouping-synonyms.sh path/to/file.tsx [more…]
#
# Exit code: 0 on clean, 1 on any violation.

set -euo pipefail

violations=0

for file in "$@"; do
    [[ -f "$file" ]] || continue
    [[ "$file" == *.ts || "$file" == *.tsx ]] || continue
    case "$file" in */node_modules/*) continue;; esac

    # 1. Dead grouping identifiers.
    hits=$(grep -nE '\b(CLAUSE_FAMILY_MAP|CLAUSES_BY_FAMILY|ClauseFamily|getClauseFamily|CLAUSE_CATEGOR[A-Z_]*)\b' "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[clause-grouping] $file uses a dead grouping synonym (family/category)"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi

    # 2. The misnamed module path.
    hits=$(grep -nE 'clauseCategories' "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[clause-grouping] $file references the deleted clauseCategories module"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
done

if (( violations > 0 )); then
    echo ""
    echo "[clause-grouping] $violations violation(s). The clause group is the ARTICLE,"
    echo "read from the spec (block.drawerArticle). There is no 'category' and no 'family'."
    echo "Spec-reading helpers live in clauseSpecSource.ts, not a clauseCategories file."
    exit 1
fi

exit 0
