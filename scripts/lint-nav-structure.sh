#!/bin/bash
# lint-nav-structure.sh — MARKETING_MAP must equal the (marketing) route tree.
#
# The marketing nav is DERIVED from the route-group structure, never curated:
#   (explain) -> doorway /kernel     (section "Kernel")
#   (contribute) -> doorway /builders (section "Builders")
#   (surfaces) -> doorway /members    (section "Join")
#   working-groups/ -> doorway /working-groups (section "Groups")
# papers/ and the root page carry no nav entries. Labels are each page's own
# metadata.title minus the " — Figaro Protocol" suffix. This guard re-derives
# the expected map from the tree and fails on any disagreement — a page
# added, removed, or retitled must be reflected in navLinks.ts, and nothing
# outside the (marketing) tier may appear there.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

node --input-type=module <<'EOF'
import fs from "node:fs";
import path from "node:path";

const ROOT = "frontend/app/(marketing)";
const NAV = "frontend/components/shared/navLinks.ts";
const SUFFIX = " — Figaro Protocol";
const DOORWAYS = {
    "(explain)": "/kernel",
    "(contribute)": "/builders",
    "(surfaces)": "/members",
    "working-groups": "/working-groups",
};
// Sanctioned tier bridges: routes OUTSIDE (marketing) that one doorway's
// group carries so the tier's tools stay reachable from the publication nav.
// Labels still derive from each page's own metadata.title.
const BRIDGES = {
    "/builders/clauses": { doorway: "/builders", file: "frontend/app/(builders)/builders/clauses/page.tsx" },
    "/builders/designer": { doorway: "/builders", file: "frontend/app/(builders)/builders/designer/page.tsx" },
};

const pages = [];
(function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name === "page.tsx") pages.push(p);
    }
})(ROOT);

const expected = new Map(Object.values(DOORWAYS).map((d) => [d, new Map()]));
for (const page of pages) {
    const rel = path.relative(ROOT, path.dirname(page));
    if (rel === "" || rel.startsWith("papers")) continue;
    const segments = rel.split(path.sep);
    const top = segments[0];
    const doorway = DOORWAYS[top];
    if (!doorway) {
        console.error(`[nav-structure:FAIL] ${page} — route dir "${top}" has no doorway mapping; add it to lint-nav-structure.sh AND the nav, or regroup the page.`);
        process.exit(1);
    }
    const route = "/" + segments.filter((s) => !s.startsWith("(")).join("/");
    const src = fs.readFileSync(page, "utf8");
    const m = src.match(/title:\s*"([^"]+)"/);
    if (!m) {
        console.error(`[nav-structure:FAIL] ${page} — no literal metadata.title; the nav label derives from it.`);
        process.exit(1);
    }
    expected.get(doorway).set(route, m[1].endsWith(SUFFIX) ? m[1].slice(0, -SUFFIX.length) : m[1]);
}

for (const [route, bridge] of Object.entries(BRIDGES)) {
    const src = fs.readFileSync(bridge.file, "utf8");
    const m = src.match(/title:\s*"([^"]+)"/);
    if (!m) {
        console.error(`[nav-structure:FAIL] ${bridge.file} — bridge page has no literal metadata.title.`);
        process.exit(1);
    }
    expected.get(bridge.doorway).set(route, m[1].endsWith(SUFFIX) ? m[1].slice(0, -SUFFIX.length) : m[1]);
}

const navSrc = fs.readFileSync(NAV, "utf8");
const start = navSrc.indexOf("export const MARKETING_MAP");
const end = navSrc.indexOf("];", start);
const block = navSrc.slice(start, end);
const groups = [...block.matchAll(/section:\s*"([^"]+)"|href:\s*"([^"]+)",\s*label:\s*"([^"]+)"/g)].reduce(
    (acc, m) => {
        if (m[1]) acc.push({ section: m[1], links: [] });
        else acc[acc.length - 1].links.push({ href: m[2], label: m[3] });
        return acc;
    },
    [],
);

let failed = false;
const fail = (msg) => { console.error(`[nav-structure:FAIL] ${msg}`); failed = true; };

const seenDoorways = new Set();
for (const group of groups) {
    const doorway = group.links[0]?.href;
    if (!expected.has(doorway)) { fail(`section "${group.section}" — first entry "${doorway}" is not a doorway.`); continue; }
    seenDoorways.add(doorway);
    const want = expected.get(doorway);
    for (const { href, label } of group.links) {
        if (!want.has(href)) fail(`section "${group.section}" lists ${href}, which is not a page of its route group (or not in the (marketing) tier).`);
        else if (want.get(href) !== label) fail(`${href} — label "${label}" ≠ page title "${want.get(href)}".`);
    }
    for (const href of want.keys()) {
        if (!group.links.some((l) => l.href === href)) fail(`section "${group.section}" is missing ${href} (page exists in its route group).`);
    }
}
for (const doorway of expected.keys()) {
    if (!seenDoorways.has(doorway)) fail(`no section opens doorway ${doorway}.`);
}

if (failed) process.exit(1);
console.log("[nav-structure] clean — MARKETING_MAP equals the (marketing) route tree");
EOF
