#!/usr/bin/env bash
#
# lint-canonical-imports.sh — pre-commit guard against re-introducing
# inlined literals or re-declared helpers whose canonical form lives
# elsewhere.
#
# Wired into the root package.json `lint-staged` block under
# `frontend/**/*.{ts,tsx}`. Run via `bash lint-canonical-imports.sh`
# (lint-staged spawn does not resolve `./` relative paths).
#
# Two checks:
#   1. LITERAL — banned string literal in any quoted form (single,
#      double, or backtick). Allowlist file is the canonical home.
#   2. DECL    — banned declaration of an identifier
#      (`function|const|let|var <NAME>`). Allowlist file is the
#      canonical home.
#
# Run manually:
#   bash lint-canonical-imports.sh path/to/file.ts [more files...]
#
# Exit code: 0 on clean, 1 on any violation.

set -euo pipefail

# ── LITERAL bans ────────────────────────────────────────────────
# Format: <hex-literal>|<canonical-file>|<name>
# Quoted-form match (`['"\`]LITERAL['"\`]`) prevents false positives
# against substrings of longer hex literals (e.g. process IDs ending
# in non-zero hex).
LITERAL_BANNED=(
    '0x0000000000000000000000000000000000000000~frontend/lib/shared/evm.ts~ZERO_ADDRESS'
)

# ── DECL bans ───────────────────────────────────────────────────
# Format: <identifier>~<canonical-file>~<message>
# Matches `function|const|let|var <NAME>` declarations. Re-exports
# (`export { NAME } from`), imports (`import { NAME } from`), and
# call sites are NOT matched.
DECL_BANNED=(
    'truncateHex~frontend/lib/shared/formatHex.ts~re-declares truncateHex — import from frontend/lib/shared/formatHex.ts'
    'ANVIL_ACCOUNTS~frontend/tests/anvilAccounts.ts~re-declares ANVIL_ACCOUNTS — import from frontend/tests/anvilAccounts.ts'
)

violations=0

check_literal() {
    local file="$1" literal="$2" canonical="$3" name="$4"

    if [[ "$file" == */"$canonical" || "$file" == "$canonical" ]]; then
        return 0
    fi

    local hits
    hits=$(grep -nE "['\"\`]${literal}['\"\`]" "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[canonical-guard] $file inlines $name — import from $canonical"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
}

check_decl() {
    local file="$1" ident="$2" canonical="$3" message="$4"

    if [[ -n "$canonical" ]]; then
        if [[ "$file" == */"$canonical" || "$file" == "$canonical" ]]; then
            return 0
        fi
    fi

    local hits
    hits=$(grep -nE "\\b(function|const|let|var)[[:space:]]+${ident}\\b" "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[canonical-guard] $file: $message"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
}

for file in "$@"; do
    [[ -f "$file" ]] || continue

    for entry in "${LITERAL_BANNED[@]}"; do
        IFS='~' read -r literal canonical name <<< "$entry"
        check_literal "$file" "$literal" "$canonical" "$name"
    done

    for entry in "${DECL_BANNED[@]}"; do
        IFS='~' read -r ident canonical message <<< "$entry"
        check_decl "$file" "$ident" "$canonical" "$message"
    done
done

if (( violations > 0 )); then
    echo ""
    echo "[canonical-guard] $violations violation(s). Replace the inlined literal or import the canonical."
    exit 1
fi

exit 0
