#!/usr/bin/env bash
#
# lint-claude-local-allowlist.sh — .claude/ COMMITS ARE ALLOWLISTED; MEMORIES NEVER.
#
# feedback_claude_local_state_not_committed: only project-shared agent harness
# lives in the repo under .claude/ — agents, skills, hooks, settings.json. Local
# session state, caches, and anything else stay out.
# feedback_memories_not_committed: memory files (the operator's `memory/` dir) are
# NEVER committed, under any path.
#
# Reads the STAGED file set (pre-commit body, not lint-staged — lint-staged only
# passes files matching a configured glob, and the point here is to catch paths
# that match NONE). Fails if a staged path under .claude/ is outside the allowlist,
# or if any staged path is a memory file.
#
# Allowlist (top-level under .claude/):  agents/  skills/  hooks/  settings.json
#
# Exit: 0 clean, 1 on violation.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

staged=$(git diff --cached --name-only 2>/dev/null)
[[ -z "$staged" ]] && exit 0

violations=0
while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    # Memories never enter the repo, regardless of where they sit.
    if [[ "$path" == *"/memory/"* || "$path" == memory/* ]]; then
        echo "[claude-local] $path — memory files are never committed (feedback_memories_not_committed)"
        violations=$((violations + 1))
        continue
    fi
    # .claude/ commits are restricted to the shared agent harness.
    case "$path" in
        .claude/agents/*|.claude/skills/*|.claude/hooks/*|.claude/settings.json) ;;
        .claude/*)
            echo "[claude-local] $path — outside the .claude/ allowlist (agents/ skills/ hooks/ settings.json)"
            violations=$((violations + 1))
            ;;
    esac
done <<< "$staged"

if [[ "$violations" -gt 0 ]]; then
    echo ""
    echo "Only the shared agent harness belongs in .claude/ (agents/ skills/ hooks/ settings.json);"
    echo "everything else — local state, caches, memories — stays out. Unstage the path(s) above."
    echo "(feedback_claude_local_state_not_committed, feedback_memories_not_committed)"
    exit 1
fi
exit 0
