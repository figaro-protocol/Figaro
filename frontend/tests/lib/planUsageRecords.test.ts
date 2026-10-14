/**
 * The buyer's at-resolution usage writes: planned before the confirm from the
 * counter's own facts (one per distinct key across the process, every clause
 * section and the agreement's provenance leaf), each simulated before it is
 * sent. Mirrors sdk/tests/recordProcessUsage.test.ts for the frontend path.
 */
import { describe, expect, it, vi } from "vitest";
import { encodePacked, keccak256, type Address, type Hex } from "viem";
import { PROVENANCE_LEAF_KEY, computeClauseKey, provenanceContentRef, provenanceSectionBytes, type Agreement, type Commitment, type UsageClaimContext } from "@figaro-protocol/sdk";
import { planUsageRecords, type UsagePlanEntry } from "@/lib/semantic/planUsageRecords";
import { createCapabilityExecutors, type CapabilityExecutorDeps } from "@/lib/semantic/createCapabilityExecutors";
import { OrderState, type Order } from "@/lib/kernel/store";
import { ZERO_BYTES32 } from "@/lib/shared/evm";

// The signed-processId restoration needs a configured Core; the planner and
// the executor are what is under test, so the restoration is the identity.
vi.mock("@/lib/kernel/signedCommitment", () => ({ restoreSignedProcessId: (c: Commitment) => c }));

const COMMERCE = computeClauseKey("figaro-commerce", 1);
const MODALITIES = computeClauseKey("figaro-modalities", 1);
const COMPOSITION = keccak256(encodePacked(["string"], ["an-assembly"]));
const BUYER = "0x0000000000000000000000000000000000000b0b" as Address;
const CURRENCY = "0x00000000000000000000000000000000000007ed" as Address;
const PROCESS = ZERO_BYTES32 as Hex;

const CONTEXT: UsageClaimContext = { provenanceLeaf: PROVENANCE_LEAF_KEY };

function commitment(salt: bigint, seller: Address): Commitment {
    return {
        processId: PROCESS, buyer: BUYER, seller, currency: CURRENCY,
        payment: 100n, expectedCumulativeValue: 100n * salt,
        agreementHash: `0x${salt.toString(16).padStart(64, "a")}` as Hex, salt, deadline: 2n,
    };
}

function agreement(seller: Address, compositionHash: unknown = COMPOSITION): Agreement {
    return {
        version: "a1", buyer: BUYER, seller,
        sections: [
            { clause: "figaro-modalities", version: 1, data: { modality: "pickup" } },
            { clause: "figaro-commerce", version: 1, data: { payment: "100", currency: CURRENCY, lineItems: [] } },
        ],
        provenance: compositionHash,
    } as Agreement;
}

const SELLER_A = "0x0000000000000000000000000000000000005e11" as Address;
const SELLER_B = "0x0000000000000000000000000000000000005e12" as Address;

function entry(salt: bigint, seller: Address, a: Agreement = agreement(seller)): UsagePlanEntry {
    return { orderHash: `order-${salt}`, commitment: commitment(salt, seller), agreement: a, context: CONTEXT };
}

describe("planUsageRecords", () => {
    it("plans every clause section, and the provenance leaf only as the assembly write", () => {
        const { writes } = planUsageRecords([entry(1n, SELLER_A)]);
        expect(writes.map((w) => w.key.toLowerCase())).not.toContain(PROVENANCE_LEAF_KEY.toLowerCase());
        expect(writes.filter((w) => w.kind === "clause").map((w) => w.key.toLowerCase()).sort())
            .toEqual([COMMERCE.toLowerCase(), MODALITIES.toLowerCase()].sort());
    });

    it("plans no assembly write for an agreement that names no assembly", () => {
        const bare = { ...agreement(SELLER_A), provenance: undefined } as Agreement;
        const { writes, problems } = planUsageRecords([entry(1n, SELLER_A, bare)]);
        expect(writes.filter((w) => w.kind === "assembly")).toHaveLength(0);
        expect(writes).toHaveLength(2);
        expect(problems).toEqual([]);
    });

    it("plans a key two orders carry once, from the first order that carries it", () => {
        const { writes } = planUsageRecords([entry(1n, SELLER_A), entry(2n, SELLER_B)]);
        const commerce = writes.filter((w) => w.key.toLowerCase() === COMMERCE.toLowerCase());
        expect(commerce).toHaveLength(1);
        expect(commerce[0].orderHash).toBe("order-1");
        expect(writes).toHaveLength(3); // two clauses + the assembly, across two orders
    });

    it("plans the assembly write once per process, from the agreement's provenance", () => {
        const { writes } = planUsageRecords([entry(1n, SELLER_A), entry(2n, SELLER_B)]);
        const assembly = writes.filter((w) => w.kind === "assembly");
        expect(assembly).toHaveLength(1);
        expect(assembly[0].key.toLowerCase()).toBe(COMPOSITION.toLowerCase());
    });

    it("says a malformed provenance out loud and plans nothing for that order", () => {
        const { writes, problems } = planUsageRecords([entry(1n, SELLER_A, agreement(SELLER_A, "0x1234"))]);
        expect(writes).toHaveLength(0);
        expect(problems.join("\n")).toMatch(/provenance present but malformed/);
    });

    it("refuses a counter whose provenance leaf is not the agreement format's", () => {
        const foreign: UsageClaimContext = { provenanceLeaf: COMMERCE };
        const { writes, problems } = planUsageRecords([{ ...entry(1n, SELLER_A), context: foreign }]);
        expect(writes).toHaveLength(0);
        expect(problems.join("\n")).toMatch(/not the agreement format's/);
    });

    it("plans nothing from no entries", () => {
        expect(planUsageRecords([])).toEqual({ writes: [], problems: [] });
    });
});

function order(salt: bigint, seller: Address): Order {
    const c = commitment(salt, seller);
    return {
        orderHash: `order-${salt}`, processId: PROCESS, buyer: BUYER, seller, currency: CURRENCY,
        agreementHash: c.agreementHash, cumulativeValue: c.expectedCumulativeValue, payment: c.payment,
        state: OrderState.Active, sellerBond: 0n, buyerBond: 0n, salt: c.salt, deadline: c.deadline,
    };
}

function deps(overrides: Partial<CapabilityExecutorDeps> = {}) {
    const orders = [order(1n, SELLER_A), order(2n, SELLER_B)];
    const agreements = new Map<string, Agreement>(orders.map((o) => [o.agreementHash!, agreement(o.seller as Address)]));
    const sent: Hex[] = [];
    const base: CapabilityExecutorDeps = {
        isE2EMock: false,
        publicClient: { waitForTransactionReceipt: async () => ({ status: "success" }), chain: { id: 31337 } },
        processOrders: orders,
        processAgreements: agreements,
        resolveProcess: vi.fn(async () => `0x${"11".repeat(32)}` as Hex),
        fetchUsageClaimContext: vi.fn(async () => CONTEXT),
        simulateClauseUsage: vi.fn(async () => undefined),
        simulateAssemblyUsage: vi.fn(async () => undefined),
        recordClauseUsage: vi.fn(async (_o: Commitment, key: Hex) => { sent.push(key); return `0x${"22".repeat(32)}` as Hex; }),
        recordAssemblyUsage: vi.fn(async (_o: Commitment, key: Hex) => { sent.push(key); return `0x${"33".repeat(32)}` as Hex; }),
        submitAttestation: vi.fn(async () => undefined),
        registerMember: vi.fn(async () => undefined),
        updateMemberProfile: vi.fn(async () => undefined),
        withdrawMemberDeposit: vi.fn(async () => undefined),
        confirmResolve: vi.fn(() => true),
        confirmWithdraw: vi.fn(() => true),
        ...overrides,
    };
    return { deps: base, sent };
}

describe("createCapabilityExecutors — resolve with usage writes", () => {
    it("asks the confirm with the planned count, before the resolve is sent", async () => {
        const { deps: d } = deps();
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});
        await createCapabilityExecutors(d).executorCallbacks.resolveProcess(PROCESS);
        expect(d.confirmResolve).toHaveBeenCalledWith(3);
        // One counter read serves every order the process resolves.
        expect(d.fetchUsageClaimContext).toHaveBeenCalledTimes(1);
        expect((d.confirmResolve as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0])
            .toBeLessThan((d.resolveProcess as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);
        errors.mockRestore();
    });

    it("sends nothing, the resolve included, when the confirm is declined", async () => {
        const { deps: d, sent } = deps({ confirmResolve: vi.fn(() => false) });
        await createCapabilityExecutors(d).executorCallbacks.resolveProcess(PROCESS);
        expect(d.resolveProcess).not.toHaveBeenCalled();
        expect(sent).toHaveLength(0);
    });

    it("plans and sends nothing under the e2e mock, and says zero", async () => {
        const { deps: d, sent } = deps({ isE2EMock: true });
        await createCapabilityExecutors(d).executorCallbacks.resolveProcess(PROCESS);
        expect(d.confirmResolve).toHaveBeenCalledWith(0);
        expect(d.fetchUsageClaimContext).not.toHaveBeenCalled();
        expect(sent).toHaveLength(0);
    });

    it("never sends a write whose simulation reverts, and sends the rest", async () => {
        const { deps: d, sent } = deps({
            simulateClauseUsage: vi.fn(async (_o: Commitment, key: Hex) => {
                if (key.toLowerCase() === MODALITIES.toLowerCase()) throw new Error("SellerNotStaked");
            }),
        });
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});
        await createCapabilityExecutors(d).executorCallbacks.resolveProcess(PROCESS);
        expect(sent.map((k) => k.toLowerCase())).not.toContain(MODALITIES.toLowerCase());
        expect(sent.map((k) => k.toLowerCase()).sort()).toEqual([COMMERCE.toLowerCase(), COMPOSITION.toLowerCase()].sort());
        expect(errors.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(/recorded 2\/3 planned \(1 skipped after a reverted simulation\) \+ assembly/);
        errors.mockRestore();
    });

    it("stays loud about an order whose agreement is not hydrated, and plans the others", async () => {
        const { deps: d } = deps();
        d.processAgreements.delete(d.processOrders[0].agreementHash!);
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});
        await createCapabilityExecutors(d).executorCallbacks.resolveProcess(PROCESS);
        expect(errors.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(/no hydrated agreement for order order-1/);
        expect(d.confirmResolve).toHaveBeenCalledWith(3);
        errors.mockRestore();
    });
});

describe("createCapabilityExecutors — the provenance leaf attestation", () => {
    it("files the buyer's attestation under the reserved key, the leaf's bytes as content", async () => {
        const { deps: d } = deps();
        await createCapabilityExecutors(d).executorCallbacks.attestProvenanceLeaf({
            executionType: "transaction", kind: "attest-provenance-leaf",
            orderHash: "order-1", compositionHash: COMPOSITION, party: "buyer",
        });
        expect(d.submitAttestation).toHaveBeenCalledWith("buyer", expect.objectContaining({
            orderHash: "order-1",
            clauseId: PROVENANCE_LEAF_KEY,
            stage: 0,
            content: provenanceSectionBytes(COMPOSITION),
        }));
        expect(keccak256(provenanceSectionBytes(COMPOSITION))).toBe(provenanceContentRef(COMPOSITION));
    });
});
