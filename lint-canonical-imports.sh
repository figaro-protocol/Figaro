#!/usr/bin/env bash
#
# lint-canonical-imports.sh — pre-commit guard against re-introducing
# inlined literals whose canonical declaration lives in
# frontend/lib/shared/evm.ts.
#
# Wired into the root package.json `lint-staged` block under
# `frontend/**/*.{ts,tsx}` — every staged file is checked.
#
# Failure mode this catches: a feature commit (human- or AI-authored)
# writes
#
#     const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
#
# instead of importing the canonical from `@/lib/shared/evm`.
# That divergence accumulated across `bd43b69`, `a3891fc`, `9004331`
# (3 separate feature commits) before being collapsed in `28856bc`.
# This guard rejects the next reintroduction at commit time.
#
# Run manually:
#   ./lint-canonical-imports.sh path/to/file.ts [more files...]
#
# Exit code: 0 on clean, 1 on any violation.

set -euo pipefail

# Each entry: <quoted-literal>|<canonical-file>|<import-name>
# The grep matches the literal *quoted* (single, double, or backtick)
# so it cannot false-hit a substring of a longer hex literal.
BANNED=(
    '0x0000000000000000000000000000000000000000|frontend/lib/shared/evm.ts|ZERO_ADDRESS'
    '0x0000000000000000000000000000000000000000000000000000000000000000|frontend/lib/shared/evm.ts|ZERO_BYTES32'
)

violations=0
for file in "$@"; do
    # Skip files that don't exist (e.g. deletions in the staged set).
    [[ -f "$file" ]] || continue

    for entry in "${BANNED[@]}"; do
        IFS='|' read -r literal canonical name <<< "$entry"

        # The canonical file is allowed to declare the literal.
        if [[ "$file" == */"$canonical" || "$file" == "$canonical" ]]; then
            continue
        fi

        # Match the literal only when wrapped in a quote on both sides.
        # Pattern: ['"`] + literal + ['"`].
        hits=$(grep -nE "['\"\`]${literal}['\"\`]" "$file" || true)
        if [[ -n "$hits" ]]; then
            echo "[canonical-guard] $file inlines $name — import from $canonical"
            echo "$hits" | sed 's/^/    /'
            violations=$((violations + 1))
        fi
    done
done

if (( violations > 0 )); then
    echo ""
    echo "[canonical-guard] $violations violation(s). Replace the inlined literal with an import."
    exit 1
fi

exit 0
