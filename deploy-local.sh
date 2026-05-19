#!/bin/bash
set -e

# Deploy the full Figaro Protocol stack to local Anvil and auto-write
# addresses into:
#   frontend/.env.local            (frontend)
#   .deployments/local.json         (downstream/manual consumption)
#
# Stack: FigaroCore, AttestationCoordinator, SchemaRegistry,
#        SchemaRegistrationHelper, OperatorRegistry, DutchAuction, FigToken,
#        MockToken, MockPermitToken, FigaroBatchVerifier.
#
# Usage:
#   ./deploy-local.sh                                  # Anvil (default)
#   RPC_URL=https://... PRIVATE_KEY=0x... ./deploy-local.sh  # Any chain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_ENV="$SCRIPT_DIR/frontend/.env.local"
DEPLOY_DIR="$SCRIPT_DIR/.deployments"
CORE_MANIFEST="$DEPLOY_DIR/local.json"

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
export PRIVATE_KEY="${PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

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
TOKEN_ADDR=$(echo "$FORGE_OUT"       | grep 'MockToken deployed at:'              | grep -oE '0x[0-9a-fA-F]+')
PERMIT_ADDR=$(echo "$FORGE_OUT"      | grep 'MockPermitToken deployed at:'        | grep -oE '0x[0-9a-fA-F]+')
ATTESTATION_ADDR=$(echo "$FORGE_OUT" | grep 'AttestationCoordinator deployed at:' | grep -oE '0x[0-9a-fA-F]+')
SCHEMA_ADDR=$(echo "$FORGE_OUT"      | grep 'SchemaRegistry deployed at:'         | grep -oE '0x[0-9a-fA-F]+')
SCHEMA_HELPER_ADDR=$(echo "$FORGE_OUT" | grep 'SchemaRegistrationHelper deployed at:' | grep -oE '0x[0-9a-fA-F]+')
OPERATOR_ADDR=$(echo "$FORGE_OUT"    | grep 'OperatorRegistry deployed at:'       | grep -oE '0x[0-9a-fA-F]+')
ASSEMBLY_ADDR=$(echo "$FORGE_OUT"    | grep 'AssemblyRegistry deployed at:'       | grep -oE '0x[0-9a-fA-F]+')
AUCTION_ADDR=$(echo "$FORGE_OUT"     | grep 'DutchAuction deployed at:'           | grep -oE '0x[0-9a-fA-F]+')
FIG_TOKEN_ADDR=$(echo "$FORGE_OUT"   | grep 'FigToken deployed at:'               | grep -oE '0x[0-9a-fA-F]+')
## FigEmission removed

BATCH_VERIFIER_ADDR=$(echo "$FORGE_OUT" | grep 'FigaroBatchVerifier deployed at:' | grep -oE '0x[0-9a-fA-F]+')
PROCESS_OFFSET_RECEIPT_ADDR=$(echo "$FORGE_OUT" | grep 'ProcessOffsetReceipt deployed at:' | grep -oE '0x[0-9a-fA-F]+')

if [ -z "$CORE_ADDR" ]; then
  echo "❌ Could not parse FigaroCore address from forge output. Aborting env update."
  exit 1
fi

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

# ── Write frontend/.env.local ─────────────────────────────────────────────────
echo ""
echo "✍️  Updating $CORE_ENV ..."
touch "$CORE_ENV"
update_env "$CORE_ENV" "NEXT_PUBLIC_FIGARO_CORE"              "$CORE_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_TOKEN_ADDRESS"             "$TOKEN_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS"      "$PERMIT_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_ATTESTATION_COORDINATOR"   "$ATTESTATION_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_SCHEMA_REGISTRY"           "$SCHEMA_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_SCHEMA_REGISTRATION_HELPER" "$SCHEMA_HELPER_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_OPERATOR_REGISTRY"         "$OPERATOR_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_ASSEMBLY_REGISTRY"         "$ASSEMBLY_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_DUTCH_AUCTION"             "$AUCTION_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_FIG_TOKEN_ADDRESS"         "$FIG_TOKEN_ADDR"
## FigEmission removed
update_env "$CORE_ENV" "NEXT_PUBLIC_BATCH_VERIFIER"            "$BATCH_VERIFIER_ADDR"
update_env "$CORE_ENV" "NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT"    "$PROCESS_OFFSET_RECEIPT_ADDR"

# ── Write deployment manifest ─────────────────────────────────────────────────
echo "✍️  Writing $CORE_MANIFEST ..."
mkdir -p "$DEPLOY_DIR"
cat > "$CORE_MANIFEST" <<EOF
{
  "chainId": 31337,
  "figaroCore": "$CORE_ADDR",
  "tokenAddress": "$TOKEN_ADDR",
  "permitTokenAddress": "$PERMIT_ADDR",
  "attestationCoordinator": "$ATTESTATION_ADDR",
  "schemaRegistry": "$SCHEMA_ADDR",
  "schemaRegistrationHelper": "$SCHEMA_HELPER_ADDR",
  "operatorRegistry": "$OPERATOR_ADDR",
  "assemblyRegistry": "$ASSEMBLY_ADDR",
  "dutchAuction": "$AUCTION_ADDR",
  "figToken": "$FIG_TOKEN_ADDR",
  "batchVerifier": "$BATCH_VERIFIER_ADDR",
  "processOffsetReceipt": "$PROCESS_OFFSET_RECEIPT_ADDR"
}
EOF

echo ""
echo "✅ Deployment complete!"
echo ""
echo "   NEXT_PUBLIC_FIGARO_CORE=$CORE_ADDR"
echo "   NEXT_PUBLIC_TOKEN_ADDRESS=$TOKEN_ADDR"
echo "   NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS=$PERMIT_ADDR"
echo "   NEXT_PUBLIC_ATTESTATION_COORDINATOR=$ATTESTATION_ADDR"
echo "   NEXT_PUBLIC_SCHEMA_REGISTRY=$SCHEMA_ADDR"
echo "   NEXT_PUBLIC_SCHEMA_REGISTRATION_HELPER=$SCHEMA_HELPER_ADDR"
echo "   NEXT_PUBLIC_OPERATOR_REGISTRY=$OPERATOR_ADDR"
echo "   NEXT_PUBLIC_ASSEMBLY_REGISTRY=$ASSEMBLY_ADDR"
echo "   NEXT_PUBLIC_DUTCH_AUCTION=$AUCTION_ADDR"
echo "   NEXT_PUBLIC_FIG_TOKEN_ADDRESS=$FIG_TOKEN_ADDR"
echo "   NEXT_PUBLIC_BATCH_VERIFIER=$BATCH_VERIFIER_ADDR"
echo "   NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT=$PROCESS_OFFSET_RECEIPT_ADDR"
echo "   Manifest: $CORE_MANIFEST"
