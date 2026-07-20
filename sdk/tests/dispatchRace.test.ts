import { describe, it, expect } from "vitest";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildBuyerOffer, type AssemblyTemplate, type OfferPolicy } from "../src/agent/originate.js";
import { validateDraft, counterSignDraft, verifyRaceReply, selectRaceWinner, type RaceReply } from "../src/agent/dispatchRace.js";
import type { CommitmentPayload } from "../src/agent/coordination.js";
import type { Address } from "../src/types.js";

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
