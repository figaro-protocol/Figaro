import { describe, it, expect } from "vitest";
import { createServer, type Server } from "node:http";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, verifyTypedData } from "viem";
import { buildBuyerOffer, counterSignOffer } from "../src/agent/originate.js";
import type { AssemblyTemplate } from "../src/agent/originate.js";
import { HttpChannel, makeHttpOfferResponder, didWebEndpointResolver } from "../src/agent/httpChannel.js";
import type { OfferHandler, CommitmentPayload } from "../src/agent/coordination.js";
import { serializeCommitmentPayload } from "../src/agent/coordination.js";
import { COMMITMENT_TYPES, buildDomain } from "../src/commitments.js";
import type { DIDDocument } from "../src/agent/did.js";

// ── Fixtures (no chain — signing is local; the socket is real) ────────────────

const CHAIN_ID = 31337;
const CORE = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const CURRENCY = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const PAYMENT = 1000n;
const BUYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"); // anvil[0]
const SELLER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"); // anvil[1]

const buyerW = createWalletClient({ account: BUYER, transport: http("http://127.0.0.1:0") });
const sellerW = createWalletClient({ account: SELLER, transport: http("http://127.0.0.1:0") });

const template: AssemblyTemplate = {
    agreements: [{
        id: "root",
        clauses: { "figaro-commerce": { currency: CURRENCY, payment: PAYMENT.toString(), lineItems: [] } },
    }],
};

async function buildOffer(): Promise<CommitmentPayload> {
    return buildBuyerOffer(buyerW, {
        template, buyer: BUYER.address, seller: SELLER.address,
        currency: CURRENCY, payment: PAYMENT, chainId: CHAIN_ID, core: CORE, salt: 1n, deadline: 0n,
    });
}

/** A pure seller handler: verifies the buyer sig and counter-signs (no chain). */
const sellerHandler: OfferHandler = (offer) => counterSignOffer(sellerW, offer, { chainId: CHAIN_ID, core: CORE }, () => true);

/** Stand up a real node:http server running `responder`; returns its URL + a stop. */
async function startSellerServer(
    responder: (body: string) => Promise<{ status: number; body: string }>,
): Promise<{ url: string; stop: () => Promise<void> }> {
    const server: Server = createServer((req, res) => {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", async () => {
            const out = await responder(body);
            res.writeHead(out.status, { "content-type": "application/json" });
            res.end(out.body);
        });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    return {
        url: `http://127.0.0.1:${port}/offer`,
        stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
}

// ── HttpChannel over a real socket ────────────────────────────────────────────

describe("HttpChannel — offer round-trip over a real HTTP socket", () => {
    it("carries a buyer offer to the seller and returns a verifiable counter-signature", async () => {
        const { url, stop } = await startSellerServer(makeHttpOfferResponder(sellerHandler));
        try {
            const channel = new HttpChannel({ resolveEndpoint: async () => url });
            const offer = await buildOffer();
            const signed = await channel.sendOffer(SELLER.address, offer);

            expect(signed?.sellerSig).toBeTruthy();
            // Out-of-band: the returned seller signature recovers to the seller over
            // the exact struct — proving the envelope survived serialize → socket →
            // deserialize → counter-sign → socket → deserialize intact.
            const ok = await verifyTypedData({
                address: SELLER.address, domain: buildDomain(CHAIN_ID, CORE),
                types: COMMITMENT_TYPES, primaryType: "Commitment",
                message: signed!.commitment, signature: signed!.sellerSig!,
            });
            expect(ok).toBe(true);
            // The buyer's original signature is untouched by the wire.
            expect(signed!.buyerSig).toBe(offer.buyerSig);
        } finally {
            await stop();
        }
    });

    it("returns null when the seller declines a clean offer (204)", async () => {
        const declineAll: OfferHandler = async () => null;
        const { url, stop } = await startSellerServer(makeHttpOfferResponder(declineAll));
        try {
            const channel = new HttpChannel({ resolveEndpoint: async () => url });
            expect(await channel.sendOffer(SELLER.address, await buildOffer())).toBeNull();
        } finally {
            await stop();
        }
    });

    it("throws (not declines) when the seller rejects a tampered offer (422)", async () => {
        const { url, stop } = await startSellerServer(makeHttpOfferResponder(sellerHandler));
        try {
            const channel = new HttpChannel({ resolveEndpoint: async () => url });
            const offer = await buildOffer();
            // Mutate the agreement after signing → it no longer hashes to the committed
            // agreementHash → the anti-tamper gate throws → 422, not a silent decline.
            const tampered: CommitmentPayload = {
                ...offer,
                agreement: {
                    ...offer.agreement,
                    sections: offer.agreement.sections.map((s) => ({ ...s, data: { ...s.data, injected: "evil" } })),
                },
            };
            await expect(channel.sendOffer(SELLER.address, tampered)).rejects.toThrow(/HTTP 422/);
        } finally {
            await stop();
        }
    });

    it("returns null when the seller has no reachable endpoint (absence)", async () => {
        const channel = new HttpChannel({ resolveEndpoint: async () => null });
        expect(await channel.sendOffer(SELLER.address, await buildOffer())).toBeNull();
    });
});

// ── The responder's status contract ───────────────────────────────────────────

describe("makeHttpOfferResponder", () => {
    it("maps a malformed body to 400", async () => {
        const out = await makeHttpOfferResponder(sellerHandler)("not-json{");
        expect(out.status).toBe(400);
    });

    it("maps a policy decline to 204 and an acceptance to 200", async () => {
        const accepted = await makeHttpOfferResponder(sellerHandler)(serializeCommitmentPayload(await buildOffer()));
        expect(accepted.status).toBe(200);

        const declined = await makeHttpOfferResponder(async () => null)(serializeCommitmentPayload(await buildOffer()));
        expect(declined.status).toBe(204);
    });
});

// ── didWebEndpointResolver — the discovery→handshake loop-closer ───────────────

describe("didWebEndpointResolver", () => {
    const didDoc: DIDDocument = {
        "@context": ["https://www.w3.org/ns/did/v1"],
        id: "did:web:seller.example.com",
        verificationMethod: [{
            id: "did:web:seller.example.com#controller",
            type: "EcdsaSecp256k1RecoveryMethod2020",
            controller: "did:web:seller.example.com",
            blockchainAccountId: `eip155:${CHAIN_ID}:${SELLER.address.toLowerCase()}`,
        }],
        service: [{ id: "did:web:seller.example.com#mcp", type: "MCPEndpoint", serviceEndpoint: "https://seller.example.com/mcp" }],
    };
    const fetchFn = (async () => new Response(JSON.stringify(didDoc), { status: 200 })) as unknown as typeof fetch;

    it("resolves a bound seller's DID to its coordination endpoint", async () => {
        const resolve = didWebEndpointResolver(() => "did:web:seller.example.com", { serviceType: "MCPEndpoint", chainId: CHAIN_ID, fetchFn });
        expect(await resolve(SELLER.address)).toBe("https://seller.example.com/mcp");
    });

    it("refuses to route to a DID that does not bind the seller address", async () => {
        const resolve = didWebEndpointResolver(() => "did:web:seller.example.com", { serviceType: "MCPEndpoint", chainId: CHAIN_ID, fetchFn });
        // The doc binds SELLER; asking for BUYER's endpoint must not leak SELLER's.
        expect(await resolve(BUYER.address)).toBeNull();
    });

    it("returns null when no DID is known for the seller", async () => {
        const resolve = didWebEndpointResolver(() => null, { fetchFn });
        expect(await resolve(SELLER.address)).toBeNull();
    });
});
