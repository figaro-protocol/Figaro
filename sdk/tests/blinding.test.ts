/**
 * The blinding value of a private set — drawn fresh by the code that collects
 * a party's data, never by a builder or a hash function, so that a private
 * value with few possibilities cannot be confirmed by hashing guesses against
 * its fingerprint (a clause's data hash and the `checkoutHash` over it, or a
 * witness's `contentRef`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
    anchorAgreement,
    buildOrderAgreement,
    freshBlindingHex,
    hashClauseData,
    withClauseBlinding,
    withFreshBlinding,
    type Agreement,
} from "../src/index.js";
import { prepareAttestationContent } from "../src/agent/autonomous.js";
import { buildBuyerOffer, buildChainOffers } from "../src/agent/originate.js";
import { buildCounterDraft, buildQuoteRequest } from "../src/agent/dispatchRace.js";
import { decodeContentFromSpec } from "../src/clauses/index.js";
import type { Address, Hex } from "../src/types.js";
import { keyOf, specSourceFromFixtures, specSourceWithRegistrations, viewOf } from "./specFixtures.js";
import { hydrateAuthored } from "./hydrate.js";

const BUYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"); // anvil[0]
const SELLER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"); // anvil[1]
const CURRENCY = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
const CORE = "0x000000000000000000000000000000000000c0de" as Address;
const CHAIN = 31337;
const buyerW = createWalletClient({ account: BUYER, transport: http("http://localhost:0") });

const BLINDING = { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true };

/** A clause no one has seen: a private committed set with one value of few
 *  possibilities, a private witness stage, and a public witness stage. */
const PRIVATE_RAW = {
    clauseId: "test-private-term",
    version: 1,
    title: "Private term",
    description: "A private committed value, a private stage and a public stage.",
    fields: [{ name: "grade", type: "enum", values: ["a", "b", "c"], required: true, disposition: "private" }, BLINDING],
    stages: {
        "1": [{ name: "reading", type: "integer", required: true, disposition: "private" }, BLINDING],
        "2": [{ name: "note", type: "string", required: true }],
    },
};
const PRIVATE = viewOf(PRIVATE_RAW);
const PRIVATE_KEY = PRIVATE.clauseKey;
const SPECS = specSourceWithRegistrations(specSourceFromFixtures(["figaro-commerce", "figaro-merchant-process"]), [PRIVATE]);
const COMMERCE = keyOf("figaro-commerce");
const LINE = { lineItems: [{ itemId: "x", name: "Item", quantity: 1, unitPrice: "1000" }] };

const isBlindingValue = (v: unknown): boolean => typeof v === "string" && /^0x[0-9a-f]{64}$/.test(v);

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("freshBlindingHex and withFreshBlinding — the fill of one set", () => {
    it("draws 32 bytes as hex, fresh on every call", () => {
        const a = freshBlindingHex();
        const b = freshBlindingHex();
        expect(isBlindingValue(a)).toBe(true);
        expect(a).not.toBe(b);
    });

    it("fills the blinding field of a private set where it is absent", () => {
        const filled = withFreshBlinding(PRIVATE.fields, { grade: "b" });
        expect(filled.grade).toBe("b");
        expect(isBlindingValue(filled.blinding)).toBe(true);
    });

    it("never overwrites a value already present", () => {
        const held = `0x${"12".repeat(32)}`;
        const values = { grade: "b", blinding: held };
        expect(withFreshBlinding(PRIVATE.fields, values)).toBe(values);
    });

    it("adds nothing to a public set", () => {
        const values = { note: "x" };
        expect(withFreshBlinding(PRIVATE.stages![2], values)).toBe(values);
    });

    it("throws without Web Crypto, and never returns a guessable value", () => {
        vi.stubGlobal("crypto", undefined);
        expect(() => withFreshBlinding(PRIVATE.fields, { grade: "b" })).toThrow(/Web Crypto/);
    });
});

describe("withClauseBlinding — the committed set of one clause", () => {
    it("a public clause gains no field", () => {
        const data = { ...LINE };
        expect(withClauseBlinding(SPECS, COMMERCE, data)).toBe(data);
    });

    it("a process-log clause stays an empty anchor", () => {
        const empty = {};
        expect(withClauseBlinding(SPECS, keyOf("figaro-merchant-process"), empty)).toBe(empty);
    });

    it("a clause whose spec is not loaded is left as it is", () => {
        const data = { grade: "b" };
        expect(withClauseBlinding(SPECS, `0x${"ee".repeat(32)}`, data)).toBe(data);
    });

    it("two commitments of one private value have different data hashes and different checkoutHashes", () => {
        const one = buildOrderAgreement(BUYER.address, SELLER.address, { [PRIVATE_KEY]: withClauseBlinding(SPECS, PRIVATE_KEY, { grade: "b" }) }, SPECS);
        const two = buildOrderAgreement(BUYER.address, SELLER.address, { [PRIVATE_KEY]: withClauseBlinding(SPECS, PRIVATE_KEY, { grade: "b" }) }, SPECS);
        expect(hashClauseData(one.agreement.clauses[0])).not.toBe(hashClauseData(two.agreement.clauses[0]));
        expect(one.checkoutHash).not.toBe(two.checkoutHash);
    });

    it("the builder stays deterministic: the same data, blinding value included, builds the same checkoutHash", () => {
        const data = withClauseBlinding(SPECS, PRIVATE_KEY, { grade: "b" });
        const one = buildOrderAgreement(BUYER.address, SELLER.address, { [PRIVATE_KEY]: data }, SPECS);
        const two = buildOrderAgreement(BUYER.address, SELLER.address, { [PRIVATE_KEY]: data }, SPECS);
        expect(one.checkoutHash).toBe(two.checkoutHash);
    });

    it("a holder of the data, blinding value included, reproduces the fingerprint; a guess of the value alone does not", () => {
        const { agreement, checkoutHash } = buildOrderAgreement(
            BUYER.address, SELLER.address, { [PRIVATE_KEY]: withClauseBlinding(SPECS, PRIVATE_KEY, { grade: "b" }) }, SPECS,
        );
        const held = JSON.parse(JSON.stringify(agreement)) as Agreement;
        expect(anchorAgreement(held, checkoutHash)).not.toBeNull();
        // Every guess of the value without the blinding value misses.
        for (const grade of ["a", "b", "c"]) {
            const guess = buildOrderAgreement(BUYER.address, SELLER.address, { [PRIVATE_KEY]: { grade } }, SPECS);
            expect(anchorAgreement(JSON.parse(JSON.stringify(guess.agreement)), checkoutHash)).toBeNull();
        }
    });
});

describe("the agent paths draw the blinding value where they collect the buyer's data", () => {
    const assembly = hydrateAuthored({
        agreements: [{ id: "agreement-0", clauses: { [COMMERCE]: {}, [PRIVATE_KEY]: {} }, follows: [] }],
    });
    const overrides = { [COMMERCE]: LINE, [PRIVATE_KEY]: { grade: "c" } };
    const offerParams = () => ({
        assembly, seller: SELLER.address, currency: CURRENCY, payment: 1000n, chainId: CHAIN, core: CORE,
        deadline: 1_900_000_000n, overrides, specs: SPECS,
    });
    const clauseOf = (agreement: Agreement, key: Hex) =>
        agreement.clauses.find((c) => c.clause.toLowerCase() === key.toLowerCase())!;

    it("buildBuyerOffer: two offers of one private value differ, each passes the sign gate, and the public clause carries none", async () => {
        const one = await buildBuyerOffer(buyerW, offerParams());
        const two = await buildBuyerOffer(buyerW, offerParams());
        expect(isBlindingValue(clauseOf(one.agreement, PRIVATE_KEY).data?.blinding)).toBe(true);
        expect(clauseOf(one.agreement, PRIVATE_KEY).data?.blinding).not.toBe(clauseOf(two.agreement, PRIVATE_KEY).data?.blinding);
        expect(one.commitment.checkoutHash).not.toBe(two.commitment.checkoutHash);
        expect(clauseOf(one.agreement, COMMERCE).data).toEqual(LINE);
    });

    it("buildBuyerOffer keeps a blinding value the buyer supplies", async () => {
        const held = `0x${"34".repeat(32)}`;
        const offer = await buildBuyerOffer(buyerW, { ...offerParams(), overrides: { ...overrides, [PRIVATE_KEY]: { grade: "c", blinding: held } } });
        expect(clauseOf(offer.agreement, PRIVATE_KEY).data?.blinding).toBe(held);
    });

    it("buildQuoteRequest draws it once, and the counter-draft keeps the draft's value, so the buyer reproduces the quoted checkoutHash", () => {
        const request = () => buildQuoteRequest({
            assembly, buyer: BUYER.address, seller: SELLER.address, currency: CURRENCY, ceiling: 1000n,
            chainId: CHAIN, core: CORE, pricedFields: [], deadline: 1_900_000_000n, overrides, specs: SPECS,
        });
        const one = request();
        const two = request();
        expect(isBlindingValue(clauseOf(one.agreement, PRIVATE_KEY).data?.blinding)).toBe(true);
        expect(one.commitment.checkoutHash).not.toBe(two.commitment.checkoutHash);
        const quoted = buildCounterDraft(one, one.quoteRequest!, 700n);
        expect(clauseOf(quoted.agreement, PRIVATE_KEY).data?.blinding).toBe(clauseOf(one.agreement, PRIVATE_KEY).data?.blinding);
        expect(buildCounterDraft(one, one.quoteRequest!, 700n).commitment.checkoutHash).toBe(quoted.commitment.checkoutHash);
    });

    it("buildChainOffers draws it for each order's private clause, and each order passes the sign gate", async () => {
        const chain = hydrateAuthored({
            agreements: [
                { id: "agreement-0", clauses: { [COMMERCE]: {} }, follows: [] },
                { id: "agreement-1", clauses: { [PRIVATE_KEY]: {} }, follows: ["agreement-0"] },
            ],
        });
        const offers = await buildChainOffers(buyerW, {
            assembly: chain, currency: CURRENCY, chainId: CHAIN, core: CORE, deadline: 1_900_000_000n, specs: SPECS,
            nodes: [
                { nodeId: "agreement-0", seller: SELLER.address, payment: 1000n, overrides: { [COMMERCE]: LINE } },
                { nodeId: "agreement-1", seller: SELLER.address, payment: 500n, overrides: { [PRIVATE_KEY]: { grade: "a" } } },
            ],
        });
        const sub = offers.find((o) => o.nodeId === "agreement-1")!;
        expect(isBlindingValue(clauseOf(sub.offer.agreement, PRIVATE_KEY).data?.blinding)).toBe(true);
        const root = offers.find((o) => o.nodeId === "agreement-0")!;
        expect(clauseOf(root.offer.agreement, COMMERCE).data).toEqual(LINE);
    });
});

describe("prepareAttestationContent draws the blinding value of a private stage", () => {
    it("two preparations on a private stage give different content references, each decoding to its blinding value", () => {
        const one = prepareAttestationContent(PRIVATE, { reading: 7 }, { stage: 1 });
        const two = prepareAttestationContent(PRIVATE, { reading: 7 }, { stage: 1 });
        expect(one.contentRef).not.toBe(two.contentRef);
        expect(isBlindingValue(one.values.blinding)).toBe(true);
        expect(decodeContentFromSpec(PRIVATE, one.content, { stage: 1 })).toEqual(one.values);
    });

    it("two preparations on a public stage give the same content reference", () => {
        const one = prepareAttestationContent(PRIVATE, { note: "x" }, { stage: 2 });
        const two = prepareAttestationContent(PRIVATE, { note: "x" }, { stage: 2 });
        expect(one.contentRef).toBe(two.contentRef);
        expect(one.values).toEqual({ note: "x" });
    });
});
