#!/usr/bin/env bash
# SessionStart hook — PUNCHLIST HYGIENE (the mechanical half of the reduce-the-list
# methodology). Flags items still in the punchlist that carry a completion/supersession
# marker (DONE / SUBSUMED / SUPERSEDED / ✅): per the punchlist's own rule, a closed item
# is DELETED, not marked, so any such marker is a quick-win deletion candidate.
#
# This is the MECHANICAL half only. The semantic checks — is the item done by a recent
# COMMIT, superseded by a later RULING, or subsumed by another ITEM — need a reading pass
# the hook can't do; this just surfaces the cheap signals so the next agent starts there.
#
# Carve-outs: the intro (before the first "## ▶" section) and the "Punchlist hygiene"
# section both DESCRIBE these markers as examples — excluded so the hook never flags its
# own instructions. `SUPERSEDES` (active — a live ruling naming what it replaced) is NOT a
# marker; only passive `SUPERSEDED` is.
set -euo pipefail

PUNCHLIST="$HOME/.claude/projects/-Users-adaliana-Figaro/memory/project_punchlist.md"
[ -f "$PUNCHLIST" ] || exit 0

# Body = from the first "## " section onward, minus any Punchlist-hygiene section.
# (Anchor was "## ▶" until 2026-07-22 — the list's headers moved to "## N · Title"
# and the hook silently scanned NOTHING; anchor on any "## " so a future format
# drift degrades to over-scanning, never to silence.)
hits=$(awk '
  /^## / { started=1; hygiene = ($0 ~ /Punchlist hygiene/) }
  started && !hygiene
' "$PUNCHLIST" | grep -E '✅|\bDONE\b|\bSUBSUMED\b|\bSUPERSEDED\b|\b(SHIPPED|[Ss]hipped)\b|\bPOSTPONED\b|\bRULED:|\bLANDED\b|[Cc]losed this session|\bPASSED\b' || true)

if [ -n "$hits" ]; then
    count=$(printf '%s\n' "$hits" | grep -c .)
    echo "============== PUNCHLIST HYGIENE — $count mechanical quick-win(s) =============="
    echo "These lines carry a completion/supersession marker but are still in the list. A closed"
    echo "item is DELETED, not marked (the punchlist's own rule). Verify each against a recent"
    echo "COMMIT (done) / a later RULING (superseded) / the item that SUBSUMES it (duplicate),"
    echo "then strike it. Mechanical only — the semantic a/b/c checks need a reading pass."
    echo
    printf '%s\n' "$hits" | cut -c1-118
    echo "======================================================================"
fi

# ── FORWARD POINTERS — memories must never point at expiring locations. ──
# Session scratchpads (/private/tmp/claude-*/…/scratchpad) die with the session;
# a memory or punch-list line that says "steps in the session scratchpad" is a
# fossil the moment the session ends (bit twice on 2026-07-22: the XMTP smoke
# steps and the ParityVectors parking both evaporated). Durable content belongs
# IN the memory file or in a tracked repo file.
MEMORY_DIR="$(dirname "$PUNCHLIST")"
fwd=$(grep -rn -E '/private/tmp/claude|/tmp/claude-|[Ss]ession scratchpad' "$MEMORY_DIR" --include='*.md' 2>/dev/null || true)
if [ -n "$fwd" ]; then
    fcount=$(printf '%s\n' "$fwd" | grep -c .)
    echo "============ MEMORY FORWARD-POINTERS — $fcount expiring reference(s) ============"
    echo "These memory lines point at session scratchpads or other expiring locations."
    echo "Scratchpads die with their session — inline the content into the memory/punch-list"
    echo "line, or move it to a tracked repo file, then fix the pointer."
    echo
    printf '%s\n' "$fwd" | cut -c1-118
    echo "======================================================================"
fi
exit 0
