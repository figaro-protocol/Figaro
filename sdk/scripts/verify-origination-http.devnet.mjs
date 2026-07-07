#!/usr/bin/env node
/**
 * verify-origination-http.devnet.mjs — autonomous origination over a REAL socket.
 *
 * The sibling of verify-origination.devnet.mjs, but the two agents talk over an
 * actual HTTP server instead of the in-process channel: the seller runs a
 * node:http endpoint wrapping `makeSellerOfferHandler` via `makeHttpOfferResponder`;
 * the buyer originates through `HttpChannel`, which POSTs the serialized offer
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
    HttpChannel, makeHttpOfferResponder,
} from "@figaro/core/agent";

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
const SELLER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"); // anvil[1]
const PAYMENT = 1000n;

const pub = createPublicClient({ transport: http(RPC), cacheTime: 0 });
const buyerW = createWalletClient({ account: BUYER, transport: http(RPC) });
const sellerW = createWalletClient({ account: SELLER, transport: http(RPC) });
const chainId = await pub.getChainId();
const tryHydrate = async (uri) => { try { return await (await fetch(GATEWAY + uri.replace("ipfs://", ""))).json(); } catch { return null; } };

let fail = 0; const check = (n, c) => { console.log(`${c ? "✓" : "✗ FAIL"} ${n}`); if (!c) fail++; };

// ── Seller: run its offer handler behind a REAL HTTP endpoint ─────────────────
const responder = makeHttpOfferResponder(makeSellerOfferHandler(sellerW, pub, addresses));
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

// ── Buyer discovers the network ───────────────────────────────────────────────
const ctx = new FigaroContext(pub, addresses);
await ctx.sync();
const clauseVersionOf = new Map(ctx.getClauses().map((c) => [c.clauseId, c.version]));
const clauseUriOf = new Map(ctx.getClauses().map((c) => [c.clauseId, c.contentURI]));

let chosen = null, template = null;
for (const a of ctx.getAssemblies()) {
    const t = await tryHydrate(a.contentURI);
    if (t && Array.isArray(t.agreements) && t.agreements.length === 1) { chosen = a; template = t; break; }
}
check("discovered a single-order seed assembly", !!chosen);
if (!chosen) { server.close(); process.exit(1); }

let commerceClauseId = null;
for (const cid of Object.keys(template.agreements[0].clauses)) {
    const spec = clauseUriOf.get(cid) ? await tryHydrate(clauseUriOf.get(cid)) : null;
    if (spec && (spec.fields ?? []).some((f) => f.name === "lineItems")) { commerceClauseId = cid; break; }
}
check("located the commerce clause by its declared field", !!commerceClauseId);

// ── Buyer LOOP: originate over HttpChannel (the seller is reached via the socket) ─
const channel = new HttpChannel({ resolveEndpoint: async () => sellerUrl });
const result = await originateProcess(buyerW, pub, addresses, {
    channel, template, seller: SELLER.address, currency: TOKEN, payment: PAYMENT, chainId, core: addresses.core,
    clauseVersion: (cid) => clauseVersionOf.get(cid) ?? 1,
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
console.log(`\n${fail === 0 ? "AUTONOMOUS ORIGINATION OVER HTTP PROVEN — the wire is real, not asserted" : fail + " CHECK(S) FAILED"}`);
process.exit(fail === 0 ? 0 : 1);
