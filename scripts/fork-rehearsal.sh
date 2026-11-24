#!/usr/bin/env bash
# The fork rehearsal (docs/RELEASE_READINESS.md Task 13, rule 2): the whole
# deploy and the whole genesis seeding against an Anvil fork of the target
# chain, then what must hold, checked — before anything is broadcast for real.
#
#   RELEASE_COMMIT=<full sha> FORK_URL=<keyed RPC of the target chain> scripts/fork-rehearsal.sh
#
# Before anything else, scripts/check-release-revision.mjs: the checkout must
# be clean and must build what RELEASE_COMMIT builds. A missing RELEASE_COMMIT
# refuses. The wrapper it runs checks the same revision again and writes it into the
# deployment record.
#
# The chain is the one FORK_URL answers for, and every chain value comes from
# that chain's own files: the wrapper (scripts/deploy-sepolia.sh for 11155111,
# scripts/deploy-mainnet.sh for 1), the expectations file
# deployments/<chainId>.expected.json (the wallets, the guest key, the gateway,
# the registration plan), and the current record deployments/<chainId>.json
# when there is one (the swap router and quoter). Any of them is overridden by
# its environment variable, the wrapper's own names: FOUNDER_WALLET,
# SUPPORTERS_WALLET, SP1_VERIFIER_GATEWAY,
# SP1_PROGRAM_VKEY (default: the key this checkout's relay prints), SWAP_ROUTER,
# SWAP_QUOTER, PUBLIC_RPC_URL. The wrapper sets the treasury's Safe and the
# rewards schedule's start itself.
#
# The steps, each stopping the rehearsal when it fails:
#   1. start the fork (FORK_PORT, default 8546) and give the deployer gas;
#   2. run the wrapper on it with SKIP_VERIFY=1, the record written under
#      REHEARSAL_DIR (deployments/ is never touched);
#   3. scripts/check-deployment.mjs before any registration: everything holds
#      but the registrations (each "not registered" is expected; any other
#      failure stops the rehearsal);
#   4. the seeding, in the plan's order (scripts/seed/seed.sh): the plan, the
#      vault's stakes, the vault's clauses, the founder's clauses, agreements and
#      assemblies, then each member profile the plan names;
#   5. scripts/check-deployment.mjs again: it must exit 0.
#
# Signers. With the real devices (FOUNDER_LEDGER_HD_PATH, DAO_OPERATOR_KEY,
# PRIVATE_KEY: the inputs seed.sh names) the rehearsal signs as the broadcast
# will. Without them, IMPERSONATE=1 (the default when no FOUNDER_LEDGER_HD_PATH
# is set) has the fork sign for every wallet the plan names, at its real
# address, so the plan, the keys and the checks are rehearsed exactly and only
# the device taps are not. PRIVATE_KEY unset deploys from a throwaway key the
# fork funds: it sends the deploy and pays its gas on the fork, and it is not
# the expectations file's deployer wallet, so it is not an owner of the vault.
# The vault is the treasury's Safe, which the wrapper creates with the owners
# and threshold the expectations file states (scripts/safe-treasury.mjs).
# VAULT_OWNER_KEYS defaults to PRIVATE_KEY. Under IMPERSONATE=1 the seeding's
# vault steps read the Safe's owners and threshold from the Safe itself, leave
# out a key that is not an owner with a line that says so, and impersonate as
# many owners as the threshold still needs, the founder first; the first
# signer left sends execTransaction, the others approveHash. With the real
# deploy key, which is an owner, that key executes and the founder approves,
# the shape of the broadcast. Under IMPERSONATE=1 every wallet the
# expectations file names gets gas on the fork before the seeding.
#
#   RELEASE_COMMIT  required; the full sha of the release revision
#   FORK_URL        required; never printed
#   FORK_PORT       default 8546
#   FORK_CUPS       default 100; the compute units a second the fork asks of FORK_URL
#   REHEARSAL_DIR   default ${TMPDIR:-/tmp}/figaro-fork-rehearsal-<chainId>
#   NEXT_PUBLIC_IPFS_API_URL / IPFS_PIN_SERVICE_JWT   where the seeding pins
#                   (default: the local Kubo node, http://127.0.0.1:5001)
#   IPFS_GATEWAY_URL  read back each member profile (default http://127.0.0.1:8080)
#   STOP_AFTER      deploy | check | seed — stop after that step (default: run all)
#
# The fork is stopped when the rehearsal ends. Its output is written to
# REHEARSAL_DIR/anvil.log, which can carry the fork URL: it is never printed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# ── 0. The release revision, first: the rehearsal runs what the broadcast will ──
node "$REPO_ROOT/scripts/check-release-revision.mjs" "${RELEASE_COMMIT:-}" || {
  echo "❌ Refusing to rehearse: this checkout is not the release revision (RELEASE_COMMIT)."
  exit 1
}
export RELEASE_COMMIT
: "${FORK_URL:?FORK_URL (a keyed RPC of the target chain) is required}"
CHAIN_ID=$(cast chain-id --rpc-url "$FORK_URL")
FORK_PORT="${FORK_PORT:-8546}"
FORK="http://127.0.0.1:$FORK_PORT"
REHEARSAL_DIR="${REHEARSAL_DIR:-${TMPDIR:-/tmp}/figaro-fork-rehearsal-$CHAIN_ID}"
EXPECTED="$REPO_ROOT/deployments/$CHAIN_ID.expected.json"
CURRENT="$REPO_ROOT/deployments/$CHAIN_ID.json"
case "$CHAIN_ID" in
  11155111) WRAPPER="$REPO_ROOT/scripts/deploy-sepolia.sh"; export SEPOLIA_DEPLOY_CONFIRM=yes ;;
  1)        WRAPPER="$REPO_ROOT/scripts/deploy-mainnet.sh"; export MAINNET_DEPLOY_CONFIRM=yes ;;
  *) echo "❌ chain $CHAIN_ID has no deploy wrapper"; exit 1 ;;
esac
[ -f "$EXPECTED" ] || { echo "❌ no expectations file $EXPECTED"; exit 1; }
mkdir -p "$REHEARSAL_DIR/records"
RECORD="$REHEARSAL_DIR/records/$CHAIN_ID.json"
rm -f "$RECORD"

step() { echo ""; echo "━━ $* ━━"; }
exp() { jq -r "$1 // empty" "$EXPECTED"; }
cur() { [ -f "$CURRENT" ] && jq -r "$1 // empty" "$CURRENT" || true; }
stop_here() { [ "${STOP_AFTER:-}" = "$1" ] && { echo ""; echo "stopped after $1 (STOP_AFTER)"; exit 0; } || true; }

# ── 1. The fork ─────────────────────────────────────────────────────────────
step "1. an Anvil fork of chain $CHAIN_ID on port $FORK_PORT"
if cast chain-id --rpc-url "$FORK" > /dev/null 2>&1; then
  echo "❌ something already answers on $FORK; choose another FORK_PORT"; exit 1
fi
# The fork paces what it asks of the upstream node (FORK_CUPS, compute units a
# second) and retries a refusal with a growing wait: with the pacing off, a
# deploy's burst of state reads is answered "Too Many Requests" by a keyed
# node on a metered plan, and the deploy fails on a read.
anvil --quiet --fork-url "$FORK_URL" --port "$FORK_PORT" --chain-id "$CHAIN_ID" \
  --compute-units-per-second "${FORK_CUPS:-100}" --retries 10 --fork-retry-backoff 1500 > "$REHEARSAL_DIR/anvil.log" 2>&1 &
ANVIL_PID=$!
trap 'kill "$ANVIL_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do cast chain-id --rpc-url "$FORK" > /dev/null 2>&1 && break; sleep 1; done
[ "$(cast chain-id --rpc-url "$FORK")" = "$CHAIN_ID" ] || { echo "❌ the fork did not start"; exit 1; }
echo "   fork at block $(cast block-number --rpc-url "$FORK")"

if [ -z "${PRIVATE_KEY:-}" ]; then
  PRIVATE_KEY="0x$(openssl rand -hex 32)"
  echo "   deployer: a throwaway key"
fi
export PRIVATE_KEY
DEPLOYER=$(cast wallet address --private-key "$PRIVATE_KEY")
GAS=0x56BC75E2D63100000 # 100 ETH, on the fork only
cast rpc anvil_setBalance "$DEPLOYER" "$GAS" --rpc-url "$FORK" > /dev/null
echo "   deployer $DEPLOYER funded on the fork"

# ── 2. The deploy, through the chain's own wrapper ─────────────────────────
step "2. the deploy ($(basename "$WRAPPER"), SKIP_VERIFY=1)"
export FOUNDER_WALLET="${FOUNDER_WALLET:-$(exp '.wallets.founder')}"
export SUPPORTERS_WALLET="${SUPPORTERS_WALLET:-$(exp '.wallets.supporters')}"
export SP1_VERIFIER_GATEWAY="${SP1_VERIFIER_GATEWAY:-$(exp '.batchVerifier.gateway')}"
# The key is this checkout's relay's, never the expectations file's own: the
# verifier the rehearsal deploys must be one a relay built here can prove on.
# When the file states another key, the rehearsal runs against a copy that
# states the relay's, and says so; a real deploy refuses until the file does.
export RELAY_BIN="${RELAY_BIN:-$REPO_ROOT/prover/target/release/sequencer}"
[ -x "$RELAY_BIN" ] || { echo "❌ no release relay at $RELAY_BIN: build it by the release recipe (scripts/prover-box/build-guest.sh, then build-sequencer.sh)"; exit 1; }
RELAY_KEY=$("$RELAY_BIN" --vkey | sed -n 's/^SP1_PROGRAM_VKEY=//p' | tail -1)
[[ "$RELAY_KEY" =~ ^0x[0-9a-fA-F]{64}$ ]] || { echo "❌ $RELAY_BIN --vkey printed no key"; exit 1; }
export SP1_PROGRAM_VKEY="${SP1_PROGRAM_VKEY:-$RELAY_KEY}"
STATED_KEY=$(exp '.batchVerifier.programVKey')
if [ "$(printf '%s' "$STATED_KEY" | tr 'A-F' 'a-f')" != "$(printf '%s' "$RELAY_KEY" | tr 'A-F' 'a-f')" ]; then
  jq --arg k "$RELAY_KEY" '.batchVerifier.programVKey = $k' "$EXPECTED" > "$REHEARSAL_DIR/expected.json"
  echo "   ⚠ $EXPECTED states the key ${STATED_KEY:-(none)}, and this checkout's relay holds $RELAY_KEY."
  echo "     The rehearsal runs against a copy that states the relay's key: $REHEARSAL_DIR/expected.json"
  echo "     A real deploy refuses until deployments/$CHAIN_ID.expected.json states the built key."
  EXPECTED="$REHEARSAL_DIR/expected.json"
fi
export EXPECTED_FILE="$EXPECTED"
export SP1_PROOF_MODE="${SP1_PROOF_MODE:-groth16}"
export SWAP_ROUTER="${SWAP_ROUTER:-$(cur .swapRouter)}"
export SWAP_QUOTER="${SWAP_QUOTER:-$(cur .swapQuoter)}"
export PUBLIC_RPC_URL="${PUBLIC_RPC_URL:-$(cur .rpcUrl)}"
export FORGE_GAS_MULTIPLIER="${FORGE_GAS_MULTIPLIER:-200}"
for v in FOUNDER_WALLET SUPPORTERS_WALLET SP1_VERIFIER_GATEWAY SP1_PROGRAM_VKEY SWAP_ROUTER; do
  [ -n "${!v}" ] || { echo "❌ $v: neither the environment nor the chain's files name it"; exit 1; }
done
SKIP_VERIFY=1 RECORD_DIR="$REHEARSAL_DIR/records" RPC_URL="$FORK" bash "$WRAPPER" > "$REHEARSAL_DIR/deploy.log" 2>&1 \
  || { echo "❌ the deploy failed; its whole output is $REHEARSAL_DIR/deploy.log"; exit 1; }
[ -f "$RECORD" ] || { echo "❌ the wrapper wrote no record at $RECORD"; exit 1; }
echo "   deployed; the wrapper's output is $REHEARSAL_DIR/deploy.log, the record $RECORD"
stop_here deploy

# ── 3. What holds before any registration ──────────────────────────────────
step "3. check-deployment before any registration (only the registrations may fail)"
set +e
RPC_URL="$FORK" node "$REPO_ROOT/scripts/check-deployment.mjs" "$RECORD" "$EXPECTED" --artifacts "$REPO_ROOT/out" > "$REHEARSAL_DIR/check-before.log" 2>&1
set -e
grep -qE '^[0-9]+ held, [0-9]+ did not\.' "$REHEARSAL_DIR/check-before.log" \
  || { echo "❌ check-deployment did not finish ($REHEARSAL_DIR/check-before.log):"; tail -5 "$REHEARSAL_DIR/check-before.log"; exit 1; }
UNEXPECTED=$(sed -n '/^What does not hold:/,$p' "$REHEARSAL_DIR/check-before.log" | grep '^  - ' | grep -v -E 'not registered|holds no live member stake' || true)
if [ -n "$UNEXPECTED" ]; then
  echo "❌ before the seeding, more than the registrations fails ($REHEARSAL_DIR/check-before.log):"
  echo "$UNEXPECTED"; exit 1
fi
echo "   every code, link, parameter, key and florin balance holds; $(grep -c '^  - ' "$REHEARSAL_DIR/check-before.log" || true) registration(s) wait for the seeding"
stop_here check

# ── 4. The seeding, in the plan's order ─────────────────────────────────────
step "4. the seeding (scripts/seed/seed.sh)"
if [ -z "${FOUNDER_LEDGER_HD_PATH:-}" ]; then export IMPERSONATE="${IMPERSONATE:-1}"; fi
export NEXT_PUBLIC_IPFS_API_URL="${NEXT_PUBLIC_IPFS_API_URL:-http://127.0.0.1:5001}"
# A key that is not an owner of the vault is left out on the fork (seed.sh vault_owners).
export VAULT_OWNER_KEYS="${VAULT_OWNER_KEYS:-$PRIVATE_KEY}"
SEED() { RPC_URL="$FORK" DEPLOYMENT_RECORD="$RECORD" EXPECTED="$EXPECTED" bash "$REPO_ROOT/scripts/seed/seed.sh" "$@"; }
# Each wallet that pays a stake on the fork gets gas and stakes there; the
# broadcast spends their own balances.
if [ "${IMPERSONATE:-}" = "1" ]; then
  for w in $(jq -r '.wallets | to_entries[] | select(.value | type == "string") | .value' "$EXPECTED"); do
    cast rpc anvil_setBalance "$w" "$GAS" --rpc-url "$FORK" > /dev/null
  done
fi
SEED plan > "$REHEARSAL_DIR/plan.txt" 2>&1 || { echo "❌ the plan has undecided entries ($REHEARSAL_DIR/plan.txt)"; exit 1; }
echo "   the written plan: $REHEARSAL_DIR/plan.txt"
for s in fund-vault vault-clauses founder; do
  SEED "$s" > "$REHEARSAL_DIR/seed-$s.log" 2>&1 || { echo "❌ seed $s failed ($REHEARSAL_DIR/seed-$s.log)"; exit 1; }
  echo "   seed $s: done ($REHEARSAL_DIR/seed-$s.log)"
done
for m in $(jq -r '.registrations.members // {} | keys[]' "$EXPECTED"); do
  SEED member "$m" > "$REHEARSAL_DIR/seed-member-$m.log" 2>&1 || { echo "❌ seed member $m failed ($REHEARSAL_DIR/seed-member-$m.log)"; exit 1; }
  echo "   seed member $m: done"
done
stop_here seed

# ── 5. What must hold after the seeding ─────────────────────────────────────
step "5. check-deployment after the seeding (must exit 0)"
if RPC_URL="$FORK" IPFS_GATEWAY_URL="${IPFS_GATEWAY_URL:-http://127.0.0.1:8080}" \
    node "$REPO_ROOT/scripts/check-deployment.mjs" "$RECORD" "$EXPECTED" --artifacts "$REPO_ROOT/out" > "$REHEARSAL_DIR/check-after.log" 2>&1; then
  echo "   $(grep -E '^[0-9]+ held' "$REHEARSAL_DIR/check-after.log")"
  echo ""
  echo "✅ The rehearsal holds: deploy, seeding and checks on a fork of chain $CHAIN_ID. Logs: $REHEARSAL_DIR"
else
  echo "❌ after the seeding, not everything holds ($REHEARSAL_DIR/check-after.log):"
  sed -n '/^What does not hold:/,$p' "$REHEARSAL_DIR/check-after.log"; exit 1
fi
