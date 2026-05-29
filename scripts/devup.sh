#!/usr/bin/env bash
#
# devup.sh — one command to a working local devnet. Idempotent.
#
# Brings up everything the devnet e2e (and manual dev) needs, in order:
#   1. IPFS (Kubo, Docker)   — agreement / branding pinning
#   2. Anvil (:8545)         — the chain
#   3. Figaro protocol stack — scripts/deploy-local.sh   (skipped if already deployed)
#   4. Mock Kleros           — scripts/deploy-mock-kleros.sh
#
# Why both deploy scripts run here: Kleros is an EXTERNAL arbitration forum,
# not a Figaro contract, so it lives in its own deploy script by design (the
# protocol is provider-agnostic — see deploy-mock-kleros.sh). This wrapper
# runs both so no one has to remember the second one.
#
# Does NOT start a dev server: Playwright's `devnet` project starts its own on
# :3100, and a `npm run dev` on :3000 is yours to manage.
#
# Usage:
#   ./scripts/devup.sh                      # full devnet (protocol + Kleros)
#   SKIP_KLEROS=1 ./scripts/devup.sh        # protocol only
#   FORCE_REDEPLOY=1 ./scripts/devup.sh     # redeploy protocol even if present

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"

note() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }

# ── 1. IPFS (Kubo via Docker) ───────────────────────────────────────────────
note "IPFS (Kubo)"
if nc -z 127.0.0.1 5001 2>/dev/null; then
    echo "  already up on :5001"
elif command -v docker >/dev/null 2>&1 && docker start figaro-ipfs >/dev/null 2>&1; then
    echo "  started container figaro-ipfs"
else
    echo "  ⚠ :5001 down and no figaro-ipfs container — agreement pinning will fail."
    echo "    Start Kubo (Docker) yourself, then re-run. (Not auto-installed by design.)"
fi

# ── 2. Anvil ────────────────────────────────────────────────────────────────
note "Anvil"
if cast block-number --rpc-url "$RPC_URL" >/dev/null 2>&1; then
    echo "  already reachable at $RPC_URL"
else
    echo "  starting anvil (detached → /tmp/figaro-anvil.log)…"
    nohup anvil --port 8545 >/tmp/figaro-anvil.log 2>&1 &
    for _ in $(seq 1 40); do
        if cast block-number --rpc-url "$RPC_URL" >/dev/null 2>&1; then break; fi
        sleep 0.5
    done
    if ! cast block-number --rpc-url "$RPC_URL" >/dev/null 2>&1; then
        echo "  ❌ anvil did not come up — see /tmp/figaro-anvil.log"; exit 1
    fi
    echo "  up"
fi

# ── 3. Figaro protocol stack ─────────────────────────────────────────────────
note "Figaro protocol stack"
if [[ "${FORCE_REDEPLOY:-0}" != "1" ]] && (cd frontend && node scripts/verify-devnet-deployment.mjs) >/dev/null 2>&1; then
    echo "  already deployed (preflight passed) — skipping. FORCE_REDEPLOY=1 to override."
else
    bash scripts/deploy-local.sh
fi

# ── 4. Mock Kleros (external arbitration forum) ──────────────────────────────
if [[ "${SKIP_KLEROS:-0}" == "1" ]]; then
    note "Mock Kleros — SKIPPED (SKIP_KLEROS=1)"
else
    note "Mock Kleros"
    bash scripts/deploy-mock-kleros.sh
fi

note "devnet ready"
echo "  chain     : $RPC_URL"
echo "  contracts : frontend/.env.local  (+ .deployments/local.json)"
echo "  run e2e   : npm --prefix frontend run test:e2e:devnet"
