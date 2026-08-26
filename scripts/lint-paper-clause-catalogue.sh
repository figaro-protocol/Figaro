#!/usr/bin/env bash
#
# lint-paper-clause-catalogue.sh — Gate: the protocol-composition paper's
# reference-clause catalogue tracks `clauses/` exactly.
#
# The paper's §4.5 (`frontend/app/(marketing)/papers/protocol-composition/`)
# enumerates the reference clause set as a `CATALOGUE` array of display names.
# The set itself is DERIVED — `ls clauses/*.json` — so every clause add or
# remove silently desyncs the enumeration until someone notices (the same
# per-add upkeep failure lint-clause-counts guards against for counts). This
# gate FAILS when the CATALOGUE keys and the clause-spec basenames diverge in
# either direction.
#
# Display names are editorial, not mechanical: the default expectation is the
# sentence-cased basename ("figaro-cold-chain" → "Cold chain"); the handful
# of editorial names live in display_for below. When a NEW clause lands whose
# display name isn't the sentence-cased basename, extend display_for — never
# delete the catalogue entry to appease the gate.
#
# Ignores its arguments (lint-staged passes staged filenames; the diff is a
# whole-set comparison either way).
#
# Run manually:  bash scripts/lint-paper-clause-catalogue.sh
# Exit codes:
#   0 — catalogue and clauses/ in sync
#   1 — drift (a clause missing from the catalogue, or a catalogue entry
#       naming no clause)
#   2 — tooling error (page or clauses dir missing)

set -u

PAGE="frontend/app/(marketing)/papers/protocol-composition/page.tsx"
CLAUSES_DIR="clauses"

if [ ! -f "$PAGE" ]; then
    echo "[paper-clause-catalogue] paper page not found: $PAGE" >&2
    exit 2
fi
if [ ! -d "$CLAUSES_DIR" ]; then
    echo "[paper-clause-catalogue] clauses dir not found: $CLAUSES_DIR" >&2
    exit 2
fi

# The editorial display names (basename → CATALOGUE key). Everything else is
# expected as the sentence-cased basename.
display_for() {
    case "$1" in
        figaro-arbitration-kleros) echo "Arbitration (Kleros)" ;;
        figaro-content-handoff)    echo "Content hand-off" ;;
        figaro-dimweight)          echo "Dimensional weight" ;;
        figaro-hazmat)             echo "Dangerous goods" ;;
        figaro-incoterms)          echo "Incoterms 2020" ;;
        *)
            local name="${1#figaro-}"
            name="${name//-/ }"
            printf '%s%s\n' "$(printf '%s' "${name:0:1}" | tr '[:lower:]' '[:upper:]')" "${name:1}"
            ;;
    esac
}

# The CATALOGUE keys: the first string of each [key, description] tuple inside
# the `const CATALOGUE ... ];` block.
actual=$(awk '/^const CATALOGUE/,/^\];/' "$PAGE" \
    | grep -oE '^[[:space:]]*\["[^"]+"' \
    | sed -E 's/^[[:space:]]*\["([^"]+)"/\1/' \
    | sort)
if [ -z "$actual" ]; then
    echo "[paper-clause-catalogue] no CATALOGUE keys parsed from $PAGE (block renamed or reshaped?)" >&2
    exit 2
fi

expected=$(
    for f in "$CLAUSES_DIR"/*.json; do
        display_for "$(basename "$f" .json)"
    done | sort
)

missing=$(comm -23 <(printf '%s\n' "$expected") <(printf '%s\n' "$actual"))
extra=$(comm -13 <(printf '%s\n' "$expected") <(printf '%s\n' "$actual"))

if [ -z "$missing" ] && [ -z "$extra" ]; then
    echo "[paper-clause-catalogue] clean — catalogue tracks clauses/ ($(printf '%s\n' "$expected" | wc -l | tr -d ' ') entries)"
    exit 0
fi

echo "[paper-clause-catalogue] the paper's CATALOGUE and clauses/ have diverged:" >&2
if [ -n "$missing" ]; then
    echo "  registered clauses missing from the catalogue (add the entry; if the display" >&2
    echo "  name is editorial, extend display_for in this script):" >&2
    printf '%s\n' "$missing" | sed 's/^/    /' >&2
fi
if [ -n "$extra" ]; then
    echo "  catalogue entries naming no clause spec (removed clause, or a display name" >&2
    echo "  display_for doesn't map):" >&2
    printf '%s\n' "$extra" | sed 's/^/    /' >&2
fi
exit 1
