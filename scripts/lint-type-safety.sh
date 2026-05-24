#!/usr/bin/env bash
#
# lint-type-safety.sh — pre-commit guard against re-introducing the two
# type-safety escape hatches eliminated 2026-05-08.
#
# Two checks (apply to .ts and .tsx files):
#
#   1. @ts-ignore         — banned. Use `@ts-expect-error <reason>` if you
#                            genuinely need to suppress; that variant fails
#                            loudly when the underlying type gets fixed,
#                            so the suppression doesn't outlive its cause.
#
#   2. catch (X: any)     — banned. Catch handlers must type the binding
#                            as `unknown` (or omit the annotation; TS now
#                            defaults catch bindings to `unknown` under
#                            `useUnknownInCatchVariables`). Narrow with
#                            `extractErrorMessage(err, fallback)` from
#                            `lib/shared/errors.ts` or with `instanceof
#                            Error`.
#
# Wired into the root package.json lint-staged block under
# `frontend/**/*.{ts,tsx}`. Run via `bash scripts/lint-type-safety.sh`.
#
# Run manually:
#   bash scripts/lint-type-safety.sh path/to/file.ts [more files...]
#
# Exit code: 0 on clean, 1 on any violation.

set -euo pipefail

violations=0

for file in "$@"; do
    [[ -f "$file" ]] || continue
    case "$file" in
        *.ts|*.tsx) ;;
        *) continue ;;
    esac

    # Check 1: @ts-ignore (NOT @ts-expect-error)
    hits=$(grep -nE '@ts-ignore\b' "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[type-safety] $file uses banned @ts-ignore — replace with @ts-expect-error <reason> or fix the underlying type"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi

    # Check 2: catch (X: any)
    # Matches `catch (foo: any)` with any whitespace, optional parens spacing.
    hits=$(grep -nE 'catch[[:space:]]*\([[:space:]]*[A-Za-z_][A-Za-z_0-9]*[[:space:]]*:[[:space:]]*any[[:space:]]*\)' "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[type-safety] $file types a catch binding as any — use unknown + extractErrorMessage()"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
done

if (( violations > 0 )); then
    echo ""
    echo "[type-safety] $violations violation(s)."
    exit 1
fi

exit 0
