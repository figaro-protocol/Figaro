#!/usr/bin/env bash
# lint-agent-surface-refs.sh — the PUBLIC agent surfaces' referent guard.
#
# The 2026-08-12 agent↔human seam audit found the public agent surfaces —
# the ecosystem-agent prompts and docs/AI_AGENT_COORDINATION.md — citing
# symbols and routes that had silently died under them (useDidVerification,
# DesignDraft, a deleted route): prose fossilizes while the code advances,
# and nothing mechanical noticed. Memories advise; this guard enforces.
#
# Three checks over every backticked token in the covered files:
#
#   1. REPO PATHS — a token that names a repo file/dir (contains '/' and a
#      known root or an extension) must exist on disk. `path#anchor` and
#      `path:LINE` suffixes are tolerated; wildcards are skipped.
#
#   2. SITE ROUTES — a token shaped like a route (`/kebab-case[/...]`) must
#      resolve to a page.tsx under frontend/app (route groups transparent).
#
#   3. DEAD IDENTIFIERS — an identifier-shaped token (one word, camelCase /
#      PascalCase / SCREAMING_SNAKE, length ≥ 6) must appear as a whole word
#      SOMEWHERE in the code tree (sdk/src, frontend, src, prover, scripts,
#      clauses, assemblies, formal). A token found nowhere is a dead referent
#      — the useDidVerification class. (This is deliberately the weakest
#      predicate that is still zero-false-positive: it cannot catch semantic
#      staleness, only referents the tree no longer contains. The semantic
#      layer stays the audits' job.)
#
# Legitimate exceptions (hypothetical names, foreign-standard identifiers)
# go in scripts/agent-surface-refs-allowlist.txt — one token per line,
# '#' comments allowed. Additions are deliberate edits, not silent drift.
set -euo pipefail
cd "$(dirname "$0")/.."

FILES=(ecosystem-agents/*.md docs/AI_AGENT_COORDINATION.md)
ALLOWLIST_FILE="scripts/agent-surface-refs-allowlist.txt"
# CODE only — markdown deliberately excluded from identifier vouching, so a
# dead symbol cited in prose can never vouch for itself (the docs/ self-match
# hole the guard's own first self-test exposed).
CODE_TREES=(sdk/src sdk/scripts frontend/lib frontend/app frontend/components frontend/hooks frontend/scripts frontend/tests src prover scripts clauses assemblies formal ecosystem-agents/runtime)
# Vendored/build content never vouches for a token (a dependency's code
# finding a name is not this tree carrying it), and scanning it turns a
# dead-referent check into a minutes-long grind (prover/target, node_modules).
GREP_EXCLUDES=(--exclude-dir=node_modules --exclude-dir=target --exclude-dir=dist)
FIND_EXCLUDES=(-not -path '*/node_modules/*' -not -path '*/target/*' -not -path '*/dist/*')

is_allowed() {
    [[ -f "$ALLOWLIST_FILE" ]] || return 1
    sed 's/#.*//;s/^[[:space:]]*//;s/[[:space:]]*$//' "$ALLOWLIST_FILE" | grep -qxF "$1"
}

fail=0
err() { echo "  ✗ $1"; fail=1; }

route_exists() {
    local route="${1%%#*}"
    route="${route%/}"
    [[ -z "$route" || "$route" == "/" ]] && return 0
    # Any page.tsx whose real (group-stripped) path ends with the route.
    while IFS= read -r page; do
        local p="${page#frontend/app}"
        p="$(echo "$p" | sed -E 's/\/\([^)]*\)//g')"
        [[ "${p%/page.tsx}" == "$route" ]] && return 0
    done < <(find frontend/app -name page.tsx)
    return 1
}

for f in "${FILES[@]}"; do
    [[ -f "$f" ]] || { err "$f: covered file missing"; continue; }
    # Unique backticked tokens (inline code only; fenced blocks excluded —
    # code samples cite parameters and locals the predicate can't judge).
    tokens="$(awk '/^```/{fence=!fence; next} !fence' "$f" | grep -o '`[^`]\{1,120\}`' | sed 's/^`//;s/`$//' | sort -u)"
    while IFS= read -r tok; do
        [[ -z "$tok" ]] && continue
        is_allowed "$tok" && continue
        # Skip: placeholders, wildcards, prose, hex, URLs, flags, expressions.
        [[ "$tok" == *"<"* || "$tok" == *"*"* || "$tok" == *" "* || "$tok" == *"…"* ]] && continue
        [[ "$tok" == *"("* || "$tok" == *"{"* || "$tok" == *"="* || "$tok" == *"|"* || "$tok" == *","* ]] && continue
        [[ "$tok" == 0x* || "$tok" == http*://* || "$tok" == ipfs://* || "$tok" == -* ]] && continue
        base="${tok%%#*}"; base="${base%%:*}"
        if [[ "$tok" == /* && "$tok" != *.* ]]; then
            route_exists "$tok" || err "$f: route \`$tok\` has no page under frontend/app"
        elif [[ "$base" == */* || "$base" == *.sol || "$base" == *.ts || "$base" == *.tsx || "$base" == *.mjs || "$base" == *.md || "$base" == *.json || "$base" == *.sh || "$base" == *.rs ]]; then
            case "$base" in
                sdk/*|frontend/*|src/*|prover/*|scripts/*|docs/*|clauses/*|assemblies/*|ecosystem-agents/*|formal/*|test/*|.claude/*|lib/*|app/*)
                    # lib/... and app/... are frontend-relative in these docs.
                    if [[ -e "$base" || -e "frontend/$base" ]]; then :; else err "$f: path \`$tok\` does not exist"; fi ;;
                *.sol|*.ts|*.tsx|*.mjs|*.sh|*.rs)
                    # Bare filename — must exist somewhere in the tree.
                    [[ -n "$(find "${CODE_TREES[@]}" "${FIND_EXCLUDES[@]}" -name "$base" -print -quit 2>/dev/null)" ]] || err "$f: file \`$tok\` found nowhere in the tree" ;;
                *) : ;; # foreign-form path (npm pkg subpath etc.) — skip
            esac
        elif [[ "$tok" =~ ^figaro-[a-z0-9-]+$ ]]; then
            # Protocol names: a clause id, a public prompt, or a repo agent.
            [[ -e "clauses/$tok.json" || -e "ecosystem-agents/$tok.md" || -e ".claude/agents/$tok.md" ]] \
                || grep -rqlw "${GREP_EXCLUDES[@]}" --include='*.ts' --include='*.tsx' --include='*.json' --include='*.mjs' "$tok" "${CODE_TREES[@]}" 2>/dev/null \
                || err "$f: name \`$tok\` is no registered clause, prompt, or agent"
        elif [[ "$tok" =~ ^[A-Za-z_][A-Za-z0-9_]{5,}$ && ( "$tok" =~ [A-Z] ) ]]; then
            grep -rqlw "${GREP_EXCLUDES[@]}" --include='*.ts' --include='*.tsx' --include='*.sol' --include='*.rs' --include='*.mjs' --include='*.json' --include='*.sh' --exclude='lint-agent-surface-refs.sh' --exclude='agent-surface-refs-allowlist.txt' "$tok" "${CODE_TREES[@]}" 2>/dev/null \
                || err "$f: identifier \`$tok\` appears nowhere in the code tree (dead referent)"
        fi
    done <<< "$tokens"
done

if [[ "$fail" -ne 0 ]]; then
    echo "[agent-surface-refs] FAIL — the public agent surfaces cite referents the tree no longer carries."
    echo "  Fix the citation, or (for a deliberate exception) add the token to $ALLOWLIST_FILE."
    exit 1
fi
echo "[agent-surface-refs] clean — every cited path, route, and identifier resolves at HEAD"
