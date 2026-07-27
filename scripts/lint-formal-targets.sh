#!/usr/bin/env bash
# lint-formal-targets.sh — existence gate for the formal-verification runner targets.
#
# The heavy formal runners name concrete contracts, specs, and models BY HAND:
#   scripts/test-certora.sh  → certora/<spec>.conf   (default SPECS list)
#   scripts/test-halmos.sh   → --contract Halmos<X>  (symbolic harness in test/)
#   scripts/test-echidna.sh  → --contract Echidna<X> + src/echidna/<X>.sol
#   scripts/test-tla.sh      → -config <M>.cfg + <M>.tla  (under formal/)
#
# When a contract is deleted (the 2026-07-27 System B rebuild removed
# IRpgfArbitrator, KlerosRpgfAdapter and DonationRail) a runner keeps pointing
# at the corpse — a "Pass 3/3 … RpgfMinter"
# step that errors ONLY when someone with the paid/heavy toolchain (Z3, a Certora
# key, TLC, echidna) actually runs it. This is the cheap, toolchain-free floor:
# it fails if any target a runner names no longer exists in the tree, so the drift
# surfaces at commit/CI time instead of mid formal-verification session.
#
# Targets are resolved FROM the runner scripts themselves (no second inventory to
# drift) and each is checked against the working tree. Comment lines are ignored —
# only executable `--contract` / `-config` / path references count.
#
# ALSO gates docs/VERIFICATION_MAP.md's cited names: the map cites suites,
# functions, and test files as `Name`: <coverage>. A deleted suite left a
# phantom citation for months (`ParityVectors` survived in three invariant
# rows long after the suite was removed) — exactly the drift an external
# auditor reads as live coverage. Every `Name`: cite must resolve to a
# defined contract, a defined Solidity function, or a tracked file basename.
#
# Exit codes:
#   0 — every formal runner targets a live contract / spec / model
#   1 — a runner points at a deleted target (drop the dead pass, or restore it)

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail=0
note() { echo "[formal-targets] $*" >&2; }

# A `contract <Name>` defined in any tracked .sol (src/ or test/ harness)?
# (git grep's regex engine does not honor \b, so bound with a non-word char / EOL.)
contract_defined() {
    git grep -qE "contract[[:space:]]+$1([^A-Za-z0-9_]|$)" -- '*.sol' 2>/dev/null
}

# Strip comment lines so a --contract/-config mentioned in a doc header is not
# treated as an executable target.
code_only() { grep -vE '^[[:space:]]*#' "$1"; }

# ── halmos + echidna: every --contract <Name> must be a defined contract ──
for runner in scripts/test-halmos.sh scripts/test-echidna.sh; do
    [ -f "$runner" ] || continue
    while read -r name; do
        [ -z "$name" ] && continue
        if ! contract_defined "$name"; then
            note "$runner targets '--contract $name', but no 'contract $name' is defined in any .sol"
            fail=1
        fi
    done < <(code_only "$runner" | grep -oE -- '--contract[[:space:]]+[A-Za-z0-9_]+' | awk '{print $2}' | sort -u)
done

# ── echidna: every src/echidna/<X>.sol path literal must exist ──
if [ -f scripts/test-echidna.sh ]; then
    while read -r p; do
        [ -z "$p" ] && continue
        if [ ! -f "$p" ]; then
            note "scripts/test-echidna.sh targets $p, which does not exist"
            fail=1
        fi
    done < <(code_only scripts/test-echidna.sh | grep -oE 'src/echidna/[A-Za-z0-9_]+\.sol' | sort -u)
fi

# ── certora: every conf named in the default SPECS list must exist ──
if [ -f scripts/test-certora.sh ]; then
    # The DEFAULT spec list (literal names), not the caller-override `SPECS=("$@")`.
    specs=$(grep -oE 'SPECS=\([A-Za-z][^)]*\)' scripts/test-certora.sh | head -1 | sed -E 's/SPECS=\((.*)\)/\1/')
    for spec in $specs; do
        conf="certora/${spec}.conf"
        if [ ! -f "$conf" ]; then
            note "scripts/test-certora.sh default SPECS names '$spec', but $conf does not exist"
            fail=1
        fi
    done
fi

# ── tla: every -config <M>.cfg and every <M>.tla model must exist under formal/ ──
if [ -f scripts/test-tla.sh ]; then
    while read -r cfg; do
        [ -z "$cfg" ] && continue
        if [ ! -f "formal/$cfg" ]; then
            note "scripts/test-tla.sh targets config $cfg, but formal/$cfg does not exist"
            fail=1
        fi
    done < <(code_only scripts/test-tla.sh | grep -oE -- '-config[[:space:]]+[A-Za-z0-9_]+\.cfg' | awk '{print $2}' | sort -u)
    while read -r model; do
        [ -z "$model" ] && continue
        if [ ! -f "formal/$model" ]; then
            note "scripts/test-tla.sh targets model $model, but formal/$model does not exist"
            fail=1
        fi
    done < <(code_only scripts/test-tla.sh | grep -oE '[A-Za-z0-9_]+\.tla' | sort -u)
fi

# ── VERIFICATION_MAP: every `Name`: cite must resolve to something live ──
# The map's suite-cite convention is a backticked name immediately followed by
# a colon (`FigaroCoreTest`: bond-amount coverage). Resolution order: a
# defined contract, a defined Solidity function (code-enforcement cites), or
# a tracked file with that basename (`FlorinToken.t.sol`, SDK `bonds.test.ts`).
VMAP="docs/VERIFICATION_MAP.md"
if [ -f "$VMAP" ]; then
    while read -r name; do
        [ -z "$name" ] && continue
        if contract_defined "$name"; then continue; fi
        if git grep -qE "function[[:space:]]+$name[[:space:]]*\(" -- '*.sol' 2>/dev/null; then continue; fi
        # Tracked file: exact basename, or the Foundry suite-file convention
        # (`FigaroCoreRevertBranchTest` → test/kernel/FigaroCoreRevertBranchTest.t.sol —
        # suite cites name the FILE; the contract inside may differ).
        if git ls-files "*/$name" "$name" "*/$name.t.sol" "*/$name.sol" | grep -q .; then continue; fi
        note "$VMAP cites \`$name\`: but no contract, function, or tracked file with that name exists"
        fail=1
    done < <(grep -oE '\`[A-Za-z0-9_.]+\`:' "$VMAP" | sed -E 's/\`([^\`]+)\`:/\1/' | sort -u)
fi

if [ "$fail" -eq 0 ]; then
    echo "[formal-targets] clean — every formal runner targets a live contract/spec/model, and every VERIFICATION_MAP cite resolves"
    exit 0
fi
note "a formal-verification runner points at a deleted target (above)."
note "fix the runner (drop the dead pass) or restore the target contract/spec/model."
exit 1
