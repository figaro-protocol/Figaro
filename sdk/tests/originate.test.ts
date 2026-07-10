import { describe, it, expect } from "vitest";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
    instantiateRootAgreement,
    buildBuyerOffer,
    validateOffer,
    counterSignOffer,
    offerToExecutionInputs,
    type AssemblyTemplate,
} from "../src/agent/originate.js";
import { InProcessChannel } from "../src/agent/coordination.js";
import { computeAgreementHash } from "../src/agreement.js";
import type { Address } from "../src/types.js";

const BUYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"); // anvil[0]
const SELLER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"); // anvil[1]
const CURRENCY = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
const CORE = "0x000000000000000000000000000000000000c0de" as Address;
const CHAIN = 31337;

// signTypedData on a local account is offline — no RPC call — so a dummy transport is fine.
const buyerW = createWalletClient({ account: BUYER, transport: http("http://localhost:0") });
const sellerW = createWalletClient({ account: SELLER, transport: http("http://localhost:0") });

const template: AssemblyTemplate = {
    agreements: [{ id: "order-0", clauses: { "figaro-commerce": {}, "figaro-topology": { parentOrderHashes: [] } } }],
};
const overrides = { "figaro-commerce": { currency: CURRENCY, payment: "1000", lineItems: [{ itemId: "x", name: "Item", quantity: 1, unitPrice: "1000" }] } };

function offerParams() {
    return { template, seller: SELLER.address, currency: CURRENCY, payment: 1000n, chainId: CHAIN, core: CORE, overrides };
}

describe("instantiateRootAgreement", () => {
    it("merges overrides onto the template's root clause bag", () => {
        const a = instantiateRootAgreement(template, { buyer: BUYER.address, seller: SELLER.address, overrides });
        const commerce = a.sections.find((s) => s.clause === "figaro-commerce");
        expect(commerce?.data.payment).toBe("1000");
        expect(commerce?.data.currency).toBe(CURRENCY);
        expect(a.buyer).toBe(BUYER.address);
        expect(a.seller).toBe(SELLER.address);
    });

    it("picks the root agreement (no non-empty parentOrderHashes) from a multi-agreement template", () => {
        const multi: AssemblyTemplate = {
            agreements: [
                { id: "order-1", clauses: { "figaro-topology": { parentOrderHashes: ["0xabc"] } } },
                { id: "order-0", clauses: { "figaro-commerce": {}, "figaro-topology": { parentOrderHashes: [] } } },
            ],
        };
        const a = instantiateRootAgreement(multi, { buyer: BUYER.address, seller: SELLER.address });
        expect(a.sections.some((s) => s.clause === "figaro-commerce")).toBe(true);
    });

    it("section versions come from the composed clauseVersions map, defaulting to 1", () => {
        const pinned: AssemblyTemplate = {
            agreements: [{
                id: "order-0",
                clauses: { "figaro-commerce": {}, "figaro-topology": { parentOrderHashes: [] } },
                clauseVersions: { "figaro-commerce": 2 },
            }],
        };
        const a = instantiateRootAgreement(pinned, { buyer: BUYER.address, seller: SELLER.address });
        expect(a.sections.find((s) => s.clause === "figaro-commerce")?.version).toBe(2);
        expect(a.sections.find((s) => s.clause === "figaro-topology")?.version).toBe(1);
    });
});

describe("origination handshake (real signatures, no chain)", () => {
    it("buyer builds a valid, self-consistent signed offer", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        expect(offer.buyerSig).toBeDefined();
        expect(offer.commitment.buyer.toLowerCase()).toBe(BUYER.address.toLowerCase());
        expect(offer.commitment.agreementHash).toBe(computeAgreementHash(offer.agreement));
        expect(validateOffer(offer, SELLER.address).ok).toBe(true);
    });

    it("seller counter-signs a clean offer; result yields both execution inputs", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const signed = await counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE });
        expect(signed).not.toBeNull();
        const inputs = offerToExecutionInputs(signed!);
        expect(inputs.buyerSig).toBeDefined();
        expect(inputs.sellerSig).toBeDefined();
        expect(inputs.commitment).toBe(offer.commitment);
    });

    it("policy decline returns null (not a throw) on a clean offer", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const signed = await counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE }, () => false);
        expect(signed).toBeNull();
    });
});

describe("origination handshake — the anti-tamper gate (security)", () => {
    it("rejects an offer whose agreement was mutated after the buyer signed", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        // Tamper: change the agreement so it no longer hashes to the committed agreementHash.
        offer.agreement.sections.find((s) => s.clause === "figaro-commerce")!.data.payment = "1";
        expect(validateOffer(offer, SELLER.address).ok).toBe(false);
        await expect(counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE })).rejects.toThrow(/agreement does not hash/i);
    });

    it("rejects an offer that names a different seller", async () => {
        const offer = await buildBuyerOffer(buyerW, { ...offerParams(), seller: "0x1111111111111111111111111111111111111111" as Address });
        expect(validateOffer(offer, SELLER.address).reason).toMatch(/different seller/i);
    });

    it("rejects an offer whose buyer signature does not recover to the named buyer", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        // Forge: same commitment, a signature from the wrong key.
        const bogus = await buildBuyerOffer(sellerW, { ...offerParams(), seller: SELLER.address });
        offer.buyerSig = bogus.buyerSig; // signature over a DIFFERENT commitment
        await expect(counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE })).rejects.toThrow(/does not recover/i);
    });
});

describe("InProcessChannel", () => {
    it("routes an offer to the registered seller handler; unregistered → null", async () => {
        const channel = new InProcessChannel();
        channel.register(SELLER.address, (o) => counterSignOffer(sellerW, o, { chainId: CHAIN, core: CORE }));
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const signed = await channel.sendOffer(SELLER.address, offer);
        expect(signed?.sellerSig).toBeDefined();
        expect(await channel.sendOffer("0x2222222222222222222222222222222222222222" as Address, offer)).toBeNull();
    });
});
