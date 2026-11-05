#!/usr/bin/env node
// check-release-vkey.mjs — which deployed verifiers a sequencer release serves.
//
// The sequencer embeds the SP1 guest ELF, and the ELF's hash is the verification
// key FigaroBatchVerifier pins as its `programVKey`. A binary serves exactly the
// verifiers that pin its key. Deployment records (`deployments/<chainId>.json`;
// `.expected.json` states intent, never a deployment) can pin different keys
// once two chains run different guest generations (docs/AUDITOR_HANDOVER.md,
// accepted risk 13), so a release is cut PER GENERATION: it publishes when at
// least one record pins the computed key, names the records it serves, and
// names the others as served by another generation. It refuses only a key no
// record pins, or a tree with no record at all.
//
//   node scripts/check-release-vkey.mjs --vkey 0x… [--records deployments]
//     prints one line per record, then `served=<chainId,…>` for the workflow;
//     exit 0 when at least one record pins the key, 1 otherwise
//   node scripts/check-release-vkey.mjs --self-test
//
// Run by .github/workflows/sequencer-release.yml; the same script a reader
// runs locally against a downloaded binary's key.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

export function classify(vkey, dir) {
    const key = String(vkey).toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(key)) throw new Error(`not a verification key: ${vkey}`);
    const records = fs
        .readdirSync(dir)
        .filter((f) => /^\d+\.json$/.test(f))
        .sort((a, b) => Number(a.split(".")[0]) - Number(b.split(".")[0]));
    const served = [];
    const other = [];
    for (const f of records) {
        const chainId = f.slice(0, -5);
        const record = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        const pinned = typeof record.programVKey === "string" ? record.programVKey.toLowerCase() : null;
        if (pinned === key) served.push({ chainId, pinned });
        else other.push({ chainId, pinned });
    }
    return { records: records.length, served, other };
}

function report(result, out = console.log) {
    for (const r of result.served) out(`serves chain ${r.chainId}: its record pins this key`);
    for (const r of result.other) {
        out(
            r.pinned === null
                ? `chain ${r.chainId}: its record pins no programVKey — not served`
                : `chain ${r.chainId}: another generation — its record pins ${r.pinned}`,
        );
    }
    out(`served=${result.served.map((r) => r.chainId).join(",")}`);
}

function selfTest() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "release-vkey-"));
    const a = "0x" + "a".repeat(64);
    const b = "0x" + "b".repeat(64);
    fs.writeFileSync(path.join(dir, "11155111.json"), JSON.stringify({ programVKey: a.toUpperCase().replace("0X", "0x") }));
    fs.writeFileSync(path.join(dir, "1.json"), JSON.stringify({ programVKey: b }));
    fs.writeFileSync(path.join(dir, "137.json"), JSON.stringify({}));
    fs.writeFileSync(path.join(dir, "1.expected.json"), JSON.stringify({ programVKey: a }));
    let rc = 0;
    const expect = (label, cond) => {
        console.log(`[check-release-vkey] self-test: ${label} — ${cond ? "ok" : "FAIL"}`);
        if (!cond) rc = 1;
    };
    const r = classify(a, dir);
    expect("the expected.json file is not a record", r.records === 3);
    expect("a record pinning the key (any case) is served", r.served.length === 1 && r.served[0].chainId === "11155111");
    expect("a record pinning another key is another generation", r.other.some((o) => o.chainId === "1" && o.pinned === b));
    expect("a record without a key is not served", r.other.some((o) => o.chainId === "137" && o.pinned === null));
    const lines = [];
    report(r, (l) => lines.push(l));
    expect("the served line names the chains served", lines[lines.length - 1] === "served=11155111");
    expect("a key no record pins serves nothing", classify("0x" + "c".repeat(64), dir).served.length === 0);
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "release-vkey-empty-"));
    expect("a tree without a record has no records", classify(a, empty).records === 0);
    let threw = false;
    try { classify("0x12", dir); } catch { threw = true; }
    expect("a malformed key is refused", threw);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(empty, { recursive: true, force: true });
    return rc;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    if (args.includes("--self-test")) process.exit(selfTest());
    const at = (flag, dflt) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : dflt);
    const vkey = at("--vkey", null);
    if (!vkey) { console.error("usage: check-release-vkey.mjs --vkey 0x… [--records deployments] | --self-test"); process.exit(2); }
    const result = classify(vkey, at("--records", "deployments"));
    if (result.records === 0) { console.error("no deployment record under the records directory — refusing to publish"); process.exit(1); }
    report(result);
    if (result.served.length === 0) { console.error(`no deployment record pins ${vkey} — refusing to publish`); process.exit(1); }
}
