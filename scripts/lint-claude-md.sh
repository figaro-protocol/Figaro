#!/usr/bin/env bash
# lint-claude-md.sh — CLAUDE.md drift guard.
#
# Closes the loop on the recurring failure mode where CLAUDE.md's inventory
# (file paths, env vars, contract lists) silently goes out of sync with the
# codebase. Memories advise; this guard enforces.
#
# Four checks. CLAUDE.md is pure discipline + pointers; the inventories it
# used to inline now live in the docs/v5/ files that own them, so each check
# reads from that owner doc:
#
#   1. PATH EXISTENCE — every backticked path-like string in CLAUDE.md
#      (src/*.sol, script/*.sol, scripts/*.sh, frontend/**/*.{ts,tsx,json},
#      docs/v5/*.md, paper/**/*.tex, prover/**/*.rs, sdk/**/*.ts,
#      .github/**, .claude/**, test/**, formal/**, certora/**) must
#      exist on disk. Optional :LINE or :LINE-RANGE suffixes are tolerated.
#
#   2. ENV VARS — the set of NEXT_PUBLIC_* keys in docs/v5/LOCAL_DEV.md must
#      equal the set in frontend/.env.local (when present). Missing-in-doc and
#      orphan-in-doc both fail. Skipped silently when .env.local absent
#      (e.g. fresh clone before deploy-local.sh has run).
#
#   3. MOCKS INVENTORY — every src/mocks/Mock*.sol must be named in
#      docs/v5/CONTRACTS.md.
#
#   4. DEPLOY SCRIPTS — every script/*.s.sol must be named in
#      docs/v5/LOCAL_DEV.md.
#
#   5. NO MIRROR FILES — CLAUDE.md is the single source of agent
#      instructions. We standardized on Claude; parallel agent-instruction
#      files (Copilot, Cursor, Windsurf, Gemini, Aider, AGENTS.md) are a
#      recurring duplication vector created by agent behavior. This check
#      fails if any reappears. Adopting a new tool = a deliberate edit to
#      MIRROR_DENYLIST below, not silent drift.
#
#   6. SIZE TRIPWIRE — CLAUDE.md must stay under MAX_BYTES. Above Claude Code's
#      documented ~40,000-char threshold, instruction adherence degrades (the file
#      is NOT truncated); this fails the commit first, forcing a move-to-owning-doc
#      decision (inventories -> docs/v5/*)
#      rather than a silent overflow. The file holds discipline + pointers;
#      lists live in the indexed docs.
#
# Exit codes:
#   0 — clean
#   1 — drift detected
#
# Run manually:
#   bash scripts/lint-claude-md.sh
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
    | grep -E '^(src|script|scripts|frontend|docs/v5|paper|prover|sdk|\.github|\.claude|test|formal|certora|\./)[A-Za-z0-9_./-]+\.(sol|ts|tsx|json|md|tex|rs|sh|yaml|yml)(:[0-9-]+)?$' \
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
ENV_DOC="docs/v5/LOCAL_DEV.md"
if [[ -f "$ENV_FILE" && -f "$ENV_DOC" ]]; then
    doc_vars=$(grep -oE 'NEXT_PUBLIC_[A-Z0-9_]+' "$ENV_DOC" | sort -u)
    env_vars=$(grep -oE '^NEXT_PUBLIC_[A-Z0-9_]+' "$ENV_FILE" | sort -u)

    missing_in_doc=$(comm -13 <(printf '%s\n' "$doc_vars") <(printf '%s\n' "$env_vars"))
    orphan_in_doc=$(comm -23 <(printf '%s\n' "$doc_vars") <(printf '%s\n' "$env_vars"))

    if [[ -n "$missing_in_doc" ]]; then
        echo "[claude-md] env vars in $ENV_FILE but not in $ENV_DOC:"
        printf '%s\n' "$missing_in_doc" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
    if [[ -n "$orphan_in_doc" ]]; then
        echo "[claude-md] env vars in $ENV_DOC but not in $ENV_FILE:"
        printf '%s\n' "$orphan_in_doc" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
fi

# --- Check 3: MOCKS INVENTORY ---
MOCKS_DIR="src/mocks"
MOCKS_DOC="docs/v5/CONTRACTS.md"
if [[ -d "$MOCKS_DIR" && -f "$MOCKS_DOC" ]]; then
    actual_mocks=$(ls "$MOCKS_DIR" 2>/dev/null | grep -E '\.sol$' | sort -u)
    doc_mocks=$(grep -oE '\bMock[A-Za-z0-9]+\.sol\b' "$MOCKS_DOC" | sort -u)

    missing_mocks=$(comm -13 <(printf '%s\n' "$doc_mocks") <(printf '%s\n' "$actual_mocks"))
    if [[ -n "$missing_mocks" ]]; then
        echo "[claude-md] $MOCKS_DIR/ files not mentioned in $MOCKS_DOC:"
        printf '%s\n' "$missing_mocks" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
fi

# --- Check 4: DEPLOY SCRIPTS ---
SCRIPT_DIR="script"
SCRIPT_DOC="docs/v5/LOCAL_DEV.md"
if [[ -d "$SCRIPT_DIR" && -f "$SCRIPT_DOC" ]]; then
    actual_scripts=$(ls "$SCRIPT_DIR"/*.s.sol 2>/dev/null | xargs -n1 basename | sort -u)
    doc_scripts=$(grep -oE '\b[A-Za-z][A-Za-z0-9]*\.s\.sol\b' "$SCRIPT_DOC" | sort -u)

    missing_scripts=$(comm -13 <(printf '%s\n' "$doc_scripts") <(printf '%s\n' "$actual_scripts"))
    if [[ -n "$missing_scripts" ]]; then
        echo "[claude-md] $SCRIPT_DIR/*.s.sol files not mentioned in $SCRIPT_DOC:"
        printf '%s\n' "$missing_scripts" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
fi

# --- Check 5: NO MIRROR FILES ---
# Standardized on Claude; CLAUDE.md is the single source. A parallel
# agent-instruction file is duplication-by-agent-behavior — block it.
MIRROR_DENYLIST=(
    ".github/copilot-instructions.md"
    ".cursorrules"
    ".cursor/rules"
    ".windsurfrules"
    "AGENTS.md"
    "GEMINI.md"
    ".aider.conf.yml"
    ".aiderignore"
)
mirror_hits=()
for f in "${MIRROR_DENYLIST[@]}"; do
    [[ -e "$f" ]] && mirror_hits+=("$f")
done
if (( ${#mirror_hits[@]} > 0 )); then
    echo "[claude-md] parallel agent-instruction file(s) present — CLAUDE.md is the single source:"
    printf '    %s\n' "${mirror_hits[@]}"
    echo "    If you are intentionally adopting another tool, remove it from MIRROR_DENYLIST in this script."
    violations=$((violations + ${#mirror_hits[@]}))
fi

# --- Check 6: SIZE TRIPWIRE ---
MAX_BYTES=40000   # Claude Code's documented soft threshold is 40,000 chars (~40 KB
                  # decimal, NOT 40·1024) — above it CLAUDE.md adherence degrades (it is
                  # NOT truncated). bytes ≥ chars for any multibyte content, so a 40,000-
                  # byte cap keeps the file under 40,000 chars. Ref: code.claude.com/docs/en/memory
size=$(wc -c < "$CLAUDE_MD" | tr -d ' ')
if (( size > MAX_BYTES )); then
    echo "[claude-md] $CLAUDE_MD is ${size} bytes (limit ${MAX_BYTES})."
    echo "    Move inventory/command/exposition content into the owning docs/v5/ file"
    echo "    and leave a pointer. CLAUDE.md holds discipline + pointers, not lists."
    violations=$((violations + 1))
fi

if (( violations > 0 )); then
    echo ""
    echo "[claude-md] $violations drift item(s). Update CLAUDE.md or restore the path."
    exit 1
fi

echo "[claude-md] clean"
exit 0
