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
#     read directly off the require()s of _validateEnv() and
#     _deployProtocol() in DeployPublicStack (script/DeployBase.s.sol), the
#     deployment script/DeployMainnet.s.sol runs — this script
#     re-checks them so the failure happens before any RPC call, not mid-
#     broadcast with gas already spent)
#   - refuses to run, in every mode, unless RELEASE_COMMIT names the full sha
#     of the release revision and this checkout builds it: a clean tree that
#     does not differ from it in the code, the guest, the proofs or the build
#     (scripts/check-release-revision.mjs); the deployment record stores it
#     as `releaseCommit`
#   - refuses to run without an explicit MAINNET_DEPLOY_CONFIRM=yes
#   - reads the target RPC's chain id back and refuses to broadcast unless
#     it is 1 (Ethereum mainnet) — this script has exactly one target chain
#   - writes the record FIRST, then verifies every contract it names on
#     Etherscan (scripts/verify-etherscan.mjs, Etherscan's multichain API, constructor
#     arguments read from forge's broadcast file), so ETHERSCAN_API_KEY is
#     required too. A verification that fails after the transactions landed
#     leaves the record written and exits 1; VERIFY_ONLY=1 then verifies the
#     deployment the record names, sending no transaction:
#
#       VERIFY_ONLY=1 RELEASE_COMMIT=<full sha> ETHERSCAN_API_KEY=... ./scripts/deploy-mainnet.sh
#
#   - SKIP_VERIFY=1 is the fork rehearsal only (an Anvil fork of mainnet keeps
#     chain id 1): no verification, and the record is diverted to
#     ${TMPDIR:-/tmp}/figaro-rehearsal-deployments so deployments/1.json is
#     never written by a rehearsal. RECORD_DIR names the directory instead.
#
# Usage:
#   RELEASE_COMMIT=<full sha> \
#   MAINNET_DEPLOY_CONFIRM=yes \
#   RPC_URL=https://... \
#   PRIVATE_KEY=0x... \
#   FOUNDER_WALLET=0x... SUPPORTERS_WALLET=0x... \
#   SP1_VERIFIER_GATEWAY=0x... SP1_PROGRAM_VKEY=0x... \
#   ETHERSCAN_API_KEY=... \
#   ./scripts/deploy-mainnet.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$REPO_ROOT/deployments"
MAINNET_CHAIN_ID=1
# Every step this wrapper shares with scripts/deploy-sepolia.sh.
source "$SCRIPT_DIR/deploy-common.sh"

# ── Guard 0: the checkout builds the release revision ──────────────────────
guard_release_revision

# ── Verify only: the deployment the record names, no transaction ────────────
verify_only_if_asked "$MAINNET_CHAIN_ID"

# ── Guard 1: explicit confirmation ──────────────────────────────────────────
if [ "${MAINNET_DEPLOY_CONFIRM:-}" != "yes" ]; then
  echo "❌ Refusing to deploy to mainnet."
  echo "   This broadcasts real transactions, spends real ETH, mints the"
  echo "   genesis florin allocation, and renounces further deployer minting"
  echo "   — irreversibly. Set MAINNET_DEPLOY_CONFIRM=yes to proceed."
  exit 1
fi

# The swap-funded on-ramp's Permit2: canonical on Ethereum (override for a chain that differs).
export PERMIT2="${PERMIT2:-$CANONICAL_PERMIT2}"

# ── Guard 2: every required env var present ─────────────────────────────────
# Required by script/DeployMainnet.s.sol itself (DeployPublicStack in
# script/DeployBase.s.sol):
#   PRIVATE_KEY            — run(): vm.envUint("PRIVATE_KEY")
#   FOUNDER_WALLET          — _validateEnv(): must be nonzero
#   SUPPORTERS_WALLET       — _validateEnv(): must be nonzero
#   DAO_WALLET              — _validateEnv(): must be nonzero; set by this wrapper
#                              to the treasury's Safe, never by hand
#   RPGF_GENESIS            — _validateEnv(): RPGF_GENESIS + one period > now; set by this
#                             wrapper to the chain's time at the broadcast
#   SP1_VERIFIER_GATEWAY    — the gateway the routed verifier is looked up on (Guard 4);
#                             the script binds that route as SP1_VERIFIER, exported here
#   SP1_PROGRAM_VKEY        — _deployProtocol(): must be nonzero
#   SWAP_ROUTER             — _deployProtocol(): probed as a SwapRouter02
# Required by this script for the target/verification:
#   RPC_URL                 — mainnet RPC endpoint; no default (unlike
#                              deploy-local.sh's Anvil default — there is no
#                              safe default for "mainnet")
#   ETHERSCAN_API_KEY       — verification always runs after the record is
#                              written, unless SKIP_VERIFY=1 (fork rehearsal)
require_env PRIVATE_KEY FOUNDER_WALLET SUPPORTERS_WALLET \
            SP1_VERIFIER_GATEWAY SP1_PROGRAM_VKEY RPC_URL SWAP_ROUTER

# ── Guard 3: chain-id read-back before broadcasting ─────────────────────────
guard_chain_id "$MAINNET_CHAIN_ID" "Ethereum mainnet" \
  "   $MAINNET_CHAIN_ID. This script only targets Ethereum mainnet; point it" \
  "   at the right RPC, or use a different deploy script for another chain."

# ── Guard 4: the SP1 verifier gateway routes the proof form we will produce ──
resolve_sp1_verifier

# ── The verification key is this checkout's relay's ──────────────────────────
guard_program_vkey

# ── The rewards schedule starts at this broadcast ───────────────────────────
start_schedule_at_chain_time

# ── The treasury's Safe ──────────────────────────────────────────────────────
ensure_treasury_safe

echo ""
echo "🚀 Deploying Figaro Protocol stack to MAINNET (chain id $ACTUAL_CHAIN_ID)..."
echo "   deployer (from PRIVATE_KEY) = $(cast wallet address --private-key "$PRIVATE_KEY")"
echo "   founder wallet              = $FOUNDER_WALLET"
echo "   supporters wallet           = $SUPPORTERS_WALLET"
echo "   dao wallet                  = $DAO_WALLET"
echo "   rpgf genesis (unix)         = $RPGF_GENESIS"
echo ""

read_deployment_block
run_forge_script script/DeployMainnet.s.sol:DeployMainnet

# ── Parse addresses from the script's NEXT_PUBLIC_* summary block ──────────
parse_stack_addresses

# ── Guard 5: read the wiring back from the chain ────────────────────────────
read_back_stack_wiring

# ── Write deployments/<chainId>.json ─────────────────────────────────────────
# Same shape as .deployments/local.json, minus the devnet-only mocks
# DeployMainnet.s.sol never deploys (no MockERC20/MockPermitToken/swap mocks/
# MockTreasuryMultisig/MockDisperse — mainnet uses real wallets and no mocks).
# See deployments/README.md: this is the machine-readable address-publication
# channel, source-of-truth from the first public deploy onward.
select_record_dir
echo ""
echo "✍️  Writing $DEPLOY_DIR/${ACTUAL_CHAIN_ID}.json ..."
mkdir -p "$DEPLOY_DIR"
# The record's `rpcUrl` is a KEYLESS public endpoint a reader with no provider
# of its own reads the chain through (the site serves it to every visitor of
# this deployment's pages). PUBLIC_RPC_URL names it; unset, the endpoint the
# record already carried is kept. It is never the deploy's own endpoint, which
# carries the deployer's provider key.
RECORD_RPC_URL="${PUBLIC_RPC_URL:-$(jq -r '.rpcUrl // empty' "$DEPLOY_DIR/${ACTUAL_CHAIN_ID}.json" 2>/dev/null || true)}"
if [ -z "$RECORD_RPC_URL" ]; then
  echo "❌ PUBLIC_RPC_URL is unset and the record carries no rpcUrl — name the keyless public endpoint the site reads mainnet through."
  exit 1
fi
if [ -n "$RECORD_RPC_URL" ] && [ "$RECORD_RPC_URL" = "${MAINNET_RPC_URL:-}" ]; then
  echo "❌ PUBLIC_RPC_URL is the deploy's own MAINNET_RPC_URL — the record is public and must not carry a provider key."
  exit 1
fi
cat > "$DEPLOY_DIR/${ACTUAL_CHAIN_ID}.json" <<EOF
{
  "chainId": $ACTUAL_CHAIN_ID,
  "figaroCore": "$CORE_ADDR",
  "attestationCoordinator": "$ATTESTATION_ADDR",
  "clauseRegistry": "$CLAUSE_ADDR",
  "membersRegistry": "$MEMBERS_ADDR",
  "processRegistry": "$ASSEMBLY_ADDR",
  "agreementRegistry": "$AGREEMENT_ADDR",
  "florinToken": "$FLORIN_TOKEN_ADDR",
  "daoTreasury": "$DAO_WALLET",
  "usageCounter": "$USAGE_COUNTER_ADDR",
  "rpgfMinter": "$RPGF_MINTER_ADDR",
  "batchVerifier": "$BATCH_VERIFIER_ADDR",
  "programVKey": "$PROGRAM_VKEY_ONCHAIN",
  "witnessSwapAndCommitCoordinator": "$SWAP_COORD_ADDR",
  "swapRouter": "$SWAP_ROUTER",
  "permit2": "$PERMIT2",
  "multisender": "0xD152f549545093347A162Dce210e7293f1452150",
  "deploymentBlock": $DEPLOYMENT_BLOCK,
  "releaseCommit": "$RELEASE_COMMIT"
}
EOF
if [ -n "$RECORD_RPC_URL" ]; then
  jq --arg url "$RECORD_RPC_URL" '. + {rpcUrl: $url}' "$DEPLOY_DIR/${ACTUAL_CHAIN_ID}.json" > "$DEPLOY_DIR/${ACTUAL_CHAIN_ID}.json.tmp"
  mv "$DEPLOY_DIR/${ACTUAL_CHAIN_ID}.json.tmp" "$DEPLOY_DIR/${ACTUAL_CHAIN_ID}.json"
fi
echo "   record written: $DEPLOY_DIR/${ACTUAL_CHAIN_ID}.json"

# The record stands before any verification: a failure below leaves it, and
# VERIFY_ONLY=1 resumes the verification alone.
[ "${SKIP_VERIFY:-}" = "1" ] || verify_record "$DEPLOY_DIR/${ACTUAL_CHAIN_ID}.json"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "   FigaroCore              = $CORE_ADDR"
echo "   AttestationCoordinator  = $ATTESTATION_ADDR"
echo "   ClauseRegistry          = $CLAUSE_ADDR"
echo "   MembersRegistry         = $MEMBERS_ADDR"
echo "   ProcessRegistry        = $ASSEMBLY_ADDR"
echo "   AgreementRegistry       = $AGREEMENT_ADDR"
echo "   FlorinToken             = $FLORIN_TOKEN_ADDR"
echo "   UsageCounter            = $USAGE_COUNTER_ADDR"
echo "   RpgfMinter              = $RPGF_MINTER_ADDR"
echo "   FigaroBatchVerifier     = $BATCH_VERIFIER_ADDR"
echo "   WitnessSwapAndCommitCoordinator = $SWAP_COORD_ADDR (router $SWAP_ROUTER, permit2 $PERMIT2)"
echo "   Record: $DEPLOY_DIR/${ACTUAL_CHAIN_ID}.json"
echo ""
echo "⚠️  Clauses are NOT registered by this script (Solidity cannot pin to"
echo "   IPFS — see DeployMainnet.s.sol's comment). Run"
echo "   frontend/scripts/populate-clauses.mjs against the new"
echo "   NEXT_PUBLIC_CLAUSE_REGISTRY=$CLAUSE_ADDR with production IPFS"
echo "   pinning credentials before the deployment is usable."
