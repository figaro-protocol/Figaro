#!/bin/bash
# Mythril analysis script for Figaro contracts using Docker.
# Usage: ./scripts/mythril-docker.sh [contract-path] [extra-mythril-args]

set -e

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CONTRACT_PATH=${1:-src/florin/FlorinToken.sol}
shift || true

# Ensure dependencies are installed
if [ ! -d "$PROJECT_ROOT/lib/openzeppelin-contracts" ]; then
  echo "[mythril-docker.sh] Installing OpenZeppelin contracts via forge..."
  cd "$PROJECT_ROOT"
  forge install
fi

# Mythril expects node_modules for remappings, so symlink if needed
if [ ! -d "$PROJECT_ROOT/node_modules/@openzeppelin" ]; then
  mkdir -p "$PROJECT_ROOT/node_modules/@openzeppelin"
  ln -sf "$PROJECT_ROOT/lib/openzeppelin-contracts/contracts" "$PROJECT_ROOT/node_modules/@openzeppelin/contracts"
fi

# Mount the full project root so all dependencies are available
# Pass any extra Mythril args after the contract path

docker run --rm -v "$PROJECT_ROOT:/workspace" mythril/myth \
  analyze "/workspace/$CONTRACT_PATH" \
  --execution-timeout 300 --solv 0.8.26 "$@"
