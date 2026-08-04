#!/usr/bin/env bash
# lint-duplicate-links.sh — no page body links the same route more than twice.
#
# WHY (operator, 2026-08-04): LLM agents each add "one line + link" and nobody
# counts the pile — the home page accumulated 3 in-body /protocol links on top
# of the nav door, the audience tile, and the reading-path step that shared
# chrome already renders. Prose-repetition probes never see this; a link census
# does. Threshold: >2 identical in-body hrefs in one page file FAILS (the nav/
# footer/strip chrome is shared and not counted here — 2 in-body mentions is
# already generous).
#
# Scope: frontend/app/(marketing)/**/page.tsx and frontend/app/(app)/**/page.tsx
# (page BODIES; shared components own their own link discipline).
set -uo pipefail
cd "$(dirname "$0")/.."

# Structural exceptions (each carries its reason; add consciously, never to
# silence a real pile-up):
#   status/page.tsx   — every verbatim quote carries a per-quote source
#                       attribution link; N quotes from one page = N links.
#   glossary/page.tsx — a reference page; each entry links its term's owner.
ALLOWLIST='\(marketing\)/status/page\.tsx|\(marketing\)/glossary/page\.tsx'

violations=0
while IFS= read -r file; do
    [[ "$file" =~ $ALLOWLIST ]] && continue
    # grep exits 1 on a linkless page — that is a clean page, not an error
    # (set -e would silently kill the loop there; hence set -u only).
    dupes=$( (grep -o 'href="/[a-z0-9/#-]*"' "$file" 2>/dev/null || true) \
        | sed 's/#.*/"/' \
        | sort | uniq -c | awk '$1 > 2 {print $1, $2}')
    if [[ -n "$dupes" ]]; then
        echo "[duplicate-links] $file"
        echo "$dupes" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
done < <(find "frontend/app/(marketing)" "frontend/app/(app)" -name "page.tsx" 2>/dev/null)

if (( violations > 0 )); then
    echo "[duplicate-links] $violations page(s) link one route >2 times in the body."
    echo "                  Keep ONE purposeful link per target; the rest become prose."
    exit 1
fi
echo "[duplicate-links] clean — no page body links one route more than twice"
