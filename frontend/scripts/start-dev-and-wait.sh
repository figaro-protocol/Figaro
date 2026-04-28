#!/usr/bin/env bash
set -euo pipefail

# Starts Next dev server on a pinned port and waits for readiness.
# Usage: PORT=3000 WAIT_TIMEOUT=300000 ./scripts/start-dev-and-wait.sh

PORT=${PORT:-3000}
WAIT_TIMEOUT=${WAIT_TIMEOUT:-120000}

echo "Starting Next dev server on port ${PORT}..."
# Start in background so CI can continue to run tests against it
PORT=${PORT} npm run dev --silent &
DEV_PID=$!

echo "Dev server started with PID ${DEV_PID}. Waiting for readiness (timeout ${WAIT_TIMEOUT}ms)..."

# Use wait-on via npx to wait for a Next static chunk indicating readiness
npx wait-on "http://localhost:${PORT}/_next/static/chunks/app-pages-internals.js" --timeout ${WAIT_TIMEOUT}

echo "Dev server ready on port ${PORT} (PID ${DEV_PID})."

# Exit without killing the background server so subsequent CI steps can run tests against it
exit 0
