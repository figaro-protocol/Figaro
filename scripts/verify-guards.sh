#!/usr/bin/env bash
# scripts/verify-guards.sh — the WHOLE-TREE guard battery.
#
# Runs EVERY commit guard over the whole tracked tree (not just a staged diff),
# then knip and the type-checks. This is the gate the per-diff pre-commit hook
# structurally CANNOT be: lint-staged only ever passes the files a commit
# touches, so a guard added (or tightened) after a file was last committed never
# re-inspects that file. This battery re-certifies the whole tree. CI runs it;
# run it locally before a release or after a broad refactor.
#
# It REUSES the exact guard scripts the pre-commit hook runs — NO check is
# reimplemented here. Each argument-driven guard (the ones that iterate `"$@"`)
# is fed the whole-tree file set matching the glob it is registered against in
# package.json `lint-staged`; the self-sourcing guards (git ls-files / find of
# their own) are invoked directly.
#
# NOT included, by design:
#   • the semantic open-world gate (scripts/semantic-precommit-audit.sh) —
#     diff-only + reasoning-agent; it cannot run whole-tree. CI wires it as its
#     own step that skips gracefully when no API key is present.
#   • forge fmt --check — foundry-owned; foundry-ci runs it (keeps this battery
#     bash+node only, no Solidity toolchain).
#   • lint-claude-local-allowlist.sh — inspects the STAGED set; it is a
#     commit-time hygiene gate with nothing to assert over a whole tree.
#
# Prereqs: workspace installed + SDK built (`devup` does both). tsc and knip
# need frontend/node_modules and sdk/dist present.
#
# Exit codes:
#   0 — every guard passed
#   1 — one or more guards failed (the failing labels are listed at the end)

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FAILURES=""

# record <label> <exit-code> — tally + report one guard's outcome.
record() {
    if [ "$2" -eq 0 ]; then
        echo "  ✓ $1"
    else
        echo "  ✗ $1 — FAILED (exit $2)"
        FAILURES="$FAILURES $1"
    fi
}

# fed <label> <script> <pathspec...> — feed an argument-driven guard the
# whole-tree file set matching the given git pathspecs.
fed() {
    local label="$1" script="$2"; shift 2
    echo ""
    echo "── $label (whole tree) ──"
    git ls-files "$@" | xargs -r bash "$script"
    record "$label" $?
}

# solo <label> <script> — a self-sourcing guard (globs the tree itself).
solo() {
    local label="$1" script="$2"
    echo ""
    echo "── $label ──"
    bash "$script"
    record "$label" $?
}

# ── Argument-driven guards (fed the whole-tree file set per lint-staged glob) ──

fed "architecture-lexicon"        scripts/lint-architecture-lexicon.sh   '*.ts' '*.tsx' '*.sol' '*.md'
fed "no-closed-world-vocab"       scripts/lint-no-closed-world-vocab.sh  '*.ts' '*.tsx' '*.sol' '*.rs'
fed "canonical-imports"           scripts/lint-canonical-imports.sh          'frontend/**/*.ts' 'frontend/**/*.tsx'
fed "no-eyebrows"                 scripts/lint-no-eyebrows.sh                'frontend/**/*.ts' 'frontend/**/*.tsx'
fed "no-product-party-terms"      scripts/lint-no-product-party-terms.sh     'frontend/**/*.ts' 'frontend/**/*.tsx'
fed "no-hardcoded-clauses"        scripts/lint-no-hardcoded-clauses-in-runtime.sh 'frontend/**/*.ts' 'frontend/**/*.tsx'
fed "no-clause-names"             scripts/lint-no-clause-names.sh            'frontend/**/*.ts' 'frontend/**/*.tsx'
fed "no-clause-grouping-synonyms" scripts/lint-no-clause-grouping-synonyms.sh 'frontend/**/*.ts' 'frontend/**/*.tsx'
fed "type-safety"                 scripts/lint-type-safety.sh                'frontend/**/*.ts' 'frontend/**/*.tsx'
fed "composition-is-designer-only" scripts/lint-composition-is-designer-only.sh 'frontend/**/*.ts' 'frontend/**/*.tsx'
fed "window-globals"              scripts/lint-window-globals.sh             'frontend/**/*.ts' 'frontend/**/*.tsx'
fed "no-handwritten-kernel-abis"  scripts/lint-no-handwritten-kernel-abis.sh 'frontend/**/*.ts' 'frontend/**/*.tsx' 'frontend/scripts/*.mjs'
fed "no-devnet-revert"            scripts/lint-no-devnet-revert.sh           'frontend/tests/**/*.devnet.spec.ts'
fed "clause-choices-are-bounded"  scripts/lint-clause-choices-are-bounded.sh 'clauses/*.json'

# ── Self-sourcing guards (glob the tree themselves) ──

solo "lib-import-direction"    scripts/lint-lib-import-direction.sh
solo "no-network-fallbacks"    scripts/lint-no-network-fallbacks.sh
solo "runtime-tests-from-chain" scripts/lint-runtime-tests-from-chain.sh
solo "core-contract-abis"      scripts/lint-core-contract-abis.sh
solo "claude-md"               scripts/lint-claude-md.sh
solo "clause-counts"           scripts/lint-clause-counts.sh
solo "clause-nests-under-a-field" scripts/lint-clause-nests-under-a-field.sh
solo "chain-gas"               scripts/lint-chain-gas.sh
solo "sdk-dist-freshness"      scripts/lint-sdk-dist-freshness.sh
solo "token-ops"               scripts/lint-token-ops.sh
solo "formal-targets"          scripts/lint-formal-targets.sh

# ── Dead-code + type-checks ──

echo ""
echo "── knip (frontend dead code) ──"
( cd frontend && npx knip --include files,exports,types --no-progress )
record "knip" $?

echo ""
echo "── type-check: frontend (tsc --noEmit) ──"
( cd frontend && npx tsc --noEmit )
record "type-check:frontend" $?

echo ""
echo "── type-check: sdk (tsc --noEmit) ──"
( cd sdk && npm run --silent lint )
record "type-check:sdk" $?

# ── Verdict ──

echo ""
if [ -n "$FAILURES" ]; then
    echo "✗ verify-guards: FAILED —$FAILURES"
    exit 1
fi
echo "✓ verify-guards: all guards passed over the whole tree."
exit 0
