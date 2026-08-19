#!/bin/bash
set -e

# Deploy the full Figaro Protocol stack to Ethereum SEPOLIA via
# script/DeploySepolia.s.sol, and write the address record to
# deployments/11155111.json (see deployments/README.md).
#
# Sepolia is the MAINNET REHEARSAL (testnet = mainnet rehearsal): same
# guardrail structure as scripts/deploy-mainnet.sh, same env contract minus
# DAO_WALLET (the script deploys MockTreasuryMultisig itself — the mock-as-code
# testnet divergence; see DeploySepolia.s.sol's header for all three
# divergences and their rulings).
#
#   - refuses to run unless every required env var is set
#   - refuses to run without an explicit SEPOLIA_DEPLOY_CONFIRM=yes
#   - reads the target RPC's chain id back and refuses unless it is
#     11155111 (Sepolia) — an Anvil FORK of Sepolia keeps that chain id,
#     which is what makes the fork rehearsal run through this same wrapper
#   - --verify wires to foundry.toml's [etherscan] "sepolia" entry unless
#     SKIP_VERIFY=1 (fork rehearsal only: a fork's contracts do not exist on
#     the real Etherscan, so verification there can only fail)
#
# Usage:
#   SEPOLIA_DEPLOY_CONFIRM=yes \
#   RPC_URL=https://... \
#   PRIVATE_KEY=0x... \
#   FOUNDER_WALLET=0x... SUPPORTERS_WALLET=0x... \
#   RPGF_GENESIS=... \
#   SP1_VERIFIER_GATEWAY=0x... SP1_PROGRAM_VKEY=0x... \
#   ETHERSCAN_API_KEY=... \
#   ./scripts/deploy-sepolia.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$REPO_ROOT/deployments"
SEPOLIA_CHAIN_ID=11155111

# ── Guard 1: explicit confirmation ──────────────────────────────────────────
if [ "${SEPOLIA_DEPLOY_CONFIRM:-}" != "yes" ]; then
  echo "❌ Refusing to deploy to Sepolia."
  echo "   This broadcasts real testnet transactions, mints the genesis florin"
  echo "   allocation, and renounces further deployer minting — irreversibly"
  echo "   for this deployment. Set SEPOLIA_DEPLOY_CONFIRM=yes to proceed."
  exit 1
fi

# The swap-funded on-ramp's Permit2: canonical on Ethereum + Sepolia (override for a chain that differs).
export PERMIT2="${PERMIT2:-0x000000000022D473030F116dDEE9F6B43aC78BA3}"

# ── Guard 2: every required env var present ─────────────────────────────────
# Required by script/DeploySepolia.s.sol itself:
#   PRIVATE_KEY            — run(): vm.envUint("PRIVATE_KEY")
#   FOUNDER_WALLET          — _validateEnv(): nonzero, distinct
#   SUPPORTERS_WALLET       — _validateEnv(): nonzero, distinct
#   RPGF_GENESIS            — _validateEnv(): RPGF_GENESIS + 365 days > now
#   SP1_VERIFIER_GATEWAY    — _deployProtocol(): must be nonzero
#   SP1_PROGRAM_VKEY        — _deployProtocol(): must be nonzero
# Required by this script for the target/verification:
#   RPC_URL                 — Sepolia RPC endpoint (or an Anvil fork of it)
#   ETHERSCAN_API_KEY       — unless SKIP_VERIFY=1 (fork rehearsal)
REQUIRED=(PRIVATE_KEY FOUNDER_WALLET SUPPORTERS_WALLET RPGF_GENESIS \
          SP1_VERIFIER_GATEWAY SP1_PROGRAM_VKEY RPC_URL SWAP_ROUTER SWAP_QUOTER)
if [ "${SKIP_VERIFY:-}" != "1" ]; then
  REQUIRED+=(ETHERSCAN_API_KEY)
fi
MISSING=()
for var in "${REQUIRED[@]}"; do
  if [ -z "${!var:-}" ]; then
    MISSING+=("$var")
  fi
done

if [ "${#MISSING[@]}" -ne 0 ]; then
  echo "❌ Refusing to deploy — missing required environment variable(s):"
  for var in "${MISSING[@]}"; do
    echo "   - $var"
  done
  exit 1
fi

# ── Guard 3: chain-id read-back before broadcasting ─────────────────────────
echo "🔎 Reading chain id from $RPC_URL ..."
ACTUAL_CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL")
echo "   RPC_URL   = $RPC_URL"
echo "   chain id  = $ACTUAL_CHAIN_ID (expecting $SEPOLIA_CHAIN_ID — Sepolia)"
if [ "$ACTUAL_CHAIN_ID" != "$SEPOLIA_CHAIN_ID" ]; then
  echo "❌ Refusing to deploy — RPC_URL resolves to chain id $ACTUAL_CHAIN_ID, not"
  echo "   $SEPOLIA_CHAIN_ID. This script only targets Sepolia (or an Anvil fork"
  echo "   of it); point it at the right RPC, or use the deploy script for the"
  echo "   chain you meant."
  exit 1
fi

# ── Guard 4: the SP1 verifier gateway routes the proof form we will produce ──
# FigaroBatchVerifier binds the gateway IMMUTABLY and UsageCounter binds the
# verifier — a gateway that does not route our sdk version's Groth16 (or PLONK,
# per SP1_PROOF_MODE) verifier means every real proof reverts RouteNotFound and
# the whole stack redeploys. The 2026-08-14 Sepolia deploy bound the retired
# PLONK gateway; this guard is that lesson.
bash "$(dirname "$0")/check-sp1-gateway-route.sh" || exit 1

echo ""
echo "🚀 Deploying Figaro Protocol stack to SEPOLIA (chain id $ACTUAL_CHAIN_ID)..."
echo "   deployer (from PRIVATE_KEY) = $(cast wallet address --private-key "$PRIVATE_KEY")"
echo "   founder wallet              = $FOUNDER_WALLET"
echo "   supporters wallet           = $SUPPORTERS_WALLET"
echo "   dao wallet                  = (MockTreasuryMultisig, deployed by the script)"
echo "   rpgf genesis (unix)         = $RPGF_GENESIS"
if [ "${SKIP_VERIFY:-}" = "1" ]; then
  echo "   verification                = SKIPPED (fork rehearsal)"
fi
echo ""

# The block the scan window starts at: read BEFORE broadcasting, so it is at
# or below every contract's creation block. Frontends read events from here
# (NEXT_PUBLIC_DEPLOYMENT_BLOCK) — public gateways cap eth_getLogs ranges, and
# a from-genesis scan of a real network never loads.
DEPLOYMENT_BLOCK=$(cast block-number --rpc-url "$RPC_URL")
echo "📝 Running forge script (deployment block $DEPLOYMENT_BLOCK)..."
# --slow: wait for each transaction's receipt before sending the next — see
# deploy-local.sh's identical rationale (nonce-tracking race under
# pipelined broadcast).
VERIFY_FLAG="--verify"
if [ "${SKIP_VERIFY:-}" = "1" ]; then
  VERIFY_FLAG=""
fi
FORGE_OUT=$(forge script script/DeploySepolia.s.sol:DeploySepolia \
    --rpc-url "$RPC_URL" \
    --broadcast --slow --via-ir $VERIFY_FLAG 2>&1)
echo "$FORGE_OUT"

# ── Parse addresses from the script's NEXT_PUBLIC_* summary block ──────────
CORE_ADDR=$(echo "$FORGE_OUT"            | grep 'NEXT_PUBLIC_FIGARO_CORE='             | grep -oE '0x[0-9a-fA-F]+')
ATTESTATION_ADDR=$(echo "$FORGE_OUT"     | grep 'NEXT_PUBLIC_ATTESTATION_COORDINATOR=' | grep -oE '0x[0-9a-fA-F]+')
CLAUSE_ADDR=$(echo "$FORGE_OUT"          | grep 'NEXT_PUBLIC_CLAUSE_REGISTRY='         | grep -oE '0x[0-9a-fA-F]+')
ASSEMBLY_ADDR=$(echo "$FORGE_OUT"        | grep 'NEXT_PUBLIC_ASSEMBLY_REGISTRY='       | grep -oE '0x[0-9a-fA-F]+')
MEMBERS_ADDR=$(echo "$FORGE_OUT"         | grep 'NEXT_PUBLIC_MEMBERS_REGISTRY='        | grep -oE '0x[0-9a-fA-F]+')
FLORIN_TOKEN_ADDR=$(echo "$FORGE_OUT"    | grep 'NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS='    | grep -oE '0x[0-9a-fA-F]+')
USAGE_COUNTER_ADDR=$(echo "$FORGE_OUT"   | grep 'NEXT_PUBLIC_USAGE_COUNTER='           | grep -oE '0x[0-9a-fA-F]+')
RPGF_MINTER_ADDR=$(echo "$FORGE_OUT"     | grep 'NEXT_PUBLIC_RPGF_MINTER='             | grep -oE '0x[0-9a-fA-F]+')
BATCH_VERIFIER_ADDR=$(echo "$FORGE_OUT"  | grep 'NEXT_PUBLIC_BATCH_VERIFIER='          | grep -oE '0x[0-9a-fA-F]+')
SWAP_COORD_ADDR=$(echo "$FORGE_OUT"      | grep 'NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR=' | grep -oE '0x[0-9a-fA-F]+')
DAO_TREASURY_ADDR=$(echo "$FORGE_OUT"    | grep 'NEXT_PUBLIC_DAO_TREASURY='            | grep -oE '0x[0-9a-fA-F]+')

if [ -z "$CORE_ADDR" ]; then
  echo "❌ Could not parse FigaroCore address from forge output. Aborting record write."
  echo "   (The broadcast above may still have succeeded or partially succeeded —"
  echo "   check the forge output and the chain directly before retrying.)"
  exit 1
fi

# ── Write deployments/<chainId>.json ─────────────────────────────────────────
# Same shape as deployments/1.json plus the one testnet-only entry: the mock
# DAO vault (mainnet uses a canonical Safe, never recorded here — config).
# A FORK REHEARSAL (SKIP_VERIFY=1) must never clobber the real record — an
# Anvil fork keeps Sepolia's chain id, so without this branch a rehearsal
# writes fork addresses over the deployed truth (it did, 2026-08-14).
if [ "${SKIP_VERIFY:-}" = "1" ]; then
  DEPLOY_DIR="${TMPDIR:-/tmp}/figaro-rehearsal-deployments"
  echo ""
  echo "ℹ️  Fork rehearsal — record diverted to $DEPLOY_DIR (deployments/ untouched)"
fi
echo ""
echo "✍️  Writing $DEPLOY_DIR/${ACTUAL_CHAIN_ID}.json ..."
mkdir -p "$DEPLOY_DIR"
cat > "$DEPLOY_DIR/${ACTUAL_CHAIN_ID}.json" <<EOF
{
  "chainId": $ACTUAL_CHAIN_ID,
  "figaroCore": "$CORE_ADDR",
  "attestationCoordinator": "$ATTESTATION_ADDR",
  "clauseRegistry": "$CLAUSE_ADDR",
  "membersRegistry": "$MEMBERS_ADDR",
  "assemblyRegistry": "$ASSEMBLY_ADDR",
  "florinToken": "$FLORIN_TOKEN_ADDR",
  "usageCounter": "$USAGE_COUNTER_ADDR",
  "rpgfMinter": "$RPGF_MINTER_ADDR",
  "batchVerifier": "$BATCH_VERIFIER_ADDR",
  "witnessSwapAndCommitCoordinator": "$SWAP_COORD_ADDR",
  "swapRouter": "$SWAP_ROUTER",
  "swapQuoter": "$SWAP_QUOTER",
  "permit2": "$PERMIT2",
  "daoTreasury": "$DAO_TREASURY_ADDR",
  "deploymentBlock": $DEPLOYMENT_BLOCK
}
EOF

echo ""
echo "✅ Deployment complete!"
echo ""
echo "   FigaroCore              = $CORE_ADDR"
echo "   AttestationCoordinator  = $ATTESTATION_ADDR"
echo "   ClauseRegistry          = $CLAUSE_ADDR"
echo "   MembersRegistry         = $MEMBERS_ADDR"
echo "   AssemblyRegistry        = $ASSEMBLY_ADDR"
echo "   FlorinToken             = $FLORIN_TOKEN_ADDR"
echo "   UsageCounter            = $USAGE_COUNTER_ADDR"
echo "   RpgfMinter              = $RPGF_MINTER_ADDR"
echo "   FigaroBatchVerifier     = $BATCH_VERIFIER_ADDR"
echo "   WitnessSwapAndCommitCoordinator = $SWAP_COORD_ADDR (router $SWAP_ROUTER, permit2 $PERMIT2)"
echo "   MockTreasuryMultisig    = $DAO_TREASURY_ADDR"
echo "   Record: $DEPLOY_DIR/${ACTUAL_CHAIN_ID}.json"
echo ""
echo "⚠️  Clauses are NOT registered by this script (Solidity cannot pin to"
echo "   IPFS). Run frontend/scripts/populate-clauses.mjs against the new"
echo "   NEXT_PUBLIC_CLAUSE_REGISTRY=$CLAUSE_ADDR with production IPFS"
echo "   pinning credentials before the deployment is usable."
