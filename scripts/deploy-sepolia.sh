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

# ── Guard 0: the checkout builds the release revision ──────────────────────
# RELEASE_COMMIT names the full sha every bench ran at and the guest key was
# built from. The tree must be clean and must not differ from it in the code,
# the guest, the proofs or the build (scripts/check-release-revision.mjs).
# A missing RELEASE_COMMIT refuses; it is never skipped. It runs first, for
# VERIFY_ONLY and PAIR_ONLY too, since each compiles this tree.
node "$REPO_ROOT/scripts/check-release-revision.mjs" "${RELEASE_COMMIT:-}" || {
  echo "❌ Refusing to run: this checkout is not the release revision (RELEASE_COMMIT)."
  exit 1
}

# ── Verify only: the deployment the record names, no transaction ────────────
verify_record() { # <record path>
  echo ""
  echo "🔎 Verifying every contract $1 names on Etherscan ..."
  if node "$REPO_ROOT/scripts/verify-etherscan.mjs" "$1" --artifacts "$REPO_ROOT/out"; then
    echo "✅ Every contract verified."
  else
    echo "❌ Verification did not complete. The record stands at $1;"
    echo "   rerun only the verification, which sends no transaction:"
    echo "   VERIFY_ONLY=1 RELEASE_COMMIT=$RELEASE_COMMIT RECORD_DIR=$(dirname "$1") ETHERSCAN_API_KEY=... $0"
    exit 1
  fi
}
if [ "${VERIFY_ONLY:-}" = "1" ]; then
  : "${ETHERSCAN_API_KEY:?VERIFY_ONLY needs ETHERSCAN_API_KEY}"
  RECORD="${RECORD_DIR:-$DEPLOY_DIR}/${SEPOLIA_CHAIN_ID}.json"
  [ -f "$RECORD" ] || { echo "❌ no record at $RECORD to verify"; exit 1; }
  # The artifacts must reproduce the deployed creation code: the deploy's own build.
  (cd "$REPO_ROOT" && forge build --via-ir) || exit 1
  verify_record "$RECORD"
  exit 0
fi

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
#   FOUNDER_WALLET          — _validateEnv(): must be nonzero
#   SUPPORTERS_WALLET       — _validateEnv(): must be nonzero
#   DAO_WALLET              — _validateEnv(): must be nonzero; set by this wrapper
#                             to the treasury's Safe, never by hand
#   RPGF_GENESIS            — _validateEnv(): RPGF_GENESIS + 365 days > now; set by this
#                             wrapper to the chain's time at the broadcast
#   SP1_VERIFIER_GATEWAY    — the gateway the routed verifier is looked up on (Guard 4);
#                             the script binds that route as SP1_VERIFIER, exported here
#   SP1_PROGRAM_VKEY        — _deployProtocol(): must be nonzero
# Required by this script for the target/verification:
#   RPC_URL                 — Sepolia RPC endpoint (or an Anvil fork of it)
#   ETHERSCAN_API_KEY       — unless SKIP_VERIFY=1 (fork rehearsal)
if [ "${PAIR_ONLY:-}" = "1" ]; then
  # Pair-only: no florin genesis, no swap composition, no founder/supporters —
  # RPGF_GENESIS is derived from the live counter below, never required.
  REQUIRED=(PRIVATE_KEY SP1_VERIFIER_GATEWAY SP1_PROGRAM_VKEY RPC_URL)
else
  REQUIRED=(PRIVATE_KEY FOUNDER_WALLET SUPPORTERS_WALLET \
            SP1_VERIFIER_GATEWAY SP1_PROGRAM_VKEY RPC_URL SWAP_ROUTER SWAP_QUOTER)
fi
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
echo "🔎 Reading chain id from $(printf '%s' "$RPC_URL" | node "$SCRIPT_DIR/url-host.mjs") (scheme and host only) ..."
ACTUAL_CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL")
echo "   RPC_URL   = $(printf '%s' "$RPC_URL" | node "$SCRIPT_DIR/url-host.mjs")"
echo "   chain id  = $ACTUAL_CHAIN_ID (expecting $SEPOLIA_CHAIN_ID — Sepolia)"
if [ "$ACTUAL_CHAIN_ID" != "$SEPOLIA_CHAIN_ID" ]; then
  echo "❌ Refusing to deploy — RPC_URL resolves to chain id $ACTUAL_CHAIN_ID, not"
  echo "   $SEPOLIA_CHAIN_ID. This script only targets Sepolia (or an Anvil fork"
  echo "   of it); point it at the right RPC, or use the deploy script for the"
  echo "   chain you meant."
  exit 1
fi

# ── Guard 4: the SP1 verifier gateway routes the proof form we will produce ──
# The gateway (SP1_VERIFIER_GATEWAY) is where the routed verifier for our sdk
# version's Groth16 (or PLONK, per SP1_PROOF_MODE) proofs is looked up; a
# gateway that routes none means every real proof would revert RouteNotFound.
# UsageCounter binds the verifier immutably, so a wrong binding redeploys the
# whole stack: this guard exists to prevent it.
ROUTE_OUT=$(bash "$(dirname "$0")/check-sp1-gateway-route.sh") || { printf '%s\n' "$ROUTE_OUT"; exit 1; }
printf '%s\n' "$ROUTE_OUT"
# FigaroBatchVerifier binds the ROUTED verifier the gateway names for this
# release's proof form, never the gateway itself: a gateway's owner can freeze
# a route, and a frozen route would strand every process open on the batch
# path. The contract refuses a gateway (no `VERIFIER_HASH()`), so the address
# the script passes is the route the preflight resolved.
export SP1_VERIFIER
SP1_VERIFIER=$(printf '%s\n' "$ROUTE_OUT" | sed -n 's/^SP1_VERIFIER=//p' | tail -1)
[ -n "$SP1_VERIFIER" ] || { echo "❌ the route preflight named no verifier"; exit 1; }

# ── The verification key is this checkout's relay's ──────────────────────────
# SP1_PROGRAM_VKEY is not taken as given. The verifier pins it for good, and a
# key no built relay holds leaves a batch path nobody can prove on. It must be
# the key this checkout's release relay prints (`sequencer --vkey`; the relay
# embeds the proof program), and the key the expectations file states, which
# is written from the release build before a deploy. This guard holds the
# three to one value; it cannot tell how the relay was built. The release
# build is scripts/prover-box/build-guest.sh, then build-sequencer.sh: a plain
# `cargo build` replaces the reproducible proof program with a host build,
# whose key is another.
# EXPECTED_FILE names another expectations file; scripts/fork-rehearsal.sh
# passes its rehearsal copy.
EXPECTED_FILE="${EXPECTED_FILE:-$REPO_ROOT/deployments/${ACTUAL_CHAIN_ID}.expected.json}"
RELAY_BIN="${RELAY_BIN:-$REPO_ROOT/prover/target/release/sequencer}"
same_hex() { [ "$(printf '%s' "$1" | tr 'A-F' 'a-f')" = "$(printf '%s' "$2" | tr 'A-F' 'a-f')" ]; }
[ -x "$RELAY_BIN" ] || { echo "❌ Refusing to deploy — no release relay at $RELAY_BIN to read the verification key from"; exit 1; }
RELAY_KEY=$("$RELAY_BIN" --vkey | sed -n 's/^SP1_PROGRAM_VKEY=//p' | tail -1)
[[ "$RELAY_KEY" =~ ^0x[0-9a-fA-F]{64}$ ]] || { echo "❌ Refusing to deploy — $RELAY_BIN --vkey printed no key"; exit 1; }
if ! same_hex "$SP1_PROGRAM_VKEY" "$RELAY_KEY"; then
  echo "❌ Refusing to deploy — SP1_PROGRAM_VKEY=$SP1_PROGRAM_VKEY is not the key this checkout's relay holds,"
  echo "   $RELAY_KEY: a verifier that pins it could be proven on by no relay built here."
  exit 1
fi
[ -f "$EXPECTED_FILE" ] || { echo "❌ Refusing to deploy — no expectations file $EXPECTED_FILE"; exit 1; }
EXPECTED_KEY=$(jq -r '.batchVerifier.programVKey // empty' "$EXPECTED_FILE")
if ! same_hex "$EXPECTED_KEY" "$RELAY_KEY"; then
  echo "❌ Refusing to deploy — $EXPECTED_FILE states the key ${EXPECTED_KEY:-(none)},"
  echo "   and this checkout's relay holds $RELAY_KEY: write the built key there before the deploy."
  exit 1
fi
echo "   verification key            = $RELAY_KEY (the relay's, and the expectations file's)"

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
  # periodEnd[0] − one real period. A preset RPGF_GENESIS that disagrees refuses.
  PERIOD_SECONDS=31536000 # 365 days — DeploySepoliaPair.s.sol's PERIOD
  PERIOD0_END=$(cast call --rpc-url "$RPC_URL" "$OLD_COUNTER" 'periodEnd(uint256)(uint64)' 0 | awk '{print $1}')
  DERIVED_GENESIS=$(( PERIOD0_END - PERIOD_SECONDS ))
  if [ -n "${RPGF_GENESIS:-}" ] && [ "$RPGF_GENESIS" != "$DERIVED_GENESIS" ]; then
    echo "❌ RPGF_GENESIS=$RPGF_GENESIS disagrees with the live counter's schedule"
    echo "   (periodEnd[0]=$PERIOD0_END − 365d = $DERIVED_GENESIS). The new counter keeps"
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

  FORGE_OUT=$(forge script script/DeploySepoliaPair.s.sol:DeploySepoliaPair \
      --rpc-url "$RPC_URL" \
      --broadcast --slow --via-ir \
      ${FORGE_GAS_MULTIPLIER:+--gas-estimate-multiplier "$FORGE_GAS_MULTIPLIER"} ${FORGE_SKIP_SIMULATION:+--skip-simulation} 2>&1) || { echo "$FORGE_OUT"; echo "❌ forge script failed — see its output above"; exit 1; }
  echo "$FORGE_OUT"

  USAGE_COUNTER_ADDR=$(echo "$FORGE_OUT"  | grep 'NEXT_PUBLIC_USAGE_COUNTER='  | grep -oE '0x[0-9a-fA-F]+')
  BATCH_VERIFIER_ADDR=$(echo "$FORGE_OUT" | grep 'NEXT_PUBLIC_BATCH_VERIFIER=' | grep -oE '0x[0-9a-fA-F]+')
  if [ -z "$USAGE_COUNTER_ADDR" ] || [ -z "$BATCH_VERIFIER_ADDR" ]; then
    echo "❌ Could not parse the pair's addresses from forge output. Aborting record update."
    echo "   (The broadcast above may still have succeeded or partially succeeded —"
    echo "   check the forge output and the chain directly before retrying.)"
    exit 1
  fi

  PROGRAM_VKEY_ONCHAIN=$(cast call --rpc-url "$RPC_URL" "$BATCH_VERIFIER_ADDR" 'programVKey()(bytes32)')
  if [ "$(echo "$PROGRAM_VKEY_ONCHAIN" | tr '[:upper:]' '[:lower:]')" != "$(echo "$SP1_PROGRAM_VKEY" | tr '[:upper:]' '[:lower:]')" ]; then
    echo "❌ The verifier pins $PROGRAM_VKEY_ONCHAIN, not the SP1_PROGRAM_VKEY given ($SP1_PROGRAM_VKEY)."
    exit 1
  fi
  echo "   programVKey pinned = $PROGRAM_VKEY_ONCHAIN"

  # Update the record in place: only the pair and the key it pins change. A
  # FORK REHEARSAL must never clobber the real record (same branch as below).
  if [ "${SKIP_VERIFY:-}" = "1" ]; then
    DEPLOY_DIR="${RECORD_DIR:-${TMPDIR:-/tmp}/figaro-rehearsal-deployments}"
    echo ""
    echo "ℹ️  Fork rehearsal — record diverted to $DEPLOY_DIR (deployments/ untouched)"
  else
    DEPLOY_DIR="${RECORD_DIR:-$DEPLOY_DIR}"
  fi
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
# RPGF_GENESIS only sets the period ends: a start before the broadcast
# shortens the first period, and a later one lengthens it. The start is the
# chain's present time. A value set by hand must be within an hour of it.
CHAIN_NOW=$(cast block latest --field timestamp --rpc-url "$RPC_URL")
[[ "$CHAIN_NOW" =~ ^[0-9]+$ ]] || { echo "❌ Refusing to deploy — the chain's time read as '$CHAIN_NOW', not a number"; exit 1; }
if [ -z "${RPGF_GENESIS:-}" ]; then
  export RPGF_GENESIS="$CHAIN_NOW"
elif ! [[ "$RPGF_GENESIS" =~ ^[0-9]+$ ]]; then
  echo "❌ Refusing to deploy — RPGF_GENESIS=$RPGF_GENESIS is not a decimal number of seconds; unset it to start the schedule at this broadcast."
  exit 1
elif [ "$RPGF_GENESIS" -gt $((CHAIN_NOW + 3600)) ] || [ "$RPGF_GENESIS" -lt $((CHAIN_NOW - 3600)) ]; then
  echo "❌ Refusing to deploy — RPGF_GENESIS=$RPGF_GENESIS is more than an hour from the chain's time $CHAIN_NOW;"
  echo "   unset it to start the schedule at this broadcast."
  exit 1
fi

# ── The treasury's Safe ──────────────────────────────────────────────────────
# DAO_WALLET is not an input. The treasury is the Safe the expectations file
# states (treasurySafe: its owners, its threshold, a salt), at the address
# Safe's own factory gives for them by CREATE2. scripts/safe-treasury.mjs
# derives that address, creates the Safe when none stands there (the deploy's
# key pays; the owners sign nothing), and checks its owners and threshold. A
# DAO_WALLET set by hand must be that address.
SAFE_ADDR=$(node "$SCRIPT_DIR/safe-treasury.mjs" ensure "$EXPECTED_FILE" --rpc-url "$RPC_URL") || {
  echo "❌ Refusing to deploy — the treasury's Safe is not as $EXPECTED_FILE states it"
  exit 1
}
[[ "$SAFE_ADDR" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "❌ Refusing to deploy — the Safe step printed no address: $SAFE_ADDR"; exit 1; }
if [ -n "${DAO_WALLET:-}" ] && [ "$(printf '%s' "$DAO_WALLET" | tr 'A-F' 'a-f')" != "$(printf '%s' "$SAFE_ADDR" | tr 'A-F' 'a-f')" ]; then
  echo "❌ Refusing to deploy — DAO_WALLET=$DAO_WALLET is not the treasury's Safe $SAFE_ADDR;"
  echo "   unset it, or state the Safe you mean under treasurySafe in the expectations file."
  exit 1
fi
export DAO_WALLET="$SAFE_ADDR"

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

# The block the scan window starts at: read BEFORE broadcasting, so it is at
# or below every contract's creation block. Frontends read events from here
# (NEXT_PUBLIC_DEPLOYMENT_BLOCK) — public gateways cap eth_getLogs ranges, and
# a from-genesis scan of a real network never loads.
DEPLOYMENT_BLOCK=$(cast block-number --rpc-url "$RPC_URL")
echo "📝 Running forge script (deployment block $DEPLOYMENT_BLOCK)..."
# --slow: wait for each transaction's receipt before sending the next — see
# deploy-local.sh's identical rationale (nonce-tracking race under
# pipelined broadcast).
# Verification runs after the record is written (verify_record), never
# inside forge: a verification failure must not lose the record of
# transactions that landed.
# The output is printed whether forge succeeds or fails: under `set -e` a
# failing forge would otherwise exit this script with its output unseen.
# FORGE_GAS_MULTIPLIER (percent) widens forge's gas limits: forge sizes each
# transaction from its own local simulation, and a live chain whose fork
# charges more for the same creation runs the transaction out of gas at
# forge's default 130 — a failed creation that still costs its gas.
# FORGE_SKIP_SIMULATION=1 goes further: forge skips its own simulation and
# takes the node's eth_estimateGas for every transaction, so a chain whose
# rules forge's EVM does not model (Sepolia under Glamsterdam charges about
# seven times forge's figure for a creation) sizes its own transactions;
# pair it with a small multiplier so the largest creation stays under the
# per-transaction gas cap.
FORGE_OUT=$(forge script script/DeploySepolia.s.sol:DeploySepolia \
    --rpc-url "$RPC_URL" \
    --broadcast --slow --via-ir \
    ${FORGE_GAS_MULTIPLIER:+--gas-estimate-multiplier "$FORGE_GAS_MULTIPLIER"} ${FORGE_SKIP_SIMULATION:+--skip-simulation} 2>&1) || { echo "$FORGE_OUT"; echo "❌ forge script failed — see its output above"; exit 1; }
echo "$FORGE_OUT"

# ── Parse addresses from the script's NEXT_PUBLIC_* summary block ──────────
CORE_ADDR=$(echo "$FORGE_OUT"            | grep 'NEXT_PUBLIC_FIGARO_CORE='             | grep -oE '0x[0-9a-fA-F]+')
ATTESTATION_ADDR=$(echo "$FORGE_OUT"     | grep 'NEXT_PUBLIC_ATTESTATION_COORDINATOR=' | grep -oE '0x[0-9a-fA-F]+')
CLAUSE_ADDR=$(echo "$FORGE_OUT"          | grep 'NEXT_PUBLIC_CLAUSE_REGISTRY='         | grep -oE '0x[0-9a-fA-F]+')
ASSEMBLY_ADDR=$(echo "$FORGE_OUT"        | grep 'NEXT_PUBLIC_PROCESS_REGISTRY='       | grep -oE '0x[0-9a-fA-F]+')
AGREEMENT_ADDR=$(echo "$FORGE_OUT"       | grep 'NEXT_PUBLIC_AGREEMENT_REGISTRY='      | grep -oE '0x[0-9a-fA-F]+')
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

# ── The guest fingerprint the verifier pins, read back from the chain ───────
# Recorded beside the addresses: a relay's guest must hash to exactly this
# value (`sequencer --vkey`), and the sequencer refuses to start otherwise.
PROGRAM_VKEY_ONCHAIN=$(cast call --rpc-url "$RPC_URL" "$BATCH_VERIFIER_ADDR" 'programVKey()(bytes32)')
if [ "$(echo "$PROGRAM_VKEY_ONCHAIN" | tr '[:upper:]' '[:lower:]')" != "$(echo "$SP1_PROGRAM_VKEY" | tr '[:upper:]' '[:lower:]')" ]; then
  echo "❌ The verifier pins $PROGRAM_VKEY_ONCHAIN, not the SP1_PROGRAM_VKEY given ($SP1_PROGRAM_VKEY)."
  exit 1
fi
echo "   programVKey pinned = $PROGRAM_VKEY_ONCHAIN"

# ── Write deployments/<chainId>.json ─────────────────────────────────────────
# Same shape as deployments/1.json plus one entry, daoTreasury: the address
# DAO_WALLET named, the treasury's Safe, which the checks read back.
# A FORK REHEARSAL (SKIP_VERIFY=1) must never clobber the real record — an
# Anvil fork keeps Sepolia's chain id, so without this branch a rehearsal
# writes fork addresses over the deployed truth.
if [ "${SKIP_VERIFY:-}" = "1" ]; then
  DEPLOY_DIR="${RECORD_DIR:-${TMPDIR:-/tmp}/figaro-rehearsal-deployments}"
  echo ""
  echo "ℹ️  Fork rehearsal — record diverted to $DEPLOY_DIR (deployments/ untouched)"
else
  DEPLOY_DIR="${RECORD_DIR:-$DEPLOY_DIR}"
fi
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
