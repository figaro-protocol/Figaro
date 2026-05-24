#!/bin/bash
set -e

# Deploy the mock Kleros stack (MockKlerosArbitrator + MockKlerosArbitrableProxy)
# to local Anvil and wire NEXT_PUBLIC_KLEROS_* into frontend/.env.local.
#
# The mock Kleros is dev-only and deliberately standalone from deploy-local.sh
# (see script/DeployMockKleros.s.sol). Run this AFTER ./deploy-local.sh — the
# devnet is ephemeral, so re-run on every redeploy.
#
# Usage:  ./scripts/deploy-mock-kleros.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/frontend/.env.local"

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
export DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

echo "🏛️  Deploying mock Kleros stack..."
echo "   rpc=$RPC_URL"
echo ""

FORGE_OUT=$(forge script script/DeployMockKleros.s.sol:DeployMockKleros \
    --rpc-url "$RPC_URL" \
    --broadcast --slow --via-ir 2>&1)
echo "$FORGE_OUT"

# console.log line 45: "MockKlerosArbitrableProxy:   0x..."
PROXY_ADDR=$(echo "$FORGE_OUT" | grep 'MockKlerosArbitrableProxy:' | grep -oE '0x[0-9a-fA-F]{40}')

if [ -z "$PROXY_ADDR" ]; then
    echo "❌ Could not parse MockKlerosArbitrableProxy address from forge output."
    exit 1
fi

echo ""
echo "✍️  Wiring NEXT_PUBLIC_KLEROS_* into $ENV_FILE ..."

# Strip any prior Kleros lines (stale from a previous deploy), then re-append.
if [ -f "$ENV_FILE" ]; then
    grep -v -E '^NEXT_PUBLIC_KLEROS_' "$ENV_FILE" > "$ENV_FILE.tmp" || true
    mv "$ENV_FILE.tmp" "$ENV_FILE"
fi
{
    echo "NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY=$PROXY_ADDR"
    echo "NEXT_PUBLIC_KLEROS_ARBITRATOR_EXTRA_DATA=0x"
    echo "NEXT_PUBLIC_KLEROS_MOCK_BANNER=true"
} >> "$ENV_FILE"

echo "✅ Mock Kleros deployed and wired."
echo "   NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY=$PROXY_ADDR"
