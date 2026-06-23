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

# Body = from the first real "## ▶" section onward, minus the Punchlist-hygiene section.
hits=$(awk '
  /^## ▶/ { started=1; hygiene = ($0 ~ /Punchlist hygiene/) }
  started && !hygiene
' "$PUNCHLIST" | grep -E '✅|\bDONE\b|\bSUBSUMED\b|\bSUPERSEDED\b' || true)

[ -z "$hits" ] && exit 0

count=$(printf '%s\n' "$hits" | grep -c .)
echo "============== PUNCHLIST HYGIENE — $count mechanical quick-win(s) =============="
echo "These lines carry a completion/supersession marker but are still in the list. A closed"
echo "item is DELETED, not marked (the punchlist's own rule). Verify each against a recent"
echo "COMMIT (done) / a later RULING (superseded) / the item that SUBSUMES it (duplicate),"
echo "then strike it. Mechanical only — the semantic a/b/c checks need a reading pass."
echo
printf '%s\n' "$hits" | cut -c1-118
echo "======================================================================"
exit 0
