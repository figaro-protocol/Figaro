#!/usr/bin/env bash
#
# lint-kernel-frozen.sh — THE KERNEL IS FROZEN. This FAILS the commit.
#
# `src/kernel/FigaroCore.sol` and `src/kernel/CommitmentTypes.sol` are the two frozen kernel
# files (CLAUDE.md § Agent Permissions § "Never edit, ever"). Two softer guards
# already exist and are both bypassable by a human:
#   • .claude/hooks/kernel-warn.sh — WARNS the agent at edit time (advisory).
#   • .claude/settings.json permissions.deny — blocks the Claude Code tool call,
#     but does nothing about a human's `git commit`.
# Neither stops a staged kernel edit from landing. This gate closes that hole:
# it reads the STAGED set and REFUSES the commit if either kernel file is staged.
#
# Deliberate escape hatch: a genuine, reviewed kernel change (e.g. a formal-audit
# fix the maintainer has verified 3× against docs/DESIGN_DECISIONS.md) sets
#   FIGARO_KERNEL_EDIT=1 git commit ...
# The override is loud and per-commit — it cannot be set-and-forgotten in config,
# so every kernel commit is a conscious act. Agents must NOT set it.
#
# Exit codes:
#   0 — no frozen kernel file staged (or the override is set)
#   1 — a frozen kernel file is staged without FIGARO_KERNEL_EDIT=1

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

staged=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null)
[ -z "$staged" ] && exit 0

frozen=$(printf '%s\n' "$staged" | grep -E '(^|/)src/kernel/(FigaroCore|CommitmentTypes)\.sol$' || true)
[ -z "$frozen" ] && exit 0

# A pure RENAME is not a mutation. The kernel may be relocated (the 2026-07-27
# tier reorganisation moved both files into src/kernel/) as long as the CONTENT
# is byte-identical to its blob in HEAD. Anything that changes a byte still
# REFUSES below. Content equality is the invariant, not the path.
unmoved=""
for f in $frozen; do
    base="${f##*/}"
    old=$(git rev-parse "HEAD:src/$base" 2>/dev/null || git rev-parse "HEAD:$f" 2>/dev/null || true)
    new=$(git rev-parse ":$f" 2>/dev/null || true)
    if [ -n "$old" ] && [ "$old" = "$new" ]; then
        echo "[kernel-frozen] relocation OK — $f is byte-identical to HEAD (moved, not edited)." >&2
        continue
    fi
    unmoved="$unmoved $f"
done
frozen=$(printf '%s\n' $unmoved)
[ -z "${frozen// /}" ] && exit 0

if [ "${FIGARO_KERNEL_EDIT:-0}" = "1" ]; then
    echo "[kernel-frozen] OVERRIDE — FIGARO_KERNEL_EDIT=1; allowing staged kernel edit:" >&2
    printf '   %s\n' $frozen >&2
    exit 0
fi

echo "[kernel-frozen] REFUSED — the kernel is FROZEN and these files are staged:" >&2
printf '   %s\n' $frozen >&2
echo "" >&2
echo "  FigaroCore.sol + CommitmentTypes.sol are the two frozen kernel files." >&2
echo "  To change kernel behavior, write a NEW contract with a NEW identifier —" >&2
echo "  never mutate the kernel (CLAUDE.md § Agent Permissions)." >&2
echo "" >&2
echo "  If this IS a reviewed, verified-3x kernel change, re-run with the loud" >&2
echo "  per-commit override:  FIGARO_KERNEL_EDIT=1 git commit ..." >&2
exit 1
