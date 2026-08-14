#!/usr/bin/env bash
# lint-abi-bundle.sh — the tracked abi/ bundle must equal what the build emits.
#
# Re-emits the bundle into a temp dir (from the forge artifacts pre-commit
# just built) and diffs against the tracked abi/. A contract change that
# alters a public surface without re-running emit-abi-bundle.sh fails here —
# a stale tracked ABI is worse than none (an integrator codes against a
# surface the chain no longer has).

set -euo pipefail
cd "$(dirname "$0")/.."

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
./scripts/emit-abi-bundle.sh "$tmp" > /dev/null

if ! diff -rq abi "$tmp" > /dev/null 2>&1; then
    echo "❌ abi/ bundle drift — the tracked ABIs no longer match the build artifacts:"
    diff -rq abi "$tmp" | sed 's/^/   /' || true
    echo "   → run ./scripts/emit-abi-bundle.sh and stage the result"
    exit 1
fi
echo "[abi-bundle] clean — tracked ABIs match the build"
