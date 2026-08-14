#!/usr/bin/env bash
# emit-abi-bundle.sh — the tracked ABI bundle for non-TS integrators.
#
# Emits abi/<Contract>.json (the bare ABI array, pretty-printed) for every
# contract named in the deployments/<chainId>.json record shape — the nine
# public-surface contracts an integrator without the TS SDK needs to speak to
# a deployment. Source of truth is the forge build artifact; this script only
# extracts, never edits. Run after `forge build`; pre-commit's
# lint-abi-bundle.sh fails the commit when the tracked bundle drifts from the
# artifacts.
#
#   ./scripts/emit-abi-bundle.sh            # writes abi/*.json
#   ./scripts/emit-abi-bundle.sh <outdir>   # writes elsewhere (the drift guard)

set -euo pipefail
cd "$(dirname "$0")/.."
OUT_DIR="${1:-abi}"

# The deployments-record surface (deployments/README.md), one artifact each.
CONTRACTS=(
    FigaroCore
    AttestationCoordinator
    ClauseRegistry
    MembersRegistry
    AssemblyRegistry
    FlorinToken
    UsageCounter
    RpgfMinter
    FigaroBatchVerifier
)

mkdir -p "$OUT_DIR"
for c in "${CONTRACTS[@]}"; do
    artifact="out/${c}.sol/${c}.json"
    if [ ! -f "$artifact" ]; then
        echo "❌ emit-abi-bundle: $artifact missing — run forge build first" >&2
        exit 1
    fi
    python3 - "$artifact" "$OUT_DIR/${c}.json" <<'PY'
import json, sys
artifact, dest = sys.argv[1], sys.argv[2]
with open(artifact) as f:
    abi = json.load(f)["abi"]
with open(dest, "w") as f:
    json.dump(abi, f, indent=2, sort_keys=False)
    f.write("\n")
PY
done
echo "[abi-bundle] emitted ${#CONTRACTS[@]} ABIs → $OUT_DIR/"
