#!/usr/bin/env bash
#
# semantic-precommit-audit.sh — the SEMANTIC open-world gate.
#
# Grep guards cannot detect prior-knowledge-of-the-registries (it routes by spec
# field-name+meaning, not clause-id literals — a soft identity-branch only a
# reader can see). So this guard IS a reasoning agent: it runs the read-only
# `figaro-open-world-auditor` (headless `claude -p`) over the STAGED DIFF and
# blocks the commit if the change INTRODUCES a cited prior-knowledge violation.
#
# DESIGN (deliberate):
#   • SCOPED — runs only when frontend .ts/.tsx is staged; skips otherwise.
#   • DIFF-ONLY — judges the staged CHANGE, not pre-existing code, so it never
#     blocks an unrelated commit for an old violation.
#   • FAIL-OPEN — if `claude` is absent, unauthenticated, errors, or the verdict
#     can't be parsed, it WARNS and PASSES. An LLM gate must never brick the
#     workflow on infra; a miss is recoverable, a bricked repo is not.
#   • OVERRIDE — `git commit --no-verify`, or `FIGARO_SKIP_SEMANTIC_AUDIT=1`.
#
# TRADEOFFS (the operator chose this knowingly): ~10–60s + tokens per qualifying
# commit. Correctness over speed. Tune cadence by editing the wiring in
# .husky/pre-commit (e.g. move to pre-push) if per-commit latency bites.
#
# Single source of truth for the audit criteria: the agent definition at
# .claude/agents/figaro-open-world-auditor.md (its body is the system prompt).

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[[ "${FIGARO_SKIP_SEMANTIC_AUDIT:-0}" == "1" ]] && exit 0

# Staged frontend source only.
files=$(git diff --cached --name-only --diff-filter=ACM | grep -E '^frontend/.*\.tsx?$' || true)
[[ -z "$files" ]] && exit 0

# Fail-open if the agent runtime isn't available headlessly.
if ! command -v claude >/dev/null 2>&1; then
    echo "[semantic-audit] claude CLI not found — skipping the semantic gate (fail-open)." >&2
    exit 0
fi

AGENT="$ROOT/.claude/agents/figaro-open-world-auditor.md"
if [[ ! -f "$AGENT" ]]; then
    echo "[semantic-audit] auditor agent missing — skipping (fail-open)." >&2
    exit 0
fi
# The agent body (everything after the closing frontmatter ---) is the brief.
brief=$(awk 'f>=2{print} /^---[[:space:]]*$/{f++}' "$AGENT")

diff_file="$(mktemp -t figaro-staged-diff)"
trap 'rm -f "$diff_file"' EXIT
git diff --cached -- $files > "$diff_file"

prompt="$brief

--- TASK ---
The staged git diff is in the file: $diff_file  (Read it with your Read tool.)
Judge ONLY whether these CHANGES INTRODUCE prior knowledge of the registries —
reason about the added/changed lines; ignore pre-existing code unless the change
worsens it. A descriptive name, generalizing field-routing, kernel-derived
state, or composition with a named on-network contract is NOT a violation.
End your reply with exactly one line: 'VERDICT: PASS' or 'VERDICT: FAIL'."

# Run the agent headless. Fail-open on any non-zero / empty output.
out=$(claude -p "$prompt" 2>/dev/null) || {
    echo "[semantic-audit] agent run failed — skipping the semantic gate (fail-open)." >&2
    exit 0
}
if [[ -z "$out" ]]; then
    echo "[semantic-audit] empty agent output — skipping (fail-open)." >&2
    exit 0
fi

if printf '%s\n' "$out" | grep -q 'VERDICT:[[:space:]]*FAIL'; then
    echo "" >&2
    echo "[semantic-audit] ✗ this change introduces PRIOR KNOWLEDGE OF THE REGISTRIES:" >&2
    printf '%s\n' "$out" | sed 's/^/    /' >&2
    echo "" >&2
    echo "Fix the cited coupling (derive from the spec/registry, name no clause/field-meaning)," >&2
    echo "or override with: git commit --no-verify  (or FIGARO_SKIP_SEMANTIC_AUDIT=1)." >&2
    exit 1
fi
exit 0
