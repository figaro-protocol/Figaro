#!/usr/bin/env node
// The frontend's dependency audit, with the advisories that cannot reach a
// static export named and set aside. `npm audit` reads package versions; it
// cannot know that this site ships no Next server (output: 'export' — no
// image optimizer, no middleware, no rewrites, no server components at
// runtime; docs/RELEASE_READINESS.md states the posture). Each advisory in
// frontend/.audit-ignore.json is one such, with its reason beside it. Any
// other high or critical advisory fails.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ignore = JSON.parse(readFileSync(new URL("../frontend/.audit-ignore.json", import.meta.url), "utf8"));
let report;
try {
    report = JSON.parse(execSync("npm audit --omit=dev --json", { cwd: new URL("../frontend", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
} catch (e) {
    // npm audit exits non-zero when it finds anything; the report is still on stdout
    report = JSON.parse(e.stdout);
}
const GATE = new Set(["high", "critical"]);
const failing = [];
const setAside = [];
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of v.via ?? []) {
        if (typeof via !== "object" || !via.url) continue;
        const id = via.url.split("/").pop();
        if (id in ignore) { setAside.push(`${name}: ${id} — ${ignore[id]}`); continue; }
        if (GATE.has(via.severity)) failing.push(`${name} ${v.range}: ${via.title} (${via.url})`);
    }
}
for (const line of setAside) console.log(`set aside — ${line}`);
if (failing.length > 0) {
    console.error("high or critical advisories not set aside:");
    for (const line of failing) console.error(`  ${line}`);
    process.exit(1);
}
console.log("frontend audit: no high or critical advisory reaches the static export");
