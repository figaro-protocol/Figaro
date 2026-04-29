#!/bin/sh
# Anvil container entrypoint.
#
# Starts anvil with state persistence. State is loaded from
# /data/state.json on startup (if it exists) and dumped there
# periodically and on graceful shutdown.
#
# Environment variables (set by Cloudflare Containers via
# rpc-proxy/wrangler.toml [[containers.environment]] entries):
#
#   ANVIL_BLOCK_TIME_SECONDS  block time in seconds (default: 1)
#                             — 1s makes UX snappy without burning
#                               state. Lower = faster ticks; higher =
#                               more realistic mainnet pacing.
#
#   ANVIL_CHAIN_ID            chain ID (default: 31337, Anvil default)
#                             — change if you want the testnet to
#                               look like a different chain ID for
#                               wallet-side disambiguation.
#
#   ANVIL_GAS_LIMIT           per-block gas limit (default: 30000000)
#
#   ANVIL_STATE_INTERVAL_SECS state-dump interval in seconds
#                             (default: 60). Lower = more durability
#                             after crash; higher = less I/O.

set -eu

BLOCK_TIME="${ANVIL_BLOCK_TIME_SECONDS:-1}"
CHAIN_ID="${ANVIL_CHAIN_ID:-31337}"
GAS_LIMIT="${ANVIL_GAS_LIMIT:-30000000}"
STATE_INTERVAL="${ANVIL_STATE_INTERVAL_SECS:-60}"
STATE_FILE="/data/state.json"

echo "[anvil-container] starting anvil"
echo "[anvil-container]   chain-id=$CHAIN_ID block-time=${BLOCK_TIME}s gas-limit=$GAS_LIMIT"
echo "[anvil-container]   state-file=$STATE_FILE state-interval=${STATE_INTERVAL}s"

# --host 0.0.0.0 so the Cloudflare Container's port forwarding can reach it.
# --state-interval triggers a periodic dump even without a graceful shutdown.
# --no-storage-caching to reduce in-memory footprint in long-running sessions.
exec anvil \
    --host 0.0.0.0 \
    --port 8545 \
    --chain-id "$CHAIN_ID" \
    --block-time "$BLOCK_TIME" \
    --gas-limit "$GAS_LIMIT" \
    --state "$STATE_FILE" \
    --state-interval "$STATE_INTERVAL" \
    --silent
