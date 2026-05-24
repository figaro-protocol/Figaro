#!/usr/bin/env bash
# lint-claude-md.sh — CLAUDE.md drift guard.
#
# Closes the loop on the recurring failure mode where CLAUDE.md's inventory
# (file paths, env vars, contract lists) silently goes out of sync with the
# codebase. Memories advise; this guard enforces.
#
# Four checks:
#
#   1. PATH EXISTENCE — every backticked path-like string in CLAUDE.md
#      (src/*.sol, script/*.sol, frontend/**/*.{ts,tsx,json},
#      docs/v5/*.md, paper/**/*.tex, prover/**/*.rs, sdk/**/*.ts,
#      .github/**, .claude/**, test/**, formal/**, certora/**,
#      root-level *.sh) must exist on disk. Optional :LINE or :LINE-RANGE
#      suffixes are tolerated.
#
#   2. ENV VARS — the set of NEXT_PUBLIC_* keys in CLAUDE.md must equal
#      the set in frontend/.env.local (when present). Missing-in-doc and
#      orphan-in-doc both fail. Skipped silently when .env.local absent
#      (e.g. fresh clone before deploy-local.sh has run).
#
#   3. MOCKS INVENTORY — every src/mocks/Mock*.sol must be named in
#      CLAUDE.md.
#
#   4. DEPLOY SCRIPTS — every script/*.s.sol must be named in CLAUDE.md.
#
# Exit codes:
#   0 — clean
#   1 — drift detected
#
# Run manually:
#   bash lint-claude-md.sh
#
# Wired into .husky/pre-commit so it fires on every commit, even when
# CLAUDE.md itself wasn't touched — most drift accumulates from
# code-side changes that forget the doc update.

set -uo pipefail

CLAUDE_MD="CLAUDE.md"
violations=0

if [[ ! -f "$CLAUDE_MD" ]]; then
    echo "[claude-md] $CLAUDE_MD not found (run from repo root)" >&2
    exit 1
fi

# --- Check 1: PATH EXISTENCE ---
#
# Extract backticked tokens; keep only those that look like in-repo paths
# (known top-level prefix + a recognised extension), tolerate an optional
# `:LINE` or `:LINE-RANGE` suffix used for source citations.
paths=$(grep -oE '`[^`]+`' "$CLAUDE_MD" \
    | sed 's/^`//; s/`$//' \
    | grep -E '^((src|script|frontend|docs/v5|paper|prover|sdk|\.github|\.claude|test|formal|certora|\./)[A-Za-z0-9_./-]+\.(sol|ts|tsx|json|md|tex|rs|sh|yaml|yml)|[A-Za-z0-9_-]+\.sh)(:[0-9-]+)?$' \
    | sed 's/:[0-9-]*$//' \
    | sort -u)

missing=()
while IFS= read -r p; do
    [[ -z "$p" ]] && continue
    [[ -e "$p" ]] || missing+=("$p")
done <<< "$paths"

if (( ${#missing[@]} > 0 )); then
    echo "[claude-md] paths referenced in CLAUDE.md that don't exist on disk:"
    printf '    %s\n' "${missing[@]}"
    violations=$((violations + ${#missing[@]}))
fi

# --- Check 2: ENV VARS ---
ENV_FILE="frontend/.env.local"
if [[ -f "$ENV_FILE" ]]; then
    doc_vars=$(grep -oE 'NEXT_PUBLIC_[A-Z0-9_]+' "$CLAUDE_MD" | sort -u)
    env_vars=$(grep -oE '^NEXT_PUBLIC_[A-Z0-9_]+' "$ENV_FILE" | sort -u)

    missing_in_doc=$(comm -13 <(printf '%s\n' "$doc_vars") <(printf '%s\n' "$env_vars"))
    orphan_in_doc=$(comm -23 <(printf '%s\n' "$doc_vars") <(printf '%s\n' "$env_vars"))

    if [[ -n "$missing_in_doc" ]]; then
        echo "[claude-md] env vars in $ENV_FILE but not in CLAUDE.md:"
        printf '%s\n' "$missing_in_doc" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
    if [[ -n "$orphan_in_doc" ]]; then
        echo "[claude-md] env vars in CLAUDE.md but not in $ENV_FILE:"
        printf '%s\n' "$orphan_in_doc" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
fi

# --- Check 3: MOCKS INVENTORY ---
MOCKS_DIR="src/mocks"
if [[ -d "$MOCKS_DIR" ]]; then
    actual_mocks=$(ls "$MOCKS_DIR" 2>/dev/null | grep -E '\.sol$' | sort -u)
    doc_mocks=$(grep -oE '\bMock[A-Za-z0-9]+\.sol\b' "$CLAUDE_MD" | sort -u)

    missing_mocks=$(comm -13 <(printf '%s\n' "$doc_mocks") <(printf '%s\n' "$actual_mocks"))
    if [[ -n "$missing_mocks" ]]; then
        echo "[claude-md] $MOCKS_DIR/ files not mentioned in CLAUDE.md:"
        printf '%s\n' "$missing_mocks" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
fi

# --- Check 4: DEPLOY SCRIPTS ---
SCRIPT_DIR="script"
if [[ -d "$SCRIPT_DIR" ]]; then
    actual_scripts=$(ls "$SCRIPT_DIR"/*.s.sol 2>/dev/null | xargs -n1 basename | sort -u)
    doc_scripts=$(grep -oE '\b[A-Za-z][A-Za-z0-9]*\.s\.sol\b' "$CLAUDE_MD" | sort -u)

    missing_scripts=$(comm -13 <(printf '%s\n' "$doc_scripts") <(printf '%s\n' "$actual_scripts"))
    if [[ -n "$missing_scripts" ]]; then
        echo "[claude-md] $SCRIPT_DIR/*.s.sol files not mentioned in CLAUDE.md:"
        printf '%s\n' "$missing_scripts" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
fi

if (( violations > 0 )); then
    echo ""
    echo "[claude-md] $violations drift item(s). Update CLAUDE.md or restore the path."
    exit 1
fi

echo "[claude-md] clean"
exit 0
