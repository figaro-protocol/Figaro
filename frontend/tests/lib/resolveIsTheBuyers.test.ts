/**
 * Only the buyer resolves, and a resolve names every active order of its
 * process.
 *
 * The Core refuses a resolve from anyone but the root buyer, and one that
 * leaves an active order out (K-2, K-3). The app keeps to the same verbs:
 * - `deriveProcessModelFromRuntime` offers the resolve capability to the
 *   buyer of an active order of the process, and to no one else: not the
 *   seller, not a stranger, not a reader with no wallet, and not the buyer
 *   once every order is resolved.
 * - `createCapabilityExecutors`'s resolve sends one commitment per active
 *   order of that process, rebuilt from the order, and none of another
 *   process or of a resolved order.
 *
 * Proves: what the app offers and what it sends, for these fixtures. Does not
 * prove: the Core's own refusals, which are K-2 and K-3.
 */
import { describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";
import { deriveProcessModelFromRuntime } from "@/lib/semantic/deriveProcessModelFromRuntime";
import { createCapabilityExecutors, type CapabilityExecutorDeps } from "@/lib/semantic/createCapabilityExecutors";
import { OrderState, type Order } from "@/lib/core/store";
import type { ProcessSummary } from "@/lib/core/walletProcessQueries";

// The root's signed process id is restored under the configured Core.
vi.hoisted(() => {
    process.env.NEXT_PUBLIC_FIGARO_CORE = "0x00000000000000000000000000000000000c0e01";
});

const BUYER = "0x1111111111111111111111111111111111111111";
const SELLER = "0x2222222222222222222222222222222222222222";
const STRANGER = "0x3333333333333333333333333333333333333333";
const PROCESS = `0x${"ab".repeat(32)}`;
const OTHER_PROCESS = `0x${"ac".repeat(32)}`;

function order(n: number, over: Partial<Order> = {}): Order {
    return {
        orderHash: `0x${n.toString(16).padStart(2, "0").repeat(32)}`,
        processId: PROCESS,
        buyer: BUYER,
        seller: SELLER,
        token: `0x${"44".repeat(20)}`,
        runningTotal: BigInt(n),
        payment: 1n,
        state: OrderState.Active,
        sellerBond: 2n * BigInt(n),
        buyerBond: 2n,
        salt: BigInt(n),
        commitDeadline: 0n,
        checkoutHash: `0x${"ef".repeat(32)}`,
        ...over,
    };
}

const summary: ProcessSummary = { processId: PROCESS, orderCount: 2, hasActive: true, createdAt: 0, orders: [] };

const resolveOffered = (orders: Order[], address?: string) =>
    deriveProcessModelFromRuntime(summary, orders, new Map(), address).capabilities
        .some((c) => c.actionKind === "resolve-process");

describe("the resolve capability is the buyer's alone", () => {
    const open = [order(1), order(2)];

    it("is offered to the buyer of an active order", () => {
        expect(resolveOffered(open, BUYER)).toBe(true);
    });

    it("is offered to no seller, no stranger and no reader without a wallet", () => {
        expect(resolveOffered(open, SELLER)).toBe(false);
        expect(resolveOffered(open, STRANGER)).toBe(false);
        expect(resolveOffered(open, undefined)).toBe(false);
    });

    it("is offered to no one once every order is resolved", () => {
        expect(resolveOffered(open.map((o) => ({ ...o, state: OrderState.Resolved })), BUYER)).toBe(false);
    });
});

describe("a resolve names every active order of its process, and only those", () => {
    it("sends one commitment per active order of the process", async () => {
        const resolveProcess = vi.fn(async () => `0x${"11".repeat(32)}` as Hex);
        const orders = [
            order(1),
            order(2),
            order(3, { state: OrderState.Resolved }),
            order(4, { processId: OTHER_PROCESS }),
        ];
        const deps = {
            isE2EMock: true,
            publicClient: { chain: { id: 31337 } },
            processOrders: orders,
            processAgreements: new Map(),
            resolveProcess,
            fetchUsageClaimContext: vi.fn(),
            readAssembly: vi.fn(),
            simulateUsage: vi.fn(),
            recordUsage: vi.fn(),
            submitAttestation: vi.fn(),
            registerMember: vi.fn(),
            updateMemberProfile: vi.fn(),
            withdrawMemberDeposit: vi.fn(),
            confirmResolve: () => true,
            confirmWithdraw: () => true,
        } as unknown as CapabilityExecutorDeps;
        await createCapabilityExecutors(deps).executorCallbacks.resolveProcess(PROCESS);
        expect(resolveProcess).toHaveBeenCalledTimes(1);
        const [processId, commitments] = resolveProcess.mock.calls[0] as unknown as [string, { salt: bigint; runningTotal: bigint }[]];
        expect(processId).toBe(PROCESS);
        expect(commitments.map((c) => c.salt)).toEqual([1n, 2n]);
        expect(commitments.map((c) => c.runningTotal)).toEqual([1n, 2n]);
    });
});
