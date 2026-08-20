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
# COST DISCIPLINE: the trees are enumerated ONCE (routes, basenames, the file
# list) and the content-vouching tokens are resolved by TWO whole-tree scans
# total — an awk set-membership pass per include-class, splitting content on
# non-token characters and checking the pieces (and, for hyphenated pieces,
# their contiguous dash-joined runs — grep -w's boundary semantics) against
# the pending set in memory. Never a find or grep per token, and never a
# large regex alternation (BSD grep's engine crawls on those): per-token
# scans put this guard at ~31s and made it the whole pre-commit battery's
# floor. Tokens reaching a content scan match ^[A-Za-z0-9_-]+$ by
# construction.
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
# Applied at the ONE enumeration; every later phase reads the file list.
FIND_EXCLUDES=(-not -path '*/node_modules/*' -not -path '*/target/*' -not -path '*/dist/*')

TMPDIR_GUARD="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_GUARD"' EXIT
ALLOW="$TMPDIR_GUARD/allow"
ROUTES="$TMPDIR_GUARD/routes"
BASENAMES="$TMPDIR_GUARD/basenames"
NAMES_PENDING="$TMPDIR_GUARD/names-pending"   # file<TAB>tok, figaro-name class
IDS_PENDING="$TMPDIR_GUARD/ids-pending"       # file<TAB>tok, identifier class
: > "$NAMES_PENDING"; : > "$IDS_PENDING"

# ── One-time indices ──────────────────────────────────────────────
[[ -f "$ALLOWLIST_FILE" ]] \
    && sed 's/#.*//;s/^[[:space:]]*//;s/[[:space:]]*$//' "$ALLOWLIST_FILE" | grep -v '^$' | sort -u > "$ALLOW" \
    || : > "$ALLOW"
# Group-stripped route paths of every page.
find frontend/app -name page.tsx | sed -E 's|^frontend/app||; s|/\([^)]*\)||g; s|/page\.tsx$||' > "$ROUTES"
# The code-tree file list, and every file's basename.
ALL_FILES="$TMPDIR_GUARD/all-files"
find "${CODE_TREES[@]}" "${FIND_EXCLUDES[@]}" -type f 2>/dev/null > "$ALL_FILES"
awk -F/ '{print $NF}' "$ALL_FILES" | sort -u > "$BASENAMES"

fail=0
err() { echo "  ✗ $1"; fail=1; }

route_exists() {
    local route="${1%%#*}"
    route="${route%/}"
    [[ -z "$route" || "$route" == "/" ]] && return 0
    grep -qxF "$route" "$ROUTES"
}

# ── Pass 1: classify every token; cheap checks inline, scans deferred ──
for f in "${FILES[@]}"; do
    [[ -f "$f" ]] || { err "$f: covered file missing"; continue; }
    # Unique backticked tokens (inline code only; fenced blocks excluded —
    # code samples cite parameters and locals the predicate can't judge),
    # minus the allowlist in one set-subtraction.
    tokens="$(awk '/^```/{fence=!fence; next} !fence' "$f" | grep -o '`[^`]\{1,120\}`' | sed 's/^`//;s/`$//' | sort -u | comm -23 - "$ALLOW")"
    while IFS= read -r tok; do
        [[ -z "$tok" ]] && continue
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
                    grep -qxF "$base" "$BASENAMES" || err "$f: file \`$tok\` found nowhere in the tree" ;;
                *) : ;; # foreign-form path (npm pkg subpath etc.) — skip
            esac
        elif [[ "$tok" =~ ^figaro-[a-z0-9-]+$ ]]; then
            # Protocol names: a clause id, a public prompt, or a repo agent.
            [[ -e "clauses/$tok.json" || -e "ecosystem-agents/$tok.md" || -e ".claude/agents/$tok.md" ]] \
                || printf '%s\t%s\n' "$f" "$tok" >> "$NAMES_PENDING"
        elif [[ "$tok" =~ ^[A-Za-z_][A-Za-z0-9_]{5,}$ && ( "$tok" =~ [A-Z] ) ]]; then
            printf '%s\t%s\n' "$f" "$tok" >> "$IDS_PENDING"
        fi
    done <<< "$tokens"
done

# ── Pass 2: resolve every deferred token in ONE corpus scan ───────
# The scanner splits content on non-token characters and checks each piece —
# and each contiguous dash-joined run inside a hyphenated piece, mirroring
# grep -w's boundary semantics (a dash is a word boundary) — against the two
# pending sets held in memory. Class scoping is per FILE EXTENSION inside the
# one pass (names vouch from ts/tsx/json/mjs; identifiers additionally from
# sol/rs/sh, minus this guard and its allowlist), so the whole corpus is read
# exactly once. A pending token the scan never emits is the failure.
NAMES_FOUND="$TMPDIR_GUARD/names-found"
IDS_FOUND="$TMPDIR_GUARD/ids-found"
: > "$NAMES_FOUND"; : > "$IDS_FOUND"
if [[ -s "$NAMES_PENDING" || -s "$IDS_PENDING" ]]; then
    cut -f2 "$NAMES_PENDING" | sort -u > "$TMPDIR_GUARD/names-want"
    cut -f2 "$IDS_PENDING" | sort -u > "$TMPDIR_GUARD/ids-want"
    grep -E '\.(ts|tsx|sol|rs|mjs|json|sh)$' "$ALL_FILES" \
        | grep -vE '/(lint-agent-surface-refs\.sh|agent-surface-refs-allowlist\.txt)$' \
        | tr '\n' '\0' \
        | xargs -0 awk \
            -v namesfile="$TMPDIR_GUARD/names-want" \
            -v idsfile="$TMPDIR_GUARD/ids-want" '
            BEGIN {
                while ((getline t < namesfile) > 0) if (t != "") names[t] = 1
                while ((getline t < idsfile) > 0) if (t != "") ids[t] = 1
            }
            FNR == 1 {
                ext = FILENAME; sub(/^.*\./, "", ext)
                checkNames = (ext == "ts" || ext == "tsx" || ext == "json" || ext == "mjs")
            }
            function record(s) {
                if (checkNames && (s in names)) print "N", s
                if (s in ids) print "I", s
            }
            {
                n = split($0, parts, /[^A-Za-z0-9_-]+/)
                for (i = 1; i <= n; i++) {
                    p = parts[i]
                    if (p == "") continue
                    record(p)
                    if (index(p, "-") > 0) {
                        m = split(p, seg, "-")
                        for (a = 1; a <= m; a++) {
                            s = seg[a]
                            record(s)
                            for (b = a + 1; b <= m; b++) {
                                s = s "-" seg[b]
                                record(s)
                            }
                        }
                    }
                }
            }' > "$TMPDIR_GUARD/hits" || true
    awk '$1 == "N" { print $2 }' "$TMPDIR_GUARD/hits" | sort -u > "$NAMES_FOUND"
    awk '$1 == "I" { print $2 }' "$TMPDIR_GUARD/hits" | sort -u > "$IDS_FOUND"
fi

# Missing = pending − found (one comm per class); attribution loops run only
# over the missing set, which is empty on a clean tree.
report_missing() {
    local pending="$1" found="$2" template="$3"
    [[ -s "$pending" ]] || return 0
    local missing
    missing="$(cut -f2 "$pending" | sort -u | comm -23 - "$found")"
    [[ -n "$missing" ]] || return 0
    # `if`, never `&&`: under set -e a found (non-missing) pair would
    # otherwise end the loop non-zero and kill the run mid-report.
    while IFS=$'\t' read -r f tok; do
        if printf '%s\n' "$missing" | grep -qxF "$tok"; then
            err "$f: ${template//TOKEN/\`$tok\`}"
        fi
    done < "$pending"
    return 0
}

report_missing "$NAMES_PENDING" "$NAMES_FOUND" 'name TOKEN is no registered clause, prompt, or agent'
report_missing "$IDS_PENDING" "$IDS_FOUND" 'identifier TOKEN appears nowhere in the code tree (dead referent)'

if [[ "$fail" -ne 0 ]]; then
    echo "[agent-surface-refs] FAIL — the public agent surfaces cite referents the tree no longer carries."
    echo "  Fix the citation, or (for a deliberate exception) add the token to $ALLOWLIST_FILE."
    exit 1
fi
echo "[agent-surface-refs] clean — every cited path, route, and identifier resolves at HEAD"