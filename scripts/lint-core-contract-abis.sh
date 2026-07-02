#!/usr/bin/env bash
# lint-core-contract-abis.sh — Core is five Figaro contracts (+ the agnostic ERC-20).
#
# Figaro's core is FigaroCore + the three registries (Clause, Seller, Assembly)
# + the FIG token. frontend/lib/kernel/ — and its contract config, contracts.ts —
# may carry ONLY those five contract ABIs plus ERC20_ABI: the kernel and
# registries are ERC-20-AGNOSTIC, so the generic token-standard ABI is a
# legitimate core primitive.
#
# Any OTHER contract ABI — dutch auction, offset receipt, attestation
# coordinator, … — is a contract the frontend COMPOSES with, not core. It does
# not belong in lib/kernel/, and no ABI may be DEFINED here (parseAbi). Non-core
# ABIs live in lib/composition/ — NOT in core, and NOT in @figaro/core either
# (the SDK is core too). The composition layer carries no prior knowledge a
# clause/assembly spec can't supply at runtime.
#
# Escalated to a guard after non-core ABIs were repeatedly re-homed into the
# core contract config. FAILS the commit on violation.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
CORE_DIR="$ROOT/frontend/lib/kernel"

# The ONLY ABIs allowed anywhere in lib/kernel/: the five core Figaro contracts
# plus the generic ERC-20 standard they are agnostic over.
ALLOWED="CORE_ABI CLAUSE_REGISTRY_ABI SELLER_REGISTRY_ABI ASSEMBLY_REGISTRY_ABI FIG_TOKEN_ABI ERC20_ABI"

in_list() { local needle="$1"; shift; for x in "$@"; do [[ "$x" == "$needle" ]] && return 0; done; return 1; }

fail=0

# ── Only the allowed ABI symbols may appear in lib/kernel/ ──
while IFS=: read -r file line tok; do
  [[ -z "${tok:-}" ]] && continue
  if ! in_list "$tok" $ALLOWED; then
    echo "✖ ${file#"$ROOT"/}:$line — non-core ABI '$tok' in lib/kernel/."
    echo "    Allowed in core: $ALLOWED."
    echo "    Other contract ABIs live in the SDK, imported by the feature layer that uses them."
    fail=1
  fi
done < <(grep -rnoE "[A-Z0-9_]+_ABI" "$CORE_DIR" 2>/dev/null || true)

# ── No ABI may be DEFINED in lib/kernel/ (parseAbi) — definitions live in the SDK ──
while IFS= read -r hit; do
  [[ -z "$hit" ]] && continue
  echo "✖ ${hit#"$ROOT"/}"
  echo "    Local contract-ABI definition in lib/kernel/. Define it in sdk/src/abis.ts and import it."
  fail=1
done < <(grep -rnE "const[[:space:]]+[A-Z0-9_]+_ABI[[:space:]]*=[[:space:]]*parseAbi" "$CORE_DIR" 2>/dev/null || true)

if [[ $fail -ne 0 ]]; then
  echo ""
  echo "Core is five Figaro contracts: FigaroCore, ClauseRegistry, SellerRegistry, AssemblyRegistry, FIG token"
  echo "— plus the generic ERC-20 they're agnostic over. Nothing else."
  echo "Contracts the frontend composes with live in lib/composition/, not core."
  exit 1
fi

echo "✓ core-contract ABIs OK (lib/kernel/ holds only the five core Figaro ABIs + ERC20_ABI; no local defs)."
