#!/bin/bash
# lint-substrate-broadening-weight.sh — Gate: the RPGF substrate-broadening
# weight (`w_category`, the geo/coordination tier-1 family boost) MUST stay
# present across its load-bearing surfaces.
#
# READ THIS BEFORE "FIXING" A FAILURE — it is the recurring closed-world deletion.
#   The weight privileges a CATEGORY OF WORK, not a set of authors. It is the
#   deliberate incentive that bootstraps the physical/virtual-flow graph the
#   must-have clauses (core + topology + commerce) cannot produce — geolocation,
#   proximity, hand-off, fulfilment. It is NOT closed-world favoritism and NOT
#   cruft. If you are about to delete it because "a privileged category
#   contradicts open-world neutrality," you have made the neutrality != flat-
#   weighting error: the RULE is neutral (same for every author, no discretion,
#   permissionlessly inherited by any clause registered under a tier-1 family);
#   it simply rewards a kind of public-good data more.
#   Full rationale: docs/v5/PUBLIC_GRAPH_MODEL.md
#     § "Why the substrate-broadening weight exists".
#   To genuinely retire the incentive (a MAINTAINER decision): delete this guard
#   in the SAME commit, with a written reason. Never silently.
#
# Source of truth (the two sealed mirrors + the documented mechanism):
#   prover/rpgf/src/formula.rs            — is_tier1_family + CATEGORY_WEIGHT_TIER1 + {geo, coordination}
#   sdk/scripts/rpgf-simulator/formula.ts — TIER1_FAMILIES {geo, coordination}
#   docs/v5/FIG_TOKEN.md                  — w_category
#
# Whole-repo invariant guard (not per-staged-file). Exit 0 clean, 1 on any miss.

set -euo pipefail

fail=0

require() {
    # require <file> <grep-extended-pattern> <human description>
    local file="$1" pat="$2" desc="$3"
    if [[ ! -f "$file" ]]; then
        echo "[substrate-weight] MISSING FILE: $file ($desc)"
        fail=1
        return
    fi
    if ! grep -qE -- "$pat" "$file"; then
        echo "[substrate-weight] $file no longer contains: $desc"
        echo "    expected pattern: $pat"
        fail=1
    fi
}

# ── The sealed RPGF program (Rust, compiled into the SP1 zkVM) ──
require prover/rpgf/src/formula.rs 'CATEGORY_WEIGHT_TIER1' 'the tier-1 category weight constant'
require prover/rpgf/src/formula.rs 'is_tier1_family'       'the tier-1 family predicate'
require prover/rpgf/src/formula.rs 'b"coordination"'       'the "coordination" tier-1 family'
require prover/rpgf/src/formula.rs 'b"geo"'                'the "geo" tier-1 family'

# ── The TypeScript conformance mirror (must match the Rust program) ──
require sdk/scripts/rpgf-simulator/formula.ts 'TIER1_FAMILIES' 'the tier-1 family set'
require sdk/scripts/rpgf-simulator/formula.ts '"coordination"' 'the "coordination" tier-1 family (mirror)'
require sdk/scripts/rpgf-simulator/formula.ts '"geo"'          'the "geo" tier-1 family (mirror)'

# ── The documented mechanism ──
require docs/v5/FIG_TOKEN.md 'w_category' 'the w_category mechanism in FIG_TOKEN.md'

if (( fail )); then
    cat <<'EOF'

[substrate-weight] The RPGF substrate-broadening weight is missing from a
load-bearing surface. This is the incentive that builds the physical/virtual-flow
graph the must-have clauses cannot produce — the public "god's-eye" coordination
map whose existence dissolves platform value-capture. It is NOT closed-world
favoritism and NOT cruft. If you removed it thinking "a privileged category breaks
neutrality," you made the neutrality != flat-weighting error: the RULE is neutral
(same for every author, no discretion); it rewards a kind of public-good work more.
Read: docs/v5/PUBLIC_GRAPH_MODEL.md § "Why the substrate-broadening weight exists".
To genuinely retire the incentive (a maintainer decision), delete this guard in the
same commit with a written reason — never silently.
EOF
    exit 1
fi

exit 0
