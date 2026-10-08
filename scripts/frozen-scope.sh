#!/usr/bin/env bash
#
# frozen-scope.sh — what the audit freeze covers, and the code of a file with
# its comments out: sourced by the maintainer's pre-commit gate
# (the British-spelling exemption, the handover's scope statement), so every
# reader judges by one rule.
# Comments and NatSpec may change in a frozen file; code may not.

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
