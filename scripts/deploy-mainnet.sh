#!/bin/bash
set -e

# Deploy the full Figaro Protocol stack to Ethereum MAINNET via
# script/DeployMainnet.s.sol, and write the address record to
# deployments/1.json (see deployments/README.md for the channel this
# populates).
#
# This is a production, irreversible broadcast: DeployMainnet.s.sol mints the
# genesis florin allocation and renounces further deployer minting rights at
# the end of the run (see that file's header comment). Every guardrail below
# exists to make an accidental or under-verified run impossible rather than
# merely discouraged:
#
#   - refuses to run unless every required env var is set (listed below,
#     read directly off script/DeployMainnet.s.sol's own _validateEnv() and
#     _deployProtocol()/_deployFlorinEcosystem() require()s — this script
#     re-checks them so the failure happens before any RPC call, not mid-
#     broadcast with gas already spent)
#   - refuses to run without an explicit MAINNET_DEPLOY_CONFIRM=yes
#   - reads the target RPC's chain id back and refuses to broadcast unless
#     it is 1 (Ethereum mainnet) — this script has exactly one target chain
#   - --verify is always wired to the foundry.toml [etherscan] "mainnet"
#     entry (added alongside "sepolia"), so ETHERSCAN_API_KEY is required
#     too, not optional the way deploy-local.sh's VERIFY flag is
#
# Usage:
#   MAINNET_DEPLOY_CONFIRM=yes \
#   RPC_URL=https://... \
#   PRIVATE_KEY=0x... \
#   FOUNDER_WALLET=0x... SUPPORTERS_WALLET=0x... DAO_WALLET=0x... \
#   RPGF_GENESIS=... \
#   SP1_VERIFIER_GATEWAY=0x... SP1_PROGRAM_VKEY=0x... \
#   ETHERSCAN_API_KEY=... \
#   ./scripts/deploy-mainnet.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$REPO_ROOT/deployments"
MAINNET_CHAIN_ID=1

# ── Guard 1: explicit confirmation ──────────────────────────────────────────
if [ "${MAINNET_DEPLOY_CONFIRM:-}" != "yes" ]; then
  echo "❌ Refusing to deploy to mainnet."
  echo "   This broadcasts real transactions, spends real ETH, mints the"
  echo "   genesis florin allocation, and renounces further deployer minting"
  echo "   — irreversibly. Set MAINNET_DEPLOY_CONFIRM=yes to proceed."
  exit 1
fi

# ── Guard 2: every required env var present ─────────────────────────────────
# Required by script/DeployMainnet.s.sol itself:
#   PRIVATE_KEY            — run(): vm.envUint("PRIVATE_KEY")
#   FOUNDER_WALLET          — _validateEnv(): must be nonzero
#   SUPPORTERS_WALLET       — _validateEnv(): must be nonzero
#   DAO_WALLET              — _validateEnv(): must be nonzero
#   RPGF_GENESIS            — _validateEnv(): RPGF_GENESIS + 365 days > now
#   SP1_VERIFIER_GATEWAY    — _deployProtocol(): must be nonzero
#   SP1_PROGRAM_VKEY        — _deployProtocol(): must be nonzero
# Required by this script for the target/verification:
#   RPC_URL                 — mainnet RPC endpoint; no default (unlike
#                              deploy-local.sh's Anvil default — there is no
#                              safe default for "mainnet")
#   ETHERSCAN_API_KEY       — --verify always runs; foundry.toml's
#                              [etherscan] "mainnet" entry reads this exact key
MISSING=()
for var in PRIVATE_KEY FOUNDER_WALLET SUPPORTERS_WALLET DAO_WALLET RPGF_GENESIS \
           SP1_VERIFIER_GATEWAY SP1_PROGRAM_VKEY RPC_URL ETHERSCAN_API_KEY; do
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
echo "   chain id  = $ACTUAL_CHAIN_ID (expecting $MAINNET_CHAIN_ID — Ethereum mainnet)"
if [ "$ACTUAL_CHAIN_ID" != "$MAINNET_CHAIN_ID" ]; then
  echo "❌ Refusing to deploy — RPC_URL resolves to chain id $ACTUAL_CHAIN_ID, not"
  echo "   $MAINNET_CHAIN_ID. This script only targets Ethereum mainnet; point it"
  echo "   at the right RPC, or use a different deploy script for another chain."
  exit 1
fi

echo ""
echo "🚀 Deploying Figaro Protocol stack to MAINNET (chain id $ACTUAL_CHAIN_ID)..."
echo "   deployer (from PRIVATE_KEY) = $(cast wallet address --private-key "$PRIVATE_KEY")"
echo "   founder wallet              = $FOUNDER_WALLET"
echo "   supporters wallet           = $SUPPORTERS_WALLET"
echo "   dao wallet                  = $DAO_WALLET"
echo "   rpgf genesis (unix)         = $RPGF_GENESIS"
echo ""

echo "📝 Running forge script..."
# --slow: wait for each transaction's receipt before sending the next — see
# deploy-local.sh's identical rationale (nonce-tracking race under
# pipelined broadcast). --verify: always on for mainnet, using the
# foundry.toml [etherscan] "mainnet" entry.
FORGE_OUT=$(forge script script/DeployMainnet.s.sol:DeployMainnet \
    --rpc-url "$RPC_URL" \
    --broadcast --slow --via-ir --verify 2>&1)
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

if [ -z "$CORE_ADDR" ]; then
  echo "❌ Could not parse FigaroCore address from forge output. Aborting record write."
  echo "   (The broadcast above may still have succeeded or partially succeeded —"
  echo "   check the forge output and the chain directly before retrying.)"
  exit 1
fi

# ── Write deployments/<chainId>.json ─────────────────────────────────────────
# Same shape as .deployments/local.json, minus the devnet-only mocks
# DeployMainnet.s.sol never deploys (no MockERC20/MockPermitToken/swap mocks/
# MockTreasuryMultisig/MockDisperse — mainnet uses real wallets and no mocks).
# See deployments/README.md: this is the machine-readable address-publication
# channel, source-of-truth from the first public deploy onward.
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
  "batchVerifier": "$BATCH_VERIFIER_ADDR"
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
echo "   Record: $DEPLOY_DIR/${ACTUAL_CHAIN_ID}.json"
echo ""
echo "⚠️  Clauses are NOT registered by this script (Solidity cannot pin to"
echo "   IPFS — see DeployMainnet.s.sol's comment). Run"
echo "   frontend/scripts/populate-clauses.mjs against the new"
echo "   NEXT_PUBLIC_CLAUSE_REGISTRY=$CLAUSE_ADDR with production IPFS"
echo "   pinning credentials before the deployment is usable."
