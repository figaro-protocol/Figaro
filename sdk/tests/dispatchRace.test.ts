import { describe, it, expect } from "vitest";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildBuyerOffer, type AssemblyTemplate, type OfferPolicy } from "../src/agent/originate.js";
import {
    validateDraft, counterSignDraft, verifyRaceReply, selectRaceWinner,
    substitutePricedValue, buildQuoteRequest, quoteDraft, verifyQuoteReply, requestQuotes, makeSellerQuoteHandler,
    type RaceReply,
} from "../src/agent/dispatchRace.js";
import { InProcessChannel, type CommitmentPayload, type PricedField } from "../src/agent/coordination.js";
import { buildDomain, hashCommitmentStruct, COMMITMENT_TYPES } from "../src/commitments.js";
import { computeAgreementHash } from "../src/agreement.js";
import type { Address, Hex } from "../src/types.js";

const BUYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"); // anvil[0]
const COURIER_A = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"); // anvil[1]
const COURIER_B = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"); // anvil[2]
const CURRENCY = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
const CORE = "0x000000000000000000000000000000000000c0de" as Address;
const CHAIN = 31337;
const CTX = { chainId: CHAIN, core: CORE };

// signTypedData on a local account is offline — no RPC call — so a dummy transport is fine.
const buyerW = createWalletClient({ account: BUYER, transport: http("http://localhost:0") });
const courierAW = createWalletClient({ account: COURIER_A, transport: http("http://localhost:0") });
const courierBW = createWalletClient({ account: COURIER_B, transport: http("http://localhost:0") });

const template: AssemblyTemplate = {
    agreements: [{ id: "order-0", clauses: { "figaro-commerce": {}, "figaro-topology": { parentOrderHashes: [] } } }],
};

const policy: OfferPolicy = { requireRootShape: true, currencyAllowlist: [CURRENCY], maxValue: 10_000n };

/** A race draft for `candidate` at `payment` — the same payload the buyer's
 *  walk produces, with NO signatures (a draft binds nobody). Built through the
 *  origination builder and stripped: the struct/agreement construction is
 *  identical between the two legs by design. */
async function draftFor(candidate: Address, payment: bigint): Promise<CommitmentPayload> {
    const offer = await buildBuyerOffer(buyerW, {
        template, seller: candidate, currency: CURRENCY, payment, chainId: CHAIN, core: CORE,
        overrides: { "figaro-commerce": { currency: CURRENCY, payment: payment.toString() } },
    });
    const { buyerSig: _stripped, ...draft } = offer;
    return draft;
}

describe("validateDraft", () => {
    it("accepts a clean unsigned draft naming me", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        expect(validateDraft(draft, COURIER_A.address).ok).toBe(true);
    });

    it("rejects a payload carrying a buyer signature — that is an offer, not a draft", async () => {
        const offer = await buildBuyerOffer(buyerW, {
            template, seller: COURIER_A.address, currency: CURRENCY, payment: 1000n, chainId: CHAIN, core: CORE,
        });
        const check = validateDraft(offer, COURIER_A.address);
        expect(check.ok).toBe(false);
        expect(check.reason).toMatch(/an offer, not a race draft/);
    });

    it("rejects a draft naming a different seller", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        expect(validateDraft(draft, COURIER_B.address).ok).toBe(false);
    });

    it("rejects a draft whose agreement was swapped after hashing", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        const tampered = { ...draft, agreement: { ...draft.agreement, buyer: COURIER_B.address } };
        expect(validateDraft(tampered, COURIER_A.address).ok).toBe(false);
    });

    it("applies the operator's economic floor when a policy is supplied", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        expect(validateDraft(draft, COURIER_A.address, policy).ok).toBe(true);
        const capped: OfferPolicy = { ...policy, maxValue: 10n };
        expect(validateDraft(draft, COURIER_A.address, capped).ok).toBe(false);
    });
});

describe("counterSignDraft (real signatures, no chain)", () => {
    it("countersigns a clean draft when both floors pass, and the reply verifies", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        const reply = await counterSignDraft(courierAW, draft, CTX, () => true, policy);
        expect(reply?.sellerSig).toBeDefined();
        expect(reply?.buyerSig).toBeUndefined();
        expect((await verifyRaceReply(reply!, draft, CTX)).ok).toBe(true);
    });

    it("declines with no policy — the economic floor is opt-in", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        expect(await counterSignDraft(courierAW, draft, CTX, () => true)).toBeNull();
    });

    it("declines when accept is absent or refuses — the refuse-all floor", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        expect(await counterSignDraft(courierAW, draft, CTX, undefined, policy)).toBeNull();
        expect(await counterSignDraft(courierAW, draft, CTX, () => false, policy)).toBeNull();
    });

    it("THROWS on a tampered draft — never countersign a bogus commitment", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        const tampered = { ...draft, agreement: { ...draft.agreement, seller: COURIER_B.address } };
        await expect(counterSignDraft(courierAW, tampered, CTX, () => true, policy)).rejects.toThrow(/malformed draft/);
    });
});

describe("verifyRaceReply", () => {
    it("rejects a doctored reply — struct equality is checked before recovery", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        // The candidate returns a DIFFERENT struct (higher payment) signed by
        // themselves — the signature recovers fine, so only exact struct
        // equality against the sent draft catches it.
        const doctored = await draftFor(COURIER_A.address, 9000n);
        const reply = await counterSignDraft(courierAW, doctored, CTX, () => true, policy);
        const check = await verifyRaceReply(reply!, draft, CTX);
        expect(check.ok).toBe(false);
        expect(check.reason).toMatch(/does not match the drafted struct/);
    });

    it("rejects a countersignature from a wallet other than the drafted candidate", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        // COURIER_B signs A's draft struct — recovery must pin to the DRAFTED candidate.
        const forged = await courierBW.signTypedData({
            account: COURIER_B,
            domain: { name: "FigaroCore", version: "3", chainId: CHAIN, verifyingContract: CORE },
            types: {
                Commitment: [
                    { name: "processId", type: "bytes32" }, { name: "buyer", type: "address" },
                    { name: "seller", type: "address" }, { name: "currency", type: "address" },
                    { name: "payment", type: "uint256" }, { name: "expectedCumulativeValue", type: "uint256" },
                    { name: "agreementHash", type: "bytes32" }, { name: "salt", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                ],
            },
            primaryType: "Commitment",
            message: draft.commitment,
        });
        const check = await verifyRaceReply({ ...draft, sellerSig: forged }, draft, CTX);
        expect(check.ok).toBe(false);
        expect(check.reason).toMatch(/does not recover to the drafted candidate/);
    });
});

describe("selectRaceWinner", () => {
    it("picks the cheapest countersigner; ties break by arrival order", async () => {
        const dA = await draftFor(COURIER_A.address, 3000n);
        const dB = await draftFor(COURIER_B.address, 1000n);
        const rA = (await counterSignDraft(courierAW, dA, CTX, () => true, policy))!;
        const rB = (await counterSignDraft(courierBW, dB, CTX, () => true, policy))!;
        const replies: RaceReply[] = [{ draft: dA, reply: rA }, { draft: dB, reply: rB }];
        expect(selectRaceWinner(replies)?.reply.commitment.seller.toLowerCase()).toBe(COURIER_B.address.toLowerCase());

        // Tie at the same price: the first arrival wins.
        const dB2 = await draftFor(COURIER_B.address, 3000n);
        const rB2 = (await counterSignDraft(courierBW, dB2, CTX, () => true, policy))!;
        const tied: RaceReply[] = [{ draft: dA, reply: rA }, { draft: dB2, reply: rB2 }];
        expect(selectRaceWinner(tied)?.reply.commitment.seller.toLowerCase()).toBe(COURIER_A.address.toLowerCase());
    });

    it("returns null with no replies", () => {
        expect(selectRaceWinner([])).toBeNull();
    });
});

// ── RFQ — the quote leg ──────────────────────────────────────────────────────

const PRICED: readonly PricedField[] = [
    { clause: "figaro-commerce", path: "payment" },
    { clause: "figaro-commerce", path: "lineItems.0.unitPrice" },
];
const CEILING = 1000n;

/** A quote request to `candidate` at the buyer's ceiling — commerce carries
 *  the priced fields the request names. */
function requestFor(candidate: Address): CommitmentPayload {
    return buildQuoteRequest({
        template, buyer: BUYER.address, seller: candidate, currency: CURRENCY,
        ceiling: CEILING, chainId: CHAIN, core: CORE, pricedFields: PRICED,
        overrides: {
            "figaro-commerce": {
                currency: CURRENCY,
                payment: "0",
                lineItems: [{ itemId: "job", name: "Bespoke job", quantity: 1, unitPrice: "0" }],
            },
        },
    });
}

const quotePolicy: OfferPolicy = { requireRootShape: true, currencyAllowlist: [CURRENCY], maxValue: 10_000n };

describe("buildQuoteRequest + substitutePricedValue", () => {
    it("prices the draft at the ceiling through the shared substitution — unsigned, terms attached", () => {
        const req = requestFor(COURIER_A.address);
        expect(req.buyerSig).toBeUndefined();
        expect(req.sellerSig).toBeUndefined();
        expect(req.commitment.payment).toBe(CEILING);
        expect(req.commitment.expectedCumulativeValue).toBe(CEILING);
        expect(req.quoteRequest?.pricedFields).toEqual(PRICED);
        const commerce = req.agreement.sections.find((s) => s.clause === "figaro-commerce")!;
        expect(commerce.data.payment).toBe(CEILING.toString());
        expect((commerce.data.lineItems as Array<{ unitPrice: string }>)[0].unitPrice).toBe(CEILING.toString());
        expect(validateDraft(req, COURIER_A.address).ok).toBe(true);
    });

    it("throws when a priced path does not exist — substitution never invents structure", () => {
        const req = requestFor(COURIER_A.address);
        expect(() => substitutePricedValue(req.agreement, [{ clause: "figaro-commerce", path: "surcharge" }], 5n))
            .toThrow(/no field "surcharge"/);
        expect(() => substitutePricedValue(req.agreement, [{ clause: "figaro-nope", path: "payment" }], 5n))
            .toThrow(/no "figaro-nope" section/);
    });
});

describe("quoteDraft (real signatures, no chain)", () => {
    it("quotes under the ceiling and the reply verifies by reconstruction", async () => {
        const req = requestFor(COURIER_A.address);
        const reply = await quoteDraft(courierAW, req, CTX, () => 700n, quotePolicy);
        expect(reply?.sellerSig).toBeDefined();
        expect(reply?.commitment.payment).toBe(700n);
        expect(reply?.commitment.expectedCumulativeValue).toBe(700n);
        const commerce = reply!.agreement.sections.find((s) => s.clause === "figaro-commerce")!;
        expect(commerce.data.payment).toBe("700");
        expect((commerce.data.lineItems as Array<{ unitPrice: string }>)[0].unitPrice).toBe("700");
        expect((await verifyQuoteReply(reply!, req, CTX)).ok).toBe(true);
    });

    it("declines without a policy, without a pricing function, on a null quote, and above the ceiling", async () => {
        const req = requestFor(COURIER_A.address);
        expect(await quoteDraft(courierAW, req, CTX, () => 700n)).toBeNull();
        expect(await quoteDraft(courierAW, req, CTX, undefined, quotePolicy)).toBeNull();
        expect(await quoteDraft(courierAW, req, CTX, () => null, quotePolicy)).toBeNull();
        expect(await quoteDraft(courierAW, req, CTX, () => CEILING + 1n, quotePolicy)).toBeNull();
        expect(await quoteDraft(courierAW, req, CTX, () => 0n, quotePolicy)).toBeNull();
    });

    it("the legs never cross: quoteDraft refuses a race draft, counterSignDraft refuses a quote request", async () => {
        const raceDraft = await draftFor(COURIER_A.address, 1000n);
        await expect(quoteDraft(courierAW, raceDraft, CTX, () => 700n, quotePolicy))
            .rejects.toThrow(/no quote request/);
        const req = requestFor(COURIER_A.address);
        await expect(counterSignDraft(courierAW, req, CTX, () => true, policy))
            .rejects.toThrow(/quote request/);
    });
});

describe("verifyQuoteReply — the reconstruction gate", () => {
    /** A DISHONEST candidate: builds their own artifacts and signs them —
     *  recovery succeeds, so only reconstruction can catch the smuggle. */
    async function signedBy(candidate: typeof courierAW, commitment: CommitmentPayload["commitment"]): Promise<Hex> {
        return await candidate.signTypedData({
            account: candidate.account!,
            domain: buildDomain(CHAIN, CORE),
            types: COMMITMENT_TYPES, primaryType: "Commitment", message: commitment,
        }) as Hex;
    }

    it("rejects a quote that smuggles a non-price term change inside the re-hash", async () => {
        const req = requestFor(COURIER_A.address);
        // The candidate re-prices AND doctors another commerce field, then
        // re-hashes consistently and signs — internally coherent, but not the
        // buyer's reconstruction.
        const agreement = substitutePricedValue(req.agreement, PRICED, 700n);
        const doctored = {
            ...agreement,
            sections: agreement.sections.map((s) =>
                s.clause === "figaro-commerce"
                    ? { ...s, data: { ...s.data, lineItems: [{ ...(s.data.lineItems as Array<Record<string, unknown>>)[0], quantity: 3 }] } }
                    : s),
        };
        const commitment = {
            ...req.commitment, payment: 700n, expectedCumulativeValue: 700n,
            agreementHash: computeAgreementHash(doctored),
        };
        const reply: CommitmentPayload = { commitment, agreement: doctored, sellerSig: await signedBy(courierAW, commitment) };
        const check = await verifyQuoteReply(reply, req, CTX);
        expect(check.ok).toBe(false);
        expect(check.reason).toMatch(/does not match the reconstruction/);
    });

    it("rejects a signed quote above the ceiling — the cap lives in the buyer's copy", async () => {
        const req = requestFor(COURIER_A.address);
        const agreement = substitutePricedValue(req.agreement, PRICED, CEILING + 500n);
        const commitment = {
            ...req.commitment, payment: CEILING + 500n, expectedCumulativeValue: CEILING + 500n,
            agreementHash: computeAgreementHash(agreement),
        };
        const reply: CommitmentPayload = { commitment, agreement, sellerSig: await signedBy(courierAW, commitment) };
        const check = await verifyQuoteReply(reply, req, CTX);
        expect(check.ok).toBe(false);
        expect(check.reason).toMatch(/exceeds the request's ceiling/);
    });

    it("rejects a quote signed by a wallet other than the drafted candidate", async () => {
        const req = requestFor(COURIER_A.address);
        const honest = await quoteDraft(courierAW, req, CTX, () => 700n, quotePolicy);
        const forged: CommitmentPayload = { ...honest!, sellerSig: await signedBy(courierBW, honest!.commitment) };
        const check = await verifyQuoteReply(forged, req, CTX);
        expect(check.ok).toBe(false);
        expect(check.reason).toMatch(/does not recover to the drafted candidate/);
    });
});

describe("requestQuotes over the coordination channel", () => {
    it("collects verified quotes and the cheapest wins; silent candidates drop out", async () => {
        const channel = new InProcessChannel();
        channel.register(COURIER_A.address, makeSellerQuoteHandler(courierAW, CTX, { quote: () => 700n, policy: quotePolicy }));
        channel.register(COURIER_B.address, makeSellerQuoteHandler(courierBW, CTX, { quote: () => 500n, policy: quotePolicy }));
        const silent = "0x000000000000000000000000000000000000dEaD" as Address;
        const drafts = [requestFor(COURIER_A.address), requestFor(COURIER_B.address), requestFor(silent)];
        const { replies, winner } = await requestQuotes(channel, drafts, CTX);
        expect(replies).toHaveLength(2);
        expect(winner?.reply.commitment.seller.toLowerCase()).toBe(COURIER_B.address.toLowerCase());
        expect(winner?.reply.commitment.payment).toBe(500n);
        // The winner's struct hash is exactly the buyer's reconstruction at 500.
        expect(hashCommitmentStruct(winner!.reply.commitment))
            .toBe(hashCommitmentStruct((await quoteDraft(courierBW, drafts[1], CTX, () => 500n, quotePolicy))!.commitment));
    });
});
