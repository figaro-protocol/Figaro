#!/bin/bash
# lint-nav-structure.sh — MARKETING_MAP must equal the ruled route tree.
#
# The marketing nav is DERIVED from the route-group structure (operator
# ruling 2026-08-07), one group per protocol object:
#   (deal) -> /kernel                       (section "The Deal")
#   (compose)+(rewards)+(spec) -> /clauses  (section "Builders" — the three
#                                            ruled sections survive as inert
#                                            subheadings inside the panel)
#   (participants) -> /members
#   (research) -> /why
# plus MARKET, the one all-bridge section carrying the (app) tier's
# e-commerce tools (/discover, /orders, /audit). (reference) is footer
# chrome and carries no nav entries; papers/ are reached through Working
# Groups. /local-commerce and /faq are nav-visible under The Deal
# (operator, 2026-08-07) on the standing condition that sitewide copy
# stays demoted — the meal is one worked example, never THE model.
# Labels are each page's own metadata.title
# minus the " — Figaro Protocol" suffix. Entry ORDER within a group is the
# ruled reading order (owned by navLinks.ts), so this guard checks set
# equality, labels, and doorway-first — not alphabetical order.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

node --input-type=module <<'EOF'
import fs from "node:fs";
import path from "node:path";

const ROOT = "frontend/app/(marketing)";
const NAV = "frontend/components/shared/navLinks.ts";
const SUFFIX = " — Figaro Protocol";
const DOORWAYS = {
    "(deal)": "/kernel",
    "(compose)": "/clauses",
    "(rewards)": "/clauses",
    "(spec)": "/clauses",
    "(participants)": "/members",
    "(research)": "/why",
};
const SKIP_GROUPS = new Set(["(reference)"]);
const EXCLUDE_ROUTES = new Set([]);
const MARKET = {
    doorway: "/discover",
    pages: [
        ["/discover", "frontend/app/(app)/discover/page.tsx"],
        ["/orders", "frontend/app/(app)/orders/page.tsx"],
        ["/audit", "frontend/app/(app)/audit/page.tsx"],
    ],
};

const titleOf = (file) => {
    const m = fs.readFileSync(file, "utf8").match(/title:\s*"([^"]+)"/);
    if (!m) {
        console.error(`[nav-structure:FAIL] ${file} — no literal metadata.title; the nav label derives from it.`);
        process.exit(1);
    }
    return m[1].endsWith(SUFFIX) ? m[1].slice(0, -SUFFIX.length) : m[1];
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
    if (SKIP_GROUPS.has(top)) continue;
    const doorway = DOORWAYS[top];
    if (!doorway) {
        console.error(`[nav-structure:FAIL] ${page} — route dir "${top}" has no doorway mapping; add it here AND to the nav, or regroup the page.`);
        process.exit(1);
    }
    const route = "/" + segments.filter((s) => !s.startsWith("(")).join("/");
    if (EXCLUDE_ROUTES.has(route)) continue;
    expected.get(doorway).set(route, titleOf(page));
}
expected.set(MARKET.doorway, new Map(MARKET.pages.map(([route, file]) => [route, titleOf(file)])));

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
        if (!want.has(href)) fail(`section "${group.section}" lists ${href}, which is not a page of its route group (or is excluded from nav).`);
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
console.log("[nav-structure] clean — MARKETING_MAP equals the ruled route tree");
EOF
