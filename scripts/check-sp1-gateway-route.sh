#!/usr/bin/env bash
#
# check-sp1-gateway-route.sh — deploy PREFLIGHT: the SP1 verifier gateway a
# FigaroBatchVerifier is about to bind (immutably) must ROUTE the proof form
# the sequencer will produce, for the sp1-sdk version the prover is locked to.
#
# Why: Succinct runs ONE gateway per proof form per chain (Groth16 and PLONK —
# `contracts/deployments/<chainId>.json` in succinctlabs/sp1-contracts names
# both, plus retired `OLD_*` gateways), and each gateway routes by the first
# four bytes of the proof — the verifier-version selector
# (`bytes4(SP1Verifier<Form>.VERIFIER_HASH())`). Bind the wrong gateway and
# every real proof reverts `RouteNotFound`; the pointer is immutable and
# UsageCounter is bound to the verifier, so the whole stack redeploys. The
# Sepolia stack of 2026-08-14 bound the OLD PLONK gateway (PLONK routes only,
# no Groth16) — this guard is that lesson.
#
# Inputs (env): SP1_VERIFIER_GATEWAY, RPC_URL; SP1_PROOF_MODE (groth16|plonk,
# default groth16); the sp1-sdk version is read from prover/Cargo.lock.
# Network: fetches the verifier source + deployment record from GitHub; fails
# CLOSED when unreachable (a deploy is not the moment to guess).
# Exit: 0 routed; 1 not routed / mismatched / unverifiable.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

: "${SP1_VERIFIER_GATEWAY:?SP1_VERIFIER_GATEWAY not set}"
: "${RPC_URL:?RPC_URL not set}"
MODE="${SP1_PROOF_MODE:-groth16}"
case "$MODE" in
  groth16|Groth16|GROTH16) FORM=Groth16; KEY=SP1_VERIFIER_GATEWAY_GROTH16 ;;
  plonk|Plonk|PLONK)       FORM=Plonk;   KEY=SP1_VERIFIER_GATEWAY_PLONK ;;
  *) echo "❌ SP1_PROOF_MODE must be groth16 or plonk (got '$MODE')"; exit 1 ;;
esac

# The proof's selector is the CIRCUIT version the locked SP1 prover embeds
# (`SP1_CIRCUIT_VERSION` at the SP1 repo tag of that version — e.g. sdk 6.3.1
# and 6.4.0 both embed v6.1.0), NOT the sdk's own version and NOT `v<major>.0.0`
# (that guess would have pointed the 6.x line at the v6.0.0 verifier: wrong).
PROVER_VERSION=$(awk '/^name = "sp1-prover"$/{getline; sub(/version = "/,""); sub(/"/,""); print; exit}' "$ROOT/prover/Cargo.lock")
[ -n "$PROVER_VERSION" ] || { echo "❌ cannot read the sp1-prover version from prover/Cargo.lock"; exit 1; }
CONTRACTS_TAG=$(curl -sf -m 30 "https://raw.githubusercontent.com/succinctlabs/sp1/v${PROVER_VERSION}/SP1_CIRCUIT_VERSION" | tr -d '[:space:]') \
  || { echo "❌ cannot read SP1_CIRCUIT_VERSION for sp1 v${PROVER_VERSION} from the SP1 repo — refusing to guess"; exit 1; }
[ -n "$CONTRACTS_TAG" ] || { echo "❌ empty SP1_CIRCUIT_VERSION for sp1 v${PROVER_VERSION}"; exit 1; }
BASE="https://raw.githubusercontent.com/succinctlabs/sp1-contracts/main"

echo "🔎 SP1 gateway route preflight: sp1 $PROVER_VERSION embeds circuit $CONTRACTS_TAG → verifiers $CONTRACTS_TAG, form $FORM"
SRC=$(curl -sf -m 30 "$BASE/contracts/src/$CONTRACTS_TAG/SP1Verifier${FORM}.sol") \
  || { echo "❌ cannot fetch SP1Verifier${FORM}.sol ($CONTRACTS_TAG) from sp1-contracts — refusing to guess"; exit 1; }
VERIFIER_HASH=$(printf '%s' "$SRC" | awk '/function VERIFIER_HASH/{f=1} f && match($0,/0x[0-9a-fA-F]{64}/){print substr($0,RSTART,RLENGTH); exit}')
[ -n "$VERIFIER_HASH" ] || { echo "❌ VERIFIER_HASH not found in SP1Verifier${FORM}.sol"; exit 1; }
SELECTOR="${VERIFIER_HASH:0:10}"

CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL")
RECORD=$(curl -sf -m 30 "$BASE/contracts/deployments/${CHAIN_ID}.json") \
  || { echo "❌ cannot fetch Succinct's deployment record for chain $CHAIN_ID — refusing to guess"; exit 1; }
CANONICAL=$(printf '%s' "$RECORD" | awk -v k="\"$KEY\"" '$0 ~ k {match($0,/0x[0-9a-fA-F]{40}/); print substr($0,RSTART,RLENGTH); exit}')
echo "   gateway (env)      = $SP1_VERIFIER_GATEWAY"
echo "   gateway (Succinct) = ${CANONICAL:-<none for $KEY on chain $CHAIN_ID>} ($KEY)"
echo "   verifier hash      = $VERIFIER_HASH  selector $SELECTOR"

lower() { printf '%s' "$1" | tr 'A-F' 'a-f'; }
# The ROUTE is the truth (the record's names lag: on Sepolia older PLONK
# verifiers are routed on the record's OLD_ PLONK gateway, not its current one).
ROUTE=$(cast call "$SP1_VERIFIER_GATEWAY" "routes(bytes4)(address,bool)" "$SELECTOR" --rpc-url "$RPC_URL")
ROUTE_ADDR=$(printf '%s\n' "$ROUTE" | sed -n 1p)
ROUTE_FROZEN=$(printf '%s\n' "$ROUTE" | sed -n 2p)
echo "   route              = $ROUTE_ADDR frozen=$ROUTE_FROZEN"
if [ "$(lower "$ROUTE_ADDR")" = "0x0000000000000000000000000000000000000000" ]; then
  echo "❌ the gateway routes NO verifier for $FORM $CONTRACTS_TAG (selector $SELECTOR) — every real proof would revert RouteNotFound."
  printf '%s' "$RECORD" | grep -i "$(lower "${SP1_VERIFIER_GATEWAY:2}")" | sed 's/^/   (the env address is named in Succinct'"'"'s record as: /; s/$/)/' || true
  exit 1
fi
if [ "$ROUTE_FROZEN" = "true" ]; then
  echo "❌ the $FORM $CONTRACTS_TAG route is FROZEN on this gateway."
  exit 1
fi
if [ -n "$CANONICAL" ] && [ "$(lower "$CANONICAL")" != "$(lower "$SP1_VERIFIER_GATEWAY")" ]; then
  echo "⚠️  routed, but SP1_VERIFIER_GATEWAY is not the address Succinct's record names $KEY on chain $CHAIN_ID:"
  printf '%s' "$RECORD" | grep -i "$(lower "${SP1_VERIFIER_GATEWAY:2}")" | sed 's/^/   the env address is named: /' || echo "   the env address is not in the record at all"
fi
echo "✅ gateway routes $FORM $CONTRACTS_TAG → $ROUTE_ADDR"
