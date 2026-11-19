#!/usr/bin/env bash
# Put the prover box's checkout at the release commit, and refuse anything else.
#
#   checkout-release.sh <release-commit> [<checkout dir>]
#   RELEASE_COMMIT=<sha> checkout-release.sh
#
# The verification key is a function of the guest's bytes, so the box builds
# exactly the commit the maintainer names, never whatever `main` holds that
# day. The commit is a full or abbreviated SHA (or a tag) that the origin
# carries. A checkout that does not exist yet is cloned; one that exists is
# fetched. Either way it ends detached at the commit, with no local change,
# and prints `RELEASE_COMMIT=<full sha>` as its last line.
#
#   FIGARO_REPO_URL   the origin (default https://github.com/figaro-protocol/Figaro)
#
# provision.sh calls it; a box left over from an earlier session runs it alone.
# scripts/prover-box/test-checkout-release.sh holds its behavior.
set -euo pipefail

COMMIT="${1:-${RELEASE_COMMIT:-}}"
DIR="${2:-$HOME/Figaro}"
REPO_URL="${FIGARO_REPO_URL:-https://github.com/figaro-protocol/Figaro}"

if [ -z "$COMMIT" ]; then
    echo "❌ no release commit: pass it as the first argument or as RELEASE_COMMIT" >&2
    exit 1
fi

if [ -d "$DIR/.git" ]; then
    git -C "$DIR" fetch --tags origin
else
    git clone "$REPO_URL" "$DIR"
fi

if ! git -C "$DIR" rev-parse --verify --quiet "$COMMIT^{commit}" > /dev/null; then
    echo "❌ $COMMIT is not a commit the origin ($REPO_URL) carries — push it first" >&2
    exit 1
fi
if [ -n "$(git -C "$DIR" status --porcelain)" ]; then
    echo "❌ $DIR has local changes; a release build starts from a clean tree" >&2
    git -C "$DIR" status --porcelain >&2
    exit 1
fi

git -C "$DIR" checkout --quiet --detach "$COMMIT"
FULL=$(git -C "$DIR" rev-parse HEAD)
WANT=$(git -C "$DIR" rev-parse "$COMMIT^{commit}")
if [ "$FULL" != "$WANT" ]; then
    echo "❌ HEAD is $FULL, not $WANT" >&2
    exit 1
fi
echo "RELEASE_COMMIT=$FULL"
