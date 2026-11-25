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
    buildProcessDesign,
    buildCommitment,
    buildDomain,
    buildOrderAgreement,
    composeOrderAgreement,
    computeCheckoutHash,
    freshBlindingHex,
    hashClauseData,
    withClauseBlinding,
    withFreshBlinding,
    validateCommitmentAgreement,
    ZERO_PROCESS_ID,
    type Agreement,
} from "../src/index.js";
import { prepareAttestationContent } from "../src/agent/autonomous.js";
import { buildBuyerOffer, buildChainOffers, instantiateRootAgreement, withAgreementBlinding } from "../src/agent/originate.js";
import { buildCounterDraft, buildQuoteRequest, validateDraft } from "../src/agent/dispatchRace.js";
import { decodeContentFromSpec, fieldSetRuleErrors } from "../src/clauses/index.js";
import type { Address, Hex } from "../src/types.js";
import { keyOf, specSourceFromFixtures, specSourceWithRegistrations, viewOf } from "./specFixtures.js";
import { hydrateAuthored, profileBinding } from "./hydrate.js";

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
/** The line's unit price, named as a priced field: a quote request names
 *  every priced line its clauses mark (`buildQuoteRequest`). */
const PRICED_LINE = [{ clause: COMMERCE, path: "lineItems.0.unitPrice" }];

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
            chainId: CHAIN, core: CORE, pricedFields: PRICED_LINE, deadline: 1_900_000_000n, overrides, specs: SPECS,
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

    it("refuses a zero blinding value and the committed set's own blinding value", () => {
        const committedBlinding = `0x${"7e".repeat(32)}`;
        const committed = { grade: "b", blinding: committedBlinding };
        expect(() => prepareAttestationContent(PRIVATE, { reading: 7, blinding: `0x${"00".repeat(32)}` }, { stage: 1 })).toThrow(/blinding.*zero/);
        expect(() => prepareAttestationContent(PRIVATE, { reading: 7, blinding: committedBlinding }, { stage: 1, committed })).toThrow(/blinding.*committed set/);
        expect(() => prepareAttestationContent(PRIVATE, { reading: 7, blinding: committedBlinding.toUpperCase().replace("0X", "0x") }, { stage: 1, committed })).toThrow(/committed set/);
        // A value of the party's own, distinct from the committed one, is kept.
        const own = `0x${"3c".repeat(32)}`;
        expect(prepareAttestationContent(PRIVATE, { reading: 7, blinding: own }, { stage: 1, committed }).values.blinding).toBe(own);
    });

    it("two preparations on a public stage give the same content reference", () => {
        const one = prepareAttestationContent(PRIVATE, { note: "x" }, { stage: 2 });
        const two = prepareAttestationContent(PRIVATE, { note: "x" }, { stage: 2 });
        expect(one.contentRef).toBe(two.contentRef);
        expect(one.values).toEqual({ note: "x" });
    });
});

describe("a blinding value that comes from the design is never kept and never signed", () => {
    const DESIGNED = `0x${"5d".repeat(32)}` as Hex;
    /** A design published by anyone whose registered agreement carries a
     *  fixed blinding value for the private clause: public, and the same in
     *  every order. */
    const design = hydrateAuthored({
        agreements: [{ id: "agreement-0", clauses: { [COMMERCE]: {}, [PRIVATE_KEY]: { blinding: DESIGNED } }, follows: [] }],
    });
    /** The same, with the value in the assembly's own clause data. */
    const assemblyDesign = hydrateAuthored({
        assemblyClauses: { [PRIVATE_KEY]: { blinding: DESIGNED } },
        agreements: [{ id: "agreement-0", clauses: { [COMMERCE]: {} }, follows: [] }],
    });
    const overrides = { [COMMERCE]: LINE, [PRIVATE_KEY]: { grade: "c" } };
    const clauseOf = (agreement: Agreement, key: Hex) =>
        agreement.clauses.find((c) => c.clause.toLowerCase() === key.toLowerCase())!;
    const signedWith = (hydrated: typeof design, blinding: Hex) => {
        const built = instantiateRootAgreement(hydrated, { buyer: BUYER.address, seller: SELLER.address, overrides });
        const agreement: Agreement = {
            ...built,
            clauses: built.clauses.map((c) => c.clause.toLowerCase() === PRIVATE_KEY.toLowerCase() ? { ...c, data: { ...c.data, blinding } } : c),
        };
        const checkoutHash = computeCheckoutHash(agreement);
        const { commitment } = buildCommitment({
            processId: ZERO_PROCESS_ID, buyer: BUYER.address, seller: SELLER.address, token: CURRENCY, payment: 1000n, runningTotal: 1000n,
            checkoutHash, commitDeadline: 1_900_000_000n,
        }, buildDomain(CHAIN, CORE));
        return { agreement, checkoutHash, commitment };
    };

    it.each([["registered agreement", design], ["assembly clause data", assemblyDesign]])(
        "the buyer's fill draws its own value over the one the %s carries",
        (_where, hydrated) => {
            const instantiated = instantiateRootAgreement(hydrated, { buyer: BUYER.address, seller: SELLER.address, overrides });
            expect(clauseOf(instantiated, PRIVATE_KEY).data?.blinding).toBe(DESIGNED);
            const filled = withAgreementBlinding(instantiated, SPECS, overrides);
            const drawn = clauseOf(filled, PRIVATE_KEY).data?.blinding;
            expect(isBlindingValue(drawn)).toBe(true);
            expect(drawn).not.toBe(DESIGNED);
        },
    );

    it("the buyer's fill keeps a value the buyer's own data carries (a counter-draft, the checkout's store)", () => {
        const held = `0x${"34".repeat(32)}`;
        const own = { ...overrides, [PRIVATE_KEY]: { grade: "c", blinding: held } };
        const instantiated = instantiateRootAgreement(design, { buyer: BUYER.address, seller: SELLER.address, overrides: own });
        expect(clauseOf(withAgreementBlinding(instantiated, SPECS, own), PRIVATE_KEY).data?.blinding).toBe(held);
    });

    it("buildQuoteRequest's draft carries a value of its own, never the design's", () => {
        const request = buildQuoteRequest({
            assembly: design, buyer: BUYER.address, seller: SELLER.address, currency: CURRENCY, ceiling: 1000n,
            chainId: CHAIN, core: CORE, pricedFields: PRICED_LINE, deadline: 1_900_000_000n, overrides, specs: SPECS,
        });
        const drawn = clauseOf(request.agreement, PRIVATE_KEY).data?.blinding;
        expect(isBlindingValue(drawn)).toBe(true);
        expect(drawn).not.toBe(DESIGNED);
    });

    it("the sign gate refuses a design whose clause data carries a blinding value, and buildBuyerOffer signs nothing", async () => {
        const { agreement, checkoutHash, commitment } = signedWith(design, `0x${"77".repeat(32)}`);
        const check = validateCommitmentAgreement(agreement, checkoutHash, SPECS, commitment, design);
        expect(check.ok).toBe(false);
        expect(check.issues).toContainEqual(expect.objectContaining({
            clause: PRIVATE_KEY.toLowerCase(), path: "blinding", message: expect.stringMatching(/design.*carries a value for the blinding field/),
        }));
        await expect(buildBuyerOffer(buyerW, {
            assembly: design, seller: SELLER.address, currency: CURRENCY, payment: 1000n, chainId: CHAIN, core: CORE,
            deadline: 1_900_000_000n, overrides, specs: SPECS,
        })).rejects.toThrow(/blinding field/);
    });

    it.each([["registered agreement", design], ["assembly clause data", assemblyDesign]])(
        "the sign gate refuses an agreement hand-built with the value the %s carries, and says why",
        (_where, hydrated) => {
            const { agreement, checkoutHash, commitment } = signedWith(hydrated, DESIGNED);
            const check = validateCommitmentAgreement(agreement, checkoutHash, SPECS, commitment, hydrated);
            expect(check.ok).toBe(false);
            expect(check.issues).toContainEqual(expect.objectContaining({
                path: "blinding", message: expect.stringMatching(/equals the value the design carries.*public/),
            }));
        },
    );

    it("the counter-signer's gate refuses the same draft", async () => {
        const { agreement, commitment } = signedWith(design, DESIGNED);
        const check = await validateDraft({ commitment, agreement }, SELLER.address, undefined, SPECS, design, profileBinding(design));
        expect(check.ok).toBe(false);
        expect(check.ok === false && check.reason).toMatch(/equals the value the design carries/);
    });
});

describe("the reference designer's build never writes a blinding value", () => {
    /** A private clause whose spec names its blinding field among the design
     *  fills (which the sign gate refuses on its own). */
    const NAMED = viewOf({
        ...PRIVATE_RAW,
        clauseId: "test-private-design-named",
        block: { design: { article: "terms", fills: ["grade", "blinding"] } },
    });
    const SCOPED = viewOf({
        ...PRIVATE_RAW,
        clauseId: "test-private-design-scoped",
        block: { design: { article: "terms", scope: "assembly", fills: ["grade", "blinding"] } },
    });
    const specs = specSourceWithRegistrations(SPECS, [NAMED, SCOPED]);
    const composedValues = { grade: "a", blinding: `0x${"6e".repeat(32)}` };

    it("composeOrderAgreement keeps the design fills and drops the blinding value", () => {
        const { composed } = composeOrderAgreement({ clauses: { [NAMED.clauseKey]: composedValues }, specs });
        expect(composed.clauses[NAMED.clauseKey]).toEqual({ grade: "a" });
    });

    it("buildProcessDesign drops it from the assembly's own clause data", () => {
        const { assembly } = buildProcessDesign({
            orders: [{ orderHash: "o-0" }],
            clausesByOrderId: { "o-0": { [COMMERCE]: {} } },
            assemblyClauses: { [SCOPED.clauseKey]: composedValues },
            specs,
        });
        expect(assembly.assemblyClauses?.[SCOPED.clauseKey]).toEqual({ grade: "a" });
    });
});

describe("the sign gate and prepareAttestationContent re-check the set rules on the spec view they are handed", () => {
    /** A spec view built by hand, never through `parseClauseSpec`: a private
     *  committed set and a private stage, neither with a blinding field. */
    const HAND_BUILT = {
        ...PRIVATE,
        clauseKey: `0x${"ab".repeat(32)}`,
        clauseId: "test-hand-built",
        fields: [{ name: "grade", type: "enum", values: ["a", "b", "c"], required: true, disposition: "private" }],
        stages: { 1: [{ name: "reading", type: "integer", required: true, disposition: "private" }] },
    } as unknown as typeof PRIVATE;

    it("fieldSetRuleErrors is the parser's own rule: it names a private set with no blinding field", () => {
        expect(fieldSetRuleErrors(HAND_BUILT.fields, "$.fields")).toEqual([
            expect.objectContaining({ path: "$.fields", message: expect.stringMatching(/exactly one blinding field/) }),
        ]);
        expect(fieldSetRuleErrors(PRIVATE.fields, "$.fields")).toEqual([]);
    });

    it("the sign gate refuses a clause whose hand-built spec breaks the set rules", () => {
        const specs = specSourceWithRegistrations(SPECS, [HAND_BUILT]);
        const { agreement, checkoutHash } = buildOrderAgreement(BUYER.address, SELLER.address, { [HAND_BUILT.clauseKey]: { grade: "b" } }, specs);
        const { commitment } = buildCommitment({
            processId: ZERO_PROCESS_ID, buyer: BUYER.address, seller: SELLER.address, token: CURRENCY, payment: 1000n, runningTotal: 1000n,
            checkoutHash, commitDeadline: 1_900_000_000n,
        }, buildDomain(CHAIN, CORE));
        const check = validateCommitmentAgreement(agreement, checkoutHash, specs, commitment, null);
        expect(check.ok).toBe(false);
        expect(check.issues).toContainEqual(expect.objectContaining({
            clause: HAND_BUILT.clauseKey, message: expect.stringMatching(/the clause's spec breaks the private set's rules.*exactly one blinding field/),
        }));
    });

    it("prepareAttestationContent refuses a private stage of a hand-built spec with no blinding field", () => {
        expect(() => prepareAttestationContent(HAND_BUILT, { reading: 7 }, { stage: 1 })).toThrow(/exactly one blinding field/);
    });
});
