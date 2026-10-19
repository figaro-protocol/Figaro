import { describe, it, expect } from "vitest";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildBuyerOffer, type OfferPolicy } from "../src/agent/originate.js";
import {
    validateDraft, counterSignDraft, verifyRaceReply, selectRaceWinner,
    substitutePricedValue, buildQuoteRequest, quoteDraft, verifyQuoteReply,
    requestQuotes, requestCounterSignatures, makeSellerRaceHandler, makeSellerQuoteHandler,
    type RaceReply,
} from "../src/agent/dispatchRace.js";
import { InProcessChannel, type CommitmentPayload, type PricedField } from "../src/agent/coordination.js";
import { keyOf, specSourceFromFixtures } from "./specFixtures.js";
import { buildDomain, hashCommitmentStruct, COMMITMENT_TYPES } from "../src/commitments.js";
import { computeAgreementHash } from "../src/agreement.js";
import type { Address, Hex } from "../src/types.js";
import { hydrateAuthored, profileBinding } from "./hydrate.js";
import { assemblyCompositionHash, deriveAssemblySlug } from "../src/assembly.js";

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

const assembly = hydrateAuthored({
    agreements: [{ id: "order-0", clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: { parentOrderHashes: [] } } }],
});

const policy: OfferPolicy = { requireRootShape: true, currencyAllowlist: [CURRENCY], maxValue: 10_000n };

// Every candidate's own profile, read at acceptance time, binds the assembly
// the drafts instantiate.
const BOUND = profileBinding(assembly);

/** A race draft for `candidate` at `payment` — the same payload the buyer's
 *  walk produces, with NO signatures (a draft binds nobody). Built through the
 *  origination builder and stripped: the struct/agreement construction is
 *  identical between the two legs by design. */
async function draftFor(candidate: Address, payment: bigint): Promise<CommitmentPayload> {
    const offer = await buildBuyerOffer(buyerW, {
        assembly: assembly, seller: candidate, currency: CURRENCY, payment, chainId: CHAIN, core: CORE, deadline: 1_900_000_000n,
        overrides: { [keyOf("figaro-commerce")]: { currency: CURRENCY, payment: payment.toString() } },
    });
    const { buyerSig: _stripped, ...draft } = offer;
    return draft;
}

describe("validateDraft", () => {
    it("accepts a clean unsigned draft naming me", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        expect((await validateDraft(draft, COURIER_A.address, undefined, undefined, null, BOUND)).ok).toBe(true);
    });

    it("rejects a payload carrying a buyer signature — that is an offer, not a draft", async () => {
        const offer = await buildBuyerOffer(buyerW, {
            assembly: assembly, seller: COURIER_A.address, currency: CURRENCY, payment: 1000n, chainId: CHAIN, core: CORE, deadline: 1_900_000_000n,
        });
        const check = await validateDraft(offer, COURIER_A.address, undefined, undefined, null, BOUND);
        expect(check.ok).toBe(false);
        expect(check.reason).toMatch(/an offer, not a race draft/);
    });

    it("rejects a draft naming a different seller", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        expect((await validateDraft(draft, COURIER_B.address, undefined, undefined, null, BOUND)).ok).toBe(false);
    });

    it("rejects a draft whose agreement was swapped after hashing", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        const tampered = { ...draft, agreement: { ...draft.agreement, buyer: COURIER_B.address } };
        expect((await validateDraft(tampered, COURIER_A.address, undefined, undefined, null, BOUND)).ok).toBe(false);
    });

    it("applies the operator's economic floor when a policy is supplied", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        expect((await validateDraft(draft, COURIER_A.address, policy, undefined, null, BOUND)).ok).toBe(true);
        const capped: OfferPolicy = { ...policy, maxValue: 10n };
        expect((await validateDraft(draft, COURIER_A.address, capped, undefined, null, BOUND)).ok).toBe(false);
    });
});

describe("counterSignDraft (real signatures, no chain)", () => {
    it("countersigns a clean draft when both floors pass, and the reply verifies", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        const reply = await counterSignDraft(courierAW, draft, CTX, () => true, policy, undefined, null, BOUND);
        expect(reply?.sellerSig).toBeDefined();
        expect(reply?.buyerSig).toBeUndefined();
        expect((await verifyRaceReply(reply!, draft, CTX)).ok).toBe(true);
    });

    it("declines with no policy — the economic floor is opt-in", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        expect(await counterSignDraft(courierAW, draft, CTX, () => true, undefined, undefined, null, BOUND)).toBeNull();
    });

    it("declines when accept is absent or refuses — the refuse-all floor", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        expect(await counterSignDraft(courierAW, draft, CTX, undefined, policy, undefined, null, BOUND)).toBeNull();
        expect(await counterSignDraft(courierAW, draft, CTX, () => false, policy, undefined, null, BOUND)).toBeNull();
    });

    it("THROWS on a tampered draft — never countersign a bogus commitment", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        const tampered = { ...draft, agreement: { ...draft.agreement, seller: COURIER_B.address } };
        await expect(counterSignDraft(courierAW, tampered, CTX, () => true, policy, undefined, null, BOUND)).rejects.toThrow(/refusing the draft — agreement parties do not match/);
    });
});

describe("verifyRaceReply", () => {
    it("rejects a doctored reply — struct equality is checked before recovery", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        // The candidate returns a DIFFERENT struct (higher payment) signed by
        // themselves — the signature recovers fine, so only exact struct
        // equality against the sent draft catches it.
        const doctored = await draftFor(COURIER_A.address, 9000n);
        const reply = await counterSignDraft(courierAW, doctored, CTX, () => true, policy, undefined, null, BOUND);
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
        const rA = (await counterSignDraft(courierAW, dA, CTX, () => true, policy, undefined, null, BOUND))!;
        const rB = (await counterSignDraft(courierBW, dB, CTX, () => true, policy, undefined, null, BOUND))!;
        const replies: RaceReply[] = [{ draft: dA, reply: rA }, { draft: dB, reply: rB }];
        expect(selectRaceWinner(replies)?.reply.commitment.seller.toLowerCase()).toBe(COURIER_B.address.toLowerCase());

        // Tie at the same price: the first arrival wins.
        const dB2 = await draftFor(COURIER_B.address, 3000n);
        const rB2 = (await counterSignDraft(courierBW, dB2, CTX, () => true, policy, undefined, null, BOUND))!;
        const tied: RaceReply[] = [{ draft: dA, reply: rA }, { draft: dB2, reply: rB2 }];
        expect(selectRaceWinner(tied)?.reply.commitment.seller.toLowerCase()).toBe(COURIER_A.address.toLowerCase());
    });

    it("returns null with no replies", () => {
        expect(selectRaceWinner([])).toBeNull();
    });
});

// ── RFQ — the quote leg ──────────────────────────────────────────────────────

const PRICED: readonly PricedField[] = [
    { clause: keyOf("figaro-commerce"), path: "payment" },
    { clause: keyOf("figaro-commerce"), path: "lineItems.0.unitPrice" },
];
const CEILING = 1000n;

/** A quote request to `candidate` at the buyer's ceiling — commerce carries
 *  the priced fields the request names. */
function requestFor(candidate: Address): CommitmentPayload {
    return buildQuoteRequest({
        assembly: assembly, buyer: BUYER.address, seller: candidate, currency: CURRENCY,
        ceiling: CEILING, chainId: CHAIN, core: CORE, pricedFields: PRICED, deadline: 1_900_000_000n,
        overrides: {
            [keyOf("figaro-commerce")]: {
                currency: CURRENCY,
                payment: "0",
                lineItems: [{ itemId: "job", name: "Bespoke job", quantity: 1, unitPrice: "0" }],
            },
        },
    });
}

const quotePolicy: OfferPolicy = { requireRootShape: true, currencyAllowlist: [CURRENCY], maxValue: 10_000n };

describe("buildQuoteRequest + substitutePricedValue", () => {
    it("prices the draft at the ceiling through the shared substitution — unsigned, terms attached", async () => {
        const req = requestFor(COURIER_A.address);
        expect(req.buyerSig).toBeUndefined();
        expect(req.sellerSig).toBeUndefined();
        expect(req.commitment.payment).toBe(CEILING);
        expect(req.commitment.expectedCumulativeValue).toBe(CEILING);
        expect(req.quoteRequest?.pricedFields).toEqual(PRICED);
        const commerce = req.agreement.sections.find((s) => s.clause === keyOf("figaro-commerce"))!;
        expect(commerce.data.payment).toBe(CEILING.toString());
        expect((commerce.data.lineItems as Array<{ unitPrice: string }>)[0].unitPrice).toBe(CEILING.toString());
        expect((await validateDraft(req, COURIER_A.address, undefined, undefined, null, BOUND)).ok).toBe(true);
    });

    it("throws when a priced path does not exist — substitution never invents structure", () => {
        const req = requestFor(COURIER_A.address);
        expect(() => substitutePricedValue(req.agreement, [{ clause: keyOf("figaro-commerce"), path: "surcharge" }], 5n))
            .toThrow(/no field "surcharge"/);
        const nope = `0x${"9e".repeat(32)}` as const;
        expect(() => substitutePricedValue(req.agreement, [{ clause: nope, path: "payment" }], 5n))
            .toThrow(new RegExp(`no "${nope}" clauseEntry`));
    });
});

describe("quoteDraft (real signatures, no chain)", () => {
    it("quotes under the ceiling and the reply verifies by reconstruction", async () => {
        const req = requestFor(COURIER_A.address);
        const reply = await quoteDraft(courierAW, req, CTX, () => 700n, quotePolicy, undefined, null, BOUND);
        expect(reply?.sellerSig).toBeDefined();
        expect(reply?.commitment.payment).toBe(700n);
        expect(reply?.commitment.expectedCumulativeValue).toBe(700n);
        const commerce = reply!.agreement.sections.find((s) => s.clause === keyOf("figaro-commerce"))!;
        expect(commerce.data.payment).toBe("700");
        expect((commerce.data.lineItems as Array<{ unitPrice: string }>)[0].unitPrice).toBe("700");
        expect((await verifyQuoteReply(reply!, req, CTX)).ok).toBe(true);
    });

    it("declines without a policy, without a pricing function, on a null quote, and above the ceiling", async () => {
        const req = requestFor(COURIER_A.address);
        expect(await quoteDraft(courierAW, req, CTX, () => 700n, undefined, undefined, null, BOUND)).toBeNull();
        expect(await quoteDraft(courierAW, req, CTX, undefined, quotePolicy, undefined, null, BOUND)).toBeNull();
        expect(await quoteDraft(courierAW, req, CTX, () => null, quotePolicy, undefined, null, BOUND)).toBeNull();
        expect(await quoteDraft(courierAW, req, CTX, () => CEILING + 1n, quotePolicy, undefined, null, BOUND)).toBeNull();
        expect(await quoteDraft(courierAW, req, CTX, () => 0n, quotePolicy, undefined, null, BOUND)).toBeNull();
    });

    it("the legs never cross: quoteDraft refuses a race draft, counterSignDraft refuses a quote request", async () => {
        const raceDraft = await draftFor(COURIER_A.address, 1000n);
        await expect(quoteDraft(courierAW, raceDraft, CTX, () => 700n, quotePolicy, undefined, null, BOUND))
            .rejects.toThrow(/no quote request/);
        const req = requestFor(COURIER_A.address);
        await expect(counterSignDraft(courierAW, req, CTX, () => true, policy, undefined, null, BOUND))
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
                s.clause === keyOf("figaro-commerce")
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
        const honest = await quoteDraft(courierAW, req, CTX, () => 700n, quotePolicy, undefined, null, BOUND);
        const forged: CommitmentPayload = { ...honest!, sellerSig: await signedBy(courierBW, honest!.commitment) };
        const check = await verifyQuoteReply(forged, req, CTX);
        expect(check.ok).toBe(false);
        expect(check.reason).toMatch(/does not recover to the drafted candidate/);
    });
});

describe("requestCounterSignatures over the coordination channel", () => {
    it("fans race drafts out through mounted handlers; the cheapest posted countersigner wins, silence drops out", async () => {
        const channel = new InProcessChannel();
        channel.register(COURIER_A.address, makeSellerRaceHandler(courierAW, CTX, { accept: () => true, policy, readProfile: BOUND }));
        channel.register(COURIER_B.address, makeSellerRaceHandler(courierBW, CTX, { accept: () => true, policy, readProfile: BOUND }));
        const silent = "0x000000000000000000000000000000000000dEaD" as Address;
        const drafts = [
            await draftFor(COURIER_A.address, 3000n),
            await draftFor(COURIER_B.address, 1000n),
            await draftFor(silent, 2000n),
        ];
        const { replies, winner } = await requestCounterSignatures(channel, drafts, CTX);
        expect(replies).toHaveLength(2);
        expect(winner?.reply.commitment.seller.toLowerCase()).toBe(COURIER_B.address.toLowerCase());
        expect(winner?.reply.commitment.payment).toBe(1000n);
    });

    it("a race handler refuses a quote request (throw → dropped), never countersigns the ceiling", async () => {
        const channel = new InProcessChannel();
        channel.register(COURIER_A.address, makeSellerRaceHandler(courierAW, CTX, { accept: () => true, policy: quotePolicy, readProfile: BOUND }));
        const { replies, winner } = await requestCounterSignatures(channel, [requestFor(COURIER_A.address)], CTX);
        expect(replies).toHaveLength(0);
        expect(winner).toBeNull();
    });
});

describe("requestQuotes over the coordination channel", () => {
    it("collects verified quotes and the cheapest wins; silent candidates drop out", async () => {
        const channel = new InProcessChannel();
        channel.register(COURIER_A.address, makeSellerQuoteHandler(courierAW, CTX, { quote: () => 700n, policy: quotePolicy, readProfile: BOUND }));
        channel.register(COURIER_B.address, makeSellerQuoteHandler(courierBW, CTX, { quote: () => 500n, policy: quotePolicy, readProfile: BOUND }));
        const silent = "0x000000000000000000000000000000000000dEaD" as Address;
        const drafts = [requestFor(COURIER_A.address), requestFor(COURIER_B.address), requestFor(silent)];
        const { replies, winner } = await requestQuotes(channel, drafts, CTX);
        expect(replies).toHaveLength(2);
        expect(winner?.reply.commitment.seller.toLowerCase()).toBe(COURIER_B.address.toLowerCase());
        expect(winner?.reply.commitment.payment).toBe(500n);
        // The winner's struct hash is exactly the buyer's reconstruction at 500.
        expect(hashCommitmentStruct(winner!.reply.commitment))
            .toBe(hashCommitmentStruct((await quoteDraft(courierBW, drafts[1], CTX, () => 500n, quotePolicy, undefined, null, BOUND))!.commitment));
    });
});

describe("the merkle-leaf seam on the race + quote legs (docs/CLAUSES.md § 'Every clause is a merkle leaf')", () => {
    const SPECS = specSourceFromFixtures(["figaro-commerce", "figaro-topology"]);
    const BAD_CURRENCY = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;
    const fullCommerce = (currency: Address, payment: string) => ({
        [keyOf("figaro-commerce")]: {
            currency, payment,
            lineItems: [{ itemId: "x", name: "Item", quantity: 1, unitPrice: payment }],
        },
    });
    /** A draft whose commerce LEAF contradicts the struct — the tamper shape
     *  only a SpecSource can see (the struct alone is allowlist-clean). */
    async function mismatchedDraft(candidate: Address): Promise<CommitmentPayload> {
        const offer = await buildBuyerOffer(buyerW, {
            assembly: assembly, seller: candidate, currency: CURRENCY, payment: 1000n,
            chainId: CHAIN, core: CORE, deadline: 1_900_000_000n,
            overrides: fullCommerce(BAD_CURRENCY, "1000"),
        });
        const { buyerSig: _stripped, ...draft } = offer;
        return draft;
    }

    it("without specs the contradiction is invisible; with specs validateDraft refuses it", async () => {
        const draft = await mismatchedDraft(COURIER_A.address);
        expect((await validateDraft(draft, COURIER_A.address, undefined, undefined, null, BOUND)).ok).toBe(true);
        expect((await validateDraft(draft, COURIER_A.address, undefined, SPECS, null, BOUND)).reason).toMatch(/denomination/i);
    });

    it("counterSignDraft THROWS on the contradiction when specs are supplied — the candidate never countersigns it", async () => {
        const draft = await mismatchedDraft(COURIER_A.address);
        await expect(counterSignDraft(courierAW, draft, CTX, () => true, policy, SPECS, null, BOUND))
            .rejects.toThrow(/denomination/i);
    });

    it("a clean draft still countersigns with the gate on (specs via the mountable handler too)", async () => {
        const offer = await buildBuyerOffer(buyerW, {
            assembly: assembly, seller: COURIER_A.address, currency: CURRENCY, payment: 1000n,
            chainId: CHAIN, core: CORE, deadline: 1_900_000_000n,
            overrides: fullCommerce(CURRENCY, "1000"),
        });
        const { buyerSig: _stripped, ...draft } = offer;
        // The gate reads the design the draft names: without it the
        // candidate refuses, with it the clean draft countersigns.
        await expect(counterSignDraft(courierAW, draft, CTX, () => true, policy, SPECS, null, BOUND))
            .rejects.toThrow(/was not read/);
        const reply = await counterSignDraft(courierAW, draft, CTX, () => true, policy, SPECS, assembly, BOUND);
        expect(reply?.sellerSig).toBeDefined();
        const viaHandler = makeSellerRaceHandler(courierAW, CTX, { accept: () => true, policy, specs: SPECS, readDesign: async () => assembly, readProfile: BOUND });
        expect((await viaHandler(draft))?.sellerSig).toBeDefined();
        const unread = makeSellerRaceHandler(courierAW, CTX, { accept: () => true, policy, specs: SPECS, readDesign: async () => null, readProfile: BOUND });
        await expect(unread(draft)).rejects.toThrow(/was not read/);
    });

    it("quoteDraft with specs: a clean request quotes (outbound gate passes), a leaf-tampered request THROWS", async () => {
        const clean = requestFor(COURIER_A.address);
        const reply = await quoteDraft(courierAW, clean, CTX, () => 700n, quotePolicy, SPECS, assembly, BOUND);
        expect(reply?.sellerSig).toBeDefined();
        const tampered = buildQuoteRequest({
            assembly: assembly, buyer: BUYER.address, seller: COURIER_A.address, currency: CURRENCY,
            ceiling: CEILING, chainId: CHAIN, core: CORE, pricedFields: PRICED, deadline: 1_900_000_000n,
            overrides: fullCommerce(BAD_CURRENCY, "0"),
        });
        await expect(quoteDraft(courierAW, tampered, CTX, () => 700n, quotePolicy, SPECS, assembly, BOUND))
            .rejects.toThrow(/denomination/i);
    });

    /** `payload` with the topology clause the registered agreement composes
     *  dropped, rehashed so only the missing clause is wrong. */
    function withoutTopology(payload: CommitmentPayload): CommitmentPayload {
        const agreement = { ...payload.agreement, sections: payload.agreement.sections.filter((s) => s.clause !== keyOf("figaro-topology")) };
        return { ...payload, agreement, commitment: { ...payload.commitment, agreementHash: computeAgreementHash(agreement) } };
    }
    const draftHash = assemblyCompositionHash(assembly.assembly);
    const missing = new RegExp(`figaro-topology clause: the order does not carry this clause, which assembly ${deriveAssemblySlug(draftHash)} \\(${draftHash}\\) composes`);

    it("validateDraft, counterSignDraft and quoteDraft refuse a draft missing a clause of the registered agreement it names", async () => {
        const offer = await buildBuyerOffer(buyerW, {
            assembly: assembly, seller: COURIER_A.address, currency: CURRENCY, payment: 1000n,
            chainId: CHAIN, core: CORE, deadline: 1_900_000_000n,
            overrides: fullCommerce(CURRENCY, "1000"),
        });
        const { buyerSig: _stripped, ...draft } = offer;
        const short = withoutTopology(draft);
        expect((await validateDraft(short, COURIER_A.address, undefined, SPECS, assembly, BOUND)).reason).toMatch(missing);
        await expect(counterSignDraft(courierAW, short, CTX, () => true, policy, SPECS, assembly, BOUND)).rejects.toThrow(missing);
        await expect(quoteDraft(courierAW, withoutTopology(requestFor(COURIER_A.address)), CTX, () => 700n, quotePolicy, SPECS, assembly, BOUND))
            .rejects.toThrow(missing);
    });
});

describe("the seller's bound assemblies — the race and quote legs refuse a draft under an assembly the candidate has not bound", () => {
    // A structurally different assembly (its own clause selection), so its
    // composition hash differs from the one the orders instantiate.
    const elsewhere = hydrateAuthored({
        agreements: [{ id: "order-0", clauses: { [keyOf("figaro-topology")]: { parentOrderHashes: [] } } }],
    });
    const draftHash = assemblyCompositionHash(assembly.assembly);
    const NOT_BINDING = profileBinding(elsewhere);
    const named = new RegExp(`has not bound assembly ${deriveAssemblySlug(draftHash)} \\(${draftHash}\\)`);

    it("validateDraft refuses a draft under an assembly the candidate has not bound, and one whose profile is unreadable", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        expect((await validateDraft(draft, COURIER_A.address, undefined, undefined, null, NOT_BINDING)).reason).toMatch(named);
        expect((await validateDraft(draft, COURIER_A.address, undefined, undefined, null, async () => null)).reason).toMatch(/could not be read/);
        expect((await validateDraft(draft, COURIER_A.address)).reason).toMatch(/no member-profile reader/);
    });

    it("validateDraft refuses a draft whose agreement carries no provenance leaf", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        const { provenance: _dropped, ...bare } = draft.agreement;
        const unprovenanced: CommitmentPayload = { agreement: bare, commitment: { ...draft.commitment, agreementHash: computeAgreementHash(bare) } };
        expect((await validateDraft(unprovenanced, COURIER_A.address, undefined, undefined, null, BOUND)).reason).toMatch(/names no assembly/);
    });

    it("counterSignDraft and quoteDraft THROW on an assembly the candidate has not bound, before any signature", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        await expect(counterSignDraft(courierAW, draft, CTX, () => true, policy, undefined, null, NOT_BINDING)).rejects.toThrow(named);
        const req = requestFor(COURIER_A.address);
        await expect(quoteDraft(courierAW, req, CTX, () => 700n, quotePolicy, undefined, null, NOT_BINDING)).rejects.toThrow(named);
    });

    it("the mountable handlers read the candidate's own profile — without readProfile every draft is refused", async () => {
        const draft = await draftFor(COURIER_A.address, 1000n);
        const reads: string[] = [];
        const race = makeSellerRaceHandler(courierAW, CTX, {
            accept: () => true, policy, readProfile: async (m) => { reads.push(m); return BOUND(m); },
        });
        expect((await race(draft))?.sellerSig).toBeDefined();
        expect(reads).toEqual([COURIER_A.address]);
        await expect(makeSellerRaceHandler(courierAW, CTX, { accept: () => true, policy })(draft)).rejects.toThrow(/no member-profile reader/);
        await expect(makeSellerRaceHandler(courierAW, CTX, { accept: () => true, policy, readProfile: NOT_BINDING })(draft)).rejects.toThrow(named);
        const req = requestFor(COURIER_A.address);
        expect((await makeSellerQuoteHandler(courierAW, CTX, { quote: () => 700n, policy: quotePolicy, readProfile: BOUND })(req))?.sellerSig).toBeDefined();
        await expect(makeSellerQuoteHandler(courierAW, CTX, { quote: () => 700n, policy: quotePolicy })(req)).rejects.toThrow(/no member-profile reader/);
        await expect(makeSellerQuoteHandler(courierAW, CTX, { quote: () => 700n, policy: quotePolicy, readProfile: NOT_BINDING })(req)).rejects.toThrow(named);
    });

    it("a race over the channel drops a candidate that has not bound the assembly — the refusal is a rejection, never a countersignature", async () => {
        const channel = new InProcessChannel();
        channel.register(COURIER_A.address, makeSellerRaceHandler(courierAW, CTX, { accept: () => true, policy, readProfile: NOT_BINDING }));
        channel.register(COURIER_B.address, makeSellerRaceHandler(courierBW, CTX, { accept: () => true, policy, readProfile: BOUND }));
        const { replies, winner } = await requestCounterSignatures(channel, [
            await draftFor(COURIER_A.address, 500n),
            await draftFor(COURIER_B.address, 1000n),
        ], CTX);
        expect(replies).toHaveLength(1);
        expect(winner?.reply.commitment.seller.toLowerCase()).toBe(COURIER_B.address.toLowerCase());
    });
});
