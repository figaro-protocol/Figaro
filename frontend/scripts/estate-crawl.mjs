#!/usr/bin/env node
/**
 * estate-crawl.mjs — hygiene crawl of the PUBLIC estate the repo-side guards
 * structurally cannot see: the deployed site and the registered/pinned
 * documents. Added by the 2026-08-24 hygiene audit ("Sorry"/"dutch auction"
 * reports reproduced on no surface; this keeps that provable).
 *
 * What it checks, with the same residue class the pre-commit vocab guard
 * enforces in-repo (lint-no-closed-world-vocab.sh FAIL_RESIDUE) plus the
 * estate's retired-term list:
 *   1. SITE  — every sitemap route's HTML and machine-facing index.txt,
 *              plus /llms.txt and /_headers.
 *   2. PINS  — every contentURI registered in ClauseRegistry /
 *              AssemblyRegistry / MembersRegistry (event enumeration from
 *              deploymentBlock), fetched through the IPFS gateway.
 *
 * Read-only everywhere. Exit 1 on any hit so the end-of-session hygiene turn
 * can gate on it.
 *
 * Env:
 *   ESTATE_SITE_URL — site origin (default https://figaro-protocol.pages.dev;
 *                     the apex hostname is filtered on the maintainer's LAN)
 *   RPC_URL         — chain RPC. publicnode intermittently returns EMPTY
 *                     eth_getLogs results with no error (observed 2026-08-24)
 *                     — prefer the Infura endpoint from ~/.figaro-deploy.env.
 *   ESTATE_RECORD   — deployment record (default deployments/11155111.json)
 *   ESTATE_GATEWAY  — IPFS gateway origin (default the record-era Pinata
 *                     gateway; ipfs.io fallback is automatic)
 *   ESTATE_SKIP_PINS=1 — site-only crawl (no RPC needed)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, parseAbiItem } from "viem";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SITE = (process.env.ESTATE_SITE_URL ?? "https://figaro-protocol.pages.dev").replace(/\/$/, "");
const RECORD = path.resolve(ROOT, process.env.ESTATE_RECORD ?? "deployments/11155111.json");
const GATEWAY = (process.env.ESTATE_GATEWAY ?? "https://silver-recent-capybara-403.mypinata.cloud").replace(/\/$/, "");
const FALLBACK_GATEWAY = "https://ipfs.io";

// Mirror of lint-no-closed-world-vocab.sh FAIL_RESIDUE (capital Sorry only —
// Lean's lowercase `sorry`-free claims are legitimate) + the estate's
// retired-term list. Extend both together.
const RESIDUE =
    /\bSorry\b|[Aa]s an AI|I apologi[sz]|I cannot assist|lorem ipsum|[Cc]oming soon|This is a placeholder|[Nn]ote to self/;
const RETIRED =
    /[Dd]utch[- ][Aa]uction|MatchPool|boostedTag|rpgfTag|\/sellers\/|\/dispute\/|\/integrate\/|[Ff]ulfil+ment/;

// Immutable Sepolia registrations carrying a since-retired word — first-write-
// wins makes the pin permanent; each entry needs a reason and a mainnet plan.
const PIN_ALLOWLIST = new Map([
    // figaro-merchant-process v1: description says "order-fulfillment flow";
    // ruling pending on rewording the repo seed before MAINNET registration
    // (2026-08-24 hygiene audit — punch-list item).
    ["QmfEt9p5GwY1RnhfcoY1PqKcBAEuce7SVhoaeYypx1gFYR", "fulfillment in v1 description"],
]);

let hits = 0;
const flag = (where, kind, line) => {
    hits += 1;
    console.log(`[estate] ${where} — ${kind}: ${line.trim().slice(0, 160)}`);
};
const scan = (where, text) => {
    // Papers narrate the project's history and write ordinary English —
    // exempt from the retired-term class (mirrors the repo guard's papers
    // exemption); residue is never history and is checked everywhere.
    const papersExempt = where.startsWith("/papers/");
    for (const line of text.split("\n")) {
        if (RESIDUE.test(line)) flag(where, "residue", line);
        if (!papersExempt && RETIRED.test(line)) flag(where, "retired-term", line);
    }
};

const fetchText = async (url) => {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    return await res.text();
};

// ── 1. Site ─────────────────────────────────────────────────────────
const sitemap = await fetchText(`${SITE}/sitemap.xml`);
if (!sitemap) {
    console.error(`[estate] cannot fetch ${SITE}/sitemap.xml — is the site up?`);
    process.exit(2);
}
const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
let siteMisses = 0;
for (const route of routes) {
    const html = await fetchText(`${SITE}${route}`);
    if (html === null) { siteMisses += 1; console.log(`[estate] ${route} — unfetchable`); continue; }
    scan(route, html);
    const txt = await fetchText(`${SITE}${route}index.txt`);
    if (txt !== null) scan(`${route}index.txt`, txt);
}
for (const extra of ["/llms.txt", "/_headers", "/robots.txt"]) {
    const body = await fetchText(`${SITE}${extra}`);
    if (body !== null) scan(extra, body);
}
console.log(`[estate] site: ${routes.length} routes crawled${siteMisses ? `, ${siteMisses} unfetchable` : ""}`);

// ── 2. Registered pins ──────────────────────────────────────────────
if (process.env.ESTATE_SKIP_PINS !== "1") {
    const record = JSON.parse(fs.readFileSync(RECORD, "utf8"));
    const client = createPublicClient({
        // 429 backoff: Infura throttles the chunked scan (observed 2026-08-24).
        transport: http(process.env.RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com", {
            retryCount: 6,
            retryDelay: 1500,
        }),
    });
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    const fromBlock = BigInt(record.deploymentBlock);
    const toBlock = await client.getBlockNumber();
    const CHUNK = 9500n;
    const collect = async (address, event, pick) => {
        const uris = [];
        for (let from = fromBlock; from <= toBlock; from += CHUNK + 1n) {
            const to = from + CHUNK > toBlock ? toBlock : from + CHUNK;
            const logs = await client.getLogs({ address, event, fromBlock: from, toBlock: to });
            for (const log of logs) uris.push(pick(log));
            await pause(250);
        }
        return uris;
    };
    const sources = [
        ["clause", record.clauseRegistry,
            parseAbiItem("event ClauseRegistered(string clauseId, uint64 version, bytes32 contentHash, string contentURI, address indexed registeredBy)"),
            (l) => l.args.contentURI],
        ["assembly", record.assemblyRegistry,
            parseAbiItem("event AssemblyRegistered(bytes32 indexed compositionHash, address indexed registeredBy, string contentURI)"),
            (l) => l.args.contentURI],
        ["member", record.membersRegistry,
            parseAbiItem("event MemberRegistered(address indexed member, string metadataURI)"),
            (l) => l.args.metadataURI],
        ["member-update", record.membersRegistry,
            parseAbiItem("event MemberProfileUpdated(address indexed member, string metadataURI)"),
            (l) => l.args.metadataURI],
    ];
    let pinCount = 0;
    for (const [kind, address, event, pick] of sources) {
        const uris = (await collect(address, event, pick)).filter(Boolean);
        if (uris.length === 0 && kind === "clause") {
            // publicnode's silent-empty failure mode: clauses can never be zero
            // on a seeded network — treat as an RPC fault, not a clean estate.
            console.error("[estate] zero ClauseRegistered logs — suspect RPC (publicnode returns silent empties); set RPC_URL to the Infura endpoint");
            process.exit(2);
        }
        for (const uri of uris) {
            const cid = uri.replace(/^ipfs:\/\//, "");
            const body =
                (await fetchText(`${GATEWAY}/ipfs/${cid}`)) ??
                (await fetchText(`${FALLBACK_GATEWAY}/ipfs/${cid}`));
            if (body === null) { flag(`${kind} ${cid}`, "unfetchable pin", uri); continue; }
            if (PIN_ALLOWLIST.has(cid)) {
                console.log(`[estate] ${kind} ${cid} — allowlisted (${PIN_ALLOWLIST.get(cid)})`);
                pinCount += 1;
                continue;
            }
            scan(`${kind} ${cid}`, body);
            pinCount += 1;
        }
    }
    console.log(`[estate] pins: ${pinCount} registered documents fetched and scanned`);
}

if (hits > 0) {
    console.log(`\n[estate] ${hits} hit(s) — the public estate carries residue or retired vocabulary.`);
    process.exit(1);
}
console.log("[estate] clean");
