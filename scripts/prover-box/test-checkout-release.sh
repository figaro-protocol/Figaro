#!/usr/bin/env bash
# The behavior of checkout-release.sh, against a throwaway origin on disk (no
# network, no box):
#   1. a fresh clone ends detached at the named commit, not at the branch tip;
#   2. an existing checkout is fetched and moved to a commit pushed after it was cloned;
#   3. RELEASE_COMMIT in the environment works as the argument does;
#   4. no commit named, a commit the origin lacks, and a dirty tree each refuse.
#
#   bash scripts/prover-box/test-checkout-release.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUT="$HERE/checkout-release.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILED=0
pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAILED=1; }

export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
git init --quiet --initial-branch=main "$WORK/src"
commit() { echo "$1" > "$WORK/src/f"; git -C "$WORK/src" add f; git -C "$WORK/src" commit --quiet -m "$1"; git -C "$WORK/src" rev-parse HEAD; }
RELEASE=$(commit release)
TIP=$(commit later)
git clone --quiet --bare "$WORK/src" "$WORK/origin.git"
export FIGARO_REPO_URL="$WORK/origin.git"

echo "checkout-release.sh"

OUT=$(bash "$SUT" "$RELEASE" "$WORK/box" 2>&1)
HEAD=$(git -C "$WORK/box" rev-parse HEAD)
[ "$HEAD" = "$RELEASE" ] && [ "$HEAD" != "$TIP" ] && pass "a fresh clone is at the release commit, not main's tip" || fail "fresh clone at $HEAD"
[ "$(printf '%s\n' "$OUT" | tail -1)" = "RELEASE_COMMIT=$RELEASE" ] && pass "it prints the full commit last" || fail "last line: $(printf '%s\n' "$OUT" | tail -1)"
git -C "$WORK/box" symbolic-ref -q HEAD > /dev/null && fail "HEAD is on a branch" || pass "HEAD is detached"

NEXT=$(commit next)
git -C "$WORK/src" push --quiet "$WORK/origin.git" main
bash "$SUT" "${NEXT:0:10}" "$WORK/box" > /dev/null 2>&1
[ "$(git -C "$WORK/box" rev-parse HEAD)" = "$NEXT" ] && pass "an existing checkout is fetched and moved to an abbreviated commit" || fail "existing checkout not moved"

(cd "$WORK" && HOME="$WORK/home" RELEASE_COMMIT="$RELEASE" bash "$SUT" > /dev/null 2>&1)
[ "$(git -C "$WORK/home/Figaro" rev-parse HEAD)" = "$RELEASE" ] && pass "RELEASE_COMMIT in the environment, default directory ~/Figaro" || fail "env form"

if bash "$SUT" "" "$WORK/box2" > /dev/null 2>&1; then fail "no commit named was accepted"; else pass "no commit named refuses"; fi
if bash "$SUT" 0123456789abcdef0123456789abcdef01234567 "$WORK/box" > /dev/null 2>&1; then fail "an unknown commit was accepted"; else pass "a commit the origin lacks refuses"; fi
echo dirt >> "$WORK/box/f"
if bash "$SUT" "$RELEASE" "$WORK/box" > /dev/null 2>&1; then fail "a dirty tree was accepted"; else pass "a tree with local changes refuses"; fi
[ "$(git -C "$WORK/box" rev-parse HEAD)" = "$NEXT" ] && pass "a refusal leaves HEAD where it was" || fail "HEAD moved on refusal"

if [ "$FAILED" != 0 ]; then echo "FAILED"; exit 1; fi
echo "all hold"
