#!/bin/bash
# lint-clause-counts.sh — Gate: the clause count is DERIVED, never stored.
#
# The count is `ls clauses/*.json | wc -l` (runtime-attestable = that minus the
# one agreement-only clause, figaro-topology). Hard-coding it in prose is a
# closed-world pattern with per-add upkeep: every clause add/remove silently
# desyncs the number until someone notices. So this gate FORBIDS a hard-coded
# clause-count integer in the tracked docs — derive it on demand, never quote it.
#
# To re-cover a doc, or add a new one, extend TRACKED / PATTERNS below.
#
# Exit codes:
#   0 — no stored clause count found
#   1 — a stored clause-count integer is present (remove it; derive instead)
#   2 — tooling error (clauses dir missing)

set -u

CLAUSES_DIR="clauses"
if [ ! -d "$CLAUSES_DIR" ]; then
    echo "[clause-counts] clauses dir not found: $CLAUSES_DIR" >&2
    exit 2
fi
total=$(ls "$CLAUSES_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ')
if [ "$total" -eq 0 ]; then
    echo "[clause-counts] no clause specs found in $CLAUSES_DIR" >&2
    exit 2
fi

# Docs that must NOT store a clause count, and the digit-bearing phrasings that
# would be one. Kept pattern-explicit (semantic prose parsing is out of scope).
TRACKED=("CLAUDE.md" "docs/v5/CLAUSES.md" "docs/v5/FRONTEND.md")
PATTERNS=('[0-9]+ protocol clauses' '[0-9]+ runtime-attestable')

declare -a failures
for file in "${TRACKED[@]}"; do
    [ -f "$file" ] || continue
    for pat in "${PATTERNS[@]}"; do
        while IFS= read -r hit; do
            [ -n "$hit" ] && failures+=("$file: stored clause count \"$hit\" — derive it (\`ls clauses/*.json | wc -l\`), never quote it")
        done < <(grep -oE "$pat" "$file")
    done
done

if [ ${#failures[@]} -eq 0 ]; then
    echo "[clause-counts] clean — count is derived, never stored (live: $total on disk)"
    exit 0
fi

echo "[clause-counts] a stored clause count was found — the count is DERIVED, never hard-coded:" >&2
for f in "${failures[@]}"; do
    echo "   $f" >&2
done
exit 1
