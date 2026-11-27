#!/usr/bin/env bash
# bench-stamp.sh — the first line of every bench's output: the commit the bench runs on
# and whether the tree differs from it. A bench's log then names its own commit, read
# from git at the run, and a result recorded against a commit can be checked against it.
# Called by each scripts/test-*.sh and by scripts/coverage.sh before anything else runs.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
commit="$(git -C "$root" rev-parse --verify -q HEAD || echo "no commit")"
changed="$(git -C "$root" status --porcelain --untracked-files=no | wc -l | tr -d ' ')"
if [ "$changed" = "0" ]; then tree="tree clean"; else tree="tree differs from the commit in $changed tracked file(s)"; fi
echo "[bench] $(basename "${1:-bench}") at commit $commit, $tree"
