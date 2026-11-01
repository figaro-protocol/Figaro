import { describe, it, expect } from "vitest";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
    instantiateRootAgreement,
    buildBuyerOffer,
    validateOffer,
    checkPayloadTerms,
    signCommitmentAs,
    countersignUnderFloors,
    checkSellerSignature,
    gateSeller,
    counterSignOffer,
    offerToExecutionInputs,
    checkDeadlineCap,
    DEFAULT_MAX_DEADLINE_SECONDS,
    type OfferPolicy,
} from "../src/agent/originate.js";
import { InProcessChannel } from "../src/agent/coordination.js";
import { computeCheckoutHash } from "../src/agreement.js";
import { buildDomain, COMMITMENT_TYPES } from "../src/commitments.js";
import { assemblyHashOf } from "../src/assembly.js";
import type { Address } from "../src/types.js";
import { keyOf, specSourceFromFixtures } from "./specFixtures.js";
import { hydrateAuthored, profileBinding } from "./hydrate.js";
import type { PublicClient } from "viem";
import { makeSellerOfferHandler } from "../src/agent/originate.js";
import { deriveAssemblySlug } from "../src/assembly.js";
import type { CommitmentPayload } from "../src/agent/coordination.js";
import { forgeBuyerOffer } from "./forgeOffer.js";

const SPECS = specSourceFromFixtures(["figaro-commerce", "figaro-topology"]);

const BUYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"); // anvil[0]
const SELLER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"); // anvil[1]
const CURRENCY = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
const CORE = "0x000000000000000000000000000000000000c0de" as Address;
const CHAIN = 31337;
/** The chain's now the seller legs bound the deadline from: the offers'
 *  deadline (1_900_000_000) is one hour past it. */
const CHAIN_NOW = 1_900_000_000n - 3600n;

// signTypedData on a local account is offline — no RPC call — so a dummy transport is fine.
const buyerW = createWalletClient({ account: BUYER, transport: http("http://localhost:0") });
const sellerW = createWalletClient({ account: SELLER, transport: http("http://localhost:0") });

const assembly = hydrateAuthored({
    agreements: [{ id: "agreement-0", clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: { follows: [] } } }],
});
const overrides = { [keyOf("figaro-commerce")]: { currency: CURRENCY, payment: "1000", lineItems: [{ itemId: "x", name: "Item", quantity: 1, unitPrice: "1000" }] } };

function offerParams() {
    return { assembly: assembly, seller: SELLER.address, currency: CURRENCY, payment: 1000n, chainId: CHAIN, core: CORE, deadline: 1_900_000_000n, overrides, specs: SPECS };
}

// The seller's own profile, read at acceptance time, binds the assembly the
// offers instantiate.
const BOUND = profileBinding(assembly);

// A conforming operator policy for the root offer above (payment 1000, CURRENCY).
const policy: OfferPolicy = { requireRootShape: true, currencyAllowlist: [CURRENCY], maxValue: 10_000n };

describe("instantiateRootAgreement", () => {
    it("merges overrides onto the assembly's root clause bag", () => {
        const a = instantiateRootAgreement(assembly, { buyer: BUYER.address, seller: SELLER.address, overrides });
        const commerce = a.clauses.find((s) => s.clause === keyOf("figaro-commerce"));
        expect(commerce?.data.payment).toBe("1000");
        expect(commerce?.data.currency).toBe(CURRENCY);
        expect(a.buyer).toBe(BUYER.address);
        expect(a.seller).toBe(SELLER.address);
    });

    it("picks the root agreement (no non-empty follows) from a multi-agreement assembly", () => {
        const multi = hydrateAuthored({
            agreements: [
                { id: "agreement-1", clauses: { [keyOf("figaro-topology")]: { follows: ["0xabc"] } } },
                { id: "agreement-0", clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: { follows: [] } } },
            ],
        });
        const a = instantiateRootAgreement(multi, { buyer: BUYER.address, seller: SELLER.address });
        expect(a.clauses.some((s) => s.clause === keyOf("figaro-commerce"))).toBe(true);
    });

});

describe("origination handshake (real signatures, no chain)", () => {
    it("buyer builds a valid, self-consistent signed offer", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        expect(offer.buyerSig).toBeDefined();
        expect(offer.commitment.buyer.toLowerCase()).toBe(BUYER.address.toLowerCase());
        expect(offer.commitment.checkoutHash).toBe(computeCheckoutHash(offer.agreement));
        expect((await validateOffer(offer, SELLER.address, undefined, undefined, null, BOUND)).ok).toBe(true);
    });

    it("seller counter-signs a clean offer WHEN accept AND policy pass; yields both execution inputs", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const signed = await counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE, chainNow: CHAIN_NOW }, SPECS, () => true, policy, assembly, BOUND);
        expect(signed).not.toBeNull();
        const inputs = offerToExecutionInputs(signed!);
        expect(inputs.buyerSig).toBeDefined();
        expect(inputs.sellerSig).toBeDefined();
        expect(inputs.commitment).toBe(offer.commitment);
    });

    it("REFUSE-ALL FLOOR: a clean offer with NO accept rule is declined (null), not signed", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const signed = await counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE, chainNow: CHAIN_NOW }, SPECS, undefined, policy, assembly, BOUND);
        expect(signed).toBeNull();
    });

    it("ECONOMIC FLOOR safe default: a clean offer with NO policy is declined (null), even when accept says yes", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const signed = await counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE, chainNow: CHAIN_NOW }, SPECS, () => true, undefined, assembly, BOUND);
        expect(signed).toBeNull();
    });

    it("ECONOMIC FLOOR: an offer whose currency is outside the policy declines (null), not a throw", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const otherOnly: OfferPolicy = { ...policy, currencyAllowlist: ["0xdddddddddddddddddddddddddddddddddddddddd" as Address] };
        const signed = await counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE, chainNow: CHAIN_NOW }, SPECS, () => true, otherOnly, assembly, BOUND);
        expect(signed).toBeNull();
    });

    it("accept decline returns null (not a throw) on a clean offer", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const signed = await counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE, chainNow: CHAIN_NOW }, SPECS, () => false, policy, assembly, BOUND);
        expect(signed).toBeNull();
    });
});

describe("validateOffer — the economic floor (operator policy)", () => {
    it("a conforming offer passes under a full policy", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        expect((await validateOffer(offer, SELLER.address, policy, undefined, null, BOUND)).ok).toBe(true);
    });

    it("rejects a root-shape violation when requireRootShape is set (cumulativeValue != payment)", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        offer.commitment.expectedCumulativeValue = 500n; // != payment (1000) — not a well-formed root
        expect((await validateOffer(offer, SELLER.address, policy, undefined, null, BOUND)).reason).toMatch(/root order/i);
    });

    it("accepts a non-root shape when requireRootShape is omitted (a sub-order seller)", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        offer.commitment.expectedCumulativeValue = 1800n; // running total on a sub-order
        const subPolicy: OfferPolicy = { currencyAllowlist: [CURRENCY], maxValue: 10_000n };
        expect((await validateOffer(offer, SELLER.address, subPolicy, undefined, null, BOUND)).ok).toBe(true);
    });

    it("rejects a currency outside the operator allowlist", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const otherOnly: OfferPolicy = { ...policy, currencyAllowlist: ["0xdddddddddddddddddddddddddddddddddddddddd" as Address] };
        expect((await validateOffer(offer, SELLER.address, otherOnly, undefined, null, BOUND)).reason).toMatch(/not in the policy allowlist/i);
    });

    it("rejects magnitude over the operator cap", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const tightCap: OfferPolicy = { ...policy, maxValue: 500n }; // payment is 1000
        expect((await validateOffer(offer, SELLER.address, tightCap, undefined, null, BOUND)).reason).toMatch(/exceeds the policy cap/i);
    });

    it("an opted-in policy with an empty allowlist vouches for nothing (rejects)", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const noList: OfferPolicy = { currencyAllowlist: [], maxValue: 10_000n };
        expect((await validateOffer(offer, SELLER.address, noList, undefined, null, BOUND)).reason).toMatch(/no currency allowlist/i);
    });

    it("an opted-in policy with no cap leaves magnitude unbounded (rejects)", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const noCap: OfferPolicy = { currencyAllowlist: [CURRENCY] };
        expect((await validateOffer(offer, SELLER.address, noCap, undefined, null, BOUND)).reason).toMatch(/no magnitude cap/i);
    });
});

describe("origination handshake — the anti-tamper gate (security)", () => {
    it("rejects an offer whose agreement was mutated after the buyer signed", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        // Tamper: change the agreement so it no longer hashes to the committed checkoutHash.
        offer.agreement.clauses.find((s) => s.clause === keyOf("figaro-commerce"))!.data.payment = "1";
        expect((await validateOffer(offer, SELLER.address, undefined, undefined, null, BOUND)).ok).toBe(false);
        await expect(counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE, chainNow: CHAIN_NOW }, SPECS, undefined, undefined, assembly, BOUND)).rejects.toThrow(/agreement does not hash/i);
    });

    it("rejects an offer that names a different seller", async () => {
        const offer = await buildBuyerOffer(buyerW, { ...offerParams(), seller: "0x1111111111111111111111111111111111111111" as Address });
        expect((await validateOffer(offer, SELLER.address, undefined, undefined, null, BOUND)).reason).toMatch(/different seller/i);
    });

    it("rejects an offer whose buyer signature does not recover to the named buyer", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        // Forge: same commitment, a signature from the wrong key.
        const bogus = await buildBuyerOffer(sellerW, { ...offerParams(), seller: SELLER.address });
        offer.buyerSig = bogus.buyerSig; // signature over a DIFFERENT commitment
        await expect(counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE, chainNow: CHAIN_NOW }, SPECS, undefined, undefined, assembly, BOUND)).rejects.toThrow(/does not recover/i);
    });

    // THE MERKLE-LEAF SEAM (docs/CLAUSES.md § "Every clause is a merkle
    // leaf"): a leaf that disagrees with the struct is tampering, refused
    // with the same anti-tamper treatment as every other structural check —
    // but ONLY when the seller's SpecSource is supplied (`specs`), since
    // that's what finds the commerce clause's currency-as-content leaf.
    it("rejects an offer whose commerce leaf names a currency contradicting the allowlisted struct currency", async () => {
        const BAD_CURRENCY = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;
        const mismatched = {
            ...offerParams(),
            overrides: {
                [keyOf("figaro-commerce")]: {
                    currency: BAD_CURRENCY, // the signed TERM
                    payment: "1000",
                    lineItems: [{ itemId: "x", name: "Item", quantity: 1, unitPrice: "1000" }],
                },
            },
        };
        const offer = await forgeBuyerOffer(buyerW, mismatched);
        // The signed STRUCT still names the allowlisted currency.
        expect(offer.commitment.currency).toBe(CURRENCY);

        // validateOffer without specs is structural only — the leaf mismatch
        // is invisible to it; no signing path runs without specs.
        expect((await validateOffer(offer, SELLER.address, undefined, undefined, null, BOUND)).ok).toBe(true);
        await expect(
            counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE, chainNow: CHAIN_NOW }, undefined as never, () => true, policy, null, BOUND),
        ).rejects.toThrow(/refusing to sign without the clause specs/);

        // With specs, it's caught and refused — before any signature.
        expect((await validateOffer(offer, SELLER.address, undefined, SPECS, null, BOUND)).ok).toBe(false);
        await expect(
            counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE, chainNow: CHAIN_NOW }, SPECS, () => true, policy, assembly, BOUND),
        ).rejects.toThrow(/denomination/i);
    });

    it("buildBuyerOffer refuses to sign without specs", async () => {
        await expect(buildBuyerOffer(buyerW, { ...offerParams(), specs: undefined as never }))
            .rejects.toThrow(/buildBuyerOffer: refusing to sign without the clause specs/);
    });

    it("buildBuyerOffer refuses to sign the same contradiction BUYER-side", async () => {
        const BAD_CURRENCY = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;
        const mismatched = {
            ...offerParams(),
            specs: SPECS,
            overrides: {
                [keyOf("figaro-commerce")]: {
                    currency: BAD_CURRENCY,
                    payment: "1000",
                    lineItems: [{ itemId: "x", name: "Item", quantity: 1, unitPrice: "1000" }],
                },
            },
        };
        await expect(buildBuyerOffer(buyerW, mismatched)).rejects.toThrow(/denomination/i);
        // A clean offer still signs with the gate on.
        const offer = await buildBuyerOffer(buyerW, { ...offerParams(), specs: SPECS });
        expect(offer.buyerSig).toBeDefined();
    });

    it("rejects an offer whose commerce PAYMENT leaf contradicts the struct payment (both mirrored fields gate)", async () => {
        const mismatched = {
            ...offerParams(), // struct payment stays 1000n
            overrides: {
                [keyOf("figaro-commerce")]: {
                    currency: CURRENCY,
                    payment: "5", // the signed TERM disagrees
                    lineItems: [{ itemId: "x", name: "Item", quantity: 1, unitPrice: "5" }],
                },
            },
        };
        const offer = await forgeBuyerOffer(buyerW, mismatched);
        // Invisible to the structural check, refused by the spec gate.
        expect((await validateOffer(offer, SELLER.address, undefined, undefined, null, BOUND)).ok).toBe(true);
        expect((await validateOffer(offer, SELLER.address, undefined, SPECS, null, BOUND)).reason).toMatch(/commitment payment 1000 contradicts/i);
    });
});

describe("InProcessChannel", () => {
    it("routes an offer to the registered seller handler; unregistered → null", async () => {
        const channel = new InProcessChannel();
        channel.register(SELLER.address, (o) => counterSignOffer(sellerW, o, { chainId: CHAIN, core: CORE, chainNow: CHAIN_NOW }, SPECS, () => true, policy, assembly, BOUND));
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const signed = await channel.sendOffer(SELLER.address, offer);
        expect(signed?.sellerSig).toBeDefined();
        expect(await channel.sendOffer("0x2222222222222222222222222222222222222222" as Address, offer)).toBeNull();
    });
});

describe("the assembly-scope fold at root instantiation (audit hole (a), closed)", () => {
    const FOLD_SPECS = specSourceFromFixtures([
        "figaro-commerce", "figaro-topology", "figaro-utility-token",
    ]);
    const PIN = CURRENCY;
    const OTHER = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;
    const pinned = hydrateAuthored({
        assemblyClauses: {
            [keyOf("figaro-utility-token")]: { currency: PIN },
        },
        agreements: [{ id: "agreement-0", clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: { follows: [] } } }],
    });

    it("instantiateRootAgreement folds assemblyClauses into the root agreement", () => {
        const a = instantiateRootAgreement(pinned, { buyer: BUYER.address, seller: SELLER.address, overrides });
        const ids = a.clauses.map((s) => s.clause);
        expect(ids).toEqual(expect.arrayContaining([
            keyOf("figaro-utility-token"), keyOf("figaro-commerce"), keyOf("figaro-topology"),
        ]));
        expect(a.clauses.find((s) => s.clause === keyOf("figaro-utility-token"))?.data.currency).toBe(PIN);
    });

    it("the instantiated agreement carries the assembly's own assembly hash as agreement.provenance", () => {
        const a = instantiateRootAgreement(pinned, { buyer: BUYER.address, seller: SELLER.address, overrides });
        expect(a.provenance).toEqual({
            agreementHash: pinned.assembly.agreements[0].agreementHash,
            assemblyHash: assemblyHashOf(pinned.assembly),
        });
        // The provenance leaf is the format's, not a clause: no clause carries it.
        expect(a.clauses.some((s) => "assemblyHash" in (s.data ?? {}))).toBe(false);
    });

    it("the folded pin now REACHES the sign gate: a pin contradicting the struct refuses to sign", async () => {
        const mismatched = {
            ...pinned,
            assembly: {
                ...pinned.assembly,
                assemblyClauses: { ...pinned.assembly.assemblyClauses, [keyOf("figaro-utility-token")]: { currency: OTHER } },
            },
        };
        await expect(buildBuyerOffer(buyerW, {
            assembly: mismatched, seller: SELLER.address, currency: CURRENCY, payment: 1000n,
            chainId: CHAIN, core: CORE, deadline: 1_900_000_000n, overrides, specs: FOLD_SPECS,
        })).rejects.toThrow(/denominated by design/);
        // And the MATCHING pin signs clean — the fold + fill + gate agree, and
        // the signed root commits the provenance leaf.
        const offer = await buildBuyerOffer(buyerW, {
            assembly: pinned, seller: SELLER.address, currency: CURRENCY, payment: 1000n,
            chainId: CHAIN, core: CORE, deadline: 1_900_000_000n, overrides, specs: FOLD_SPECS,
        });
        expect(offer.buyerSig).toBeDefined();
        expect(offer.agreement.provenance?.assemblyHash).toBe(assemblyHashOf(pinned.assembly));
        expect(offer.commitment.checkoutHash).toBe(computeCheckoutHash(offer.agreement));
    });
});

describe("the designer's values — never changed by a buyer or a seller", () => {
    // The ruling: a design fill (`block.design.fills`) the designer set is the
    // designer's value; the sign gate refuses an agreement whose clause
    // carries another, wherever the override came from.
    const DESIGN_SPECS = specSourceFromFixtures(["figaro-commerce", "figaro-topology", "figaro-consent", "figaro-applicable-law", "figaro-property-transfer"]);
    const DOCS = [{ documentHash: `0x${"d0".repeat(32)}`, documentVersion: "1.0.0", documentTitle: "Terms of Service" }];
    const FORGED = [{ documentHash: `0x${"ee".repeat(32)}`, documentVersion: "1.0.0", documentTitle: "Terms of Service" }];
    // The designer's value of an ASSEMBLY-SCOPED clause with a design fill …
    const EVENTS = ["Sale of the consignment agreed mid-voyage, ownership passing at resolution"];
    // … and the buyer's fill, at checkout, of the forum clause the designer
    // composed with no values — once for the whole process.
    const FORUM = { applicableLaw: "England-Wales", forum: "LCIA-arbitration" };
    const designed = hydrateAuthored({
        assemblyClauses: {
            [keyOf("figaro-property-transfer")]: { anticipatedEvents: EVENTS },
            [keyOf("figaro-applicable-law")]: {},
        },
        agreements: [{
            id: "agreement-0",
            clauses: {
                [keyOf("figaro-commerce")]: {},
                [keyOf("figaro-topology")]: { follows: [] },
                [keyOf("figaro-consent")]: { documents: DOCS },
            },
        }],
    });
    const params = (extra: Record<string, Record<string, unknown>>) => ({
        assembly: designed, seller: SELLER.address, currency: CURRENCY, payment: 1000n,
        chainId: CHAIN, core: CORE, deadline: 1_900_000_000n, specs: DESIGN_SPECS,
        overrides: { ...overrides, [keyOf("figaro-applicable-law")]: FORUM, ...extra },
    });

    it("signs an offer that keeps every designer value", async () => {
        const offer = await buildBuyerOffer(buyerW, params({}));
        expect(offer.buyerSig).toBeDefined();
    });

    it("refuses an override that replaces an agreement-scoped designer value", async () => {
        await expect(buildBuyerOffer(buyerW, params({ [keyOf("figaro-consent")]: { documents: FORGED } })))
            .rejects.toThrow(/figaro-consent documents: .*designer/);
    });

    it("refuses an override that replaces an assembly-scoped designer value", async () => {
        await expect(buildBuyerOffer(buyerW, params({ [keyOf("figaro-property-transfer")]: { anticipatedEvents: ["Another event"] } })))
            .rejects.toThrow(/figaro-property-transfer anticipatedEvents: .*designer/);
    });

    it("the seller refuses an offer whose designer value a buyer changed, and one whose design it cannot read", async () => {
        // A buyer that skips its own gate still reaches the seller's.
        const forged = await forgeBuyerOffer(buyerW, params({ [keyOf("figaro-consent")]: { documents: FORGED } }));
        expect((await validateOffer(forged, SELLER.address, undefined, DESIGN_SPECS, designed, profileBinding(designed))).reason).toMatch(/figaro-consent documents: .*designer/);
        const clean = await buildBuyerOffer(buyerW, params({}));
        expect((await validateOffer(clean, SELLER.address, undefined, DESIGN_SPECS, designed, profileBinding(designed))).ok).toBe(true);
        expect((await validateOffer(clean, SELLER.address, undefined, DESIGN_SPECS, null, profileBinding(designed))).reason).toMatch(/was not read/);
        await expect(counterSignOffer(sellerW, forged, { chainId: CHAIN, core: CORE, chainNow: CHAIN_NOW }, DESIGN_SPECS, () => true, policy, designed, profileBinding(designed)))
            .rejects.toThrow(/designer/);
    });

    it("the seller refuses an offer missing a clause of the registered agreement it names, before any signature", async () => {
        const clean = await buildBuyerOffer(buyerW, params({}));
        const agreement = { ...clean.agreement, clauses: clean.agreement.clauses.filter((s) => s.clause !== keyOf("figaro-consent")) };
        const commitment = { ...clean.commitment, checkoutHash: computeCheckoutHash(agreement) };
        const buyerSig = await buyerW.signTypedData({
            account: BUYER, domain: buildDomain(CHAIN, CORE), types: COMMITMENT_TYPES, primaryType: "Commitment", message: commitment,
        });
        const short: CommitmentPayload = { commitment, agreement, buyerSig };
        const assemblyHash = assemblyHashOf(designed.assembly);
        const named = new RegExp(`figaro-consent clause: the order does not carry this clause, which assembly ${deriveAssemblySlug(assemblyHash)} \\(${assemblyHash}\\) composes`);
        expect((await validateOffer(short, SELLER.address, undefined, DESIGN_SPECS, designed, profileBinding(designed))).reason).toMatch(named);
        await expect(counterSignOffer(sellerW, short, { chainId: CHAIN, core: CORE, chainNow: CHAIN_NOW }, DESIGN_SPECS, () => true, policy, designed, profileBinding(designed)))
            .rejects.toThrow(named);
    });

    it("the buyer fills the forum clause the designer composed with no values, and the offer carries the buyer's choice", async () => {
        const offer = await buildBuyerOffer(buyerW, params({}));
        expect(offer.agreement.clauses.find((s) => s.clause === keyOf("figaro-applicable-law"))?.data).toEqual(FORUM);
        const other = { applicableLaw: "US-NY", forum: "JAMS-arbitration" };
        const chosen = await buildBuyerOffer(buyerW, params({ [keyOf("figaro-applicable-law")]: other }));
        expect(chosen.agreement.clauses.find((s) => s.clause === keyOf("figaro-applicable-law"))?.data).toEqual(other);
        // A forum clause left empty is not an offer: the field is required once composed.
        await expect(buildBuyerOffer(buyerW, params({ [keyOf("figaro-applicable-law")]: {} })))
            .rejects.toThrow(/figaro-applicable-law \$\.forum/);
    });
});

describe("the seller's bound assemblies — the offer leg refuses an order under an assembly the seller has not bound", () => {
    // A structurally different assembly (its own clause selection), so its
    // assembly hash differs from the one the orders instantiate.
    const elsewhere = hydrateAuthored({
        agreements: [{ id: "agreement-0", clauses: { [keyOf("figaro-topology")]: { follows: [] } } }],
    });
    const offeredHash = assemblyHashOf(assembly.assembly);
    const CTX = { chainId: CHAIN, core: CORE, chainNow: CHAIN_NOW };
    // The handler reads only the chain id and the chain's clock from its
    // public client here: the bond approval is switched off, so nothing else
    // touches the chain.
    const pub = { getChainId: async () => CHAIN, getBlock: async () => ({ timestamp: CHAIN_NOW }) } as unknown as PublicClient;
    const addresses = { core: CORE } as Parameters<typeof makeSellerOfferHandler>[2];

    it("validateOffer passes an offer under a bound assembly and refuses one under an assembly the seller has not bound, by slug and full hash", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        expect((await validateOffer(offer, SELLER.address, undefined, undefined, null, BOUND)).ok).toBe(true);
        const refused = await validateOffer(offer, SELLER.address, undefined, undefined, null, profileBinding(elsewhere));
        expect(refused.ok).toBe(false);
        expect(refused.reason).toContain(deriveAssemblySlug(offeredHash));
        expect(refused.reason).toContain(offeredHash);
    });

    it("counterSignOffer signs under a bound assembly and THROWS under one it has not bound, before any signature", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        expect((await counterSignOffer(sellerW, offer, CTX, SPECS, () => true, policy, assembly, BOUND))?.sellerSig).toBeDefined();
        await expect(counterSignOffer(sellerW, offer, CTX, SPECS, () => true, policy, assembly, profileBinding(elsewhere)))
            .rejects.toThrow(new RegExp(`has not bound assembly ${deriveAssemblySlug(offeredHash)} \\(${offeredHash}\\)`));
    });

    it("counterSignOffer refuses an offer whose agreement carries no provenance leaf", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const { provenance: _dropped, ...bare } = offer.agreement;
        const unprovenanced: CommitmentPayload = {
            ...offer, agreement: bare, commitment: { ...offer.commitment, checkoutHash: computeCheckoutHash(bare) },
        };
        await expect(counterSignOffer(sellerW, unprovenanced, CTX, SPECS, () => true, policy, assembly, BOUND))
            .rejects.toThrow(/names no assembly/);
    });

    it("counterSignOffer refuses when the seller's profile cannot be read, or no reader is given", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        await expect(counterSignOffer(sellerW, offer, CTX, SPECS, () => true, policy, assembly, async () => null))
            .rejects.toThrow(/could not be read/);
        await expect(counterSignOffer(sellerW, offer, CTX, SPECS, () => true, policy, assembly))
            .rejects.toThrow(/no member-profile reader/);
    });

    it("makeSellerOfferHandler reads the seller's own profile through readProfile — without it every offer is refused", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const reads: string[] = [];
        const handler = makeSellerOfferHandler(sellerW, pub, addresses, {
            accept: () => true, policy, approveBond: false, specs: SPECS, readDesign: async () => assembly,
            readProfile: async (member) => { reads.push(member); return BOUND(member); },
        });
        expect((await handler(offer))?.sellerSig).toBeDefined();
        expect(reads).toEqual([SELLER.address]);
        const bare = makeSellerOfferHandler(sellerW, pub, addresses, { accept: () => true, policy, approveBond: false, specs: SPECS, readDesign: async () => assembly });
        await expect(bare(offer)).rejects.toThrow(/no member-profile reader/);
        const specless = makeSellerOfferHandler(sellerW, pub, addresses, { accept: () => true, policy, approveBond: false, readProfile: BOUND });
        await expect(specless(offer)).rejects.toThrow(/refusing to sign without the clause specs/);
        const notBinding = makeSellerOfferHandler(sellerW, pub, addresses, {
            accept: () => true, policy, approveBond: false, specs: SPECS, readDesign: async () => assembly, readProfile: profileBinding(elsewhere),
        });
        await expect(notBinding(offer)).rejects.toThrow(/has not bound assembly/);
    });
});

describe("checkPayloadTerms — the one term check the offer leg and the race draft leg share", () => {
    it("passes a clean payload and names the payload's noun in the refusal of a different seller", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        expect((await checkPayloadTerms(offer, SELLER.address, "offer", undefined, undefined, null, BOUND)).ok).toBe(true);
        const other = await checkPayloadTerms(offer, BUYER.address, "offer", undefined, undefined, null, BOUND);
        expect(other).toEqual({ ok: false, reason: "offer names a different seller" });
        const draftSide = await checkPayloadTerms(offer, BUYER.address, "draft", undefined, undefined, null, BOUND);
        expect(draftSide).toEqual({ ok: false, reason: "draft names a different seller" });
    });

    it("refuses an agreement that does not hash to the committed checkoutHash, and a seller whose profile does not bind", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const tampered = { ...offer, agreement: { ...offer.agreement, buyer: SELLER.address } };
        expect((await checkPayloadTerms(tampered, SELLER.address, "offer", undefined, undefined, null, BOUND)).ok).toBe(false);
        expect((await checkPayloadTerms(offer, SELLER.address, "offer", undefined, undefined, null, undefined)).ok).toBe(false);
    });

    it("applies the operator's economic floor when a policy is given", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const tight: OfferPolicy = { requireRootShape: true, currencyAllowlist: [CURRENCY], maxValue: 1n };
        expect((await checkPayloadTerms(offer, SELLER.address, "offer", tight, undefined, null, BOUND)).ok).toBe(false);
        expect((await checkPayloadTerms(offer, SELLER.address, "offer", policy, undefined, null, BOUND)).ok).toBe(true);
    });
});

describe("signCommitmentAs — the one signature over a commitment the seller legs share", () => {
    it("signs the commitment under the wallet's account, and refuses a wallet with no account", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const ctx = { chainId: CHAIN, core: CORE, chainNow: CHAIN_NOW };
        const sig = await signCommitmentAs(sellerW, ctx, offer.commitment, "test");
        const direct = await sellerW.signTypedData({
            account: SELLER, domain: buildDomain(CHAIN, CORE), types: COMMITMENT_TYPES, primaryType: "Commitment", message: offer.commitment,
        });
        expect(sig).toBe(direct);
        const noAccount = createWalletClient({ transport: http("http://localhost:0") });
        await expect(signCommitmentAs(noAccount, ctx, offer.commitment, "test")).rejects.toThrow(/test: wallet has no account/);
    });
});

describe("countersignUnderFloors — the two opt-in floors, then the seller's signature, shared by the seller legs", () => {
    it("declines with no policy, outside the policy, with no accept, or when accept says no; signs only when all three agree", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const ctx = { chainId: CHAIN, core: CORE, chainNow: CHAIN_NOW };
        const yes = () => true;
        const go = (pol: OfferPolicy | undefined, accept: ((p: CommitmentPayload) => boolean) | undefined) =>
            countersignUnderFloors(sellerW, offer, ctx, pol, accept, "test");
        expect(await go(undefined, yes)).toBeNull();
        expect(await go({ requireRootShape: true, currencyAllowlist: [CURRENCY], maxValue: 1n }, yes)).toBeNull();
        expect(await go(policy, undefined)).toBeNull();
        expect(await go(policy, () => false)).toBeNull();
        const signed = await go(policy, yes);
        expect(signed?.sellerSig).toBe(await signCommitmentAs(sellerW, ctx, offer.commitment, "test"));
        expect(signed?.commitment).toEqual(offer.commitment);
    });
});

describe("checkSellerSignature — recovery of a seller signature to the named seller", () => {
    it("passes the seller's own signature and refuses another wallet's", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const ctx = { chainId: CHAIN, core: CORE, chainNow: CHAIN_NOW };
        const sig = await signCommitmentAs(sellerW, ctx, offer.commitment, "test");
        expect(await checkSellerSignature(offer.commitment, sig, SELLER.address, ctx)).toEqual({ ok: true });
        const wrong = await checkSellerSignature(offer.commitment, sig, BUYER.address, ctx);
        expect(wrong).toEqual({ ok: false, reason: "seller signature does not recover to the drafted candidate" });
    });
});

describe("gateSeller — the head the seller legs share: the wallet's account, then the term check, or a throw", () => {
    it("returns the wallet's address when the check passes, names the caller and the thing refused when it fails, and refuses a wallet with no account", async () => {
        expect(await gateSeller(sellerW, "who", "the thing", async () => ({ ok: true }))).toBe(SELLER.address);
        await expect(gateSeller(sellerW, "who", "the thing", async () => ({ ok: false, reason: "why" })))
            .rejects.toThrow("who: refusing the thing — why");
        const noAccount = createWalletClient({ transport: http("http://localhost:0") });
        await expect(gateSeller(noAccount, "who", "the thing", async () => ({ ok: true }))).rejects.toThrow("who: wallet has no account");
    });
});

describe("the seller's deadline cap — the latest deadline it will counter-sign, one field of its offer policy", () => {
    // The offers above carry deadline 1_900_000_000n.
    const DEADLINE = 1_900_000_000n;
    const addresses = { core: CORE } as Parameters<typeof makeSellerOfferHandler>[2];
    const pubAt = (timestamp: bigint) => ({
        getChainId: async () => CHAIN,
        getBlock: async () => ({ timestamp }),
    }) as unknown as PublicClient;

    it("checkDeadlineCap passes a deadline at most maxDeadlineSeconds past the chain's now, and refuses one past it", () => {
        const c = { deadline: DEADLINE } as Parameters<typeof checkDeadlineCap>[0];
        const capped: OfferPolicy = { ...policy, maxDeadlineSeconds: 600n };
        expect(checkDeadlineCap(c, capped, DEADLINE - 600n)).toEqual({ ok: true });
        const over = checkDeadlineCap(c, capped, DEADLINE - 601n);
        expect(over.ok).toBe(false);
        expect(over.reason).toMatch(/deadline .* exceeds the policy's 600-second cap/);
    });

    it("an omitted cap applies DEFAULT_MAX_DEADLINE_SECONDS, which clears the buyer's default one-hour deadline", () => {
        const c = { deadline: DEADLINE } as Parameters<typeof checkDeadlineCap>[0];
        expect(DEFAULT_MAX_DEADLINE_SECONDS).toBeGreaterThanOrEqual(3600n);
        expect(checkDeadlineCap(c, policy, DEADLINE - DEFAULT_MAX_DEADLINE_SECONDS).ok).toBe(true);
        expect(checkDeadlineCap(c, policy, DEADLINE - DEFAULT_MAX_DEADLINE_SECONDS - 1n).ok).toBe(false);
    });

    it("refuses when no chain time is given: the deadline has nothing to be bounded against", () => {
        const c = { deadline: DEADLINE } as Parameters<typeof checkDeadlineCap>[0];
        expect(checkDeadlineCap(c, policy, undefined).reason).toMatch(/no chain time/);
    });

    it("counterSignOffer declines (null) a deadline past the cap, signs one within it, and declines with no chainNow", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const capped: OfferPolicy = { ...policy, maxDeadlineSeconds: 600n };
        const at = (chainNow?: bigint) => counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE, chainNow }, SPECS, () => true, capped, assembly, BOUND);
        expect(await at(DEADLINE - 601n)).toBeNull();
        expect((await at(DEADLINE - 600n))?.sellerSig).toBeDefined();
        expect(await at(undefined)).toBeNull();
    });

    it("makeSellerOfferHandler bounds the deadline by the chain's own clock, read at each offer", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const opts = { accept: () => true, policy: { ...policy, maxDeadlineSeconds: 600n }, approveBond: false, specs: SPECS, readDesign: async () => assembly, readProfile: BOUND };
        expect(await makeSellerOfferHandler(sellerW, pubAt(DEADLINE - 601n), addresses, opts)(offer)).toBeNull();
        expect((await makeSellerOfferHandler(sellerW, pubAt(DEADLINE - 600n), addresses, opts)(offer))?.sellerSig).toBeDefined();
    });
});
