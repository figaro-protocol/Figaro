#!/usr/bin/env node
/**
 * verify-origination.devnet.mjs — the two-agent AUTONOMOUS ORIGINATION proof.
 *
 * Two agents holding only private keys (no human, no browser) originate a bonded
 * process end-to-end against a DISCOVERED seed assembly, over the SDK
 * coordination channel — dogfooding the two loops (`originateProcess`,
 * `makeSellerOfferHandler`). Run against a live devnet:
 *
 *   ./scripts/devup.sh && (cd frontend && node scripts/populate-test-data.mjs)
 *   cd sdk && npm run build && node scripts/verify-origination.devnet.mjs
 *
 * The in-process channel elides only the WIRE; both agents run their real
 * sign/validate/bond logic. A real transport (XMTP, or an A2A/MCP endpoint a
 * seller publishes via did:web) implements the same CoordinationChannel.
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
    FigaroContext, originateProcess, makeSellerOfferHandler, InProcessChannel,
} from "@figaro/sdk/agent";
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
const SELLER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"); // anvil[1]
const PAYMENT = 1000n;

const pub = createPublicClient({ transport: http(RPC), cacheTime: 0 });
const buyerW = createWalletClient({ account: BUYER, transport: http(RPC) });
const sellerW = createWalletClient({ account: SELLER, transport: http(RPC) });
const chainId = await pub.getChainId();
// CHAIN time, never the machine clock — the kernel's DeadlineExpired guard
// compares against block.timestamp.
const deadline = computeDeadline(await readChainTimestamp(pub));
const tryHydrate = async (uri) => { try { return await (await fetch(GATEWAY + uri.replace("ipfs://", ""))).json(); } catch { return null; } };

let fail = 0; const check = (n, c) => { console.log(`${c ? "✓" : "✗ FAIL"} ${n}`); if (!c) fail++; };

// ── Buyer discovers the network ───────────────────────────────────────────────
const ctx = new FigaroContext(pub, addresses);
await ctx.sync();

// The SpecSource, built from the SAME registry→IPFS specs the frontend uses
// (parseClauseSpec + parseProjectionHints — the construction any consumer
// performs). Passing it on BOTH sides of the handshake engages the merkle-leaf
// sign gate (assertAgreementSignable): neither agent signs an agreement whose
// terms contradict the commitment struct (docs/CLAUSES.md § "Every clause is a
// merkle leaf").
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

// Pick a single-order assembly by hydrating templates — no hardcoded id; skip un-hydratable ones.
let chosen = null, template = null;
for (const a of ctx.getAssemblies()) {
    const t = await tryHydrate(a.contentURI);
    if (t && Array.isArray(t.agreements) && t.agreements.length === 1) { chosen = a; template = t; break; }
}
check("discovered a single-order seed assembly", !!chosen);
if (!chosen) process.exit(1);

// Commerce clause by declared field (lineItems) — open-world, no clause name.
const commerceClauseId = Object.keys(template.agreements[0].clauses)
    .find((cid) => (specs.get(cid)?.fields ?? []).some((f) => f.name === "lineItems")) ?? null;
check("located the commerce clause by its declared field", !!commerceClauseId);

// ── Seller LOOP: register the offer handler on the channel ────────────────────
const channel = new InProcessChannel();
// Refuse-all floor: the proof script IS the operator — explicit accept + policy.
channel.register(SELLER.address, makeSellerOfferHandler(sellerW, pub, addresses, {
    accept: () => true, policy: { requireRootShape: true, currencyAllowlist: [TOKEN], maxValue: 10_000n },
    specs, // the merkle-leaf seam on the counter-sign side
}));

// ── Buyer LOOP: originate against the discovered assembly + seller ────────────
const result = await originateProcess(buyerW, pub, addresses, {
    channel, template, seller: SELLER.address, currency: TOKEN, payment: PAYMENT, chainId, core: addresses.core, deadline,
    specs, // the merkle-leaf seam before the buyer signs
    overrides: { [commerceClauseId]: { currency: TOKEN, payment: PAYMENT.toString(), lineItems: [{ itemId: "sku-1", name: "Autonomous order", quantity: 1, unitPrice: PAYMENT.toString() }] } },
});
check("origination returned a tx (seller counter-signed, commit submitted)", !!result?.hash);
if (result?.hash) {
    const rcpt = await pub.waitForTransactionReceipt({ hash: result.hash });
    check("initiate-process commit landed on chain (status success)", rcpt.status === "success");
}

// ── Out-of-band: the process is discoverable on chain ─────────────────────────
await ctx.sync();
const originated = ctx.getProcessesAsBuyer(BUYER.address)
    .some((p) => [...p.orders.values()].some((o) => o.seller.toLowerCase() === SELLER.address.toLowerCase() && o.payment === PAYMENT));
check("the originated process is discoverable on chain with the right seller + payment", originated);

console.log(`\n${fail === 0 ? "AUTONOMOUS ORIGINATION PROVEN — no human in the loop" : fail + " CHECK(S) FAILED"}`);
process.exit(fail === 0 ? 0 : 1);
