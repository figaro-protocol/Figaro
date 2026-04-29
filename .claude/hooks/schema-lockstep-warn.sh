#!/usr/bin/env bash
# Warn when an agent is about to edit a schema-coupled surface.
# Reads Claude Code's PreToolUse JSON on stdin; extracts tool_input.file_path;
# prints a reminder if the path is one of the multi-surface schema files.
# Schemas must move together across Layer A spec, TS encoder, on-chain
# validator, registry registration, and user-facing pages — drift between
# off-chain encoder and on-chain validator silently passes off-chain
# validation, then reverts on-chain at attestation time.
set -euo pipefail

file_path=$(jq -r '.tool_input.file_path // empty')

case "$file_path" in
  */frontend/lib/shared/schemas/*.json|\
  */frontend/public/schemas/*.json|\
  */sdk/src/schemas/encode.ts|\
  */sdk/src/schemas/validate.ts|\
  */sdk/src/schemas/spec.ts|\
  */sdk/src/schemas/index.ts|\
  */src/schemaValidators/*.sol|\
  */src/SchemaRegistry.sol|\
  */src/SchemaRegistrationHelper.sol)
    cat <<EOF
⚠ SCHEMA SURFACE EDIT: $file_path

This file is one surface of the multi-surface schema-lockstep contract.
Other surfaces must move together. Before committing, invoke the
figaro-schema-lockstep subagent on the diff to verify all required
surfaces are in sync.

Required surfaces per schemaId:
  - Layer A spec:        frontend/lib/shared/schemas/<id>.json
  - TS encoder:          sdk/src/schemas/encode.ts (encode<Name>Content)
  - TS exports:          sdk/src/schemas/index.ts
  - Solidity validator:  src/schemaValidators/Figaro<Name>V1Validator.sol
  - Registry binding:    SchemaRegistry registration in script/ deploy paths
  - User-facing surface: at least one frontend/app/ page references the schemaId

Drift between encoder and validator is silent off-chain and lethal
on-chain. The validator-contract pattern is 1:1 with schemaId, ABI-encoded
content, first-write-wins. New behavior = new schemaId, never an in-place
edit of an existing one.
EOF
    ;;
esac
