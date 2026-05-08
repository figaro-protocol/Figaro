#!/usr/bin/env bash
#
# lint-no-eyebrows.sh — pre-commit guard against re-introducing
# eyebrow patterns. The "no eyebrows on any page" rule has
# regressed three times across sessions; this guard closes the loop.
#
# Two checks (both apply to .tsx files):
#
#   1. text-eyebrow TOKEN — banned outright. The Tailwind type-scale
#      name "eyebrow" has no legitimate use case; the token itself
#      encodes the pattern.
#
#   2. ad-hoc EYEBROW CHORD — `uppercase tracking-widest` substring
#      in any className that does NOT also contain `rounded` or `bg-`.
#      Pills/chips that use the same letter-spacing PLUS rounded
#      background are NOT eyebrows; they are badges and pass.
#
# Wired into the root package.json lint-staged block under
# `frontend/**/*.{ts,tsx}`. Run via `bash lint-no-eyebrows.sh`
# (lint-staged spawn does not resolve `./` relative paths).
#
# Run manually:
#   bash lint-no-eyebrows.sh path/to/file.tsx [more files...]
#
# Exit code: 0 on clean, 1 on any violation.

set -euo pipefail

violations=0

for file in "$@"; do
    [[ -f "$file" ]] || continue
    # Eyebrow patterns appear in JSX className= attributes; .ts files
    # without JSX never trigger.
    [[ "$file" == *.tsx ]] || continue

    # Check 1: text-eyebrow token
    hits=$(grep -nE '\btext-eyebrow\b' "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[no-eyebrows] $file uses the banned text-eyebrow token"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi

    # Check 2: ad-hoc eyebrow chord (uppercase tracking-widest without
    # a chip/pill background).
    hits=$(grep -nE 'uppercase tracking-widest' "$file" | grep -vE 'rounded|bg-' || true)
    if [[ -n "$hits" ]]; then
        echo "[no-eyebrows] $file uses the ad-hoc eyebrow chord (uppercase + tracking-widest, no chip/pill bg)"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
done

if (( violations > 0 )); then
    echo ""
    echo "[no-eyebrows] $violations violation(s). Delete the eyebrow per the no-eyebrows-on-any-page rule."
    exit 1
fi

exit 0
