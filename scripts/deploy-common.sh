# shellcheck shell=bash
#
# deploy-common.sh — the guards and steps the public deploy wrappers share.
#
# Sourced, never run: scripts/deploy-mainnet.sh and scripts/deploy-sepolia.sh
# take every step they have in common from here, so both chains run the same
# guards in the same words, and scripts/deploy-swap-coordinator.sh takes the
# canonical Permit2 address from here. Each wrapper keeps only its chain's
# parameters (chain id, confirmation variable, script name, record shape) and
# its genuine differences. Sourcing defines functions and one constant and
# runs nothing.
#
# The functions read and set the wrapper's variables by name: SCRIPT_DIR,
# REPO_ROOT, DEPLOY_DIR, RPC_URL, ACTUAL_CHAIN_ID, and the addresses
# parse_stack_addresses sets. A function that refuses exits the wrapper.

# The swap-funded on-ramp's Permit2: Uniswap's canonical deployment, at this
# address on Ethereum and Sepolia. The one copy the deploy wrappers read; a
# wrapper's PERMIT2 overrides it for a chain where it differs. The Solidity
# scripts hold no copy: they take PERMIT2 from the environment.
CANONICAL_PERMIT2=0x000000000022D473030F116dDEE9F6B43aC78BA3

# ── Guard 0: the checkout builds the release revision ──────────────────────
# RELEASE_COMMIT names the full sha every bench ran at and the guest key was
# built from. The tree must be clean and must not differ from it in the code,
# the guest, the proofs or the build (scripts/check-release-revision.mjs).
# A missing RELEASE_COMMIT refuses; it is never skipped. It runs first, in
# every mode, since each compiles this tree.
guard_release_revision() {
  node "$REPO_ROOT/scripts/check-release-revision.mjs" "${RELEASE_COMMIT:-}" || {
    echo "❌ Refusing to run: this checkout is not the release revision (RELEASE_COMMIT)."
    exit 1
  }
}

# ── Verification on Etherscan ────────────────────────────────────────────────
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

# ── Verify only: the deployment the record names, no transaction ────────────
verify_only_if_asked() { # <chain id>
  if [ "${VERIFY_ONLY:-}" = "1" ]; then
    : "${ETHERSCAN_API_KEY:?VERIFY_ONLY needs ETHERSCAN_API_KEY}"
    local record="${RECORD_DIR:-$DEPLOY_DIR}/$1.json"
    [ -f "$record" ] || { echo "❌ no record at $record to verify"; exit 1; }
    # The artifacts must reproduce the deployed creation code: the deploy's own build.
    (cd "$REPO_ROOT" && forge build --via-ir) || exit 1
    verify_record "$record"
    exit 0
  fi
}

# ── Guard 2: every required env var present ─────────────────────────────────
# ETHERSCAN_API_KEY is required too: verification always runs after the
# record is written, unless SKIP_VERIFY=1 (fork rehearsal).
require_env() { # <variable name>...
  local required=("$@")
  if [ "${SKIP_VERIFY:-}" != "1" ]; then
    required+=(ETHERSCAN_API_KEY)
  fi
  local missing=() var
  for var in "${required[@]}"; do
    if [ -z "${!var:-}" ]; then
      missing+=("$var")
    fi
  done
  if [ "${#missing[@]}" -ne 0 ]; then
    echo "❌ Refusing to deploy — missing required environment variable(s):"
    for var in "${missing[@]}"; do
      echo "   - $var"
    done
    exit 1
  fi
}

# ── Guard 3: chain-id read-back before broadcasting ─────────────────────────
# Sets ACTUAL_CHAIN_ID. The refusal's closing lines are the wrapper's, since
# they name its chain.
guard_chain_id() { # <expected chain id> <chain name> <refusal line>...
  local expected="$1" name="$2"
  shift 2
  echo "🔎 Reading chain id from $(printf '%s' "$RPC_URL" | node "$SCRIPT_DIR/url-host.mjs") (scheme and host only) ..."
  ACTUAL_CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL")
  echo "   RPC_URL   = $(printf '%s' "$RPC_URL" | node "$SCRIPT_DIR/url-host.mjs")"
  echo "   chain id  = $ACTUAL_CHAIN_ID (expecting $expected — $name)"
  if [ "$ACTUAL_CHAIN_ID" != "$expected" ]; then
    echo "❌ Refusing to deploy — RPC_URL resolves to chain id $ACTUAL_CHAIN_ID, not"
    printf '%s\n' "$@"
    exit 1
  fi
}

# ── Guard 4: the SP1 verifier gateway routes the proof form we will produce ──
# The gateway (SP1_VERIFIER_GATEWAY) is where the routed verifier for our sdk
# version's Groth16 (or PLONK, per SP1_PROOF_MODE) proofs is looked up; a
# gateway that routes none means every real proof would revert RouteNotFound.
# UsageCounter binds the verifier immutably, so a wrong binding redeploys the
# whole stack: this guard exists to prevent it.
# FigaroBatchVerifier binds the ROUTED verifier the gateway names for this
# release's proof form, never the gateway itself: a gateway's owner can freeze
# a route, and a frozen route would strand every process open on the batch
# path. The contract refuses a gateway (no `VERIFIER_HASH()`), so the address
# the script passes is the route the preflight resolved. Exports SP1_VERIFIER.
resolve_sp1_verifier() {
  local route_out
  route_out=$(bash "$SCRIPT_DIR/check-sp1-gateway-route.sh") || { printf '%s\n' "$route_out"; exit 1; }
  printf '%s\n' "$route_out"
  export SP1_VERIFIER
  SP1_VERIFIER=$(printf '%s\n' "$route_out" | sed -n 's/^SP1_VERIFIER=//p' | tail -1)
  [ -n "$SP1_VERIFIER" ] || { echo "❌ the route preflight named no verifier"; exit 1; }
}

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
# passes its rehearsal copy. Sets EXPECTED_FILE and RELAY_KEY.
same_hex() { [ "$(printf '%s' "$1" | tr 'A-F' 'a-f')" = "$(printf '%s' "$2" | tr 'A-F' 'a-f')" ]; }
guard_program_vkey() {
  EXPECTED_FILE="${EXPECTED_FILE:-$REPO_ROOT/deployments/${ACTUAL_CHAIN_ID}.expected.json}"
  RELAY_BIN="${RELAY_BIN:-$REPO_ROOT/prover/target/release/sequencer}"
  [ -x "$RELAY_BIN" ] || { echo "❌ Refusing to deploy — no release relay at $RELAY_BIN to read the verification key from"; exit 1; }
  RELAY_KEY=$("$RELAY_BIN" --vkey | sed -n 's/^SP1_PROGRAM_VKEY=//p' | tail -1)
  [[ "$RELAY_KEY" =~ ^0x[0-9a-fA-F]{64}$ ]] || { echo "❌ Refusing to deploy — $RELAY_BIN --vkey printed no key"; exit 1; }
  if ! same_hex "$SP1_PROGRAM_VKEY" "$RELAY_KEY"; then
    echo "❌ Refusing to deploy — SP1_PROGRAM_VKEY=$SP1_PROGRAM_VKEY is not the key this checkout's relay holds,"
    echo "   $RELAY_KEY: a verifier that pins it could be proven on by no relay built here."
    exit 1
  fi
  [ -f "$EXPECTED_FILE" ] || { echo "❌ Refusing to deploy — no expectations file $EXPECTED_FILE"; exit 1; }
  local expected_key
  expected_key=$(jq -r '.batchVerifier.programVKey // empty' "$EXPECTED_FILE")
  if ! same_hex "$expected_key" "$RELAY_KEY"; then
    echo "❌ Refusing to deploy — $EXPECTED_FILE states the key ${expected_key:-(none)},"
    echo "   and this checkout's relay holds $RELAY_KEY: write the built key there before the deploy."
    exit 1
  fi
  echo "   verification key            = $RELAY_KEY (the relay's, and the expectations file's)"
}

# ── The rewards schedule starts at this broadcast ───────────────────────────
# RPGF_GENESIS only sets the period ends: a start before the broadcast
# shortens the first period, and a later one lengthens it. The start is the
# chain's present time. A value set by hand must be within an hour of it.
start_schedule_at_chain_time() {
  local chain_now
  chain_now=$(cast block latest --field timestamp --rpc-url "$RPC_URL")
  [[ "$chain_now" =~ ^[0-9]+$ ]] || { echo "❌ Refusing to deploy — the chain's time read as '$chain_now', not a number"; exit 1; }
  if [ -z "${RPGF_GENESIS:-}" ]; then
    export RPGF_GENESIS="$chain_now"
  elif ! [[ "$RPGF_GENESIS" =~ ^[0-9]+$ ]]; then
    echo "❌ Refusing to deploy — RPGF_GENESIS=$RPGF_GENESIS is not a decimal number of seconds; unset it to start the schedule at this broadcast."
    exit 1
  elif [ "$RPGF_GENESIS" -gt $((chain_now + 3600)) ] || [ "$RPGF_GENESIS" -lt $((chain_now - 3600)) ]; then
    echo "❌ Refusing to deploy — RPGF_GENESIS=$RPGF_GENESIS is more than an hour from the chain's time $chain_now;"
    echo "   unset it to start the schedule at this broadcast."
    exit 1
  fi
}

# ── The treasury's Safe ──────────────────────────────────────────────────────
# DAO_WALLET is not an input. The treasury is the Safe the expectations file
# states (treasurySafe: its owners, its threshold, a salt), at the address
# Safe's own factory gives for them by CREATE2. scripts/safe-treasury.mjs
# derives that address, creates the Safe when none stands there (the deploy's
# key pays; the owners sign nothing), and checks its owners and threshold. A
# DAO_WALLET set by hand must be that address. Exports DAO_WALLET.
ensure_treasury_safe() {
  local safe_addr
  safe_addr=$(node "$SCRIPT_DIR/safe-treasury.mjs" ensure "$EXPECTED_FILE" --rpc-url "$RPC_URL") || {
    echo "❌ Refusing to deploy — the treasury's Safe is not as $EXPECTED_FILE states it"
    exit 1
  }
  [[ "$safe_addr" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "❌ Refusing to deploy — the Safe step printed no address: $safe_addr"; exit 1; }
  if [ -n "${DAO_WALLET:-}" ] && [ "$(printf '%s' "$DAO_WALLET" | tr 'A-F' 'a-f')" != "$(printf '%s' "$safe_addr" | tr 'A-F' 'a-f')" ]; then
    echo "❌ Refusing to deploy — DAO_WALLET=$DAO_WALLET is not the treasury's Safe $safe_addr;"
    echo "   unset it, or state the Safe you mean under treasurySafe in the expectations file."
    exit 1
  fi
  export DAO_WALLET="$safe_addr"
}

# ── The scan window's first block ────────────────────────────────────────────
# Read BEFORE broadcasting, so it is at or below every contract's creation
# block. Frontends read events from here (NEXT_PUBLIC_DEPLOYMENT_BLOCK) —
# public gateways cap eth_getLogs ranges, and a from-genesis scan of a real
# network never loads. Sets DEPLOYMENT_BLOCK.
read_deployment_block() {
  DEPLOYMENT_BLOCK=$(cast block-number --rpc-url "$RPC_URL")
  echo "📝 Running forge script (deployment block $DEPLOYMENT_BLOCK)..."
}

# ── The broadcast ────────────────────────────────────────────────────────────
# --slow: wait for each transaction's receipt before sending the next — see
# deploy-local.sh's identical rationale (nonce-tracking race under
# pipelined broadcast). Verification runs after the record is written
# (verify_record), never inside forge: a verification failure must not lose
# the record of transactions that landed.
# The output is printed whether forge succeeds or fails: under `set -e` a
# failing forge would otherwise exit the wrapper with its output unseen.
# FORGE_GAS_MULTIPLIER (percent) widens forge's gas limits: forge sizes each
# transaction from its own local simulation, and a live chain whose fork
# charges more for the same creation runs the transaction out of gas at
# forge's default 130 — a failed creation that still costs its gas.
# FORGE_SKIP_SIMULATION=1 goes further: forge skips its own simulation and
# takes the node's eth_estimateGas for every transaction, so a chain whose
# rules forge's EVM does not model (Sepolia under Glamsterdam charges about
# seven times forge's figure for a creation) sizes its own transactions;
# pair it with a small multiplier so the largest creation stays under the
# per-transaction gas cap. Sets FORGE_OUT.
run_forge_script() { # <script path:contract>
  FORGE_OUT=$(forge script "$1" \
      --rpc-url "$RPC_URL" \
      --broadcast --slow --via-ir \
      ${FORGE_GAS_MULTIPLIER:+--gas-estimate-multiplier "$FORGE_GAS_MULTIPLIER"} ${FORGE_SKIP_SIMULATION:+--skip-simulation} 2>&1) || { echo "$FORGE_OUT"; echo "❌ forge script failed — see its output above"; exit 1; }
  echo "$FORGE_OUT"
}

# ── Parse addresses from the script's NEXT_PUBLIC_* summary block ──────────
# Also the genesis balances the script prints from its one allocation
# (FLORIN_GENESIS_*_WEI), which the read-back expects on the chain. A line
# that is missing reads as empty, so the refusal below (or the read-back's)
# names it; under `set -e` a failing grep would end the wrapper unexplained.
printed_address() { echo "$FORGE_OUT" | grep "$1" | grep -oE '0x[0-9a-fA-F]+' || true; }
printed_number() { echo "$FORGE_OUT" | grep "$1" | grep -oE '[0-9]+$' || true; }
parse_stack_addresses() {
  CORE_ADDR=$(printed_address 'NEXT_PUBLIC_FIGARO_CORE=')
  ATTESTATION_ADDR=$(printed_address 'NEXT_PUBLIC_ATTESTATION_COORDINATOR=')
  CLAUSE_ADDR=$(printed_address 'NEXT_PUBLIC_CLAUSE_REGISTRY=')
  ASSEMBLY_ADDR=$(printed_address 'NEXT_PUBLIC_PROCESS_REGISTRY=')
  AGREEMENT_ADDR=$(printed_address 'NEXT_PUBLIC_AGREEMENT_REGISTRY=')
  MEMBERS_ADDR=$(printed_address 'NEXT_PUBLIC_MEMBERS_REGISTRY=')
  FLORIN_TOKEN_ADDR=$(printed_address 'NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS=')
  USAGE_COUNTER_ADDR=$(printed_address 'NEXT_PUBLIC_USAGE_COUNTER=')
  RPGF_MINTER_ADDR=$(printed_address 'NEXT_PUBLIC_RPGF_MINTER=')
  BATCH_VERIFIER_ADDR=$(printed_address 'NEXT_PUBLIC_BATCH_VERIFIER=')
  SWAP_COORD_ADDR=$(printed_address 'NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR=')
  GENESIS_FOUNDER_WEI=$(printed_number 'FLORIN_GENESIS_FOUNDER_WEI=')
  GENESIS_SUPPORTERS_WEI=$(printed_number 'FLORIN_GENESIS_SUPPORTERS_WEI=')
  GENESIS_DAO_WEI=$(printed_number 'FLORIN_GENESIS_DAO_WEI=')

  if [ -z "$CORE_ADDR" ]; then
    echo "❌ Could not parse FigaroCore address from forge output. Aborting record write."
    echo "   (The broadcast above may still have succeeded or partially succeeded —"
    echo "   check the forge output and the chain directly before retrying.)"
    exit 1
  fi
}

# ── Guard 5: read the wiring back from the chain ────────────────────────────
# Nothing in the stack can be upgraded or re-parameterized, so the deploy is
# the one moment a wrong immutable is cheap to catch. Every binding below is
# read from the deployed contracts and compared with what the wrapper was
# given; a mismatch prints the addresses (the broadcast has happened) and
# refuses to write the record. test/script/DeployWiringTest.t.sol runs the
# same read-back, and more, against the scripts in Foundry. Both chains run
# this one guard: the full stack through read_back_stack_wiring, the Sepolia
# pair redeploy through read_back_pair_wiring.
lower() { echo "$1" | tr '[:upper:]' '[:lower:]'; }
expect_eq() { # label, got, want
  if [ "$(lower "$2")" != "$(lower "$3")" ]; then
    echo "❌ wiring: $1 reads $2, expected $3"
    WIRING_FAIL=1
  else
    echo "   ✓ $1"
  fi
}
read_call() { cast call --rpc-url "$RPC_URL" "$1" "$2" "${@:3}"; }

# The pair's bindings: the verifier's three, the counter's six. Reads
# BATCH_VERIFIER_ADDR, USAGE_COUNTER_ADDR, CORE_ADDR, MEMBERS_ADDR,
# CLAUSE_ADDR, ASSEMBLY_ADDR, AGREEMENT_ADDR; sets PROGRAM_VKEY_ONCHAIN.
_expect_pair_wiring() {
  expect_eq "batchVerifier.usageCounter()"  "$(read_call "$BATCH_VERIFIER_ADDR" 'usageCounter()(address)')"   "$USAGE_COUNTER_ADDR"
  expect_eq "batchVerifier.verifier()"       "$(read_call "$BATCH_VERIFIER_ADDR" 'verifier()(address)')"       "$SP1_VERIFIER"
  PROGRAM_VKEY_ONCHAIN=$(read_call "$BATCH_VERIFIER_ADDR" 'programVKey()(bytes32)')
  expect_eq "batchVerifier.programVKey()"    "$PROGRAM_VKEY_ONCHAIN"    "$SP1_PROGRAM_VKEY"
  expect_eq "usageCounter.batchVerifier()"   "$(read_call "$USAGE_COUNTER_ADDR" 'batchVerifier()(address)')"   "$BATCH_VERIFIER_ADDR"
  expect_eq "usageCounter.core()"            "$(read_call "$USAGE_COUNTER_ADDR" 'core()(address)')"            "$CORE_ADDR"
  expect_eq "usageCounter.members()"         "$(read_call "$USAGE_COUNTER_ADDR" 'members()(address)')"         "$MEMBERS_ADDR"
  expect_eq "usageCounter.clauses()"         "$(read_call "$USAGE_COUNTER_ADDR" 'clauses()(address)')"         "$CLAUSE_ADDR"
  expect_eq "usageCounter.processDesigns()"  "$(read_call "$USAGE_COUNTER_ADDR" 'processDesigns()(address)')"      "$ASSEMBLY_ADDR"
  expect_eq "usageCounter.agreements()"      "$(read_call "$USAGE_COUNTER_ADDR" 'agreements()(address)')"      "$AGREEMENT_ADDR"
}

# The full stack: the pair, then the compositions, the minter and the
# florin's genesis. A wrapper may define read_back_chain_extra for checks of
# its own, run in the same pass.
read_back_stack_wiring() {
  echo ""
  echo "🔎 Reading the wiring back from chain $ACTUAL_CHAIN_ID ..."
  WIRING_FAIL=0
  _expect_pair_wiring
  expect_eq "attestation.core()"             "$(read_call "$ATTESTATION_ADDR" 'core()(address)')"              "$CORE_ADDR"
  expect_eq "swapCoordinator.figaroCore()"   "$(read_call "$SWAP_COORD_ADDR" 'figaroCore()(address)')"         "$CORE_ADDR"
  expect_eq "swapCoordinator.permit2()"      "$(read_call "$SWAP_COORD_ADDR" 'permit2()(address)')"            "$PERMIT2"
  expect_eq "swapCoordinator.router()"       "$(read_call "$SWAP_COORD_ADDR" 'router()(address)')"             "$SWAP_ROUTER"
  expect_eq "rpgfMinter.florin()"            "$(read_call "$RPGF_MINTER_ADDR" 'florin()(address)')"            "$FLORIN_TOKEN_ADDR"
  expect_eq "rpgfMinter.counter()"           "$(read_call "$RPGF_MINTER_ADDR" 'counter()(address)')"           "$USAGE_COUNTER_ADDR"
  expect_eq "rpgfMinter.clauses()"           "$(read_call "$RPGF_MINTER_ADDR" 'clauses()(address)')"           "$CLAUSE_ADDR"
  expect_eq "rpgfMinter.processDesigns()"    "$(read_call "$RPGF_MINTER_ADDR" 'processDesigns()(address)')"        "$ASSEMBLY_ADDR"
  expect_eq "rpgfMinter.agreements()"        "$(read_call "$RPGF_MINTER_ADDR" 'agreements()(address)')"        "$AGREEMENT_ADDR"
  expect_eq "florin.deployerMintRenounced()" "$(read_call "$FLORIN_TOKEN_ADDR" 'deployerMintRenounced()(bool)')" "true"
  expect_eq "florin.balanceOf(founder)"      "$(read_call "$FLORIN_TOKEN_ADDR" 'balanceOf(address)(uint256)' "$FOUNDER_WALLET" | awk '{print $1}')"    "$GENESIS_FOUNDER_WEI"
  expect_eq "florin.balanceOf(supporters)"   "$(read_call "$FLORIN_TOKEN_ADDR" 'balanceOf(address)(uint256)' "$SUPPORTERS_WALLET" | awk '{print $1}')" "$GENESIS_SUPPORTERS_WEI"
  expect_eq "florin.balanceOf(dao)"          "$(read_call "$FLORIN_TOKEN_ADDR" 'balanceOf(address)(uint256)' "$DAO_WALLET" | awk '{print $1}')"        "$GENESIS_DAO_WEI"
  if declare -F read_back_chain_extra > /dev/null; then
    read_back_chain_extra
  fi

  if [ "$WIRING_FAIL" != "0" ]; then
    echo ""
    echo "❌ The deployed wiring does not match what this script was given. The"
    echo "   broadcast above has happened; these are the addresses it produced:"
    echo "   core=$CORE_ADDR attestation=$ATTESTATION_ADDR clauses=$CLAUSE_ADDR"
    echo "   assemblies=$ASSEMBLY_ADDR agreements=$AGREEMENT_ADDR members=$MEMBERS_ADDR florin=$FLORIN_TOKEN_ADDR"
    echo "   usageCounter=$USAGE_COUNTER_ADDR rpgfMinter=$RPGF_MINTER_ADDR"
    echo "   batchVerifier=$BATCH_VERIFIER_ADDR swapCoordinator=$SWAP_COORD_ADDR"
    echo "   No record is written; a stack with a wrong immutable is redeployed, never recorded."
    exit 1
  fi
}

# The pair alone, against the live stack's addresses.
read_back_pair_wiring() {
  echo ""
  echo "🔎 Reading the wiring back from chain $ACTUAL_CHAIN_ID ..."
  WIRING_FAIL=0
  _expect_pair_wiring
  if [ "$WIRING_FAIL" != "0" ]; then
    echo ""
    echo "❌ The redeployed pair's wiring does not match what this script was given."
    echo "   The broadcast above has happened; these are the addresses it produced:"
    echo "   usageCounter=$USAGE_COUNTER_ADDR batchVerifier=$BATCH_VERIFIER_ADDR"
    echo "   No record is updated; a pair with a wrong immutable is redeployed, never recorded."
    exit 1
  fi
}

# ── Where the record goes ────────────────────────────────────────────────────
# A FORK REHEARSAL (SKIP_VERIFY=1) must never clobber the real record — an
# Anvil fork keeps the chain's id, so without this branch a rehearsal writes
# fork addresses over the deployed truth. RECORD_DIR names the directory
# instead. Sets DEPLOY_DIR.
select_record_dir() {
  if [ "${SKIP_VERIFY:-}" = "1" ]; then
    DEPLOY_DIR="${RECORD_DIR:-${TMPDIR:-/tmp}/figaro-rehearsal-deployments}"
    echo ""
    echo "ℹ️  Fork rehearsal — record diverted to $DEPLOY_DIR (deployments/ untouched)"
  else
    DEPLOY_DIR="${RECORD_DIR:-$DEPLOY_DIR}"
  fi
}
