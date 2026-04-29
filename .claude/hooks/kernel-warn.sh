#!/usr/bin/env bash
# Warn when an agent is about to edit the Figaro kernel.
# Reads Claude Code's PreToolUse JSON on stdin; extracts tool_input.file_path;
# prints a reminder to stdout if the path targets a kernel file. Output is
# surfaced back to the agent so the gradient toward web2 patterns gets
# interrupted at the moment of manifestation, not just at CLAUDE.md read time.
set -euo pipefail

file_path=$(jq -r '.tool_input.file_path // empty')

case "$file_path" in
  */src/FigaroCore.sol|*/src/CommitmentTypes.sol)
    cat <<EOF
⚠ KERNEL EDIT: $file_path

The kernel is FROZEN. Verify 3× against docs/v5/DESIGN_DECISIONS.md before
proposing changes.

Anti-patterns to reject on sight:
  - timeout / recovery path for locked bonds (breaks MAD)
  - finalized flag on resolved process (breaks multi-round composition)
  - admin / owner / pause function (breaks no-escape-hatch invariant)
  - yield on locked bonds or bond-lending pools (breaks asymmetric bonding)
  - governance vote / DAO for disputes (reintroduces discretionary power)
  - stuck-fund recovery (stuck funds ARE the deterrent)
  - partial resolution (breaks atomic-resolution coordination pressure)
  - soulbound reputation / role checks that the EIP-712 signature already enforces

The core question for any proposed change:
  Does the bilateral EIP-712 signature requirement already enforce this?
If yes, do not add on-chain state, role checks, or lifecycle flags.
EOF
    ;;
esac
