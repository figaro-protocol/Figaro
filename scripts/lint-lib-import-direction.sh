#!/usr/bin/env bash
#
# lint-lib-import-direction.sh — frontend/lib layer arrows point ONE way.
#
# Two rules, both already documented in source:
#   1. lib/core/   may import NO feature layer (checkout, composition, semantic,
#      designer, seller, handoff, audit, agent). core/ is the kernel-adjacent
#      read/sign layer; everything else builds ON it.
#   2. lib/shared/ may import NOTHING from lib/ outside shared/ — it is the
#      generic leaf (evm, json, formatting, service INTERFACES). The single
#      sanctioned exception is the runtime-services composition seam
#      (runtimeServices.ts + runtimeServicesContext.tsx), the DI registry that
#      by design assembles feature-layer service implementations.
#
# Service implementations live in their feature layer (handoff/, seller/);
# core code that needs a transport capability declares a minimal STRUCTURAL
# type instead of importing the feature interface (see the CommitmentPayloadRelay
# structural type in lib/checkout/orderSignedAndShared.ts).
#
# Wired into the root package.json lint-staged block under frontend/**/*.{ts,tsx}.
# Run manually:  bash scripts/lint-lib-import-direction.sh [files...]
# With no args, scans all of frontend/lib. Exit code: 0 clean, 1 on violation.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FEATURE_LAYERS='checkout|composition|semantic|designer|seller|handoff|audit|agent'

files=("$@")
if [[ ${#files[@]} -eq 0 ]]; then
    while IFS= read -r f; do files+=("$f"); done \
        < <(find "$REPO_ROOT/frontend/lib" -type f \( -name '*.ts' -o -name '*.tsx' \))
fi

violations=0

for file in "${files[@]}"; do
    [[ -f "$file" ]] || continue
    [[ "$file" == *.ts || "$file" == *.tsx ]] || continue

    case "$file" in
        *"frontend/lib/core/"*)
            if hits=$(grep -nE "from [\"']@/lib/(${FEATURE_LAYERS})/" "$file"); then
                echo "[lib-import-direction] $file — lib/core/ may not import a feature layer:"
                echo "$hits" | sed 's/^/    /'
                violations=1
            fi
            ;;
        *"frontend/lib/shared/runtimeServices.ts"|*"frontend/lib/shared/runtimeServicesContext.tsx")
            ;; # the sanctioned DI composition seam
        *"frontend/lib/shared/"*)
            if hits=$(grep -nE "from [\"']@/lib/(${FEATURE_LAYERS}|core)/" "$file"); then
                echo "[lib-import-direction] $file — lib/shared/ is the generic leaf; it may not import lib/ outside shared/:"
                echo "$hits" | sed 's/^/    /'
                violations=1
            fi
            ;;
    esac
done

if [[ $violations -ne 0 ]]; then
    echo ""
    echo "Layer arrows point one way: feature layers import core/ and shared/,"
    echo "never the reverse. Move the module to the layer its imports say it"
    echo "belongs to, or depend on a minimal structural type instead."
    exit 1
fi

exit 0
