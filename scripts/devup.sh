#!/usr/bin/env bash
#
# devup.sh — one command to a working local devnet. Idempotent.
#
# Brings up everything the devnet e2e (and manual dev) needs, in order:
#   1. IPFS (Kubo, Docker)   — agreement / branding pinning
#   2. Anvil (:8545)         — the chain
#   3. Figaro protocol stack — scripts/deploy-local.sh   (skipped if already deployed)
#
# Does NOT start a dev server: Playwright's `devnet` project starts its own on
# :3100, and a `npm run dev` on :3000 is yours to manage.
#
# Usage:
#   ./scripts/devup.sh                      # full devnet
#   FORCE_REDEPLOY=1 ./scripts/devup.sh     # redeploy protocol even if present

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"

note() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }

# ── 0. SDK dist ─────────────────────────────────────────────────────────────
# The frontend executes sdk/dist (file:../sdk + exports map), and tsc never
# deletes outputs of deleted sources — a stale dist silently ships deleted
# APIs into every build and poisons audits that read it. Clean-rebuild every
# devup (the build script rm -rfs dist first; ~seconds, idempotent).
note "SDK (@figaro/sdk dist)"
npm --prefix "$REPO_ROOT/sdk" run build --silent
echo "  rebuilt sdk/dist from src"

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
    nohup anvil --port 8545 --accounts 20 >/tmp/figaro-anvil.log 2>&1 &
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
    DEPLOY_SKIPPED=1
else
    bash scripts/deploy-local.sh
    DEPLOY_SKIPPED=0
fi

# ── 4. Clauses — pin specs to IPFS + anchor on ClauseRegistry ────────────────
# deploy-local.sh now populates clauses itself (the single clause-population path,
# same script prod/testnet/mainnet use). This step is therefore only needed when the
# deploy above was SKIPPED (already-deployed path) — it self-heals a registry whose
# clauses went missing. Idempotent: a clause already on the registry is skipped.
if [[ "${DEPLOY_SKIPPED:-0}" == "1" ]]; then
    note "Clauses (pin → IPFS, anchor → ClauseRegistry)"
    (cd frontend && node scripts/populate-clauses.mjs)
fi

note "devnet ready"
echo "  chain     : $RPC_URL"
echo "  contracts : frontend/.env.local  (+ .deployments/local.json)"
echo "  run e2e   : npm --prefix frontend run test:e2e:devnet"
