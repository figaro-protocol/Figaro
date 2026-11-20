#!/usr/bin/env bash
# Start (or restart) the sequencer in real-Groth16 mode against RPC_TARGET —
# the box-local fork (default) for layer 2, or the live chain for the real
# resolve. Every address comes from the deployment record of the chain
# RPC_TARGET answers for (DEPLOYMENT_RECORD, default
# $FIGARO_DIR/deployments/<chainId>.json): the batch pair (BATCH_VERIFIER /
# USAGE_COUNTER, which override it for a fork-deployed validation pair) and the
# registries. The relay rebuilds the state behind the verifier's root from the
# chain at every start (REBUILD_FROM_CHAIN=1), scanning from the record's
# deployment block, which is at or before the verifier's. The record must name
# the chain RPC_TARGET answers for; a mismatch refuses.
# SEQUENCER_PRIVATE_KEY arrives via the invocation environment — never
# written to disk. FIGARO_DIR names the checkout, the one provision.sh put at
# the release commit (default $HOME/Figaro); the binary is built there.
#
# The full sequencer environment table is prover/sequencer/README.md's.
set -euo pipefail
: "${SEQUENCER_PRIVATE_KEY:?}"
RPC_TARGET="${RPC_TARGET:-http://127.0.0.1:8546}"
FIGARO="${FIGARO_DIR:-$HOME/Figaro}"
CHAIN_ID=$(cast chain-id --rpc-url "$RPC_TARGET")
REC="${DEPLOYMENT_RECORD:-$FIGARO/deployments/$CHAIN_ID.json}"
[ -f "$REC" ] || { echo "no deployment record at $REC for chain $CHAIN_ID"; exit 1; }
addr() { python3 -c "import json;print(json.load(open('$REC'))['$1'])"; }
[ "$(addr chainId)" = "$CHAIN_ID" ] || { echo "$REC is chain $(addr chainId), RPC_TARGET is chain $CHAIN_ID"; exit 1; }
BATCH_VERIFIER="${BATCH_VERIFIER:-$(addr batchVerifier)}"
USAGE_COUNTER="${USAGE_COUNTER:-$(addr usageCounter)}"
LISTEN_ADDR="${LISTEN_ADDR:-127.0.0.1:3001}"

pkill -x sequencer 2>/dev/null || true
sleep 1

cd "$FIGARO/prover"
RPC_URL="$RPC_TARGET" \
FIGARO_CORE_ADDRESS="$BATCH_VERIFIER" \
BATCH_VERIFIER_ADDRESS="$BATCH_VERIFIER" \
USAGE_COUNTER_ADDRESS="$USAGE_COUNTER" \
CLAUSE_REGISTRY_ADDRESS="$(addr clauseRegistry)" \
PROCESS_REGISTRY_ADDRESS="$(addr processRegistry)" \
AGREEMENT_REGISTRY_ADDRESS="$(addr agreementRegistry)" \
MEMBERS_REGISTRY_ADDRESS="$(addr membersRegistry)" \
SP1_PROVER="${SP1_PROVER:-cpu}" \
SP1_PROOF_MODE="${SP1_PROOF_MODE:-groth16}" \
BATCH_INTERVAL_SECS="${BATCH_INTERVAL_SECS:-30}" \
STATE_PATH="${STATE_PATH:-$HOME/sequencer-state-$BATCH_VERIFIER.json}" \
REBUILD_FROM_CHAIN=1 \
REBUILD_FROM_BLOCK="${REBUILD_FROM_BLOCK:-$(addr deploymentBlock)}" \
LISTEN_ADDR="$LISTEN_ADDR" \
RUST_LOG=figaro_sequencer=debug,info \
nohup "${SEQUENCER_BIN:-./target/release/sequencer}" > "${SEQUENCER_LOG:-$HOME/sequencer-current.log}" 2>&1 &
echo "sequencer pid $!"
for _ in $(seq 1 "${READY_WAIT_SECS:-600}"); do
  if curl -sf "http://$LISTEN_ADDR/status" > /dev/null; then
    curl -sf "http://$LISTEN_ADDR/status" && echo && echo SEQUENCER-UP
    exit 0
  fi
  sleep 1
done
echo "the sequencer did not answer on $LISTEN_ADDR"; exit 1
