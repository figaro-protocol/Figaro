#!/usr/bin/env bash
#
# lint-composition-is-designer-only.sh — pre-commit guard that keeps assembly
# COMPOSITION confined to the designer.
#
# The premise (CLAUDE.md; [[feedback_composition_is_designer_only]],
# [[reference_lifecycle_phases]] "Designer ≠ seller"): there are three distinct
# runtime roles and only ONE composes.
#
#   - DESIGNER composes — attaches clauses, builds assembly TEMPLATES. Surface:
#     /builders/designer (the editable AgreementDrawer + buildAssemblyTemplate).
#   - SELLER binds — appends designer-published assemblies to its profile array.
#   - BUYER selects & fills — picks a seller's bound assembly, fills allowed
#     fields at checkout. Instantiates a published template; never composes.
#
# Why this guard exists: the base model defaults to a product-app mental model
# where "the party transacting builds its own deal," so an agent slides
# composition into buyer/seller/runtime surfaces (checkout, seller profile, the
# order page). It shipped as analysis on 2026-06-17 — seeded by a memory that
# read "buyer composes commerce/geo". Memories advise; this guard enforces — it
# stops the next agent at commit if a NON-designer surface starts composing.
#
# Allowed composition homes (substring match on the staged path):
#   - app/(builders)/builders/designer/   (the designer surface — canvas + drawer)
#   - lib/designer/                  (the composition library it drives)
#
# Composition signatures (a non-designer surface that composes cannot avoid one):
#   1. buildAssemblyTemplate( / serializeAssemblyTemplate( — building a template.
#   2. onToggleClause= / onSetClauseField= — passing the editable-drawer clause-
#      mutation handlers (i.e. mounting the drawer in COMPOSE, not read-only, mode).
#
# Wired into the root package.json lint-staged block under
# `frontend/**/*.{ts,tsx}`. Run manually:
#   bash scripts/lint-composition-is-designer-only.sh path/to/file.tsx [...]
#
# Exit code: 0 on clean, 1 on any violation.

set -euo pipefail

# The two paths where composition legitimately lives. A file under either is
# exempt; everything else (checkout, seller profile, order runtime, discover,
# shared components) must not compose. Tests are exempt too — they legitimately
# exercise the composition lib (e.g. assemblySlug.test.ts asserts the derivation)
# and drive the designer UI; the guard targets PRODUCTION surfaces.
ALLOWED_1='app/(builders)/builders/designer/'
ALLOWED_2='lib/designer/'

violations=0

for file in "$@"; do
    [[ -f "$file" ]] || continue
    [[ "$file" == *.ts || "$file" == *.tsx ]] || continue
    [[ "$file" == *"$ALLOWED_1"* ]] && continue
    [[ "$file" == *"$ALLOWED_2"* ]] && continue
    # Test files exercise/drive composition by design.
    [[ "$file" == *"/tests/"* || "$file" == *.test.ts || "$file" == *.test.tsx \
       || "$file" == *.spec.ts || "$file" == *.spec.tsx ]] && continue

    # Signature 1: building/serializing an assembly template.
    hits=$(grep -nE '\b(build|serialize)AssemblyTemplate\(' "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[composition-designer-only] $file builds an assembly template outside the designer"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi

    # Signature 2: passing the editable-drawer clause-mutation handlers.
    hits=$(grep -nE 'on(ToggleClause|SetClauseField)=' "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[composition-designer-only] $file mounts the clause-composition drawer in edit mode outside the designer"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
done

if (( violations > 0 )); then
    echo ""
    echo "[composition-designer-only] $violations violation(s): composition leaked out of the designer."
    echo "Composition (attaching clauses, building a template, the editable AgreementDrawer)"
    echo "belongs ONLY in app/(builders)/builders/designer/. Sellers BIND published assemblies;"
    echo "buyers SELECT + fill at checkout — neither composes. See"
    echo "feedback_composition_is_designer_only / reference_lifecycle_phases."
    exit 1
fi

exit 0
