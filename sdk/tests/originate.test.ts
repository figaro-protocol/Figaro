import { describe, it, expect } from "vitest";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
    instantiateRootAgreement,
    buildBuyerOffer,
    validateOffer,
    counterSignOffer,
    offerToExecutionInputs,
    type OfferPolicy,
} from "../src/agent/originate.js";
import { InProcessChannel } from "../src/agent/coordination.js";
import { computeAgreementHash } from "../src/agreement.js";
import { assemblyCompositionHash } from "../src/assembly.js";
import type { Address } from "../src/types.js";
import { keyOf, specSourceFromFixtures } from "./specFixtures.js";
import { hydrateAuthored, profileBinding } from "./hydrate.js";
import type { PublicClient } from "viem";
import { makeSellerOfferHandler } from "../src/agent/originate.js";
import { deriveAssemblySlug } from "../src/assembly.js";
import type { CommitmentPayload } from "../src/agent/coordination.js";

const SPECS = specSourceFromFixtures(["figaro-commerce", "figaro-topology"]);

const BUYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"); // anvil[0]
const SELLER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"); // anvil[1]
const CURRENCY = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
const CORE = "0x000000000000000000000000000000000000c0de" as Address;
const CHAIN = 31337;

// signTypedData on a local account is offline — no RPC call — so a dummy transport is fine.
const buyerW = createWalletClient({ account: BUYER, transport: http("http://localhost:0") });
const sellerW = createWalletClient({ account: SELLER, transport: http("http://localhost:0") });

const assembly = hydrateAuthored({
    agreements: [{ id: "order-0", clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: { parentOrderHashes: [] } } }],
});
const overrides = { [keyOf("figaro-commerce")]: { currency: CURRENCY, payment: "1000", lineItems: [{ itemId: "x", name: "Item", quantity: 1, unitPrice: "1000" }] } };

function offerParams() {
    return { assembly: assembly, seller: SELLER.address, currency: CURRENCY, payment: 1000n, chainId: CHAIN, core: CORE, deadline: 1_900_000_000n, overrides };
}

// The seller's own profile, read at acceptance time, binds the assembly the
// offers instantiate.
const BOUND = profileBinding(assembly);

// A conforming operator policy for the root offer above (payment 1000, CURRENCY).
const policy: OfferPolicy = { requireRootShape: true, currencyAllowlist: [CURRENCY], maxValue: 10_000n };

describe("instantiateRootAgreement", () => {
    it("merges overrides onto the assembly's root clause bag", () => {
        const a = instantiateRootAgreement(assembly, { buyer: BUYER.address, seller: SELLER.address, overrides });
        const commerce = a.sections.find((s) => s.clause === keyOf("figaro-commerce"));
        expect(commerce?.data.payment).toBe("1000");
        expect(commerce?.data.currency).toBe(CURRENCY);
        expect(a.buyer).toBe(BUYER.address);
        expect(a.seller).toBe(SELLER.address);
    });

    it("picks the root agreement (no non-empty parentOrderHashes) from a multi-agreement assembly", () => {
        const multi = hydrateAuthored({
            agreements: [
                { id: "order-1", clauses: { [keyOf("figaro-topology")]: { parentOrderHashes: ["0xabc"] } } },
                { id: "order-0", clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: { parentOrderHashes: [] } } },
            ],
        });
        const a = instantiateRootAgreement(multi, { buyer: BUYER.address, seller: SELLER.address });
        expect(a.sections.some((s) => s.clause === keyOf("figaro-commerce"))).toBe(true);
    });

});

describe("origination handshake (real signatures, no chain)", () => {
    it("buyer builds a valid, self-consistent signed offer", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        expect(offer.buyerSig).toBeDefined();
        expect(offer.commitment.buyer.toLowerCase()).toBe(BUYER.address.toLowerCase());
        expect(offer.commitment.agreementHash).toBe(computeAgreementHash(offer.agreement));
        expect((await validateOffer(offer, SELLER.address, undefined, undefined, null, BOUND)).ok).toBe(true);
    });

    it("seller counter-signs a clean offer WHEN accept AND policy pass; yields both execution inputs", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const signed = await counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE }, () => true, policy, undefined, null, BOUND);
        expect(signed).not.toBeNull();
        const inputs = offerToExecutionInputs(signed!);
        expect(inputs.buyerSig).toBeDefined();
        expect(inputs.sellerSig).toBeDefined();
        expect(inputs.commitment).toBe(offer.commitment);
    });

    it("REFUSE-ALL FLOOR: a clean offer with NO accept rule is declined (null), not signed", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const signed = await counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE }, undefined, policy, undefined, null, BOUND);
        expect(signed).toBeNull();
    });

    it("ECONOMIC FLOOR safe default: a clean offer with NO policy is declined (null), even when accept says yes", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const signed = await counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE }, () => true, undefined, undefined, null, BOUND);
        expect(signed).toBeNull();
    });

    it("ECONOMIC FLOOR: an offer whose currency is outside the policy declines (null), not a throw", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const otherOnly: OfferPolicy = { ...policy, currencyAllowlist: ["0xdddddddddddddddddddddddddddddddddddddddd" as Address] };
        const signed = await counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE }, () => true, otherOnly, undefined, null, BOUND);
        expect(signed).toBeNull();
    });

    it("accept decline returns null (not a throw) on a clean offer", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const signed = await counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE }, () => false, policy, undefined, null, BOUND);
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
        // Tamper: change the agreement so it no longer hashes to the committed agreementHash.
        offer.agreement.sections.find((s) => s.clause === keyOf("figaro-commerce"))!.data.payment = "1";
        expect((await validateOffer(offer, SELLER.address, undefined, undefined, null, BOUND)).ok).toBe(false);
        await expect(counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE }, undefined, undefined, undefined, null, BOUND)).rejects.toThrow(/agreement does not hash/i);
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
        await expect(counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE }, undefined, undefined, undefined, null, BOUND)).rejects.toThrow(/does not recover/i);
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
        const offer = await buildBuyerOffer(buyerW, mismatched);
        // The signed STRUCT still names the allowlisted currency.
        expect(offer.commitment.currency).toBe(CURRENCY);

        // With no specs, the leaf/struct check does not run — structurally
        // clean (the leaf mismatch is invisible without a SpecSource).
        expect((await validateOffer(offer, SELLER.address, undefined, undefined, null, BOUND)).ok).toBe(true);

        // With specs, it's caught and refused — before any signature.
        expect((await validateOffer(offer, SELLER.address, undefined, SPECS, null, BOUND)).ok).toBe(false);
        await expect(
            counterSignOffer(sellerW, offer, { chainId: CHAIN, core: CORE }, () => true, policy, SPECS, null, BOUND),
        ).rejects.toThrow(/denomination/i);
    });

    it("buildBuyerOffer with specs refuses to sign the same contradiction BUYER-side", async () => {
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
        const offer = await buildBuyerOffer(buyerW, mismatched);
        // Invisible without a SpecSource, refused with one.
        expect((await validateOffer(offer, SELLER.address, undefined, undefined, null, BOUND)).ok).toBe(true);
        expect((await validateOffer(offer, SELLER.address, undefined, SPECS, null, BOUND)).reason).toMatch(/commitment payment 1000 contradicts/i);
    });
});

describe("InProcessChannel", () => {
    it("routes an offer to the registered seller handler; unregistered → null", async () => {
        const channel = new InProcessChannel();
        channel.register(SELLER.address, (o) => counterSignOffer(sellerW, o, { chainId: CHAIN, core: CORE }, () => true, policy, undefined, null, BOUND));
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
        agreements: [{ id: "order-0", clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: { parentOrderHashes: [] } } }],
    });

    it("instantiateRootAgreement folds assemblyClauses into the root agreement", () => {
        const a = instantiateRootAgreement(pinned, { buyer: BUYER.address, seller: SELLER.address, overrides });
        const ids = a.sections.map((s) => s.clause);
        expect(ids).toEqual(expect.arrayContaining([
            keyOf("figaro-utility-token"), keyOf("figaro-commerce"), keyOf("figaro-topology"),
        ]));
        expect(a.sections.find((s) => s.clause === keyOf("figaro-utility-token"))?.data.currency).toBe(PIN);
    });

    it("the instantiated agreement carries the assembly's own composition hash as agreement.provenance", () => {
        const a = instantiateRootAgreement(pinned, { buyer: BUYER.address, seller: SELLER.address, overrides });
        expect(a.provenance).toEqual({
            agreementKey: pinned.assembly.agreements[0].agreementKey,
            compositionHash: assemblyCompositionHash(pinned.assembly),
        });
        // The provenance leaf is the format's, not a clause: no clause carries it.
        expect(a.sections.some((s) => "compositionHash" in (s.data ?? {}))).toBe(false);
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
        expect(offer.agreement.provenance?.compositionHash).toBe(assemblyCompositionHash(pinned.assembly));
        expect(offer.commitment.agreementHash).toBe(computeAgreementHash(offer.agreement));
    });
});

describe("the designer's values — never changed by a buyer or a seller", () => {
    // The ruling: a design fill (`block.design.fills`) the designer set is the
    // designer's value; the sign gate refuses an agreement whose clause
    // carries another, wherever the override came from.
    const DESIGN_SPECS = specSourceFromFixtures(["figaro-commerce", "figaro-topology", "figaro-consent", "figaro-applicable-law"]);
    const DOCS = [{ documentHash: `0x${"d0".repeat(32)}`, documentVersion: "1.0.0", documentTitle: "Terms of Service" }];
    const FORGED = [{ documentHash: `0x${"ee".repeat(32)}`, documentVersion: "1.0.0", documentTitle: "Terms of Service" }];
    const designed = hydrateAuthored({
        assemblyClauses: { [keyOf("figaro-applicable-law")]: { applicableLaw: "England-Wales" } },
        agreements: [{
            id: "order-0",
            clauses: {
                [keyOf("figaro-commerce")]: {},
                [keyOf("figaro-topology")]: { parentOrderHashes: [] },
                [keyOf("figaro-consent")]: { documents: DOCS },
            },
        }],
    });
    const params = (extra: Record<string, Record<string, unknown>>) => ({
        assembly: designed, seller: SELLER.address, currency: CURRENCY, payment: 1000n,
        chainId: CHAIN, core: CORE, deadline: 1_900_000_000n, specs: DESIGN_SPECS,
        overrides: { ...overrides, ...extra },
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
        await expect(buildBuyerOffer(buyerW, params({ [keyOf("figaro-applicable-law")]: { applicableLaw: "US-NY" } })))
            .rejects.toThrow(/figaro-applicable-law applicableLaw: .*designer/);
    });

    it("the seller refuses an offer whose designer value a buyer changed, and one whose design it cannot read", async () => {
        // A buyer that skips its own gate (no specs) still reaches the seller's.
        const forged = await buildBuyerOffer(buyerW, { ...params({ [keyOf("figaro-consent")]: { documents: FORGED } }), specs: undefined });
        expect((await validateOffer(forged, SELLER.address, undefined, DESIGN_SPECS, designed, profileBinding(designed))).reason).toMatch(/figaro-consent documents: .*designer/);
        const clean = await buildBuyerOffer(buyerW, params({}));
        expect((await validateOffer(clean, SELLER.address, undefined, DESIGN_SPECS, designed, profileBinding(designed))).ok).toBe(true);
        expect((await validateOffer(clean, SELLER.address, undefined, DESIGN_SPECS, null, profileBinding(designed))).reason).toMatch(/was not read/);
        await expect(counterSignOffer(sellerW, forged, { chainId: CHAIN, core: CORE }, () => true, policy, DESIGN_SPECS, designed, profileBinding(designed)))
            .rejects.toThrow(/designer/);
    });

    it("lets a party fill a design field the designer left unset", async () => {
        const offer = await buildBuyerOffer(buyerW, params({
            [keyOf("figaro-applicable-law")]: { applicableLaw: "England-Wales", forum: "London" },
        }));
        expect(offer.buyerSig).toBeDefined();
    });
});

describe("the seller's bound assemblies — the offer leg refuses an order under an assembly the seller has not bound", () => {
    // A structurally different assembly (its own clause selection), so its
    // composition hash differs from the one the orders instantiate.
    const elsewhere = hydrateAuthored({
        agreements: [{ id: "order-0", clauses: { [keyOf("figaro-topology")]: { parentOrderHashes: [] } } }],
    });
    const offeredHash = assemblyCompositionHash(assembly.assembly);
    const CTX = { chainId: CHAIN, core: CORE };
    // The handler reads only the chain id from its public client here: the
    // bond approval is switched off, so nothing else touches the chain.
    const pub = { getChainId: async () => CHAIN } as unknown as PublicClient;
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
        expect((await counterSignOffer(sellerW, offer, CTX, () => true, policy, undefined, null, BOUND))?.sellerSig).toBeDefined();
        await expect(counterSignOffer(sellerW, offer, CTX, () => true, policy, undefined, null, profileBinding(elsewhere)))
            .rejects.toThrow(new RegExp(`has not bound assembly ${deriveAssemblySlug(offeredHash)} \\(${offeredHash}\\)`));
    });

    it("counterSignOffer refuses an offer whose agreement carries no provenance leaf", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const { provenance: _dropped, ...bare } = offer.agreement;
        const unprovenanced: CommitmentPayload = {
            ...offer, agreement: bare, commitment: { ...offer.commitment, agreementHash: computeAgreementHash(bare) },
        };
        await expect(counterSignOffer(sellerW, unprovenanced, CTX, () => true, policy, undefined, null, BOUND))
            .rejects.toThrow(/names no assembly/);
    });

    it("counterSignOffer refuses when the seller's profile cannot be read, or no reader is given", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        await expect(counterSignOffer(sellerW, offer, CTX, () => true, policy, undefined, null, async () => null))
            .rejects.toThrow(/could not be read/);
        await expect(counterSignOffer(sellerW, offer, CTX, () => true, policy))
            .rejects.toThrow(/no member-profile reader/);
    });

    it("makeSellerOfferHandler reads the seller's own profile through readProfile — without it every offer is refused", async () => {
        const offer = await buildBuyerOffer(buyerW, offerParams());
        const reads: string[] = [];
        const handler = makeSellerOfferHandler(sellerW, pub, addresses, {
            accept: () => true, policy, approveBond: false,
            readProfile: async (member) => { reads.push(member); return BOUND(member); },
        });
        expect((await handler(offer))?.sellerSig).toBeDefined();
        expect(reads).toEqual([SELLER.address]);
        const bare = makeSellerOfferHandler(sellerW, pub, addresses, { accept: () => true, policy, approveBond: false });
        await expect(bare(offer)).rejects.toThrow(/no member-profile reader/);
        const notBinding = makeSellerOfferHandler(sellerW, pub, addresses, {
            accept: () => true, policy, approveBond: false, readProfile: profileBinding(elsewhere),
        });
        await expect(notBinding(offer)).rejects.toThrow(/has not bound assembly/);
    });
});
