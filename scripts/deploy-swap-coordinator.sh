#!/usr/bin/env bash
#
# deploy-swap-coordinator.sh — deploy WitnessSwapAndCommitCoordinator onto a LIVE
# public stack (Sepolia or mainnet) and merge its addresses into the deployment
# record. Wrapper for script/DeploySwapCoordinator.s.sol (never a bare forge
# script — the repo's rule). Guards, in order:
#   1. every required env var present (PRIVATE_KEY, RPC_URL, SWAP_ROUTER;
#      PERMIT2 defaults to the canonical address; FIGARO_CORE is read from the
#      record for the RPC's chain id);
#   2. chain-id read-back — the RPC's chain must have a deployment record;
#   3. the router answers by BEHAVIOUR (factory() + WETH9() are contracts) —
#      re-checked in Solidity before broadcast;
#   4. record merge: deployments/<chainId>.json gains
#      witnessSwapAndCommitCoordinator / swapRouter / permit2. SKIP_VERIFY=1
#      (fork rehearsal) diverts the record and skips Etherscan verification.
#
# Usage (from repo root):
#   set -a; source ~/.figaro-deploy.env; set +a
#   RPC_URL=$SEPOLIA_RPC_URL SWAP_ROUTER=0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E \
#     ./scripts/deploy-swap-coordinator.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

: "${PRIVATE_KEY:?PRIVATE_KEY not set}"
: "${RPC_URL:?RPC_URL not set}"
: "${SWAP_ROUTER:?SWAP_ROUTER not set (Uniswap SwapRouter02 on the target chain, from the Uniswap deployment docs)}"
export PERMIT2="${PERMIT2:-0x000000000022D473030F116dDEE9F6B43aC78BA3}"
# Uniswap QuoterV2 on the target chain — the frontend's Uniswap venue quotes
# through it (the coordinator never touches it). Optional here; recorded when given.
SWAP_QUOTER="${SWAP_QUOTER:-}"

CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL")
RECORD="deployments/${CHAIN_ID}.json"
if [ ! -f "$RECORD" ]; then echo "❌ no deployment record for chain $CHAIN_ID ($RECORD) — the coordinator joins a LIVE stack"; exit 1; fi
export FIGARO_CORE
FIGARO_CORE=$(jq -r '.figaroCore' "$RECORD")
if [ "$FIGARO_CORE" = "null" ] || [ -z "$FIGARO_CORE" ]; then echo "❌ $RECORD has no figaroCore"; exit 1; fi
if jq -e '.witnessSwapAndCommitCoordinator' "$RECORD" >/dev/null 2>&1 && [ "${SKIP_VERIFY:-}" != "1" ]; then
  echo "❌ $RECORD already carries witnessSwapAndCommitCoordinator=$(jq -r .witnessSwapAndCommitCoordinator "$RECORD") — refusing to deploy a second"
  exit 1
fi

echo "🔎 chain $CHAIN_ID · core $FIGARO_CORE · permit2 $PERMIT2 · router $SWAP_ROUTER"
FACTORY=$(cast call "$SWAP_ROUTER" "factory()(address)" --rpc-url "$RPC_URL" 2>/dev/null || true)
WETH9=$(cast call "$SWAP_ROUTER" "WETH9()(address)" --rpc-url "$RPC_URL" 2>/dev/null || true)
for pair in "factory:$FACTORY" "WETH9:$WETH9"; do
  name=${pair%%:*}; addr=${pair#*:}
  if [ -z "$addr" ] || [ "$(cast code "$addr" --rpc-url "$RPC_URL" 2>/dev/null)" = "0x" ]; then
    echo "❌ SWAP_ROUTER does not behave like SwapRouter02: $name() = '${addr:-<no answer>}' is not a contract"; exit 1
  fi
done
echo "   router behaves like SwapRouter02: factory()=$FACTORY WETH9()=$WETH9"
echo "   deployer = $(cast wallet address --private-key "$PRIVATE_KEY")"

VERIFY_FLAG="--verify"; [ "${SKIP_VERIFY:-}" = "1" ] && VERIFY_FLAG=""
FORGE_OUT=$(forge script script/DeploySwapCoordinator.s.sol:DeploySwapCoordinator \
    --rpc-url "$RPC_URL" --broadcast --slow --via-ir $VERIFY_FLAG 2>&1)
echo "$FORGE_OUT"
COORD=$(echo "$FORGE_OUT" | grep 'NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR=' | grep -oE '0x[0-9a-fA-F]{40}' | head -1)
if [ -z "$COORD" ]; then
  echo "❌ could not parse the coordinator address — check the forge output and the chain before retrying"
  exit 1
fi

OUT="$RECORD"
if [ "${SKIP_VERIFY:-}" = "1" ]; then
  mkdir -p "${TMPDIR:-/tmp}/figaro-rehearsal-deployments"; OUT="${TMPDIR:-/tmp}/figaro-rehearsal-deployments/${CHAIN_ID}.json"
  cp "$RECORD" "$OUT"; echo "ℹ️  Fork rehearsal — record diverted to $OUT"
fi
TMP=$(mktemp)
jq --arg c "$COORD" --arg r "$SWAP_ROUTER" --arg p "$PERMIT2" --arg q "$SWAP_QUOTER" \
   '. + {witnessSwapAndCommitCoordinator: $c, swapRouter: $r, permit2: $p} + (if $q == "" then {} else {swapQuoter: $q} end)' "$OUT" > "$TMP" && mv "$TMP" "$OUT"
echo ""
echo "✅ WitnessSwapAndCommitCoordinator = $COORD  (record: $OUT)"
echo "   Bake NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR / NEXT_PUBLIC_SWAP_ROUTER / NEXT_PUBLIC_PERMIT2 / NEXT_PUBLIC_SWAP_QUOTER into the site build."
