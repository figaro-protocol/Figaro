#!/usr/bin/env bash
#
# lint-no-base-chain.sh — DEPLOYMENT-TARGET FLOOR: no Coinbase Base chain wiring.
#
# Operator ruling 2026-07-23 (project_deployment_targets): deployment targets are
# Ethereum Sepolia → Ethereum mainnet FIRST — NOT Coinbase/Base. The repo config
# pointed at Base Sepolia for months and kept misleading agents into treating Base
# as the target; this guard makes the retarget permanent.
#
# FAIL — any of these in the live tree:
#   - a `base` / `baseSepolia` chain import from viem/chains or wagmi/chains
#   - a basescan.org explorer/verifier URL
#   - a `base_sepolia` / `base_mainnet` [etherscan] entry in foundry.toml
#   - the retired `base-sepolia` NEXT_PUBLIC_CHAIN value
#
# Scope: whole TRACKED tree under frontend/lib, frontend/app, scripts, docs, plus
# foundry.toml (certification of STATE, not just a diff — the diff-only scoping is
# how dead guards go unnoticed). git ls-files already excludes node_modules /
# .next* / test-results; archive-*/ and this guard itself are excluded explicitly.
# The word "base" in its ordinary sense (base URL, base class, …) is NOT matched —
# the bare-word check applies only to viem/wagmi chain-import lines.
#
# Exit: 0 clean, 1 on any violation.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

files=$(git ls-files frontend/lib frontend/app scripts docs foundry.toml 2>/dev/null |
    grep -vE '^archive-|/archive-|node_modules|\.next|test-results|scripts/lint-no-base-chain\.sh$')

# (1) Base chain identifiers: the viem/wagmi export names + the retired env value
#     + the foundry [etherscan] key + basescan explorer URLs.
PAT_ALWAYS='\bbaseSepolia\b|base-sepolia|base_sepolia|base_mainnet|[Bb]ase[Ss]can'
# (2) bare `base` chain import — only meaningful on a viem/wagmi chains import line.
PAT_CHAIN_IMPORT='(viem|wagmi)/chains'
PAT_BARE_BASE='([{,][[:space:]]*base[[:space:]]*[,}]|[{,][[:space:]]*base[[:space:]]+as[[:space:]])'

violations=0
for f in $files; do
    [[ -f "$f" ]] || continue
    hits=$(grep -nE "$PAT_ALWAYS" "$f" || true)
    import_hits=$(grep -nE "$PAT_CHAIN_IMPORT" "$f" | grep -E "$PAT_BARE_BASE" || true)
    all_hits="${hits}${hits:+$'\n'}${import_hits}"
    all_hits="${all_hits#$'\n'}"; all_hits="${all_hits%$'\n'}"
    if [[ -n "$all_hits" ]]; then
        echo "[no-base-chain] $f — Coinbase Base chain reference:"
        echo "$all_hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
done

if [[ "$violations" -gt 0 ]]; then
    echo ""
    echo "Deployment targets: Ethereum Sepolia → mainnet; NOT Base —"
    echo "project_deployment_targets ruling 2026-07-23. Use viem's sepolia/mainnet"
    echo "and api-sepolia.etherscan.io; the devnet (anvil, 31337) is unaffected."
    exit 1
fi
exit 0
