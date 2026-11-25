#!/bin/bash
set -e

# Deploy the full Figaro Protocol stack to Ethereum SEPOLIA via
# script/DeploySepolia.s.sol, and write the address record to
# deployments/11155111.json (see deployments/README.md).
#
# Sepolia is the MAINNET REHEARSAL (testnet = mainnet rehearsal): same
# guardrail structure as scripts/deploy-mainnet.sh and the same env contract.
# The treasury is a Safe this wrapper derives and creates by CREATE2 from the
# expectations file, then hands the script as DAO_WALLET; the script deploys
# no mock (DeploySepolia.s.sol's header).
#
#   - refuses to run, in every mode, unless RELEASE_COMMIT names the full sha
#     of the release revision and this checkout builds it: a clean tree that
#     does not differ from it in the code, the guest, the proofs or the build
#     (scripts/check-release-revision.mjs); the deployment record stores it
#     as `releaseCommit` (PAIR_ONLY leaves the stored one: the rest of the
#     stack was built at it)
#   - refuses to run unless every required env var is set
#   - refuses to run without an explicit SEPOLIA_DEPLOY_CONFIRM=yes
#   - reads the target RPC's chain id back and refuses unless it is
#     11155111 (Sepolia) — an Anvil FORK of Sepolia keeps that chain id,
#     which is what makes the fork rehearsal run through this same wrapper
#   - writes the record FIRST, then verifies every contract it names on
#     Etherscan (scripts/verify-etherscan.mjs, constructor arguments read from
#     forge's broadcast file), unless SKIP_VERIFY=1 (fork rehearsal only: a
#     fork's contracts do not exist on the real Etherscan, so verification
#     there can only fail). A verification that fails after the transactions
#     landed leaves the record written and exits 1; VERIFY_ONLY=1 then
#     verifies the deployment the record names, sending no transaction:
#
#       VERIFY_ONLY=1 RELEASE_COMMIT=<full sha> ETHERSCAN_API_KEY=... ./scripts/deploy-sepolia.sh
#
#   - RECORD_DIR names the directory the record is written to (default
#     deployments/; under SKIP_VERIFY=1, ${TMPDIR:-/tmp}/figaro-rehearsal-deployments)
#
# Usage:
#   RELEASE_COMMIT=<full sha> \
#   SEPOLIA_DEPLOY_CONFIRM=yes \
#   RPC_URL=https://... \
#   PRIVATE_KEY=0x... \
#   FOUNDER_WALLET=0x... SUPPORTERS_WALLET=0x... \
#   SP1_VERIFIER_GATEWAY=0x... SP1_PROGRAM_VKEY=0x... \
#   ETHERSCAN_API_KEY=... \
#   ./scripts/deploy-sepolia.sh
#
# PAIR_ONLY=1 redeploys ONLY the counter↔verifier pair (UsageCounter +
# FigaroBatchVerifier) via script/DeploySepoliaPair.s.sol against the stack the
# record already names — the Core, the four registries and their stakes are
# untouched. The EXISTING_* addresses are read from deployments/11155111.json,
# RPGF_GENESIS is derived from the LIVE counter's periodEnd[0] (never invented;
# a preset RPGF_GENESIS that disagrees refuses), and the record is UPDATED in
# place: only batchVerifier, usageCounter and programVKey change. The live
# RpgfMinter stays bound to the old counter (florin minter registration is
# renounced) — usage accrued through the new counter is not claimable on
# Sepolia; docs/AUDITOR_HANDOVER.md records it.
#
#   PAIR_ONLY=1 RELEASE_COMMIT=<full sha> SEPOLIA_DEPLOY_CONFIRM=yes \
#   RPC_URL=https://... PRIVATE_KEY=0x... \
#   SP1_VERIFIER_GATEWAY=0x... SP1_PROGRAM_VKEY=0x... \
#   ETHERSCAN_API_KEY=... \
#   ./scripts/deploy-sepolia.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$REPO_ROOT/deployments"
SEPOLIA_CHAIN_ID=11155111
# Every step this wrapper shares with scripts/deploy-mainnet.sh.
source "$SCRIPT_DIR/deploy-common.sh"

# ── Guard 0: the checkout builds the release revision ──────────────────────
# For VERIFY_ONLY and PAIR_ONLY too.
guard_release_revision

# ── Verify only: the deployment the record names, no transaction ────────────
verify_only_if_asked "$SEPOLIA_CHAIN_ID"

# ── Guard 1: explicit confirmation ──────────────────────────────────────────
if [ "${SEPOLIA_DEPLOY_CONFIRM:-}" != "yes" ]; then
  echo "❌ Refusing to deploy to Sepolia."
  echo "   This broadcasts real testnet transactions, mints the genesis florin"
  echo "   allocation, and renounces further deployer minting — irreversibly"
  echo "   for this deployment. Set SEPOLIA_DEPLOY_CONFIRM=yes to proceed."
  exit 1
fi

# The swap-funded on-ramp's Permit2: canonical on Ethereum + Sepolia (override for a chain that differs).
export PERMIT2="${PERMIT2:-$CANONICAL_PERMIT2}"

# ── Guard 2: every required env var present ─────────────────────────────────
# Required by script/DeploySepolia.s.sol itself (DeployPublicStack in
# script/DeployBase.s.sol, the deployment mainnet runs):
#   PRIVATE_KEY            — run(): vm.envUint("PRIVATE_KEY")
#   FOUNDER_WALLET          — _validateEnv(): must be nonzero
#   SUPPORTERS_WALLET       — _validateEnv(): must be nonzero
#   DAO_WALLET              — _validateEnv(): must be nonzero; set by this wrapper
#                             to the treasury's Safe, never by hand
#   RPGF_GENESIS            — _validateEnv(): RPGF_GENESIS + one period > now; set by this
#                             wrapper to the chain's time at the broadcast
#   SP1_VERIFIER_GATEWAY    — the gateway the routed verifier is looked up on (Guard 4);
#                             the script binds that route as SP1_VERIFIER, exported here
#   SP1_PROGRAM_VKEY        — _deployProtocol(): must be nonzero
#   SWAP_ROUTER             — _deployProtocol(): probed as a SwapRouter02
# Required by this script for the target/verification:
#   RPC_URL                 — Sepolia RPC endpoint (or an Anvil fork of it)
#   SWAP_QUOTER             — Sepolia only: the Uniswap QuoterV2 the record
#                             carries as `swapQuoter` for the site's venue
#   ETHERSCAN_API_KEY       — unless SKIP_VERIFY=1 (fork rehearsal)
if [ "${PAIR_ONLY:-}" = "1" ]; then
  # Pair-only: no florin genesis, no swap composition, no founder/supporters —
  # RPGF_GENESIS is derived from the live counter below, never required.
  require_env PRIVATE_KEY SP1_VERIFIER_GATEWAY SP1_PROGRAM_VKEY RPC_URL
else
  require_env PRIVATE_KEY FOUNDER_WALLET SUPPORTERS_WALLET \
              SP1_VERIFIER_GATEWAY SP1_PROGRAM_VKEY RPC_URL SWAP_ROUTER SWAP_QUOTER
fi

# ── Guard 3: chain-id read-back before broadcasting ─────────────────────────
# An Anvil FORK of Sepolia keeps its chain id, which is what makes the fork
# rehearsal run through this same wrapper.
guard_chain_id "$SEPOLIA_CHAIN_ID" "Sepolia" \
  "   $SEPOLIA_CHAIN_ID. This script only targets Sepolia (or an Anvil fork" \
  "   of it); point it at the right RPC, or use the deploy script for the" \
  "   chain you meant."

# ── Guard 4: the SP1 verifier gateway routes the proof form we will produce ──
resolve_sp1_verifier

# ── The verification key is this checkout's relay's ──────────────────────────
guard_program_vkey

# ── The guest fingerprint the verifier pins, read back from the chain ───────
# Recorded beside the addresses: a relay's guest must hash to exactly this
# value (`sequencer --vkey`), and the sequencer refuses to start otherwise.
# Sets PROGRAM_VKEY_ONCHAIN.
check_pinned_vkey() {
  PROGRAM_VKEY_ONCHAIN=$(cast call --rpc-url "$RPC_URL" "$BATCH_VERIFIER_ADDR" 'programVKey()(bytes32)')
  if [ "$(echo "$PROGRAM_VKEY_ONCHAIN" | tr '[:upper:]' '[:lower:]')" != "$(echo "$SP1_PROGRAM_VKEY" | tr '[:upper:]' '[:lower:]')" ]; then
    echo "❌ The verifier pins $PROGRAM_VKEY_ONCHAIN, not the SP1_PROGRAM_VKEY given ($SP1_PROGRAM_VKEY)."
    exit 1
  fi
  echo "   programVKey pinned = $PROGRAM_VKEY_ONCHAIN"
}

# ── PAIR_ONLY: redeploy the counter↔verifier pair against the live stack ────
if [ "${PAIR_ONLY:-}" = "1" ]; then
  RECORD_PATH="$DEPLOY_DIR/${SEPOLIA_CHAIN_ID}.json"
  if [ ! -f "$RECORD_PATH" ]; then
    echo "❌ PAIR_ONLY needs the live record at $RECORD_PATH — there is no stack to pair into."
    exit 1
  fi

  export EXISTING_FIGARO_CORE=$(jq -r .figaroCore "$RECORD_PATH")
  export EXISTING_MEMBERS_REGISTRY=$(jq -r .membersRegistry "$RECORD_PATH")
  export EXISTING_CLAUSE_REGISTRY=$(jq -r .clauseRegistry "$RECORD_PATH")
  export EXISTING_PROCESS_REGISTRY=$(jq -r .processRegistry "$RECORD_PATH")
  export EXISTING_AGREEMENT_REGISTRY=$(jq -r .agreementRegistry "$RECORD_PATH")
  OLD_COUNTER=$(jq -r .usageCounter "$RECORD_PATH")
  OLD_VERIFIER=$(jq -r .batchVerifier "$RECORD_PATH")

  # The schedule anchor comes from the LIVE counter, never invented: genesis =
  # periodEnd[0] − one period, and the period is read from the same counter
  # (periodEnd[1] − periodEnd[0]), never restated here. A preset RPGF_GENESIS
  # that disagrees refuses.
  PERIOD0_END=$(cast call --rpc-url "$RPC_URL" "$OLD_COUNTER" 'periodEnd(uint256)(uint64)' 0 | awk '{print $1}')
  PERIOD1_END=$(cast call --rpc-url "$RPC_URL" "$OLD_COUNTER" 'periodEnd(uint256)(uint64)' 1 | awk '{print $1}')
  if ! [[ "$PERIOD0_END" =~ ^[0-9]+$ && "$PERIOD1_END" =~ ^[0-9]+$ ]] || [ "$PERIOD1_END" -le "$PERIOD0_END" ]; then
    echo "❌ The live counter $OLD_COUNTER read periodEnd[0]='$PERIOD0_END', periodEnd[1]='$PERIOD1_END': no schedule to continue."
    exit 1
  fi
  PERIOD_SECONDS=$(( PERIOD1_END - PERIOD0_END ))
  DERIVED_GENESIS=$(( PERIOD0_END - PERIOD_SECONDS ))
  if [ -n "${RPGF_GENESIS:-}" ] && [ "$RPGF_GENESIS" != "$DERIVED_GENESIS" ]; then
    echo "❌ RPGF_GENESIS=$RPGF_GENESIS disagrees with the live counter's schedule"
    echo "   (periodEnd[0]=$PERIOD0_END − one period of ${PERIOD_SECONDS}s = $DERIVED_GENESIS). The new counter keeps"
    echo "   the live schedule; unset RPGF_GENESIS to use the derived value."
    exit 1
  fi
  export RPGF_GENESIS=$DERIVED_GENESIS

  echo ""
  echo "🚀 Redeploying the counter↔verifier PAIR on SEPOLIA (chain id $ACTUAL_CHAIN_ID)..."
  echo "   deployer (from PRIVATE_KEY) = $(cast wallet address --private-key "$PRIVATE_KEY")"
  echo "   existing FigaroCore         = $EXISTING_FIGARO_CORE"
  echo "   existing MembersRegistry    = $EXISTING_MEMBERS_REGISTRY"
  echo "   existing ClauseRegistry     = $EXISTING_CLAUSE_REGISTRY"
  echo "   existing ProcessRegistry   = $EXISTING_PROCESS_REGISTRY"
  echo "   existing AgreementRegistry  = $EXISTING_AGREEMENT_REGISTRY"
  echo "   replacing UsageCounter      = $OLD_COUNTER"
  echo "   replacing FigaroBatchVerifier = $OLD_VERIFIER"
  echo "   rpgf genesis (from chain)   = $RPGF_GENESIS"
  if [ "${SKIP_VERIFY:-}" = "1" ]; then
    echo "   verification                = SKIPPED (fork rehearsal)"
  fi
  echo ""

  run_forge_script script/DeploySepoliaPair.s.sol:DeploySepoliaPair

  USAGE_COUNTER_ADDR=$(printed_address 'NEXT_PUBLIC_USAGE_COUNTER=')
  BATCH_VERIFIER_ADDR=$(printed_address 'NEXT_PUBLIC_BATCH_VERIFIER=')
  if [ -z "$USAGE_COUNTER_ADDR" ] || [ -z "$BATCH_VERIFIER_ADDR" ]; then
    echo "❌ Could not parse the pair's addresses from forge output. Aborting record update."
    echo "   (The broadcast above may still have succeeded or partially succeeded —"
    echo "   check the forge output and the chain directly before retrying.)"
    exit 1
  fi

  check_pinned_vkey

  # The pair's whole wiring, read back against the live stack it binds.
  CORE_ADDR=$EXISTING_FIGARO_CORE
  MEMBERS_ADDR=$EXISTING_MEMBERS_REGISTRY
  CLAUSE_ADDR=$EXISTING_CLAUSE_REGISTRY
  ASSEMBLY_ADDR=$EXISTING_PROCESS_REGISTRY
  AGREEMENT_ADDR=$EXISTING_AGREEMENT_REGISTRY
  read_back_pair_wiring

  # Update the record in place: only the pair and the key it pins change. A
  # FORK REHEARSAL must never clobber the real record.
  select_record_dir
  mkdir -p "$DEPLOY_DIR"
  OUT_RECORD="$DEPLOY_DIR/${ACTUAL_CHAIN_ID}.json"
  echo ""
  echo "✍️  Updating $OUT_RECORD ..."
  jq --arg uc "$USAGE_COUNTER_ADDR" --arg bv "$BATCH_VERIFIER_ADDR" --arg vk "$PROGRAM_VKEY_ONCHAIN" \
     '.usageCounter = $uc | .batchVerifier = $bv | .programVKey = $vk' \
     "$RECORD_PATH" > "$OUT_RECORD.tmp"
  mv "$OUT_RECORD.tmp" "$OUT_RECORD"

  echo ""
  echo "✅ Pair redeploy complete!"
  echo ""
  echo "   UsageCounter            = $USAGE_COUNTER_ADDR (was $OLD_COUNTER)"
  echo "   FigaroBatchVerifier     = $BATCH_VERIFIER_ADDR (was $OLD_VERIFIER)"
  echo "   Record: $OUT_RECORD"
  [ "${SKIP_VERIFY:-}" = "1" ] || verify_record "$OUT_RECORD"
  echo ""
  echo "⚠️  The live RpgfMinter stays bound to $OLD_COUNTER (minter registration"
  echo "   renounced): usage accrued through the new counter is not claimable on"
  echo "   Sepolia. The relay must be rebuilt against the new verifier's key and"
  echo "   the site rebuilt from the updated record."
  exit 0
fi

# ── The rewards schedule starts at this broadcast ───────────────────────────
start_schedule_at_chain_time

# ── The treasury's Safe ──────────────────────────────────────────────────────
ensure_treasury_safe

echo ""
echo "🚀 Deploying Figaro Protocol stack to SEPOLIA (chain id $ACTUAL_CHAIN_ID)..."
echo "   deployer (from PRIVATE_KEY) = $(cast wallet address --private-key "$PRIVATE_KEY")"
echo "   founder wallet              = $FOUNDER_WALLET"
echo "   supporters wallet           = $SUPPORTERS_WALLET"
echo "   dao wallet                  = $DAO_WALLET"
echo "   rpgf genesis (unix)         = $RPGF_GENESIS"
if [ "${SKIP_VERIFY:-}" = "1" ]; then
  echo "   verification                = SKIPPED (fork rehearsal)"
fi
echo ""

read_deployment_block
run_forge_script script/DeploySepolia.s.sol:DeploySepolia

# ── Parse addresses from the script's NEXT_PUBLIC_* summary block ──────────
parse_stack_addresses
# Sepolia's script also prints the treasury it read (DeploySepolia.s.sol).
DAO_TREASURY_ADDR=$(printed_address 'NEXT_PUBLIC_DAO_TREASURY=')

check_pinned_vkey

# ── Guard 5: read the wiring back from the chain ────────────────────────────
# The guard mainnet runs, and one check of Sepolia's own: the treasury the
# script printed is the Safe this wrapper handed it.
read_back_chain_extra() {
  expect_eq "script's DAO treasury"          "$DAO_TREASURY_ADDR"                                                 "$DAO_WALLET"
}
read_back_stack_wiring

# ── Write deployments/<chainId>.json ─────────────────────────────────────────
# Same shape as deployments/1.json plus one entry, daoTreasury: the address
# DAO_WALLET named, the treasury's Safe, which the checks read back.
# A FORK REHEARSAL (SKIP_VERIFY=1) must never clobber the real record
# (select_record_dir, scripts/deploy-common.sh).
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
if [ -n "$RECORD_RPC_URL" ] && [ "$RECORD_RPC_URL" = "${SEPOLIA_RPC_URL:-}" ]; then
  echo "❌ PUBLIC_RPC_URL is the deploy's own SEPOLIA_RPC_URL — the record is public and must not carry a provider key."
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
  "usageCounter": "$USAGE_COUNTER_ADDR",
  "rpgfMinter": "$RPGF_MINTER_ADDR",
  "batchVerifier": "$BATCH_VERIFIER_ADDR",
  "programVKey": "$PROGRAM_VKEY_ONCHAIN",
  "witnessSwapAndCommitCoordinator": "$SWAP_COORD_ADDR",
  "swapRouter": "$SWAP_ROUTER",
  "swapQuoter": "$SWAP_QUOTER",
  "permit2": "$PERMIT2",
  "multisender": "0xD152f549545093347A162Dce210e7293f1452150",
  "daoTreasury": "$DAO_TREASURY_ADDR",
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
echo "   DAO treasury (DAO_WALLET) = $DAO_TREASURY_ADDR"
echo "   Record: $DEPLOY_DIR/${ACTUAL_CHAIN_ID}.json"
echo ""
echo "⚠️  Clauses are NOT registered by this script (Solidity cannot pin to"
echo "   IPFS). Run frontend/scripts/populate-clauses.mjs against the new"
echo "   NEXT_PUBLIC_CLAUSE_REGISTRY=$CLAUSE_ADDR with production IPFS"
echo "   pinning credentials before the deployment is usable."
