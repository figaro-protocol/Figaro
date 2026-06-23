#!/usr/bin/env bash
# lint-no-devnet-revert.sh — a devnet spec MUST NOT snapshot + revert its own chain.
#
# Devnet is a mainnet REHEARSAL, not a sandbox. A spec that snapshots at the start
# and reverts in afterEach erases its on-chain state (and the event logs) the moment
# it finishes — so its effects can only ever be checked from the test's OWN
# assertions, never verified OUT-OF-BAND (a fresh chain / IPFS query). That defeats
# the whole point of a rehearsal. Leave the state; verify it independently.
# Model: tests/e2e/orders-accept.devnet.spec.ts (the canonical full-cycle e2e — no revert).
#
# lint-staged passes the staged files as args; only *.devnet.spec.ts are checked.
# Exit 0 clean, 1 on any violation.

set -euo pipefail

violations=0
for file in "$@"; do
    case "$file" in
        *.devnet.spec.ts) ;;
        *) continue ;;
    esac
    [[ -f "$file" ]] || continue
    # Match actual calls (the `(`) + the raw RPC method names — not prose/comments
    # that legitimately discuss the anti-pattern.
    hits=$(grep -nE 'evmSnapshot[[:space:]]*\(|evmRevert[[:space:]]*\(|evm_snapshot|evm_revert' "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[devnet-revert] $file snapshots/reverts its own chain."
        echo "$hits" | sed 's/^/      /'
        violations=$((violations + 1))
    fi
done

if (( violations > 0 )); then
    echo ""
    echo "[devnet-revert] Devnet is a mainnet REHEARSAL: leave the run's state on-chain +"
    echo "                in IPFS so it can be verified OUT-OF-BAND, not only from the test's"
    echo "                own assertions. Drop evmSnapshot/evmRevert; model the spec on"
    echo "                tests/e2e/orders-accept.devnet.spec.ts."
    exit 1
fi
exit 0
