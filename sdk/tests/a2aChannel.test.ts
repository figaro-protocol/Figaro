/**
 * A2A coordination transport — the Agent2Agent-shaped CoordinationChannel.
 *
 * Same discipline as the HTTP-transport test: the handshake is REAL (buyer
 * builds + signs the offer locally, the seller's handler runs the actual
 * anti-tamper gate and counter-signs, signatures verify as typed data) and
 * the socket is real (node:http) — only the chain is absent. What this file
 * adds over the HTTP sibling is the WIRE assertion: the envelope rides as an
 * A2A `message/send` data part, a decline is a result message WITHOUT a data
 * part, and a tampered offer is a JSON-RPC ERROR, never a silent decline.
 */
import { describe, it, expect } from "vitest";
import { createServer, type Server } from "node:http";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, verifyTypedData } from "viem";
import { buildBuyerOffer, counterSignOffer } from "../src/agent/originate.js";
import type { AssemblyTemplate } from "../src/agent/originate.js";
import {
    A2aChannel,
    a2aMessageFromOffer,
    makeA2aOfferResponder,
    offerFromA2aMessage,
} from "../src/agent/a2aChannel.js";
import type { OfferHandler, CommitmentPayload } from "../src/agent/coordination.js";
import { COMMITMENT_TYPES, buildDomain } from "../src/commitments.js";

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

const sellerHandler: OfferHandler = (offer) => counterSignOffer(
    sellerW, offer, { chainId: CHAIN_ID, core: CORE }, () => true,
    { requireRootShape: true, currencyAllowlist: [CURRENCY], maxValue: 10_000n },
);

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
        url: `http://127.0.0.1:${port}/a2a`,
        stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
}

describe("the A2A envelope codec", () => {
    it("round-trips the offer through an A2A message's data part", async () => {
        const offer = await buildOffer();
        const message = a2aMessageFromOffer(offer, "user", "m-1");
        expect(message.kind).toBe("message");
        expect(message.parts[0].kind).toBe("data");
        const back = offerFromA2aMessage(message);
        expect(back).not.toBeNull();
        expect(back!.commitment.agreementHash).toBe(offer.commitment.agreementHash);
        expect(back!.commitment.payment).toBe(offer.commitment.payment);
        expect(back!.buyerSig).toBe(offer.buyerSig);
    });

    it("a message with no data part is absence (null), a malformed data part throws", async () => {
        expect(offerFromA2aMessage({
            role: "agent", parts: [{ kind: "text", text: "offer declined" }], messageId: "m", kind: "message",
        })).toBeNull();
        expect(() => offerFromA2aMessage({
            role: "agent", parts: [{ kind: "data", data: { not: "an envelope" } }], messageId: "m", kind: "message",
        })).toThrow();
    });
});

describe("A2aChannel over a real socket", () => {
    it("carries the full origination handshake — offer out, counter-signed envelope back, both sigs verify", async () => {
        const { url, stop } = await startSellerServer(makeA2aOfferResponder(sellerHandler));
        try {
            const channel = new A2aChannel({ resolveEndpoint: async () => url });
            const offer = await buildOffer();
            const signed = await channel.sendOffer(SELLER.address, offer);
            expect(signed).not.toBeNull();
            const domain = buildDomain(CHAIN_ID, CORE);
            for (const [sig, signer] of [
                [signed!.buyerSig!, BUYER.address],
                [signed!.sellerSig!, SELLER.address],
            ] as const) {
                expect(await verifyTypedData({
                    address: signer, domain, types: COMMITMENT_TYPES,
                    primaryType: "Commitment", message: signed!.commitment as never, signature: sig,
                })).toBe(true);
            }
        } finally {
            await stop();
        }
    });

    it("a policy decline is a result message with no envelope — sendOffer returns null", async () => {
        const decliner: OfferHandler = async () => null;
        const { url, stop } = await startSellerServer(makeA2aOfferResponder(decliner));
        try {
            const channel = new A2aChannel({ resolveEndpoint: async () => url });
            expect(await channel.sendOffer(SELLER.address, await buildOffer())).toBeNull();
        } finally {
            await stop();
        }
    });

    it("a tampered offer is a JSON-RPC error, never a silent decline — sendOffer throws", async () => {
        const { url, stop } = await startSellerServer(makeA2aOfferResponder(sellerHandler));
        try {
            const channel = new A2aChannel({ resolveEndpoint: async () => url });
            const offer = await buildOffer();
            // Tamper: repoint the payment after the buyer signed.
            const tampered: CommitmentPayload = {
                ...offer,
                commitment: { ...offer.commitment, payment: offer.commitment.payment + 1n },
            };
            await expect(channel.sendOffer(SELLER.address, tampered)).rejects.toThrow(/rejected/);
        } finally {
            await stop();
        }
    });

    it("an unresolvable endpoint is absence — null, no throw", async () => {
        const channel = new A2aChannel({ resolveEndpoint: async () => null });
        expect(await channel.sendOffer(SELLER.address, await buildOffer())).toBeNull();
    });

    it("a third-party A2A reply (hand-built JSON-RPC, no SDK) interoperates", async () => {
        // A seller that never imports the SDK: it answers message/send by
        // hand-building the JSON-RPC result carrying the envelope back
        // (counter-signature elided — interop here is about the WIRE).
        const { url, stop } = await startSellerServer(async (body) => {
            const req = JSON.parse(body);
            return {
                status: 200,
                body: JSON.stringify({
                    jsonrpc: "2.0", id: req.id,
                    result: {
                        role: "agent", kind: "message", messageId: "third-party-reply",
                        parts: [req.params.message.parts[0]],
                    },
                }),
            };
        });
        try {
            const channel = new A2aChannel({ resolveEndpoint: async () => url });
            const offer = await buildOffer();
            const echoed = await channel.sendOffer(SELLER.address, offer);
            expect(echoed?.commitment.agreementHash).toBe(offer.commitment.agreementHash);
        } finally {
            await stop();
        }
    });
});
