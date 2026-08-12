#!/usr/bin/env bash
#
# devdown.sh — stop the local devnet. Idempotent. The inverse of devup.sh:
# it stops ONLY what devup starts, and nothing else.
#
# Stops, in reverse order of devup:
#   1. Anvil (:8545)        — the chain
#   2. IPFS (Kubo, Docker)  — `docker stop figaro-ipfs`
#
# NEVER `docker rm`s Kubo: devup brings it back with `docker start`, the pins
# live in the container's named volume (/data/ipfs), and the container carries
# the CORS allowlist pinning needs. Removing it means re-creating + re-configuring.
# `--restart unless-stopped` respects an explicit stop, so it stays down.
#
# Does NOT touch:
#   :3000  — your dev server. Yours to manage; devup never started it.
#   :3100  — Playwright's. Its devnet/mobile projects start and stop their own.
#            A stray one is REPORTED, never killed — it may be a run in flight.
#   sdk/dist, frontend/.env.local, .deployments/local.json — deployment RECORDS,
#            not processes. After this they name a dead chain; that is fine and
#            self-healing: the next devup's preflight fails and redeploys.
#            Nothing to clean, so nothing is cleaned.
#
# Usage:
#   ./scripts/devdown.sh               # stop anvil + Kubo
#   KEEP_IPFS=1 ./scripts/devdown.sh   # stop the chain, leave Kubo pinning

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

note() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }

# ── 1. Anvil ────────────────────────────────────────────────────────────────
# Killed BY PORT, and only after confirming the process really is anvil — :8545
# is a conventional port and another project's node is not ours to kill.
note "Anvil"
anvil_pids="$(lsof -ti:8545 2>/dev/null || true)"
if [[ -z "$anvil_pids" ]]; then
    echo "  already down (:8545)"
else
    for pid in $anvil_pids; do
        cmd="$(ps -p "$pid" -o comm= 2>/dev/null | tr -d ' ' || true)"
        if [[ "$cmd" != *anvil* ]]; then
            echo "  ⚠ :8545 is '${cmd:-unknown}' (pid $pid), NOT anvil — left running."
            echo "    Nothing devup started is on that port; stop it yourself if you meant to."
            continue
        fi
        kill "$pid" 2>/dev/null || true
        for _ in $(seq 1 20); do
            kill -0 "$pid" 2>/dev/null || break
            sleep 0.1
        done
        if kill -0 "$pid" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null || true
            echo "  stopped anvil (pid $pid, SIGKILL — it ignored SIGTERM)"
        else
            echo "  stopped anvil (pid $pid)"
        fi
    done
fi

# ── 2. IPFS (Kubo via Docker) ───────────────────────────────────────────────
note "IPFS (Kubo)"
if [[ "${KEEP_IPFS:-0}" == "1" ]]; then
    echo "  left running (KEEP_IPFS=1)"
elif ! command -v docker >/dev/null 2>&1; then
    echo "  docker not on PATH — nothing to stop"
elif ! docker inspect figaro-ipfs >/dev/null 2>&1; then
    echo "  no figaro-ipfs container — nothing to stop"
elif [[ "$(docker inspect figaro-ipfs --format '{{.State.Status}}' 2>/dev/null)" != "running" ]]; then
    echo "  already stopped"
else
    docker stop figaro-ipfs >/dev/null
    echo "  stopped container figaro-ipfs (pins kept — they live in its volume)"
fi

# ── 3. Report what is NOT ours ──────────────────────────────────────────────
# Reported, never killed: a :3100 could be a Playwright run in flight, and :3000
# is the maintainer's. Silence here would be the worse failure — a stray :3100
# fails the NEXT Playwright run with a confusing port-in-use error.
for port in 3000 3100; do
    if lsof -ti:"$port" >/dev/null 2>&1; then
        [[ "$port" == "3100" ]] \
            && echo "  ⚠ something is still on :3100 (Playwright's port) — not devup's, so not stopped." \
            && echo "    If it is a leftover static-export server it will fail the next e2e run: lsof -ti:3100 | xargs kill" \
            || echo "  note: your dev server is still up on :3000 — left alone."
    fi
done

note "devnet down"
echo "  the chain's state is gone; .env.local + .deployments/local.json now name a dead chain."
echo "  bring it back : ./scripts/devup.sh   (its preflight fails → redeploys automatically)"
