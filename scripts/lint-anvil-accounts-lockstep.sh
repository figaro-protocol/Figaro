#!/usr/bin/env bash
# lint-anvil-accounts-lockstep.sh — the anvil account count is ONE number in FOUR
# places: devup.sh's launch flag, CI's launch flag (CI starts its OWN anvil), and
# the two index-aligned arrays in anvilAccounts.ts. Drift starves the highest-index
# spec wallets of launch ETH and the failure surfaces as a confusing mid-spec
# timeout, far from the cause. It has happened TWICE (2026-07-23 CI at 20 after
# the 34 bump; 2026-07-31 CI at 34 after the 36 bump) — hence a guard, per the
# escalate-recurring rule. Whole-tree: certifies state, not the staged diff.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"

DEVUP=$(grep -oE '\--accounts [0-9]+' "$ROOT/scripts/devup.sh" | head -1 | awk '{print $2}')
CI=$(grep -oE '\--accounts [0-9]+' "$ROOT/.github/workflows/devnet-e2e-ci.yml" | head -1 | awk '{print $2}')
ADDRS=$(grep -cE "^\s*'0x[0-9a-fA-F]{40}'," "$ROOT/frontend/tests/anvilAccounts.ts")
KEYS=$(grep -cE "^\s*'0x[0-9a-f]{64}'," "$ROOT/frontend/tests/anvilAccounts.ts")

if [[ "$DEVUP" != "$CI" || "$DEVUP" != "$ADDRS" || "$DEVUP" != "$KEYS" ]]; then
  echo "✖ anvil account count out of lockstep:"
  echo "    scripts/devup.sh --accounts          $DEVUP"
  echo "    devnet-e2e-ci.yml --accounts         $CI"
  echo "    anvilAccounts.ts ANVIL_ACCOUNTS      $ADDRS entries"
  echo "    anvilAccounts.ts ANVIL_KEYS          $KEYS entries"
  echo "  One number, four places — bump ALL of them together"
  echo "  (reference_e2e_wallet_index_allocation owns the rule)."
  exit 1
fi

echo "[anvil-accounts] in lockstep ($DEVUP across devup, CI, and both arrays)"
