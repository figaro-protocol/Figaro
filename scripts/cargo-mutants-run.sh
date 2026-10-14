#!/usr/bin/env bash
# Launch a cargo-mutants run over one prover crate detached, holding .mewt.lock
# for its duration. The run is always `--in-place`: the clause conformance tests
# read ../clauses/ and ../test/fixtures/ from the workspace root, and
# cargo-mutants' default copy takes prover/ alone, so the unmutated baseline
# fails and nothing is tested. In place, cargo-mutants rewrites the crate's
# source ON DISK between mutants; the lock is the one mewt-run.sh holds, so the
# two mutation runs never overlap (beside each other they starve the machine) and
# the subagent-dispatch hook (.claude/hooks/mewt-lock-warn.sh) tells every
# subagent that a source on disk is mutated. `--in-place` refuses `-j`, so a
# jobs flag is refused here first.
#   scripts/cargo-mutants-run.sh <crate> [log] [cargo-mutants args...]
#       e.g. scripts/cargo-mutants-run.sh figaro-kernel
#            scripts/cargo-mutants-run.sh figaro-clause /tmp/m.console --iterate
#   MUTANTS_DRY_RUN=1 scripts/cargo-mutants-run.sh <crate>   — check the checkout, print the command, launch nothing
# Run it from a FULL checkout (a `git worktree add` under the scratchpad serves).
set -euo pipefail
crate="${1:?crate (figaro-kernel or figaro-clause)}"; shift
log="${1:-/tmp/cargo-mutants-$crate.console}"; [[ $# -gt 0 ]] && shift
root="$(cd "$(dirname "$0")/.." && pwd)"; lock="$root/.mewt.lock"
for a in "$@"; do
    case "$a" in -j|-j*|--jobs|--jobs=*) echo "cargo-mutants-run: --in-place refuses $a; run without a jobs flag"; exit 1 ;; esac
done
for need in prover/Cargo.toml clauses test/fixtures; do
    [[ -e "$root/$need" ]] || { echo "cargo-mutants-run: $root is not a full checkout ($need missing); the clause conformance tests read it from the workspace root"; exit 1; }
done
# Which layers this change re-runs (handover § "The baseline commit"), said before the run.
( cd "$root" && source scripts/frozen-scope.sh && gate_layers ) || true
cmd=(cargo mutants --in-place -p "$crate" "$@")
if [[ -n "${MUTANTS_DRY_RUN:-}" ]]; then
    echo "cargo-mutants-run: would run in $root/prover: ${cmd[*]} > $log"
    exit 0
fi
[[ -e "$lock" ]] && { echo "a mutation run already holds $lock ($(cat "$lock")); wait for it or remove the lock"; exit 1; }
echo "cargo-mutants $crate (prover/, in place) since $(date -u +%FT%TZ)" > "$lock"
( cd "$root/prover" && "${cmd[@]}" > "$log" 2>&1; rm -f "$lock" ) &
disown
echo "cargo-mutants run on $crate detached → $log; lock: $lock (removed when the run ends)"
