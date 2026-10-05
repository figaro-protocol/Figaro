#!/usr/bin/env bash
#
# check-frozen-scope-commits.sh — the audit freeze, checked in public CI.
#
#   scripts/check-frozen-scope-commits.sh <from-sha> <to-sha>
#
# While an audit tag stands, every commit in from..to that changes the CODE of
# an audit-scope file (comments and NatSpec aside — scripts/frozen-scope.sh
# holds the scope and the comment stripper) must carry a line
#
#   Audit-scope-change: <the reason>
#
# in its message: the maintainer's override of the freeze, written into the
# commit where anyone can read it. The maintainer's pre-commit gate
# (scripts/lint-kernel-frozen.sh) refuses such a commit locally unless
# FIGARO_KERNEL_EDIT=1; this check is the same rule for a commit that never
# passed that gate. Each commit is compared with its parent, so a change
# accepted once is not judged again.
#
# Exit 0 when every commit holds; 1, naming each commit and file, when not.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=frozen-scope.sh
source "$ROOT/scripts/frozen-scope.sh"

from="${1:?usage: check-frozen-scope-commits.sh <from-sha> <to-sha>}"
to="${2:?usage: check-frozen-scope-commits.sh <from-sha> <to-sha>}"

tag=$(git tag -l 'audit-*' | sort -V | tail -1)
if [ -z "$tag" ]; then
    echo "[frozen-scope] no audit tag stands — nothing is frozen"
    exit 0
fi

failed=0
for commit in $(git rev-list --reverse "$from..$to"); do
    parent=$(git rev-parse -q --verify "$commit^" 2>/dev/null) || continue
    changed=""
    for f in $(git diff --name-only --diff-filter=ACDMR "$parent" "$commit"); do
        in_scope "$f" || continue
        old=$(git cat-file -p "$parent:$f" 2>/dev/null | strip_comments "$f")
        new=$(git cat-file -p "$commit:$f" 2>/dev/null | strip_comments "$f")
        [ "$old" != "$new" ] && changed="$changed $f"
    done
    [ -z "$changed" ] && continue
    subject=$(git log -1 --format=%s "$commit" | cut -c1-80)
    if git log -1 --format=%B "$commit" | grep -qE '^Audit-scope-change: .+'; then
        echo "[frozen-scope] ${commit:0:8} changes audit-scope code, with its Audit-scope-change line:$changed"
    else
        echo "[frozen-scope] REFUSED ${commit:0:8} \"$subject\" changes the code of files frozen at $tag and carries no 'Audit-scope-change: <reason>' line:$changed"
        failed=1
    fi
done

[ "$failed" = 0 ] && echo "[frozen-scope] clean — every commit in range keeps the audit scope at $tag, or says why it does not"
exit "$failed"
