#!/usr/bin/env bash
# Start (or restart) the box-local Sepolia fork — the layer-2 rehearsal chain.
# FORK_RPC must be a KEYED upstream (e.g. the Infura Sepolia URL): anvil's fork
# backend has panicked mid-eth_estimateGas on the keyless public RPC, taking
# the whole fork state with it. The fork inherits live balances and contracts,
# so nothing is dealt or mocked; fund gas via anvil_setBalance.
set -euo pipefail
[ -n "${FORK_RPC:-}" ] || { echo "FORK_RPC not set (use a keyed RPC URL)"; exit 1; }

pkill -x sequencer 2>/dev/null || true
pkill -f "anvil --fork-url" 2>/dev/null || true
sleep 1

nohup "$HOME/.foundry/bin/anvil" --fork-url "$FORK_RPC" --chain-id 11155111 \
  --port 8546 --host 127.0.0.1 > "$HOME/anvil-fork.log" 2>&1 &
echo "anvil pid $!"
for i in $(seq 1 30); do
  curl -sf -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    http://127.0.0.1:8546 > /dev/null && { echo FORK-UP; exit 0; }
  sleep 2
done
echo FORK-FAILED; exit 1
