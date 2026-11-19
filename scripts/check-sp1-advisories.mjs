#!/usr/bin/env node
// Fails when a pinned `sp1*` crate in prover/Cargo.lock is inside the affected
// range of a published GitHub security advisory.
//
//   node scripts/check-sp1-advisories.mjs [--lock <Cargo.lock>] [--advisories <file.json>]
//
// Why a check of its own: RustSec carries none of SP1's advisories, so
// `cargo audit` and `cargo deny` cannot see them. SP1 publishes them as
// security advisories of the succinctlabs/sp1 repository, and only some of
// them reach the reviewed global advisory database. The check reads both:
//
//   1. GET /advisories?ecosystem=rust&affects=<names>  (the global database;
//      every pinned name is queried in its hyphen and its underscore spelling,
//      since SP1's entries name the crates with underscores)
//   2. GET /repos/succinctlabs/sp1/security-advisories?state=published
//
// Both endpoints answer without a token. GITHUB_TOKEN, when set, is sent only
// to raise the rate limit; it is never printed.
//
// Matching: a crate name is compared with `_` read as `-`. An advisory entry
// with no package name (SP1's older repository advisories) is applied to every
// pinned sp1 crate, so an unnamed entry can only fail the check, never pass it.
// A read that fails fails the check.
//
// --advisories <file> replaces both reads with a JSON array of advisories in
// the API's shape (the test in scripts/test-check-sp1-advisories.mjs uses it).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.github.com";
const SP1_REPO = "succinctlabs/sp1";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The `sp1*` packages of a Cargo.lock, as [{ name, version }]. */
export function sp1Pins(lockText) {
    const pins = [];
    for (const block of lockText.split(/^\[\[package\]\]$/m).slice(1)) {
        const name = /^name = "([^"]+)"$/m.exec(block)?.[1];
        const version = /^version = "([^"]+)"$/m.exec(block)?.[1];
        if (name && version && /^sp1[-_]/.test(name)) pins.push({ name, version });
    }
    return pins;
}

const norm = (name) => name.toLowerCase().replace(/_/g, "-");

/** A version as three numbers and a pre-release tag ("" when none). */
function parseVersion(v) {
    const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(v.trim());
    if (!m) throw new Error(`unreadable version "${v}"`);
    return { n: [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)], pre: m[4] ?? "" };
}

export function compareVersions(a, b) {
    const x = parseVersion(a);
    const y = parseVersion(b);
    for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] < y.n[i] ? -1 : 1;
    if (x.pre === y.pre) return 0;
    if (!x.pre) return 1;
    if (!y.pre) return -1;
    return x.pre < y.pre ? -1 : 1;
}

/** True when `version` meets every constraint of a range such as ">= 6.0.0, <= 6.8.0". */
export function inRange(version, range) {
    if (!range || !range.trim()) throw new Error("empty vulnerable_version_range");
    return range.split(",").every((part) => {
        const m = /^\s*(>=|<=|>|<|=)?\s*(\S+)\s*$/.exec(part);
        if (!m) throw new Error(`unreadable constraint "${part}" in "${range}"`);
        const c = compareVersions(version, m[2]);
        switch (m[1] ?? "=") {
            case ">=": return c >= 0;
            case "<=": return c <= 0;
            case ">": return c > 0;
            case "<": return c < 0;
            default: return c === 0;
        }
    });
}

/** Every (pin, advisory) pair where the pin is in an affected range. */
export function affectedPins(pins, advisories) {
    const hits = [];
    for (const adv of advisories) {
        for (const vuln of adv.vulnerabilities ?? []) {
            const pkg = vuln.package?.name ?? "";
            const eco = vuln.package?.ecosystem ?? "";
            if (eco && eco.toLowerCase() !== "rust") continue;
            const range = vuln.vulnerable_version_range;
            for (const pin of pins) {
                if (pkg && norm(pkg) !== norm(pin.name)) continue;
                if (inRange(pin.version, range)) {
                    hits.push({ pin, ghsa: adv.ghsa_id, severity: adv.severity, range, pkg: pkg || "(no package named)" });
                }
            }
        }
    }
    return hits;
}

async function getAll(url) {
    const headers = { Accept: "application/vnd.github+json" };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const out = [];
    let next = url;
    while (next) {
        const res = await fetch(next, { headers });
        if (!res.ok) throw new Error(`GET ${next.replace(API, "")} answered ${res.status}`);
        out.push(...(await res.json()));
        next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get("link") ?? "")?.[1] ?? null;
    }
    return out;
}

/** The advisories of both sources, one entry per GHSA id. */
export async function readAdvisories(pins) {
    const names = [...new Set(pins.flatMap((p) => [norm(p.name), norm(p.name).replace(/-/g, "_")]))];
    const global = await getAll(
        `${API}/advisories?ecosystem=rust&per_page=100&affects=${encodeURIComponent(names.join(","))}`,
    );
    const repo = await getAll(`${API}/repos/${SP1_REPO}/security-advisories?state=published&per_page=100`);
    const byId = new Map();
    for (const a of [...global, ...repo]) {
        const seen = byId.get(a.ghsa_id);
        byId.set(a.ghsa_id, seen ? { ...seen, vulnerabilities: [...seen.vulnerabilities, ...a.vulnerabilities] } : a);
    }
    return { advisories: [...byId.values()], globalCount: global.length, repoCount: repo.length };
}

async function main(argv) {
    const arg = (flag) => {
        const i = argv.indexOf(flag);
        return i === -1 ? undefined : argv[i + 1];
    };
    const lockPath = arg("--lock") ?? path.join(ROOT, "prover/Cargo.lock");
    const pins = sp1Pins(fs.readFileSync(lockPath, "utf8"));
    if (pins.length === 0) {
        console.error(`no sp1 crate found in ${lockPath}`);
        return 1;
    }
    const versions = [...new Set(pins.map((p) => p.version))].join(", ");
    console.log(`${pins.length} sp1 crates pinned in ${path.relative(ROOT, lockPath) || lockPath}, at ${versions}`);

    let advisories;
    const file = arg("--advisories");
    if (file) {
        advisories = JSON.parse(fs.readFileSync(file, "utf8"));
        console.log(`${advisories.length} advisories read from ${file}`);
    } else {
        const read = await readAdvisories(pins);
        advisories = read.advisories;
        console.log(
            `${read.globalCount} advisories from the global database, ${read.repoCount} from ${SP1_REPO}; ${advisories.length} distinct`,
        );
    }

    for (const a of advisories) {
        const ranges = (a.vulnerabilities ?? [])
            .map((v) => `${v.package?.name || "(no package named)"} ${v.vulnerable_version_range}`)
            .join("; ");
        console.log(`  ${a.ghsa_id} (${a.severity}): ${ranges}`);
    }

    const hits = affectedPins(pins, advisories);
    if (hits.length === 0) {
        console.log("no pinned sp1 crate is in an affected range");
        return 0;
    }
    for (const h of hits) {
        console.error(`AFFECTED: ${h.pin.name} ${h.pin.version} is in ${h.ghsa} (${h.severity}), ${h.pkg} ${h.range}`);
    }
    return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2)).then(
        (code) => process.exit(code),
        (err) => {
            console.error(`check-sp1-advisories: ${err.message}`);
            process.exit(1);
        },
    );
}
