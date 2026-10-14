#!/usr/bin/env bash
#
# frozen-scope.sh — what the audit scope covers, and the code of a file with
# its comments out: sourced by the maintainer's pre-commit gate
# (the British-spelling exemption, the handover's scope statement), so every
# reader judges by one rule.
# Comments and NatSpec are stripped so a scope file's code can be compared.

# The scope, as docs/AUDITOR_HANDOVER.md § "Scope" lists it.
in_scope() {
    case "$1" in
        src/core/*.sol|src/build/*.sol|src/app/*.sol) return 0 ;;
        script/Deploy.s.sol|script/DeployMainnet.s.sol|script/DeploySwapCoordinator.s.sol) return 0 ;;
        prover/program/*|prover/lib/*|prover/clause/*|prover/sequencer/*)
            case "$1" in *.rs|*/Cargo.toml) return 0 ;; esac ;;
        prover/Cargo.toml|prover/Cargo.lock) return 0 ;;
    esac
    return 1
}

# Comments out, string literals kept, whitespace collapsed: what is left is the
# code the audit reads. Solidity and Rust share the two comment forms.
STRIP_PY=$(cat <<'PY'
import re, sys
src = sys.stdin.read()
name = sys.argv[1]
if name.endswith((".toml", ".lock")):
    out = re.sub(r"#[^\n]*", "", src)
else:
    rust = name.endswith(".rs")
    # In Rust an apostrophe opens a character literal only when it closes at
    # once ('a', '\n', '\u{1F600}'); otherwise it is a lifetime or a label and
    # opens nothing. A raw string (r"..", r#".."#, br#".."#) ends at its own
    # closing quote and hashes, whatever quotes it holds.
    char_lit = re.compile(r"'(?:\\(?:[nrt\\0'\"]|x[0-9a-fA-F]{2}|u\{[0-9a-fA-F_]{1,6}\})|[^\\'\n])'")
    raw_open = re.compile(r"b?r(#*)\"")
    out = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c == "/" and src.startswith("//", i):
            j = src.find("\n", i)
            i = n if j < 0 else j
        elif c == "/" and src.startswith("/*", i):
            j = src.find("*/", i + 2)
            i = n if j < 0 else j + 2
            out.append(" ")
        elif rust and c in "br" and not (i and (src[i - 1].isalnum() or src[i - 1] == "_")) and raw_open.match(src, i):
            m = raw_open.match(src, i)
            j = src.find('"' + m.group(1), m.end())
            j = n if j < 0 else j + 1 + len(m.group(1))
            out.append(src[i:j])
            i = j
        elif rust and c == "'":
            m = char_lit.match(src, i)
            if m:
                out.append(m.group(0))
                i = m.end()
            else:
                out.append(c)
                i += 1
        elif c in "\"'":
            j = i + 1
            while j < n and src[j] != c:
                j += 2 if src[j] == "\\" else 1
            out.append(src[i:j + 1])
            i = j + 1
        else:
            out.append(c)
            i += 1
    out = "".join(out)
sys.stdout.write(" ".join(out.split()))
PY
)
strip_comments() {
    python3 -c "$STRIP_PY" "$1"
}

# The files whose change forces every layer of the gate, whatever the stripped
# code shows: the compiler's settings and remappings, the Rust lock, and the
# guest's build (its crate manifest, the relay's build step that compiles it,
# the toolchain pin, the canonical build script).
GATE_FULL_CONFIG=(foundry.toml remappings.txt prover/Cargo.lock prover/program/Cargo.toml prover/sequencer/build.rs prover/rust-toolchain.toml scripts/prover-box/build-guest.sh)

# The baseline the handover names (At a glance, "Baseline commit").
handover_baseline() {
    sed -nE 's/^\| Baseline commit \| `([0-9a-f]{7,40})`.*/\1/p' docs/AUDITOR_HANDOVER.md | head -1
}

# gate_layers [base] [head] — which layers of the gate a change from base to head
# re-runs, printed before a mutation run or a Certora run: "full gate" when a
# scope file's stripped code moved or a GATE_FULL_CONFIG file changed, else
# "quick layers only" (handover § "The baseline commit": the mutation runs and
# the Certora reports depend on code and tests alone, so they stand). Returns 0
# for quick layers, 1 for the full gate. Defaults: the handover's baseline, HEAD.
gate_layers() {
    local base="${1:-$(handover_baseline)}" head="${2:-HEAD}" f moved="" config
    if [ -z "$base" ] || ! git rev-parse --verify -q "$base^{commit}" >/dev/null; then
        echo "full gate: no baseline commit to compare against (${base:-none named})"
        return 1
    fi
    config=$(git diff --name-only "$base" "$head" -- "${GATE_FULL_CONFIG[@]}")
    if [ -n "$config" ]; then
        echo "full gate: a build configuration changed from $base to $head: $(echo $config)"
        return 1
    fi
    for f in $( { git ls-tree -r --name-only "$base" -- src script prover; git ls-tree -r --name-only "$head" -- src script prover; } | sort -u); do
        in_scope "$f" || continue
        if ! diff -q <(git show "$base:$f" 2>/dev/null | strip_comments "$f") <(git show "$head:$f" 2>/dev/null | strip_comments "$f") >/dev/null 2>&1; then
            moved="$moved $f"
        fi
    done
    if [ -n "$moved" ]; then
        echo "full gate: the stripped code moved from $base to $head in:$moved"
        return 1
    fi
    echo "quick layers only: the scope's stripped code is equal from $base to $head and no build configuration changed; the mutation runs and the Certora reports stand at the commits they name"
    return 0
}

# bash scripts/frozen-scope.sh --self-test — prove gate_layers tells a comment
# edit (quick layers only) from a code edit and a configuration edit (full gate).
if [ "${BASH_SOURCE[0]}" = "$0" ] && [ "${1:-}" = "--self-test" ]; then
    st=$(mktemp -d -t guards-frozen-scope-XXXXXX)
    trap 'rm -rf "$st"' EXIT
    cd "$st" || exit 1
    git init -q && mkdir -p src/core docs
    printf '| Baseline commit | `0000000` |\n' > docs/AUDITOR_HANDOVER.md
    printf 'contract A {\n    // a comment\n    uint256 x;\n}\n' > src/core/A.sol
    printf '[profile.default]\n' > foundry.toml
    git add src/core/A.sol foundry.toml docs/AUDITOR_HANDOVER.md && git -c user.email=t@t -c user.name=t commit -qm base
    base=$(git rev-parse --short HEAD)
    rc=0
    expect() { # want(0 quick|1 full), label
        if gate_layers "$base" HEAD >/dev/null; then got=0; else got=1; fi
        if [ "$got" = "$1" ]; then echo "[frozen-scope] self-test: $2 — ok"; else echo "[frozen-scope] self-test: $2 — FAIL"; rc=1; fi
    }
    printf 'contract A {\n    // a comment, reworded\n    uint256 x;\n}\n' > src/core/A.sol
    git add src/core/A.sol && git -c user.email=t@t -c user.name=t commit -qm comment
    expect 0 "a comment edit runs the quick layers only"
    printf '[profile.default]\nvia_ir = true\n' > foundry.toml
    git add foundry.toml && git -c user.email=t@t -c user.name=t commit -qm config
    expect 1 "a foundry.toml edit forces the full gate"
    git reset -q --hard "$base"
    printf 'contract A {\n    // a comment\n    uint256 y;\n}\n' > src/core/A.sol
    git add src/core/A.sol && git -c user.email=t@t -c user.name=t commit -qm code
    expect 1 "a code edit forces the full gate"
    exit $rc
fi
