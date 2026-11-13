#!/usr/bin/env node
// check-licence.mjs: anyone can run it with `node scripts/check-licence.mjs`.
// It fails unless every LICENSE file is the MIT text and every package manifest
// (package.json, Cargo.toml) declares a licence consistent with MIT. A package.json
// with "private": true and no licence is accepted, since it is never published.
// A Cargo.toml with no licence is reported and accepted, since the repository LICENSE
// covers it; one that declares another licence fails. Each file it reads is printed.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".git", "target", "out", ".next", "dist", "cache", "work", ".claude"]);
const failures = [];
const fail = (m) => failures.push(m);

function walk(dir, hits = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const s = statSync(p);
        if (s.isDirectory()) {
            if (!SKIP.has(name)) walk(p, hits);
        } else if (name === "package.json" || name === "Cargo.toml" || name === "LICENSE") hits.push(p);
    }
    return hits;
}

const norm = (t) => t.replace(/\s+/g, " ").trim();
const MIT_MARKERS = [
    "MIT License",
    "Permission is hereby granted, free of charge, to any person obtaining a copy",
    "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.",
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND',
];
const isMit = (text) => MIT_MARKERS.every((m) => norm(text).includes(m));

const files = walk(root).sort();
if (!files.some((p) => relative(root, p) === "LICENSE")) fail("no LICENSE at the repository root");

for (const p of files) {
    const rel = relative(root, p);
    const text = readFileSync(p, "utf8");
    if (rel === "LICENSE" || rel.endsWith("/LICENSE")) {
        console.log(`read ${rel}: ${isMit(text) ? "MIT text" : "NOT the MIT text"}`);
        if (!isMit(text)) fail(`${rel} is not the MIT text`);
    } else if (rel.endsWith("package.json")) {
        let j;
        try {
            j = JSON.parse(text);
        } catch {
            fail(`${rel} is not valid JSON`);
            continue;
        }
        const lic = j.license;
        console.log(`read ${rel}: license=${lic ?? "(none)"} private=${j.private === true}`);
        if (!(lic === "MIT" || (lic === undefined && j.private === true))) {
            fail(`${rel} declares license ${JSON.stringify(lic)} and is not private`);
        }
    } else {
        const m = text.match(/^\s*license\s*=\s*"([^"]+)"/m);
        const viaWorkspace = /^\s*license\.workspace\s*=\s*true/m.test(text);
        console.log(`read ${rel}: license=${m ? m[1] : viaWorkspace ? "(workspace)" : "(none)"}`);
        if (m && m[1] !== "MIT") fail(`${rel} declares license ${m[1]}`);
    }
}

if (failures.length) {
    console.error("FAIL:\n" + failures.map((f) => "  " + f).join("\n"));
    process.exit(1);
}
console.log("OK: every LICENSE is the MIT text and no manifest declares another licence");
