#!/bin/bash
set -e

# Deploy the full Figaro Protocol stack to local Anvil and auto-write
# addresses into:
#   frontend/.env.local            (frontend)
#   .deployments/local.json         (downstream/manual consumption)
#
# Stack: FigaroCore, AttestationCoordinator, ClauseRegistry, AssemblyRegistry,
#        MembersRegistry, WitnessSwapAndCommitCoordinator (+ MockWitnessPermit2,
#        MockUniversalRouter), FlorinToken, MockERC20, MockPermitToken.
#
# Usage:
#   ./scripts/deploy-local.sh                                  # Anvil (default)
#   RPC_URL=https://... PRIVATE_KEY=0x... ./scripts/deploy-local.sh  # Any chain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CORE_ENV="$REPO_ROOT/frontend/.env.local"
DEPLOY_DIR="$REPO_ROOT/.deployments"
CORE_DEPLOYMENT="$DEPLOY_DIR/local.json"

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"

# Randomized throwaway deployer (devnet default). The universal Anvil
# default-deployer addresses (FigaroCore at 0xCf7Ed3…, MockERC20 at
# 0x5FbDB…, etc. — identical on every dev machine on Earth) collide with
# wallet-security threat lists: MetaMask/Blockaid flags the EIP-712 commit
# signature as "This is a deceptive request" because those exact addresses
# host flagged contracts on public chains. A fresh deployer per deploy
# yields per-machine-unique addresses — which is also what a real network
# deployment looks like. An explicit PRIVATE_KEY env still wins (the
# testnet/mainnet path). Deploy.s.sol mints to anvil[0..19] explicitly,
# so no fixture depends on the deployer identity.
if [ -z "${PRIVATE_KEY:-}" ]; then
    PRIVATE_KEY="0x$(openssl rand -hex 32)"
    DEPLOYER_ADDR=$(cast wallet address --private-key "$PRIVATE_KEY")
    echo "🎲 Throwaway deployer $DEPLOYER_ADDR — funding 10 ETH from anvil[0]"
    cast send "$DEPLOYER_ADDR" --value 10ether \
        --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
        --rpc-url "$RPC_URL" >/dev/null
fi
export PRIVATE_KEY

# Optional: --verify flag for Etherscan contract verification
VERIFY_FLAG=""
if [ "${VERIFY:-}" = "true" ] || [ "${VERIFY:-}" = "1" ]; then
    if [ -z "${ETHERSCAN_API_KEY:-}" ]; then
        echo "⚠️  VERIFY=true but ETHERSCAN_API_KEY is not set. Skipping verification."
    else
        VERIFY_FLAG="--verify"
    fi
fi

echo "🚀 Deploying Figaro Protocol stack..."
echo "   rpc=$RPC_URL"
echo ""

echo "📝 Running forge script..."
# --slow: wait for each transaction's receipt before sending the
# next, instead of pipelining all transactions at once. Without it,
# forge's nonce tracking races anvil's instamine + receipt-polling
# loop and a single missed nonce parks the rest in the queued pool,
# hanging the whole deploy. Slightly slower; far more reliable.
FORGE_OUT=$(forge script script/Deploy.s.sol:Deploy \
    --rpc-url "$RPC_URL" \
    --broadcast --slow --via-ir $VERIFY_FLAG 2>&1)
echo "$FORGE_OUT"

# ── Parse addresses from console.log output (macOS-safe: no grep -P) ────────────
CORE_ADDR=$(echo "$FORGE_OUT"        | grep 'FigaroCore deployed at:'             | grep -oE '0x[0-9a-fA-F]+')
TOKEN_ADDR=$(echo "$FORGE_OUT"       | grep 'MockERC20 deployed at:'              | grep -oE '0x[0-9a-fA-F]+')
PERMIT_ADDR=$(echo "$FORGE_OUT"      | grep 'MockPermitToken deployed at:'        | grep -oE '0x[0-9a-fA-F]+')
ATTESTATION_ADDR=$(echo "$FORGE_OUT" | grep 'AttestationCoordinator deployed at:' | grep -oE '0x[0-9a-fA-F]+')
SWAP_COORD_ADDR=$(echo "$FORGE_OUT"  | grep 'WitnessSwapAndCommitCoordinator deployed at:' | grep -oE '0x[0-9a-fA-F]+')
PERMIT2_ADDR=$(echo "$FORGE_OUT"     | grep 'MockWitnessPermit2 deployed at:'      | grep -oE '0x[0-9a-fA-F]+')
SWAP_ROUTER_ADDR=$(echo "$FORGE_OUT" | grep 'MockUniversalRouter deployed at:'     | grep -oE '0x[0-9a-fA-F]+')
CLAUSE_ADDR=$(echo "$FORGE_OUT"      | grep 'ClauseRegistry deployed at:'         | grep -oE '0x[0-9a-fA-F]+')
SELLER_ADDR=$(echo "$FORGE_OUT"    | grep 'MembersRegistry deployed at:'      | grep -oE '0x[0-9a-fA-F]+')
ASSEMBLY_ADDR=$(echo "$FORGE_OUT"    | grep 'AssemblyRegistry deployed at:'       | grep -oE '0x[0-9a-fA-F]+')
FLORIN_TOKEN_ADDR=$(echo "$FORGE_OUT"   | grep 'FlorinToken deployed at:'               | grep -oE '0x[0-9a-fA-F]+')
RPGF_MINTER_ADDR=$(echo "$FORGE_OUT" | grep 'RpgfMinter deployed at:'             | grep -oE '0x[0-9a-fA-F]+')
USAGE_COUNTER_ADDR=$(echo "$FORGE_OUT" | grep 'UsageCounter deployed at:'           | grep -oE '0x[0-9a-fA-F]+')
DAO_TREASURY_ADDR=$(echo "$FORGE_OUT" | grep 'MockTreasuryMultisig deployed at:' | grep -oE '0x[0-9a-fA-F]+')
BATCH_VERIFIER_ADDR=$(echo "$FORGE_OUT" | grep 'FigaroBatchVerifier deployed at:' | grep -oE '0x[0-9a-fA-F]+')
MULTISENDER_ADDR=$(echo "$FORGE_OUT" | grep 'MockDisperse deployed at:' | grep -oE '0x[0-9a-fA-F]+')

if [ -z "$CORE_ADDR" ]; then
  echo "❌ Could not parse FigaroCore address from forge output. Aborting env update."
  exit 1
fi

# ── Gas top-up for anvil[10..19] — belt-and-suspenders, local Anvil only ──
# Anvil MUST be started with `--accounts 34` (devup does) so indices 10-33 are
# unlocked SIGNERS — a default `anvil` only unlocks (and funds) 0-9, and sellers
# beyond anvil[9] (see tests/e2e/seller-roster.ts) cannot sign otherwise.
# `--accounts 34` also funds all 34 with ETH, so this setBalance loop is just a
# safety net for the 10-19 range (22-33 get their ETH from the launch funding —
# a self-seeding spec's dedicated wallets). `anvil_setBalance` only funds gas — it
# does NOT unlock a signer, which is why the launch flag is required. Skipped on
# non-Anvil RPCs (anvil_setBalance is Anvil-only).
case "$RPC_URL" in
  *127.0.0.1*|*localhost*)
    GAS_ETH=0x21e19e0c9bab2400000  # 10000 ETH, matching anvil's default funding
    for addr in \
      0xBcd4042DE499D14e55001CcbB24a551F3b954096 \
      0x71bE63f3384f5fb98995898A86B02Fb2426c5788 \
      0xFABB0ac9d68B0B445fB7357272Ff202C5651694a \
      0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec \
      0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097 \
      0xcd3B766CCDd6AE721141F452C550Ca635964ce71 \
      0x2546BcD3c84621e976D8185a91A922aE77ECEc30 \
      0xbDA5747bFD65F08deb54cb465eB87D40e51B197E \
      0xdD2FD4581271e230360230F9337D5c0430Bf44C0 \
      0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199; do
      cast rpc anvil_setBalance "$addr" "$GAS_ETH" --rpc-url "$RPC_URL" >/dev/null 2>&1 || true
    done
    echo "⛽ Funded anvil[10..19] with ETH for gas (launch-independent)."
    ;;
esac

# ── Helper: update key=value in an env file, or append if absent ───────────────
update_env() {
  local file="$1" key="$2" value="$3"
  if [ -z "$value" ]; then return; fi
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$file" && rm -f "${file}.bak"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

# ── Helper: set key=value only if the key is ABSENT ────────────────────────────
# For stable service endpoints (IPFS) — unlike contract addresses, which
# rotate every deploy and must be overwritten, a hand-set custom endpoint
# (Pinata, remote gateway, self-hosted Kubo) must survive a redeploy.
default_env() {
  local file="$1" key="$2" value="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then return; fi
  echo "${key}=${value}" >> "$file"
}

# ── Write frontend/.env.local ─────────────────────────────────────────────────
echo ""
echo "✍️  Updating $CORE_ENV ..."
touch "$CORE_ENV"
update_env "$CORE_ENV" "NEXT_PUBLIC_FIGARO_CORE"              "$CORE_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_TOKEN_ADDRESS"             "$TOKEN_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS"      "$PERMIT_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_ATTESTATION_COORDINATOR"   "$ATTESTATION_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR" "$SWAP_COORD_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_PERMIT2"                    "$PERMIT2_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_SWAP_ROUTER"                "$SWAP_ROUTER_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_CLAUSE_REGISTRY"           "$CLAUSE_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_SELLER_REGISTRY"         "$SELLER_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_ASSEMBLY_REGISTRY"         "$ASSEMBLY_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS"         "$FLORIN_TOKEN_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_USAGE_COUNTER"             "$USAGE_COUNTER_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_RPGF_MINTER"               "$RPGF_MINTER_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_DAO_TREASURY"              "$DAO_TREASURY_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_BATCH_VERIFIER"            "$BATCH_VERIFIER_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_MULTISENDER"               "$MULTISENDER_ADDR"

# IPFS service endpoints — default to the local Kubo daemon. Set only if
# absent, so a custom endpoint configured by hand survives a redeploy.
default_env "$CORE_ENV" "NEXT_PUBLIC_IPFS_API_URL"     "http://127.0.0.1:5001"
default_env "$CORE_ENV" "NEXT_PUBLIC_IPFS_GATEWAY_URL" "http://127.0.0.1:8080"

# ── Write deployment record ─────────────────────────────────────────────────
echo "✍️  Writing $CORE_DEPLOYMENT ..."
mkdir -p "$DEPLOY_DIR"
cat > "$CORE_DEPLOYMENT" <<EOF
{
  "chainId": 31337,
  "figaroCore": "$CORE_ADDR",
  "tokenAddress": "$TOKEN_ADDR",
  "permitTokenAddress": "$PERMIT_ADDR",
  "attestationCoordinator": "$ATTESTATION_ADDR",
  "witnessSwapAndCommitCoordinator": "$SWAP_COORD_ADDR",
  "permit2": "$PERMIT2_ADDR",
  "swapRouter": "$SWAP_ROUTER_ADDR",
  "clauseRegistry": "$CLAUSE_ADDR",
  "sellerRegistry": "$SELLER_ADDR",
  "assemblyRegistry": "$ASSEMBLY_ADDR",
  "florinToken": "$FLORIN_TOKEN_ADDR",
  "usageCounter": "$USAGE_COUNTER_ADDR",
  "rpgfMinter": "$RPGF_MINTER_ADDR",
  "batchVerifier": "$BATCH_VERIFIER_ADDR",
  "daoTreasury": "$DAO_TREASURY_ADDR",
  "multisender": "$MULTISENDER_ADDR"
}
EOF

echo ""
echo "✅ Deployment complete!"
echo ""
echo "   NEXT_PUBLIC_FIGARO_CORE=$CORE_ADDR"
echo "   NEXT_PUBLIC_TOKEN_ADDRESS=$TOKEN_ADDR"
echo "   NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS=$PERMIT_ADDR"
echo "   NEXT_PUBLIC_ATTESTATION_COORDINATOR=$ATTESTATION_ADDR"
echo "   NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR=$SWAP_COORD_ADDR"
echo "   NEXT_PUBLIC_PERMIT2=$PERMIT2_ADDR"
echo "   NEXT_PUBLIC_SWAP_ROUTER=$SWAP_ROUTER_ADDR"
echo "   NEXT_PUBLIC_CLAUSE_REGISTRY=$CLAUSE_ADDR"
echo "   NEXT_PUBLIC_SELLER_REGISTRY=$SELLER_ADDR"
echo "   NEXT_PUBLIC_ASSEMBLY_REGISTRY=$ASSEMBLY_ADDR"
echo "   NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS=$FLORIN_TOKEN_ADDR"
echo "   NEXT_PUBLIC_USAGE_COUNTER=$USAGE_COUNTER_ADDR"
echo "   NEXT_PUBLIC_RPGF_MINTER=$RPGF_MINTER_ADDR"
echo "   NEXT_PUBLIC_DAO_TREASURY=$DAO_TREASURY_ADDR"
echo "   NEXT_PUBLIC_IPFS_API_URL / NEXT_PUBLIC_IPFS_GATEWAY_URL — local Kubo defaults (set only if absent)"
echo "   Deployment: $CORE_DEPLOYMENT"

# ── Clauses — pin specs to IPFS + anchor on ClauseRegistry ───────────────────
# Deploy.s.sol deploys the registry but registers NO clauses — Solidity cannot pin
# to IPFS (Deploy.s.sol:77-80). populate-clauses.mjs is the single clause-population
# path (same script prod/testnet/mainnet use) and is idempotent: a clause already on
# the registry is skipped. Running it HERE makes a bare `deploy-local.sh` self-
# sufficient — every deploy ends with the structural clauses (figaro-commerce,
# figaro-topology, required by EVERY order) pinned + anchored. Without it the
# frontend's useClauseSpecs() never loads and the designer/checkout surfaces crash
# with "clause specs not loaded: no structural clauses in the cache".
echo ""
echo "📎 Populating clauses (pin → IPFS, anchor → ClauseRegistry)..."
(cd "$REPO_ROOT/frontend" && node scripts/populate-clauses.mjs)
