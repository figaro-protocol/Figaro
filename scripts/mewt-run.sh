#!/usr/bin/env bash
# Launch a mewt mutation run detached, holding .mewt.lock for its duration.
# mewt rewrites the target's source ON DISK between mutants; anything that reads
# or builds the tree while the run goes sees a mutated contract. The lock names
# the target so the subagent-dispatch hook (.claude/hooks/mewt-lock-warn.sh) can
# tell every subagent, and so nobody commits (pre-commit builds) mid-run.
#   scripts/mewt-run.sh <target.sol> [log]   — mewt.toml's [targets]/[test] must already point at it
set -euo pipefail
target="${1:?target .sol}"; log="${2:-/tmp/mewt-$(basename "$target" .sol).console}"
root="$(cd "$(dirname "$0")/.." && pwd)"; lock="$root/.mewt.lock"
[[ -e "$lock" ]] && { echo "a mewt run already holds $lock ($(cat "$lock")); wait for it or remove the lock"; exit 1; }
echo "$target since $(date -u +%FT%TZ)" > "$lock"
( cd "$root" && mewt run "$target" > "$log" 2>&1; rm -f "$lock" ) &
disown
echo "mewt run on $target detached → $log; lock: $lock (removed when the run ends)"
