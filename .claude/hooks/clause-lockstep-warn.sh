#!/usr/bin/env bash
# Warn when an agent is about to edit a clause-coupled surface.
# Reads Claude Code's PreToolUse JSON on stdin; extracts tool_input.file_path;
# prints a reminder if the path is one of the multi-surface clause files.
# The canonical specs live at repo-root clauses/*.json; the SDK's generic
# parse/validate/encode engine is the only Layer-A code (no per-clause code
# exists — finding any is itself drift). The on-chain validator surface is
# DEFERRED (docs/CONTRACTS.md § "Deferred vs permanent").
set -euo pipefail

file_path=$(jq -r '.tool_input.file_path // empty')

case "$file_path" in
  */clauses/*.json|\
  */sdk/src/clauses/encode.ts|\
  */sdk/src/clauses/validate.ts|\
  */sdk/src/clauses/spec.ts|\
  */sdk/src/clauses/index.ts|\
  */sdk/src/clauses/clause-spec.schema.json|\
  */src/protocol/registries/ClauseRegistry.sol)
    cat <<EOF
⚠ CLAUSE SURFACE EDIT: $file_path

This file is one surface of the multi-surface clause-lockstep contract.
Other surfaces must move together. Before committing, invoke the
figaro-clause-lockstep subagent on the diff to verify all required
surfaces are in sync.

Required surfaces per clauseId (docs/CLAUSES.md owns the checklist):
  - Canonical spec:      clauses/<id>.json (bare id — version is a hashed
                         field, never a name suffix)
  - Generic Layer A:     the spec must parse + round-trip through
                         sdk/src/clauses (parseClauseSpec / validateContent /
                         encodeContentFromSpec) — NO per-clause code
  - Registry seeding:    ClauseRegistry registration in the deploy path
  - User-facing prose:   grep -rl "<id>" frontend/app/ on rename/remove
  (On-chain validator + prover mirror: DEFERRED surfaces — absence is not
   drift; see docs/CONTRACTS.md § "Deferred vs permanent".)

This repo is device-only: edit the clause spec in place (no -v2, no version
bump) and make sure the same change reaches every live surface above.
EOF
    ;;
esac
