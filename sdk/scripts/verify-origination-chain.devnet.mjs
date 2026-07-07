#!/usr/bin/env node
/**
 * verify-origination-chain.devnet.mjs — AUTONOMOUS MULTI-ORDER ORIGINATION.
 *
 * A buyer and THREE sellers (keys only — no human, no browser) originate the
 * seed value-added CHAIN end-to-end over the coordination channel: root + two
 * sub-orders, each bond-secured, each seller counter-signing its own order, all
 * committed root-first in cumulative order. Dogfoods `originateChain` +
 * `makeSellerOfferHandler`. Run against a live devnet:
 *
 *   ./scripts/devup.sh && (cd frontend && node scripts/populate-test-data.mjs)
 *   cd sdk && npm run build && node scripts/verify-origination-chain.devnet.mjs
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { FigaroContext, originateChain, makeSellerOfferHandler, InProcessChannel } from "@figaro/core/agent";

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
    readFileSync(resolve(here, "../../frontend/.env.local"), "utf8").split("\n")
        .filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const RPC = process.env.FIGARO_DEVNET_RPC_URL || "http://127.0.0.1:8545";
const GATEWAY = "http://127.0.0.1:8080/ipfs/";
const addresses = {
    core: env.NEXT_PUBLIC_FIGARO_CORE, clauseRegistry: env.NEXT_PUBLIC_CLAUSE_REGISTRY,
    sellerRegistry: env.NEXT_PUBLIC_SELLER_REGISTRY, assemblyRegistry: env.NEXT_PUBLIC_ASSEMBLY_REGISTRY,
};
const TOKEN = env.NEXT_PUBLIC_TOKEN_ADDRESS;
const BUYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"); // anvil[0]
const SELLERS = [
    privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"), // anvil[1]
    privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"), // anvil[2]
    privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"), // anvil[3]
];
const PAYMENTS = [1000n, 500n, 300n]; // root + two subs → cumulative 1800

const pub = createPublicClient({ transport: http(RPC), cacheTime: 0 });
const buyerW = createWalletClient({ account: BUYER, transport: http(RPC) });
const sellerW = SELLERS.map((s) => createWalletClient({ account: s, transport: http(RPC) }));
const chainId = await pub.getChainId();
const tryHydrate = async (uri) => { try { return await (await fetch(GATEWAY + uri.replace("ipfs://", ""))).json(); } catch { return null; } };

let fail = 0; const check = (n, c) => { console.log(`${c ? "✓" : "✗ FAIL"} ${n}`); if (!c) fail++; };

// ── Discover the MULTI-order seed chain (a template with >1 agreement) ─────────
const ctx = new FigaroContext(pub, addresses);
await ctx.sync();
const clauseVersionOf = new Map(ctx.getClauses().map((c) => [c.clauseId, c.version]));
const clauseUriOf = new Map(ctx.getClauses().map((c) => [c.clauseId, c.contentURI]));

let template = null;
for (const a of ctx.getAssemblies()) {
    const t = await tryHydrate(a.contentURI);
    if (t && Array.isArray(t.agreements) && t.agreements.length === 3) { template = t; break; }
}
check("discovered the 3-order seed chain", !!template);
if (!template) process.exit(1);

// Commerce clause by declared field (lineItems) — open-world, once for the chain.
let commerceClauseId = null;
const allClauseIds = new Set(template.agreements.flatMap((a) => Object.keys(a.clauses)));
for (const cid of allClauseIds) {
    const spec = clauseUriOf.get(cid) ? await tryHydrate(clauseUriOf.get(cid)) : null;
    if (spec && (spec.fields ?? []).some((f) => f.name === "lineItems")) { commerceClauseId = cid; break; }
}
check("located the commerce clause by its declared field", !!commerceClauseId);

// ── One seller LOOP per node, registered on the channel ───────────────────────
const channel = new InProcessChannel();
SELLERS.forEach((s, i) => channel.register(s.address, makeSellerOfferHandler(sellerW[i], pub, addresses)));

// ── Buyer LOOP: originate the whole chain ─────────────────────────────────────
const orderedIds = [
    ...template.agreements.filter((a) => (Object.values(a.clauses).find((d) => Array.isArray(d.parentOrderHashes))?.parentOrderHashes ?? []).length === 0),
    ...template.agreements.filter((a) => (Object.values(a.clauses).find((d) => Array.isArray(d.parentOrderHashes))?.parentOrderHashes ?? []).length > 0),
].map((a) => a.id);
const nodes = orderedIds.map((id, i) => ({
    nodeId: id, seller: SELLERS[i].address, payment: PAYMENTS[i],
    overrides: { [commerceClauseId]: { currency: TOKEN, payment: PAYMENTS[i].toString(), lineItems: [{ itemId: `n${i}`, name: `Node ${i}`, quantity: 1, unitPrice: PAYMENTS[i].toString() }] } },
}));

const result = await originateChain(buyerW, pub, addresses, {
    template, currency: TOKEN, chainId, core: addresses.core, channel, nodes,
    clauseVersion: (cid) => clauseVersionOf.get(cid) ?? 1,
});
check("originateChain committed all three orders (3 tx hashes)", result?.hashes?.length === 3);

// ── Out-of-band: one process, three orders, cumulative 1800, the three sellers ─
await ctx.sync();
const proc = ctx.getProcessesAsBuyer(BUYER.address).find((p) => p.orders.size >= 3
    && SELLERS.every((s) => [...p.orders.values()].some((o) => o.seller.toLowerCase() === s.address.toLowerCase())));
check("one process holds all three orders under the three sellers", !!proc);
check("the process cumulative value is the chain total (1800)", proc?.cumulativeValue === 1800n);

console.log(`\n${fail === 0 ? "AUTONOMOUS MULTI-ORDER ORIGINATION PROVEN — no human in the loop" : fail + " CHECK(S) FAILED"}`);
process.exit(fail === 0 ? 0 : 1);
