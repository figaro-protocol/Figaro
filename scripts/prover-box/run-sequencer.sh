#!/usr/bin/env bash
# Start (or restart) the sequencer in real-Groth16 mode against RPC_TARGET —
# the box-local fork (default) for layer 2, or live Sepolia for the real
# settle. The batch pair arrives via BATCH_VERIFIER / USAGE_COUNTER (a
# fork-deployed validation pair, or the committed record's); registry
# addresses come from the record. SEQUENCER_PRIVATE_KEY arrives via the
# invocation environment — never written to disk.
#
# The full sequencer environment table is prover/sequencer/README.md's.
set -euo pipefail
: "${SEQUENCER_PRIVATE_KEY:?}" "${BATCH_VERIFIER:?}" "${USAGE_COUNTER:?}"
RPC_TARGET="${RPC_TARGET:-http://127.0.0.1:8546}"
REC="$HOME/Figaro/deployments/11155111.json"
addr() { python3 -c "import json;print(json.load(open('$REC'))['$1'])"; }

pkill -x sequencer 2>/dev/null || true
sleep 1

cd "$HOME/Figaro/prover"
RPC_URL="$RPC_TARGET" \
CHAIN_ID=11155111 \
FIGARO_CORE_ADDRESS="$BATCH_VERIFIER" \
BATCH_VERIFIER_ADDRESS="$BATCH_VERIFIER" \
USAGE_COUNTER_ADDRESS="$USAGE_COUNTER" \
CLAUSE_REGISTRY_ADDRESS="$(addr clauseRegistry)" \
ASSEMBLY_REGISTRY_ADDRESS="$(addr assemblyRegistry)" \
MEMBERS_REGISTRY_ADDRESS="$(addr membersRegistry)" \
SP1_PROVER=cpu \
SP1_PROOF_MODE=groth16 \
BATCH_INTERVAL_SECS=30 \
ARCHIVE_PATH="$HOME/sequencer-archive-$(date +%s).jsonl" \
LISTEN_ADDR=127.0.0.1:3001 \
RUST_LOG=figaro_sequencer=debug,info \
nohup ./target/release/sequencer > "$HOME/sequencer-current.log" 2>&1 &
echo "sequencer pid $!"
sleep 3
curl -sf http://127.0.0.1:3001/status && echo && echo SEQUENCER-UP
