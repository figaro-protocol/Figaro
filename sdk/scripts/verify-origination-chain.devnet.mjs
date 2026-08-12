#!/usr/bin/env node
/**
 * verify-origination-chain.devnet.mjs — AUTONOMOUS MULTI-ORDER ORIGINATION.
 *
 * A buyer and its seller-agents (keys only — no human, no browser) originate the
 * seed value-added CHAIN end-to-end over the coordination channel: root + two
 * sub-orders, each bond-secured, each seller counter-signing its own order, all
 * committed root-first in cumulative order. One seller takes BOTH subs — so it
 * bonds for two nodes in one chain, exercising the additive bond approval.
 * Dogfoods `originateChain` + `makeSellerOfferHandler`. Run against a live devnet:
 *
 *   ./scripts/devup.sh && (cd frontend && node scripts/populate-test-data.mjs)
 *   cd sdk && npm run build && node scripts/verify-origination-chain.devnet.mjs
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { FigaroContext, originateChain, makeSellerOfferHandler, InProcessChannel } from "@figaro/sdk/agent";
import { computeDeadline, readChainTimestamp, parseProjectionHints } from "@figaro/sdk";
import { parseClauseSpec } from "@figaro/sdk/clauses";

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
    readFileSync(resolve(here, "../../frontend/.env.local"), "utf8").split("\n")
        .filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const RPC = process.env.FIGARO_DEVNET_RPC_URL || "http://127.0.0.1:8545";
const GATEWAY = "http://127.0.0.1:8080/ipfs/";
const addresses = {
    core: env.NEXT_PUBLIC_FIGARO_CORE, clauseRegistry: env.NEXT_PUBLIC_CLAUSE_REGISTRY,
    membersRegistry: env.NEXT_PUBLIC_MEMBERS_REGISTRY, assemblyRegistry: env.NEXT_PUBLIC_ASSEMBLY_REGISTRY,
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
// CHAIN time, never the machine clock — the kernel's DeadlineExpired guard
// compares against block.timestamp.
const deadline = computeDeadline(await readChainTimestamp(pub));
const tryHydrate = async (uri) => { try { return await (await fetch(GATEWAY + uri.replace("ipfs://", ""))).json(); } catch { return null; } };

let fail = 0; const check = (n, c) => { console.log(`${c ? "✓" : "✗ FAIL"} ${n}`); if (!c) fail++; };

// ── Discover the MULTI-order seed chain (a template with >1 agreement) ─────────
const ctx = new FigaroContext(pub, addresses);
await ctx.sync();

// The SpecSource (registry→IPFS, parseClauseSpec + parseProjectionHints) —
// passed on both sides so the merkle-leaf sign gate runs on every order of the
// chain, and so the walk's currency-leaf fill + contradiction throw engage.
const specViews = [];
for (const c of ctx.getClauses()) {
    const raw = await tryHydrate(c.contentURI);
    if (!raw) continue;
    const parsed = parseClauseSpec(raw);
    if (parsed.ok) specViews.push({ ...parsed.spec, hints: parseProjectionHints(raw) });
}
const specs = {
    get: (clauseId, version) => specViews.find((v) => v.clauseId === clauseId && (version === undefined || v.version === version)),
    list: () => specViews,
};

let chosen = null, template = null;
for (const a of ctx.getAssemblies()) {
    const t = await tryHydrate(a.contentURI);
    if (t && Array.isArray(t.agreements) && t.agreements.length === 3) { chosen = a; template = t; break; }
}
check("discovered the 3-order seed chain", !!template);
if (!template) process.exit(1);

// Commerce clause by declared field (lineItems) — open-world, once for the chain.
const commerceClauseId = [...new Set(template.agreements.flatMap((a) => Object.keys(a.clauses)))]
    .find((cid) => (specs.get(cid)?.fields ?? []).some((f) => f.name === "lineItems")) ?? null;
check("located the commerce clause by its declared field", !!commerceClauseId);

// Node→seller: root to SELLERS[0]; BOTH subs to SELLERS[1]. One seller bonding
// for two nodes in one chain exercises the ADDITIVE bond approval — the second
// approval must stack on the first, not overwrite it.
const NODE_SELLERS = [SELLERS[0], SELLERS[1], SELLERS[1]];

// ── One seller LOOP per DISTINCT seller, registered on the channel ────────────
const channel = new InProcessChannel();
// The refuse-all floor (operator ruling 2026-07-07): a bare handler declines
// everything. This proof script IS the operator, so it supplies the explicit
// accept rule + economic policy its sellers sign under. The root seller
// requires root shape; the sub-order seller serves chain nodes, so it omits it.
const OPERATOR = { accept: () => true };
channel.register(SELLERS[0].address, makeSellerOfferHandler(sellerW[0], pub, addresses, {
    ...OPERATOR, policy: { requireRootShape: true, currencyAllowlist: [TOKEN], maxValue: 10_000n }, specs,
}));
channel.register(SELLERS[1].address, makeSellerOfferHandler(sellerW[1], pub, addresses, {
    ...OPERATOR, policy: { currencyAllowlist: [TOKEN], maxValue: 10_000n }, specs,
}));

// ── Buyer LOOP: originate the whole chain ─────────────────────────────────────
const orderedIds = [
    ...template.agreements.filter((a) => (Object.values(a.clauses).find((d) => Array.isArray(d.parentOrderHashes))?.parentOrderHashes ?? []).length === 0),
    ...template.agreements.filter((a) => (Object.values(a.clauses).find((d) => Array.isArray(d.parentOrderHashes))?.parentOrderHashes ?? []).length > 0),
].map((a) => a.id);
// The headless buyer authors its transaction particulars exactly as checkout
// does: the modality is the buyer's request, and the provenance section fills
// mechanically with the instantiated assembly's OWN compositionHash — the gate
// (engaged via `specs`) refuses to sign while any required term is missing,
// which is how the pre-gate version of this proof was caught committing empty
// provenance/modality sections.
const rootParticulars = (agreementId) => {
    const clauses = template.agreements.find((a) => a.id === agreementId)?.clauses ?? {};
    const fill = {};
    for (const cid of Object.keys(clauses)) {
        const fields = specs.get(cid)?.fields ?? [];
        if (fields.some((f) => f.name === "modality")) fill[cid] = { modality: "virtual" };
        if (fields.some((f) => f.name === "compositionHash")) fill[cid] = { compositionHash: chosen.compositionHash };
    }
    return fill;
};
const nodes = orderedIds.map((id, i) => ({
    nodeId: id, seller: NODE_SELLERS[i].address, payment: PAYMENTS[i],
    overrides: {
        ...rootParticulars(id),
        [commerceClauseId]: { currency: TOKEN, payment: PAYMENTS[i].toString(), lineItems: [{ itemId: `n${i}`, name: `Node ${i}`, quantity: 1, unitPrice: PAYMENTS[i].toString() }] },
    },
}));

const result = await originateChain(buyerW, pub, addresses, {
    template, currency: TOKEN, chainId, core: addresses.core, channel, nodes, deadline, specs,
});
check("originateChain committed all three orders (3 tx hashes)", result?.hashes?.length === 3);

// ── Out-of-band: one process, three orders, cumulative 1800, the repeated
//    seller on BOTH subs (the additive-bond shape — also distinguishes THIS run
//    from any earlier distinct-seller run lingering on the devnet). ────────────
await ctx.sync();
const proc = ctx.getProcessesAsBuyer(BUYER.address).find((p) => {
    if (p.cumulativeValue !== 1800n || p.orders.size < 3) return false;
    const orders = [...p.orders.values()];
    const s0 = orders.some((o) => o.seller.toLowerCase() === SELLERS[0].address.toLowerCase());
    const s1 = orders.filter((o) => o.seller.toLowerCase() === SELLERS[1].address.toLowerCase()).length;
    return s0 && s1 === 2;
});
check("a process holds all three orders: root seller + one seller on BOTH subs (additive bond)", !!proc);
check("the process cumulative value is the chain total (1800)", proc?.cumulativeValue === 1800n);

console.log(`\n${fail === 0 ? "AUTONOMOUS MULTI-ORDER ORIGINATION PROVEN — no human in the loop" : fail + " CHECK(S) FAILED"}`);
process.exit(fail === 0 ? 0 : 1);
