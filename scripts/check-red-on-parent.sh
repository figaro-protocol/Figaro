#!/usr/bin/env bash
#
# check-red-on-parent.sh — a test-first change's new tests fail on the code
# before the change. For the `function test*` names a change ADDS under test/,
# in a change that touches both src/ and test/, the new tests are run against
# src/ as it stood before the change; at least one must fail (a failing test or
# a test that does not compile against the old src/). New tests that pass there
# do not test the change, and the check fails.
#
# Run on request only, never on every commit:
#   bash scripts/check-red-on-parent.sh              — the staged change: test/ from the index, src/ at HEAD
#   bash scripts/check-red-on-parent.sh <commit>     — a commit: test/ at <commit>, src/ at its parent
#   a commit message carrying a `Red-on-parent:` trailer runs the staged form
#   from .husky/commit-msg.
#   bash scripts/check-red-on-parent.sh --self-test  — prove it fires and stays quiet (needs forge)
#
# The run copies src/, script/, foundry.toml and remappings.txt at the old side
# and test/ at the new side into a temporary directory beside a link to lib/,
# so the working tree is never touched.
#
# Exit code: 0 when a new test fails on the old src/ (or the change is not a
# test-first one), 1 when every new test passes there.

set -uo pipefail
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"

run_check() { # [commit]
    local commit="${1:-}" old diff names pattern tmp out rc f
    cd "$(git rev-parse --show-toplevel)" || return 1
    if [[ -n "$commit" ]]; then
        old="$commit^"
        changed=$(git diff --name-only "$old" "$commit")
        diff=$(git diff -U0 --no-color "$old" "$commit" -- test)
    else
        old=HEAD
        changed=$(git diff --cached --name-only)
        diff=$(git diff --cached -U0 --no-color -- test)
    fi
    if ! grep -q '^src/' <<< "$changed" || ! grep -q '^test/' <<< "$changed"; then
        echo "[red-on-parent] the change does not touch both src/ and test/; not a test-first change, nothing to run"
        return 0
    fi
    names=$(comm -23 \
        <(sed -nE 's/^\+[[:space:]]*function[[:space:]]+(test[A-Za-z0-9_]*)[[:space:]]*\(.*/\1/p' <<< "$diff" | sort -u) \
        <(sed -nE 's/^-[[:space:]]*function[[:space:]]+(test[A-Za-z0-9_]*)[[:space:]]*\(.*/\1/p' <<< "$diff" | sort -u))
    if [[ -z "$names" ]]; then
        echo "[red-on-parent] the change adds no \`function test*\` under test/; nothing to run"
        return 0
    fi
    tmp=$(mktemp -d -t red-on-parent-XXXXXX)
    # git archive refuses a pathspec that matches nothing, so name only what the old side holds.
    local present=()
    for f in src script foundry.toml remappings.txt; do
        [[ -n "$(git ls-tree --name-only "$old" -- "$f")" ]] && present+=("$f")
    done
    git archive "$old" -- "${present[@]}" | tar -x -C "$tmp"
    if [[ -n "$commit" ]]; then
        git archive "$commit" -- test | tar -x -C "$tmp"
    else
        git ls-files -z -- test | xargs -0 git checkout-index -f --prefix="$tmp/" --
    fi
    [[ -d lib ]] && ln -s "$PWD/lib" "$tmp/lib"
    # forge matches --match-test against the signature (`test_x()`), so the name ends at "(" or the end.
    pattern="^($(paste -sd'|' - <<< "$names"))(\\(|\$)"
    echo "[red-on-parent] running $(wc -l <<< "$names" | tr -d ' ') new test(s) against src/ at $old: $(tr '\n' ' ' <<< "$names")"
    out=$(cd "$tmp" && forge test --match-test "$pattern" 2>&1); rc=$?
    rm -rf "$tmp"
    if [[ $rc -ne 0 ]]; then
        if grep -q 'Compiler run failed' <<< "$out"; then
            echo "[red-on-parent] red: the new tests do not compile against src/ at $old — ok"
            grep -A1 -E '^Error \(' <<< "$out" | sed 's/^/    /' | head -6
        else
            echo "[red-on-parent] red: a new test fails against src/ at $old — ok"
            grep -E '^\[FAIL' <<< "$out" | sed 's/^/    /' | head -10
        fi
        return 0
    fi
    if grep -q 'No tests match' <<< "$out"; then
        echo "[red-on-parent] no test matched $pattern against src/ at $old — FAIL (the names were not found)"
        return 1
    fi
    echo "[red-on-parent] every new test passes against src/ at $old: they do not test the change — FAIL"
    return 1
}

if [[ "${1:-}" == "--self-test" ]]; then
    st=$(mktemp -d -t guards-red-on-parent-XXXXXX)
    trap 'rm -rf "$st"' EXIT
    cd "$st" || exit 1
    git init -q && mkdir -p src test
    printf '[profile.default]\nsrc = "src"\nout = "out"\nlibs = []\n' > foundry.toml
    printf '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract A { function f() external pure returns (uint256) { return 1; } }\n' > src/A.sol
    printf '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\nimport "../src/A.sol";\ncontract T {\n    function test_one() public { require(new A().f() >= 1); }\n}\n' > test/A.t.sol
    git add foundry.toml src/A.sol test/A.t.sol && git -c user.email=t@t -c user.name=t commit -qm base
    rc=0
    # Red: the change makes f() return 2 and adds a test that needs it.
    printf '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract A { function f() external pure returns (uint256) { return 2; } }\n' > src/A.sol
    printf '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\nimport "../src/A.sol";\ncontract T {\n    function test_one() public { require(new A().f() >= 1); }\n    function test_two() public { require(new A().f() == 2); }\n}\n' > test/A.t.sol
    git add src/A.sol test/A.t.sol
    if bash "$SELF" >/dev/null 2>&1; then echo "[red-on-parent] self-test: a new test that fails on the parent passes the check — ok"; else echo "[red-on-parent] self-test: a red-on-parent test should pass the check — FAIL"; rc=1; fi
    # Green on the parent: the added test holds before the change too.
    printf '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\nimport "../src/A.sol";\ncontract T {\n    function test_one() public { require(new A().f() >= 1); }\n    function test_two() public { require(new A().f() > 0); }\n}\n' > test/A.t.sol
    git add test/A.t.sol
    if bash "$SELF" >/dev/null 2>&1; then echo "[red-on-parent] self-test: a new test that passes on the parent should fail the check — FAIL"; rc=1; else echo "[red-on-parent] self-test: a new test that passes on the parent fails the check — ok"; fi
    exit $rc
fi

run_check "${1:-}"
