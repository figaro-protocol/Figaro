import { describe, it, expect } from "vitest";
import {
    deriveInFlightOrders,
    deriveClauseWithdrawGate,
    deriveAssemblyWithdrawGate,
    deriveAgreementWithdrawGate,
    type InFlightAgreement,
} from "../src/derive/withdraw.js";
import type { CoreEvents } from "../src/state.js";
import type { Agreement } from "../src/agreement.js";
import type {
    Hex,
    Address,
    OrderCommittedEvent,
    OrderResolvedEvent,
    ProcessResolvedEvent,
} from "../src/types.js";
import { keyOf } from "./specFixtures.js";

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
const SELLER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const CURRENCY = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address;

const PROC_A = ("0x" + "a".repeat(64)) as Hex;
const PROC_B = ("0x" + "b".repeat(64)) as Hex;
const ORDER_1 = ("0x" + "11".repeat(32)) as Hex;
const ORDER_2 = ("0x" + "22".repeat(32)) as Hex;
const AGREEMENT_HASH = ("0x" + "99".repeat(32)) as Hex;

function committed(overrides: Partial<OrderCommittedEvent> = {}): OrderCommittedEvent {
    return {
        orderHash: ORDER_1,
        processId: PROC_A,
        buyer: BUYER,
        seller: SELLER,
        currency: CURRENCY,
        payment: 1000n,
        cumulativeValue: 1000n,
        agreementHash: AGREEMENT_HASH,
        salt: 0n,
        deadline: 0n,
        blockNumber: 1,
        transactionHash: null,
        ...overrides,
    };
}

function coreEvents(overrides: Partial<CoreEvents> = {}): CoreEvents {
    return {
        orderCommitted: [],
        orderResolved: [],
        processResolved: [],
        ...overrides,
    };
}

/** An agreement composing exactly the given clause ids (data is irrelevant to
 *  the gate — it keys on `section.clause`). */
function agreementWith(clauses: string[]): Agreement {
    return {
        version: "a1",
        buyer: BUYER,
        seller: SELLER,
        sections: clauses.map((name) => ({ clause: keyOf(name), data: {} })),
    };
}

// ── deriveInFlightOrders ──────────────────────────────────────────────────────

describe("deriveInFlightOrders", () => {
    it("returns nothing for an empty event set", () => {
        expect(deriveInFlightOrders(coreEvents())).toEqual([]);
    });

    it("surfaces a committed, unresolved order as in-flight", () => {
        const refs = deriveInFlightOrders(coreEvents({ orderCommitted: [committed()] }));
        expect(refs).toHaveLength(1);
        expect(refs[0]).toMatchObject({ orderHash: ORDER_1, processId: PROC_A, agreementHash: AGREEMENT_HASH });
    });

    it("drops orders whose process resolved (atomic resolution)", () => {
        const events = coreEvents({
            orderCommitted: [committed()],
            orderResolved: [{ orderHash: ORDER_1, processId: PROC_A, sellerPayout: 0n, buyerPayout: 0n, blockNumber: 2 } as OrderResolvedEvent],
            processResolved: [{ processId: PROC_A, buyer: BUYER, orderCount: 1n, blockNumber: 2 } as ProcessResolvedEvent],
        });
        expect(deriveInFlightOrders(events)).toEqual([]);
    });
});

// ── Clause gate ────────────────────────────────────────────────────────────────

describe("deriveClauseWithdrawGate", () => {
    it("zero orders → canWithdraw true (absence, not error)", () => {
        expect(deriveClauseWithdrawGate(keyOf("figaro-emissions"), [])).toEqual({
            canWithdraw: true,
            inFlightCount: 0,
            unverifiedCount: 0,
        });
    });

    it("an in-flight order composing the clause → false with the count", () => {
        const agreements: InFlightAgreement[] = [
            { processId: PROC_A, agreement: agreementWith(["figaro-commerce", "figaro-emissions"]) },
        ];
        expect(deriveClauseWithdrawGate(keyOf("figaro-emissions"), agreements)).toEqual({
            canWithdraw: false,
            inFlightCount: 1,
            unverifiedCount: 0,
        });
    });

    it("in-flight orders NOT composing the clause → true", () => {
        const agreements: InFlightAgreement[] = [
            { processId: PROC_A, agreement: agreementWith(["figaro-commerce", "figaro-modalities"]) },
        ];
        expect(deriveClauseWithdrawGate(keyOf("figaro-emissions"), agreements).canWithdraw).toBe(true);
    });

    it("counts each in-flight order naming the clause", () => {
        const agreements: InFlightAgreement[] = [
            { processId: PROC_A, agreement: agreementWith(["figaro-emissions"]) },
            { processId: PROC_A, agreement: agreementWith(["figaro-emissions", "figaro-commerce"]) },
            { processId: PROC_B, agreement: agreementWith(["figaro-commerce"]) },
        ];
        expect(deriveClauseWithdrawGate(keyOf("figaro-emissions"), agreements).inFlightCount).toBe(2);
    });

    it("unverified-only (party-private terms) → surfaced as a caveat, never blocking", () => {
        const agreements: InFlightAgreement[] = [
            { processId: PROC_A, agreement: null },
        ];
        expect(deriveClauseWithdrawGate(keyOf("figaro-emissions"), agreements)).toEqual({
            canWithdraw: true,
            inFlightCount: 0,
            unverifiedCount: 1,
        });
    });

    it("mixed: a verified composing deal blocks, unverified counted alongside", () => {
        const agreements: InFlightAgreement[] = [
            { processId: PROC_A, agreement: agreementWith(["figaro-emissions"]) },
            { processId: PROC_B, agreement: null },
        ];
        expect(deriveClauseWithdrawGate(keyOf("figaro-emissions"), agreements)).toEqual({
            canWithdraw: false,
            inFlightCount: 1,
            unverifiedCount: 1,
        });
    });
});

// ── Assembly gate ────────────────────────────────────────────────────────────

const COMPOSITION = ("0x" + "c0".repeat(32)) as Hex;
const OTHER_COMPOSITION = ("0x" + "c1".repeat(32)) as Hex;
const AGREEMENT_KEY = ("0x" + "a0".repeat(32)) as Hex;
const OTHER_AGREEMENT_KEY = ("0x" + "a1".repeat(32)) as Hex;

/** An agreement whose provenance leaf names the given registered agreement
 *  and assembly. */
function instantiated(agreementKey: Hex, compositionHash: Hex): Agreement {
    return { ...agreementWith(["figaro-commerce", "figaro-topology"]), provenance: { agreementKey, compositionHash } };
}

for (const [label, derive, key, other] of [
    ["deriveAssemblyWithdrawGate", deriveAssemblyWithdrawGate, COMPOSITION, OTHER_COMPOSITION],
    ["deriveAgreementWithdrawGate", deriveAgreementWithdrawGate, AGREEMENT_KEY, OTHER_AGREEMENT_KEY],
] as const) {
    const named = (k: Hex) => label === "deriveAssemblyWithdrawGate"
        ? instantiated(AGREEMENT_KEY, k)
        : instantiated(k, COMPOSITION);

    describe(label, () => {
        it("zero orders → canWithdraw true (absence, not error)", () => {
            expect(derive(key, [])).toEqual({ canWithdraw: true, inFlightCount: 0, unverifiedCount: 0 });
        });

        it("a process whose verified provenance names the key → false", () => {
            expect(derive(key, [{ processId: PROC_A, agreement: named(key) }])).toEqual({
                canWithdraw: false, inFlightCount: 1, unverifiedCount: 0,
            });
        });

        it("matches the key in any letter case", () => {
            const upper = key.toUpperCase().replace("0X", "0x") as Hex;
            expect(derive(upper, [{ processId: PROC_A, agreement: named(key) }]).inFlightCount).toBe(1);
        });

        it("a process naming another key, or no provenance, does NOT match", () => {
            expect(derive(key, [
                { processId: PROC_A, agreement: named(other) },
                { processId: PROC_B, agreement: agreementWith(["figaro-commerce", "figaro-topology"]) },
            ]).canWithdraw).toBe(true);
        });

        it("counts distinct in-flight processes, not orders", () => {
            expect(derive(key, [
                { processId: PROC_A, agreement: named(key) },
                { processId: PROC_A, agreement: named(key) },
                { processId: PROC_B, agreement: named(key) },
            ]).inFlightCount).toBe(2);
        });

        it("unverified-only: a process with an unverifiable agreement is a caveat, never blocking", () => {
            expect(derive(key, [
                { processId: PROC_A, agreement: named(key) },
                { processId: PROC_A, agreement: null },
            ])).toEqual({ canWithdraw: true, inFlightCount: 0, unverifiedCount: 1 });
        });

        it("mixed: a verified composing process blocks, unverified counted alongside", () => {
            expect(derive(key, [
                { processId: PROC_A, agreement: named(key) },
                { processId: PROC_B, agreement: null },
            ])).toEqual({ canWithdraw: false, inFlightCount: 1, unverifiedCount: 1 });
        });
    });
}
