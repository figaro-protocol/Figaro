#!/usr/bin/env bash
#
# lint-clause-choices-are-bounded.sh — a clause-spec CHOICE field must be a BOUNDED
# enum, never a free-form string. The mechanical teeth for the future-proofing model
# (reference_future_proofing_model, ratified 2026-06-17): collapse variants into ONE clause
# whose variation is a bounded, spec-declared option set; extend by clause VERSIONING — never
# a free-form field for a choice.
#
# Why this guard exists: the emissions consolidation shipped `figaro-emissions.standard` as a free-form
# `string`, so it rendered a TEXT BOX instead of a dropdown (the user's dismay, 2026-06-17).
# A bounded enum is validatable (Layer-C membership check), deterministically encodable (the
# generic encoder maps value→0-based ordinal — position-as-index, which a free string cannot
# do), and renderable as a real choice control. Free text loses all three. A free `string` is
# ONLY for genuinely-free content (an address, a nonce/sig, a geohash, a URI, a description).
#
# Flags: a clause-spec field `type:"string"`, `required:true`, with no `default`, whose name
# is NOT a known free-content field — almost certainly a choice that should be `type:"enum"`
# with a bounded `values` array.
#
# Wired under lint-staged `clauses/*.json`. Exit 0 clean, 1 on violation.

set -euo pipefail

# Genuinely-free string fields (addresses, crypto data, geohashes, URIs, free prose,
# externally-standardised identifiers/names) — NOT choices. A field whose name matches
# this is legitimately free-form. `unNumber`/`properShippingName` are the UN dangerous-
# goods number + official shipping name: regulated values anchored to an external standard
# (the clause references the standard rather than enumerating its thousands of entries).
FREE_CONTENT='^(currency|nonce|.*[Ss]ig|.*[Uu]ri|.*[Hh]ash|.*[Gg]eohash|origin|destination|geocodeStandard|description|name|properShippingName|unNumber|incotermsNamedPlace|credentialId|tagline|specialty|notes?|custodyScheme|acceptanceBasis|licenseScope)$'

# Known violations pending conversion to enums (tracked in the backlog UI/UX audit). Allowed
# for now so the guard doesn't block existing work; REMOVE each as it becomes an enum — then
# the guard FAILS if it ever regresses.
KNOWN_PENDING='^(figaro-emissions\.standard|figaro-applicable-law\.applicableLaw)$'

violations=0
for file in "$@"; do
    [[ -f "$file" ]] || continue
    [[ "$file" == *.json ]] || continue

    hits=$(FREE="$FREE_CONTENT" node -e '
        const fs = require("fs");
        const spec = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
        const free = new RegExp(process.env.FREE);
        const out = [];
        const walk = (fields, prefix) => {
            for (const f of fields || []) {
                // A field declaring a `format` (iso-datetime, address-hex, bytes-hex,
                // …) is format-constrained free content, NEVER a choice-from-a-set: it
                // renders its format input (a datetime picker, not a text box) and is
                // validated by the format gate. Exempt it, the same as a named free
                // field — a bounded choice must still be a `type:"enum"`, never a
                // `string` with a bogus format.
                if (f.type === "string" && f.required === true && f.default === undefined
                    && f.format === undefined && !free.test(f.name))
                    out.push(prefix + f.name);
                if (f.type === "object") walk(f.fields, prefix + f.name + ".");
            }
        };
        walk(spec.fields, "");
        const id = spec.clauseId || "?";
        for (const name of out) console.log(id + "." + name);
    ' "$file" 2>/dev/null || true)

    for hit in $hits; do
        if [[ "$hit" =~ $KNOWN_PENDING ]]; then
            echo "[clause-choices-bounded] $hit — KNOWN free-string choice pending enum conversion (backlog UI/UX audit); allowed for now."
        else
            echo "[clause-choices-bounded] $file: \`$hit\` is a REQUIRED free-form string."
            violations=$((violations + 1))
        fi
    done
done

if (( violations > 0 )); then
    echo ""
    echo "[clause-choices-bounded] $violations field(s): a clause CHOICE must be a bounded enum,"
    echo "never free text (reference_future_proofing_model). Make it type:\"enum\" with a bounded"
    echo "\`values\` array (extend the set by registering a new clause VERSION) — or, if the field"
    echo "is genuinely-free content (address / nonce / sig / geohash / URI / prose), add its name"
    echo "to FREE_CONTENT in this guard."
    exit 1
fi
exit 0
