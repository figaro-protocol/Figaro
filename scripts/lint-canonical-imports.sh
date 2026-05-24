#!/usr/bin/env bash
#
# lint-canonical-imports.sh — pre-commit guard against re-introducing
# inlined literals or re-declared helpers whose canonical form lives
# elsewhere.
#
# Wired into the root package.json `lint-staged` block under
# `frontend/**/*.{ts,tsx}`. Run via `bash scripts/lint-canonical-imports.sh`
# (lint-staged spawn does not resolve `./` relative paths).
#
# Three checks:
#   1. LITERAL  — banned string literal in any quoted form (single,
#      double, or backtick). Allowlist file is the canonical home.
#   2. COMPUTED — banned synthesized form of the same value via
#      `"0x" + "0".repeat(N)` or `\`0x\${"0".repeat(N)}\``. Catches
#      the equivalence class that the literal grep misses.
#   3. DECL     — banned declaration of an identifier
#      (`function|const|let|var <NAME>`). Allowlist file is the
#      canonical home.
#
# Run manually:
#   bash scripts/lint-canonical-imports.sh path/to/file.ts [more files...]
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
    '0x0000000000000000000000000000000000000000000000000000000000000000~frontend/lib/shared/evm.ts~ZERO_BYTES32'
)

# ── COMPUTED bans ───────────────────────────────────────────────
# Format: <zero-count>~<canonical-file>~<name>
# Catches `"0x" + "0".repeat(N)` and `\`0x\${"0".repeat(N)}\`` forms
# for the canonical's all-zero value of that byte length. N is the
# number of hex zeros (40 for a 20-byte address, 64 for a 32-byte
# bytes32).
COMPUTED_BANNED=(
    '40~frontend/lib/shared/evm.ts~ZERO_ADDRESS'
    '64~frontend/lib/shared/evm.ts~ZERO_BYTES32'
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

check_computed() {
    local file="$1" count="$2" canonical="$3" name="$4"

    if [[ "$file" == */"$canonical" || "$file" == "$canonical" ]]; then
        return 0
    fi

    # Match both the string-concat form (`"0x" + "0".repeat(N)`) and
    # the template-literal form (`\`0x\${"0".repeat(N)}\``).
    local concat_re='"0x"[[:space:]]*\+[[:space:]]*"0"\.repeat\([[:space:]]*'"$count"'[[:space:]]*\)'
    local tmpl_re='`0x\$\{"0"\.repeat\([[:space:]]*'"$count"'[[:space:]]*\)\}`'

    local hits
    hits=$(grep -nE "${concat_re}|${tmpl_re}" "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[canonical-guard] $file synthesizes $name via \"0x\" + \"0\".repeat($count) — import from $canonical"
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

    for entry in "${COMPUTED_BANNED[@]}"; do
        IFS='~' read -r count canonical name <<< "$entry"
        check_computed "$file" "$count" "$canonical" "$name"
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
