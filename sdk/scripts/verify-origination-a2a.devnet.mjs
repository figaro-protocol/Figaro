#!/usr/bin/env node
/**
 * verify-origination-a2a.devnet.mjs — autonomous origination over the A2A wire.
 *
 * The sibling of verify-origination.devnet.mjs, but the two agents talk over an
 * actual HTTP server instead of the in-process channel: the seller runs a
 * node:http endpoint wrapping `makeSellerOfferHandler` via `makeA2aOfferResponder`
 * (the JSON-RPC `message/send` wire); the buyer originates through `A2aChannel`,
 * which sends the offer as an A2A data part
 * envelope to that endpoint and awaits the counter-signed reply. This is the
 * proof that turns "the wire is swappable" from asserted to DEMONSTRATED — the
 * envelope crosses a socket (real serialize/deserialize) and a full bonded
 * process still lands on chain. Run against a live devnet:
 *
 *   ./scripts/devup.sh && (cd frontend && node scripts/populate-test-data.mjs)
 *   cd sdk && npm run build && node scripts/verify-origination-http.devnet.mjs
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
    FigaroContext, originateProcess, makeSellerOfferHandler,
    A2aChannel, makeA2aOfferResponder,
} from "@figaro-protocol/sdk/agent";
import {
    anchorAssembly, computeDeadline, hydrateAssembly, parseProjectionHints, readChainTimestamp, agreementClauses,
} from "@figaro-protocol/sdk";
import { parseClauseSpec } from "@figaro-protocol/sdk/clauses";
import { bindAssemblyAsSeller, designReader, memberProfileReader } from "./devnet-seller.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
    readFileSync(resolve(here, "../../frontend/.env.local"), "utf8").split("\n")
        .filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const RPC = process.env.FIGARO_DEVNET_RPC_URL || "http://127.0.0.1:8545";
const GATEWAY = "http://127.0.0.1:8080/ipfs/";
const IPFS_API = env.NEXT_PUBLIC_IPFS_API_URL || "http://127.0.0.1:5001";
const addresses = {
    core: env.NEXT_PUBLIC_FIGARO_CORE, clauseRegistry: env.NEXT_PUBLIC_CLAUSE_REGISTRY,
    membersRegistry: env.NEXT_PUBLIC_MEMBERS_REGISTRY, assemblyRegistry: env.NEXT_PUBLIC_ASSEMBLY_REGISTRY,
    agreementRegistry: env.NEXT_PUBLIC_AGREEMENT_REGISTRY,
};
const TOKEN = env.NEXT_PUBLIC_TOKEN_ADDRESS;
const BUYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"); // anvil[0]
const SELLER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"); // anvil[1]
const PAYMENT = 1000n;

const pub = createPublicClient({ transport: http(RPC), cacheTime: 0 });
const buyerW = createWalletClient({ account: BUYER, transport: http(RPC) });
const sellerW = createWalletClient({ account: SELLER, transport: http(RPC) });
const chainId = await pub.getChainId();
// CHAIN time, never the machine clock — FigaroCore's DeadlineExpired guard
// compares against block.timestamp.
const deadline = computeDeadline(await readChainTimestamp(pub));
const tryHydrate = async (uri) => { try { return await (await fetch(GATEWAY + uri.replace("ipfs://", ""))).json(); } catch { return null; } };

let fail = 0; const check = (n, c) => { console.log(`${c ? "✓" : "✗ FAIL"} ${n}`); if (!c) fail++; };

// ── Shared discovery + the SpecSource (registry→IPFS, parseClauseSpec +
//    parseProjectionHints) — built BEFORE the seller endpoint so both sides of
//    the socket run the merkle-leaf sign gate (assertAgreementSignable). ──────
const ctx = new FigaroContext(pub, addresses);
await ctx.sync();
const specViews = [];
for (const c of ctx.getClauses()) {
    const raw = await tryHydrate(c.contentURI);
    if (!raw) continue;
    const parsed = parseClauseSpec(raw);
    if (parsed.ok) specViews.push({ ...parsed.spec, clauseKey: c.clauseKey, hints: parseProjectionHints(raw) });
}
const specs = {
    get: (clauseKey) => specViews.find((v) => v.clauseKey.toLowerCase() === clauseKey.toLowerCase()),
    list: () => specViews,
};

// An assembly is offered only when its assembly hashes to its composition
// hash and every one of its registered agreements hydrates and verifies
// against its key — read from the binding whatever its stake.
const hydrate = async (a) => {
    const t = anchorAssembly(await tryHydrate(a.contentURI), a.assemblyHash);
    if (!t) return null;
    return hydrateAssembly(t, async (key) => {
        const binding = ctx.getAgreementBinding(key);
        return binding ? tryHydrate(binding.contentURI) : null;
    });
};

// ── Seller: run its offer handler behind a REAL HTTP endpoint ─────────────────
// Refuse-all floor: the proof script IS the operator — explicit accept + policy.
// The readers give the gate the seller's own profile (the offer's assembly
// must be bound there) and the design the offer names, read at acceptance.
const readProfile = memberProfileReader(ctx, tryHydrate);
const readDesign = designReader(ctx, hydrate);
const responder = makeA2aOfferResponder(makeSellerOfferHandler(sellerW, pub, addresses, {
    accept: () => true, policy: { requireRootShape: true, currencyAllowlist: [TOKEN], maxValue: 10_000n },
    specs, // the merkle-leaf seam on the counter-sign side of the socket
    readDesign,
    readProfile,
}));
const server = createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c));
    req.on("end", async () => {
        const out = await responder(body);
        res.writeHead(out.status, { "content-type": "application/json" });
        res.end(out.body);
    });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const sellerUrl = `http://127.0.0.1:${server.address().port}/offer`;
check("seller HTTP endpoint is listening", !!server.address().port);

// ── Buyer discovers the network (the ctx synced above) ────────────────────────
// The single-order assembly with the fewest clauses: the mandatory-only blank the harness
// seeds, whatever else the genesis holds — no hardcoded id, no order of anchoring.
let chosen = null, assembly = null, fewest = Infinity;
for (const a of ctx.getAssemblies()) {
    const h = await hydrate(a);
    if (!h || h.assembly.agreements.length !== 1) continue;
    const n = Object.keys(agreementClauses(h, h.assembly.agreements[0])).length;
    if (n < fewest) { chosen = a; assembly = h; fewest = n; }
}
check("discovered a single-order seed assembly", !!chosen);
if (!chosen) { server.close(); process.exit(1); }

const commerceClauseId = Object.keys(agreementClauses(assembly, assembly.assembly.agreements[0]))
    .find((cid) => (specs.get(cid)?.fields ?? []).some((f) => f.name === "lineItems")) ?? null;
check("located the commerce clause by its declared field", !!commerceClauseId);

// ── The seller binds the assembly in its own member profile ──────────────────
await bindAssemblyAsSeller({
    pub, wallet: sellerW, membersRegistry: addresses.membersRegistry, assemblyHash: chosen.assemblyHash,
    ipfsApiUrl: IPFS_API, readProfile, name: "Origination proof seller",
});
check("the seller's own profile binds the assembly", (await readProfile(SELLER.address))?.assemblyBindings
    ?.some((b) => b.assemblyHash.toLowerCase() === chosen.assemblyHash.toLowerCase()) === true);

// ── Buyer LOOP: originate over HttpChannel (the seller is reached via the socket) ─
const channel = new A2aChannel({ resolveEndpoint: async () => sellerUrl });
const result = await originateProcess(buyerW, pub, addresses, {
    channel, assembly, seller: SELLER.address, currency: TOKEN, payment: PAYMENT, chainId, core: addresses.core, deadline,
    specs, // the merkle-leaf seam before the buyer signs
    overrides: { [commerceClauseId]: { currency: TOKEN, payment: PAYMENT.toString(), lineItems: [{ itemId: "sku-1", name: "Autonomous order (HTTP)", quantity: 1, unitPrice: PAYMENT.toString() }] } },
});
check("origination returned a tx (offer traversed a real HTTP socket, seller counter-signed)", !!result?.hash);
if (result?.hash) {
    const rcpt = await pub.waitForTransactionReceipt({ hash: result.hash });
    check("initiate-process commit landed on chain (status success)", rcpt.status === "success");
}

// ── Out-of-band: the process is discoverable on chain ─────────────────────────
await ctx.sync();
const originated = ctx.getProcessesAsBuyer(BUYER.address)
    .some((p) => [...p.orders.values()].some((o) => o.seller.toLowerCase() === SELLER.address.toLowerCase() && o.payment === PAYMENT));
check("the originated process is discoverable on chain with the right seller + payment", originated);

server.close();
console.log(`\n${fail === 0 ? "AUTONOMOUS ORIGINATION OVER A2A PROVEN — the interop wire is real, not asserted" : fail + " CHECK(S) FAILED"}`);
process.exit(fail === 0 ? 0 : 1);
