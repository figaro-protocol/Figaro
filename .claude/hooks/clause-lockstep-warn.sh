#!/usr/bin/env bash
# Warn when an agent is about to edit a clause-coupled surface.
# Reads Claude Code's PreToolUse JSON on stdin; extracts tool_input.file_path;
# prints a reminder if the path is one of the multi-surface clause files.
# Clauses must move together across Layer A spec, TS encoder, on-chain
# validator, registry registration, and user-facing pages — drift between
# off-chain encoder and on-chain validator silently passes off-chain
# validation, then reverts on-chain at attestation time.
set -euo pipefail

file_path=$(jq -r '.tool_input.file_path // empty')

case "$file_path" in
  */frontend/lib/shared/clauses/*.json|\
  */frontend/public/clauses/*.json|\
  */sdk/src/clauses/encode.ts|\
  */sdk/src/clauses/validate.ts|\
  */sdk/src/clauses/spec.ts|\
  */sdk/src/clauses/index.ts|\
  */src/clauseValidators/*.sol|\
  */src/ClauseRegistry.sol|\
  */src/ClauseRegistrationHelper.sol)
    cat <<EOF
⚠ CLAUSE SURFACE EDIT: $file_path

This file is one surface of the multi-surface clause-lockstep contract.
Other surfaces must move together. Before committing, invoke the
figaro-clause-lockstep subagent on the diff to verify all required
surfaces are in sync.

Required surfaces per clauseId:
  - Layer A spec:        frontend/lib/shared/clauses/<id>.json
  - TS encoder:          sdk/src/clauses/encode.ts (encode<Name>Content)
  - TS exports:          sdk/src/clauses/index.ts
  - Solidity validator:  src/clauseValidators/Figaro<Name>V1Validator.sol
  - Registry binding:    ClauseRegistry registration in script/ deploy paths
  - User-facing surface: at least one frontend/app/ page references the clauseId

Drift between encoder and validator is silent off-chain and lethal
on-chain — so a clause change must land on EVERY surface together. This repo is
device-only: edit the clause spec in place (no `-v2`, no version bump) and make
sure the same change reaches every surface above.
EOF
    ;;
esac
