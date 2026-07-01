#!/usr/bin/env bash
#
# lint-clause-nests-under-a-field.sh — a clause spec's `block.nestsUnder` must name a
# STRUCTURED FIELD (enum / array / object) of another clause, never a scalar and never a
# non-existent field.
#
# What nestsUnder means (and the confusion this guard kills): `block.nestsUnder: "X"` makes
# THIS clause render nested beneath the field named `X` of whatever parent clause is being
# drawn (clauseSpecSource.ts → AgreementDrawer.tsx). Semantically: "this clause REFINES field
# X." That is a DIFFERENT job from `block.article`, which GROUPS co-equal clauses together.
# The two get conflated: an author who wants "these clauses belong WITH cargo" reaches for
# nestsUnder and points it at cargo's first field — but grouping is `article`'s job.
#
# The mechanical tell: you never nest a whole clause under a SCALAR. The canonical-correct
# use is proximity-policy → nestsUnder "handoff", where `handoff` is an ARRAY field the policy
# elaborates. The bug this guard was born from (2026-07-01): freight-class / cold-chain /
# hazmat all declared nestsUnder "massGrams" — a real field, but cargo's `integer` mass. It
# was structurally valid (a real field name) so nothing flagged it; it silently buried three
# co-equal logistics clauses under a lone number.
#
# Flags, for every clause whose block.nestsUnder is set:
#   - the target field name exists on NO clause  → dangling reference.
#   - the target field is SCALAR everywhere it exists (integer/string/number/boolean) → a
#     whole clause cannot refine a scalar; it wanted `article` grouping, not nesting.
# Passes when the target is a structured field (enum/array/object) on some clause.
#
# Scans the WHOLE clauses/ set (cross-clause resolution — ignores "$@"). Wired whole-tree in
# .husky/pre-commit alongside lint-clause-counts.sh. Exit 0 clean, 1 on violation.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

node -e '
    const fs = require("fs");
    const path = require("path");
    const dir = path.join(process.argv[1], "clauses");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

    const SCALAR = new Set(["integer", "string", "number", "boolean"]);

    // field name -> set of every type it is declared as, across all clauses (recursive).
    const fieldTypes = new Map();
    const addField = (name, type) => {
        if (!fieldTypes.has(name)) fieldTypes.set(name, new Set());
        fieldTypes.get(name).add(type);
    };
    const walk = (fields) => {
        for (const f of fields || []) {
            if (f && typeof f.name === "string") addField(f.name, f.type);
            if (f && f.type === "object") walk(f.fields);
        }
    };

    const specs = [];
    for (const file of files) {
        const spec = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
        specs.push({ file, spec });
        walk(spec.fields);
    }

    let violations = 0;
    for (const { file, spec } of specs) {
        const target = spec.block && spec.block.nestsUnder;
        if (typeof target !== "string" || target.length === 0) continue;

        const types = fieldTypes.get(target);
        if (!types) {
            console.log(`[clause-nests-under] clauses/${file}: block.nestsUnder "${target}" names NO field on any clause (dangling).`);
            violations++;
            continue;
        }
        const structured = [...types].some((t) => !SCALAR.has(t));
        if (!structured) {
            console.log(`[clause-nests-under] clauses/${file}: block.nestsUnder "${target}" is a SCALAR field (${[...types].join("/")}) — a clause cannot nest under a scalar.`);
            violations++;
        }
    }

    if (violations > 0) {
        console.log("");
        console.log("[clause-nests-under] " + violations + " clause(s) misuse block.nestsUnder.");
        console.log("nestsUnder REFINES a structured field (enum/array/object) of another clause — it is");
        console.log("NOT how clauses are grouped. To GROUP co-equal clauses together, give them the same");
        console.log("block.article and drop nestsUnder. Reserve nestsUnder for a genuine sub-clause that");
        console.log("elaborates one structured field (e.g. proximity-policy under the handoff array).");
        process.exit(1);
    }
' "$ROOT"
