#!/usr/bin/env bash
#
# lint-lib-import-direction.sh — frontend/lib layer arrows point ONE way.
#
# The tiers, bottom to top (each may import only what sits BELOW it):
#   shared/    — the generic leaf (evm, json, formatting, service INTERFACES).
#                May import NOTHING from lib/ outside shared/. The single
#                sanctioned exception is the runtime-services composition seam
#                (runtimeServices.ts + runtimeServicesContext.tsx), the DI
#                registry that by design assembles feature-layer services.
#   kernel/    — the FigaroCore seam (commit/resolve writes, order events,
#                commitment/agreement hashing, chain config). May import only
#                shared/.
#   protocol/  — the registry tier (ClauseRegistry, MembersRegistry,
#                AssemblyRegistry readers). May import kernel/ and shared/.
#   feature layers (checkout, composition, semantic, designer, seller,
#                handoff, audit, agent) — build on all of the above.
#
# Service implementations live in their feature layer (handoff/, seller/);
# lower-tier code that needs a transport capability declares a minimal
# STRUCTURAL type instead of importing the feature interface (see the
# CommitmentPayloadRelay structural type in lib/checkout/orderSignedAndShared.ts).
#
# Wired into the root package.json lint-staged block under frontend/**/*.{ts,tsx}.
# Run manually:  bash scripts/lint-lib-import-direction.sh [files...]
# With no args, scans all of frontend/lib. Exit code: 0 clean, 1 on violation.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FEATURE_LAYERS='checkout|composition|semantic|designer|seller|handoff|audit|agent'

files=("$@")
whole_tree=0
if [[ ${#files[@]} -eq 0 ]]; then
    whole_tree=1
    while IFS= read -r f; do files+=("$f"); done \
        < <(find "$REPO_ROOT/frontend/lib" -type f \( -name '*.ts' -o -name '*.tsx' \))
fi

violations=0

for file in "${files[@]}"; do
    [[ -f "$file" ]] || continue
    [[ "$file" == *.ts || "$file" == *.tsx ]] || continue

    case "$file" in
        *"frontend/lib/kernel/"*)
            if hits=$(grep -nE "from [\"']@/lib/(${FEATURE_LAYERS}|protocol)/" "$file"); then
                echo "[lib-import-direction] $file — lib/kernel/ may import only lib/shared/:"
                echo "$hits" | sed 's/^/    /'
                violations=1
            fi
            ;;
        *"frontend/lib/protocol/"*)
            if hits=$(grep -nE "from [\"']@/lib/(${FEATURE_LAYERS})/" "$file"); then
                echo "[lib-import-direction] $file — lib/protocol/ may not import a feature layer:"
                echo "$hits" | sed 's/^/    /'
                violations=1
            fi
            ;;
        *"frontend/lib/shared/runtimeServices.ts"|*"frontend/lib/shared/runtimeServicesContext.tsx")
            ;; # the sanctioned DI composition seam
        *"frontend/lib/shared/"*)
            if hits=$(grep -nE "from [\"']@/lib/(${FEATURE_LAYERS}|kernel|protocol)/" "$file"); then
                echo "[lib-import-direction] $file — lib/shared/ is the generic leaf; it may not import lib/ outside shared/:"
                echo "$hits" | sed 's/^/    /'
                violations=1
            fi
            ;;
    esac
done

# ── READER COUNT — a shared/ module must be genuinely shared. ──
# Whole-tree mode only (per-file staged runs can't count readers). A module in
# lib/shared/ whose NON-TEST readers all live in ONE feature layer belongs in
# that layer — shared/ is the generic leaf, not a dumping ground. Zero readers
# is knip's territory (ahead-of-UI @public is legitimate); readers spanning
# multiple layers, or app/, or components/, are what "shared" means.
if [[ $whole_tree -eq 1 ]]; then
    for mod in "$REPO_ROOT"/frontend/lib/shared/*.ts "$REPO_ROOT"/frontend/lib/shared/*.tsx; do
        [[ -f "$mod" ]] || continue
        base="$(basename "$mod")"
        name="${base%.tsx}"; name="${name%.ts}"
        # The DI composition seam assembles feature services by design.
        [[ "$name" == "runtimeServices" || "$name" == "runtimeServicesContext" ]] && continue
        # `|| true`: a zero-reader module (knip's territory) exits the grep
        # non-zero, and pipefail+set -e would otherwise kill the whole lint.
        layers=$(grep -rlE "from [\"']@/lib/shared/${name}[\"']" \
                "$REPO_ROOT/frontend/lib" "$REPO_ROOT/frontend/app" "$REPO_ROOT/frontend/components" \
                --include='*.ts' --include='*.tsx' 2>/dev/null \
            | grep -v "/lib/shared/" \
            | sed -E "s|.*/frontend/lib/([a-z]+)/.*|lib:\1|; s|.*/frontend/app/.*|app|; s|.*/frontend/components/.*|components|" \
            | sort -u || true)
        [[ -z "$layers" ]] && continue
        count=$(printf '%s\n' "$layers" | grep -c .)
        if [[ $count -eq 1 ]] && printf '%s' "$layers" | grep -qE "^lib:(${FEATURE_LAYERS})$"; then
            echo "[lib-import-direction] lib/shared/${base} — single-layer reader (${layers#lib:}/ only):"
            echo "    shared/ is the generic leaf; a module read by one feature layer belongs IN that layer."
            violations=1
        fi
    done
fi

if [[ $violations -ne 0 ]]; then
    echo ""
    echo "Layer arrows point one way: feature layers import protocol/, kernel/,"
    echo "and shared/; protocol/ imports kernel/ and shared/; kernel/ imports"
    echo "shared/; shared/ imports nothing. Move the module to the layer its"
    echo "imports say it belongs to, or depend on a minimal structural type."
    exit 1
fi

exit 0
