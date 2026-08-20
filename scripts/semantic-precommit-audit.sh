#!/usr/bin/env bash
#
# semantic-precommit-audit.sh — the SEMANTIC open-world gate (parameterized runner).
#
# Grep guards cannot detect prior-knowledge-of-the-registries (it routes by spec
# field-name+meaning, not clause-id literals — a soft identity-branch only a reader can
# see). So this guard IS a reasoning agent: it runs a read-only auditor agent (headless
# `claude -p`) over the STAGED DIFF for ONE ROOM of the codebase and blocks the commit if
# the change INTRODUCES a cited violation.
#
# ONE runner, MANY inspectors (SoC): the auditor's *rulebook* is per-room (frontend /
# protocol), but the headless-run *harness* is single-sourced here — no copy-pasted second
# script. Call it once per room from .husky/pre-commit. Every inspector shares one
# definition of open-world: docs/OPEN_WORLD.md §1.
#
# USAGE: semantic-precommit-audit.sh <label> <staged-file-regex> <agent-md-path>
#   frontend: '^frontend/.*\.tsx?$'            .claude/agents/figaro-open-world-auditor.md
#   protocol: '^(src/.*\.sol|prover/.*\.rs)$'  .claude/agents/figaro-protocol-open-world-auditor.md
#
# DESIGN (deliberate):
#   • SCOPED — runs only when files matching <regex> are staged; skips otherwise.
#   • DIFF-ONLY — judges the staged CHANGE, not pre-existing code.
#   • FAIL-OPEN — if `claude` is absent, unauthenticated, errors, or the verdict can't be
#     parsed, it WARNS and PASSES. An LLM gate must never brick the workflow on infra.
#   • OVERRIDE — `git commit --no-verify`, or `FIGARO_SKIP_SEMANTIC_AUDIT=1`.
#
# Single source of truth for each room's criteria: the cited agent definition (its body).

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LABEL="${1:?usage: semantic-precommit-audit.sh <label> <staged-file-regex> <agent-md-path>}"
REGEX="${2:?missing staged-file regex}"
AGENT_REL="${3:?missing agent md path}"

[[ "${FIGARO_SKIP_SEMANTIC_AUDIT:-0}" == "1" ]] && exit 0

# Staged source for this room only.
files=$(git diff --cached --name-only --diff-filter=ACM | grep -E "$REGEX" || true)
[[ -z "$files" ]] && exit 0

# Fail-open if the agent runtime isn't available headlessly.
if ! command -v claude >/dev/null 2>&1; then
    echo "[semantic-audit:$LABEL] claude CLI not found — skipping the semantic gate (fail-open)." >&2
    exit 0
fi

AGENT="$ROOT/$AGENT_REL"
if [[ ! -f "$AGENT" ]]; then
    echo "[semantic-audit:$LABEL] auditor agent missing ($AGENT_REL) — skipping (fail-open)." >&2
    exit 0
fi
# The agent body (everything after the closing frontmatter ---) is the brief.
brief=$(awk 'f>=2{print} /^---[[:space:]]*$/{f++}' "$AGENT")

diff_file="$(mktemp -t figaro-staged-diff)"
trap 'rm -f "$diff_file"' EXIT
git diff --cached -- $files > "$diff_file"

prompt="$brief

--- TASK ---
Apply your rulebook above to the staged changes for the '$LABEL' room.
The staged git diff is in the file: $diff_file  (Read it with your Read tool.)
Judge ONLY whether these CHANGES INTRODUCE a violation — reason about the added/changed
lines; ignore pre-existing code unless the change worsens it. A descriptive name,
generalizing spec-driven routing, kernel-derived state, or composition with a named
on-network contract is NOT a violation.
End your reply with exactly one line: 'VERDICT: PASS' or 'VERDICT: FAIL'."

# Run the agent headless. Fail-open on any non-zero / empty output — and
# BOUNDED: fail-open covered error and empty output but a HUNG run blocked a
# commit for 10+ minutes (2026-08-20), visually indistinguishable from work.
# perl's alarm is the wrapper because macOS ships no `timeout` binary; a
# stall now joins the fail-open path instead of holding the terminal.
out=$(perl -e 'alarm shift; exec @ARGV' "${SEMANTIC_AUDIT_TIMEOUT_SECS:-120}" claude -p "$prompt" 2>/dev/null) || {
    echo "[semantic-audit:$LABEL] agent run failed — skipping the semantic gate (fail-open)." >&2
    exit 0
}
if [[ -z "$out" ]]; then
    echo "[semantic-audit:$LABEL] empty agent output — skipping (fail-open)." >&2
    exit 0
fi

if printf '%s\n' "$out" | grep -q 'VERDICT:[[:space:]]*FAIL'; then
    echo "" >&2
    echo "[semantic-audit:$LABEL] ✗ this change introduces a closed-world violation:" >&2
    printf '%s\n' "$out" | sed 's/^/    /' >&2
    echo "" >&2
    echo "Fix the cited coupling (derive from the spec/registry; name no clause identity)," >&2
    echo "or override with: git commit --no-verify  (or FIGARO_SKIP_SEMANTIC_AUDIT=1)." >&2
    exit 1
fi
exit 0
