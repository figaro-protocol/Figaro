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
# SCOPE — `merchant` and `courier` (both collapsed to `seller`), and only
# where the term is a permanent surface:
#
#   A. ROUTE        — `/m/[`, `[merchant]`, `[courier]` (the route is `/s/[seller]`).
#   B. DECLARATION  — a component / type / interface / hook NAMED Merchant*/Courier*
#                     (`function|const|let|var|interface|type|class …`, or `use…`).
#   C. TEST-ID      — `data-testid="…merchant…"` / `…courier…`.
#
# ALLOWED (the schema-bound merchant-process / courier-process surface — a
# distinct, frozen artifact family, item-(c) rename candidate, NOT a party):
#   {Merchant,Courier}{Process,Content,Signal,Event,Timeline,Proximity}…,
#   use{Merchant,Courier}Process, {merchant,courier}-{process,proximity,
#   action,handoff,transit,hint}, figaro-{merchant,courier}-*.
#
# Transient lowercase locals (`merchantActions`, `courierEvents`, …) are NOT
# flagged: they are not permanent surfaces. The cost this guard prevents is
# vocabulary entrenchment in names/routes/ids, not local readability.
#
# `driver` / `vendor` / `supplier` are not yet enforced (stray, low-count;
# fold in when next touched). `operator` (Figaro-party sense) is now enforced too;
# the "Project Operator" beta-consent copy is prose, not a declaration/route/testid,
# so it does not match the patterns below.
#
# Wired into the root package.json lint-staged block under
# `frontend/**/*.{ts,tsx}`. Run manually:
#   bash scripts/lint-no-product-party-terms.sh path/to/file.tsx [more…]
#
# Exit code: 0 on clean, 1 on any violation.

set -euo pipefail

ALLOW='(Merchant|Courier)(Process|Content|Signal|Event|Timeline|Proximity)|use(Merchant|Courier)Process|(merchant|courier)-(process|proximity|action|handoff|transit|hint)|figaro-(merchant|courier)'

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
    hits=$(grep -nE '/m/\[|\[merchant\]|\[courier\]|\[operator\]|/operators' "$file" || true)
    [[ -n "$hits" ]] && report "party route (use /s/[seller] or /sellers)" "$file" "$hits"

    # B. Declaration / hook named Merchant*/Courier*/Operator* (minus schema-bound surface)
    hits=$(grep -nE '\b(function|const|let|var|interface|type|class)[[:space:]]+(Merchant|Courier|Operator)[A-Za-z0-9_]*|\buse(Merchant|Courier|Operator)[A-Za-z0-9_]*' "$file" \
        | grep -vE "$ALLOW" || true)
    [[ -n "$hits" ]] && report "party-named declaration/hook (rename to Seller*)" "$file" "$hits"

    # C. Test-id carrying a party term (minus schema-bound surface)
    hits=$(grep -nE 'data-testid="[^"]*(merchant|courier|operator)[^"]*"' "$file" \
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
