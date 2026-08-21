#!/bin/bash
# lint-sdk-synopsis.sh — the README's Synopsis table must match the built SDK.
#
# The table (sdk/README.md § "Synopsis — which entry point is each export
# from?") promises: every row's export exists on the entry point it names, and
# every export a README recipe calls has a row. Both promises drift silently on
# a rename — this guard executes them (added 2026-08-21 with the table; the
# builder wave's verifier, made standing).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

node --input-type=module <<'EOF'
import fs from "node:fs";

const README = "sdk/README.md";
const ENTRY_POINTS = {
    "root": "sdk/dist/index.js",
    "/agent": "sdk/dist/agent/index.js",
    "/derive": "sdk/dist/derive/index.js",
    "/clauses": "sdk/dist/clauses/index.js",
    "/handoff": "sdk/dist/handoff/index.js",
    "/signer": "sdk/dist/signer/index.js",
};

const mods = {};
for (const [name, file] of Object.entries(ENTRY_POINTS)) {
    if (!fs.existsSync(file)) {
        console.error(`[sdk-synopsis:FAIL] ${file} missing — build the SDK first (npm run build --workspace sdk).`);
        process.exit(1);
    }
    mods[name] = new Set(Object.keys(await import(`${process.cwd()}/${file}`)));
}

const md = fs.readFileSync(README, "utf8");
const synStart = md.indexOf("### Synopsis");
if (synStart === -1) { console.error("[sdk-synopsis:FAIL] Synopsis section not found in sdk/README.md."); process.exit(1); }
const synEnd = md.indexOf("\n### ", synStart + 10);
const table = md.slice(synStart, synEnd === -1 ? undefined : synEnd);

let failed = false;
const fail = (m) => { console.error(`[sdk-synopsis:FAIL] ${m}`); failed = true; };

// Rows: | `export` | `entryPoint` | ... |
const rows = [...table.matchAll(/^\|\s*`([A-Za-z0-9_]+)`\s*\|\s*`?([^`|]+?)`?\s*\|/gm)]
    .map((m) => [m[1], m[2].trim().replace(/^@figaro-protocol\/sdk\/?/, "")])
    .map(([e, ep]) => [e, ep === "" ? "root" : ep]);
if (rows.length === 0) fail("no rows parsed from the Synopsis table — format changed?");
const tabled = new Set(rows.map(([e]) => e));
for (const [exp, ep] of rows) {
    const key = ep === "root" ? "root" : ep.startsWith("/") ? ep : `/${ep}`;
    if (!mods[key]) fail(`row \`${exp}\` names unknown entry point \`${ep}\`.`);
    else if (!mods[key].has(exp)) fail(`row \`${exp}\` → \`${ep}\`: no such export on that entry point.`);
}

// Recipe-called exports (code fences OUTSIDE the table) must have a row.
const outside = md.slice(0, synStart) + (synEnd === -1 ? "" : md.slice(synEnd));
const allExports = new Set(Object.values(mods).flatMap((s) => [...s]));
const called = new Set();
for (const fence of outside.matchAll(/```[a-z]*\n([\s\S]*?)```/g)) {
    for (const tok of fence[1].matchAll(/\b([a-zA-Z_][A-Za-z0-9_]*)\s*\(/g)) {
        if (allExports.has(tok[1])) called.add(tok[1]);
    }
}
// Constants rule: *_ABI / EV_* / RPGF_* are covered by the table's stated rule, not rows.
for (const name of called) {
    if (/^(EV_|RPGF_)|_ABI$/.test(name)) continue;
    if (!tabled.has(name)) fail(`recipe calls \`${name}\` but the Synopsis table has no row for it.`);
}

if (failed) process.exit(1);
console.log(`[sdk-synopsis] clean — ${rows.length} rows resolve; every recipe-called export tabled`);
EOF
