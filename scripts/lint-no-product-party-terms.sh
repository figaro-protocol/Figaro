#!/usr/bin/env bash
#
# lint-no-product-party-terms.sh — pre-commit guard against re-introducing
# product/party vocabulary on PERMANENT frontend surfaces.
#
# Figaro has exactly two parties: buyer and seller. "Merchant" is a seller.
# The merchant→seller collapse (Phase 1) keeps recurring because the product
# noun gets baked into routes, component/type/hook names, and test-ids —
# the expensive-to-undo surfaces. This guard closes that loop.
#
# SCOPE — `merchant` only, and only where it is a permanent surface:
#
#   A. ROUTE        — `/m/[` or `[merchant]` (the route is `/s/[seller]`).
#   B. DECLARATION  — a component / type / interface / hook NAMED Merchant*
#                     (`function|const|let|var|interface|type|class Merchant…`,
#                     or `useMerchant…`).
#   C. TEST-ID      — `data-testid="…merchant…"`.
#
# ALLOWED (the schema-bound merchant-process surface — a distinct, frozen
# artifact family, Phase-2 rename candidate, NOT a party name):
#   Merchant{Process,Content,Signal}…, useMerchantProcess, merchant-process,
#   merchant-proximity, figaro-merchant-*.
#
# Transient lowercase locals (`merchantActions`, `merchantEvents`, …) are NOT
# flagged: they are not permanent surfaces. The cost this guard prevents is
# vocabulary entrenchment in names/routes/ids, not local readability.
#
# Phase 2 will extend this to `courier` / `driver` / `vendor` / `supplier`
# once the delivery flow is collapsed; they are intentionally NOT enforced
# yet (the courier flow still uses them legitimately).
#
# Wired into the root package.json lint-staged block under
# `frontend/**/*.{ts,tsx}`. Run manually:
#   bash scripts/lint-no-product-party-terms.sh path/to/file.tsx [more…]
#
# Exit code: 0 on clean, 1 on any violation.

set -euo pipefail

ALLOW='Merchant(Process|Content|Signal|Event|Timeline)|useMerchantProcess|merchant-process|merchant-proximity|figaro-merchant'

violations=0

report() {
    # $1 = label, $2 = file, $3 = hits
    echo "[no-party-terms] $2 — $1"
    echo "$3" | sed 's/^/    /'
    violations=$((violations + 1))
}

for file in "$@"; do
    [[ -f "$file" ]] || continue
    case "$file" in
        frontend/*.ts | frontend/*.tsx | frontend/**/*.ts | frontend/**/*.tsx) ;;
        *) continue ;;
    esac

    # A. Route surface
    hits=$(grep -nE '/m/\[|\[merchant\]' "$file" || true)
    [[ -n "$hits" ]] && report "party route (use /s/[seller])" "$file" "$hits"

    # B. Declaration / hook named Merchant* (minus schema-bound surface)
    hits=$(grep -nE '\b(function|const|let|var|interface|type|class)[[:space:]]+Merchant[A-Za-z0-9_]*|\buseMerchant[A-Za-z0-9_]*' "$file" \
        | grep -vE "$ALLOW" || true)
    [[ -n "$hits" ]] && report "party-named declaration/hook (rename to Seller*)" "$file" "$hits"

    # C. Test-id carrying a party term (minus schema-bound surface)
    hits=$(grep -nE 'data-testid="[^"]*merchant[^"]*"' "$file" \
        | grep -vE "$ALLOW" || true)
    [[ -n "$hits" ]] && report "party test-id (use seller-*)" "$file" "$hits"
done

if (( violations > 0 )); then
    echo ""
    echo "[no-party-terms] $violations violation(s). A party is a buyer or a seller;"
    echo "                 'merchant' is a seller. Collapse it (Phase-1 naming rule)."
    exit 1
fi

exit 0
