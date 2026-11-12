/**
 * useWithdrawGate — a gateway failure on an order this wallet WITNESSED is
 * unknown state: the gate is absent (no reclaim affordance), never an
 * "unverified" trade that leaves the reclaim enabled. An order the wallet never
 * witnessed is still the SDK gate's unverified caveat, and never blocks.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const CLAUSE = `0x${"0c".repeat(32)}` as const;
const CHECKOUT = `0x${"cd".repeat(32)}` as const;

const mocks = vi.hoisted(() => ({
    witnessed: vi.fn<(h: string) => string | null>(),
    fetchAgreement: vi.fn(),
}));

vi.mock("@/lib/shared/wagmi", () => ({ publicClient: { getLogs: async () => [] }, activeChain: { id: 31337 } }));
vi.mock("@/lib/core/contracts", () => ({
    CONTRACTS: { core: "0x2222222222222222222222222222222222222222", batchVerifier: "" },
}));
// The order scan answers; `deriveInFlightOrders` below names the one order.
vi.mock("@/lib/core/indexer", () => ({
    getCoreEvents: async () => ({ events: { orderCommitted: [], orderResolved: [], processResolved: [] }, committedLogs: [] }),
}));
vi.mock("@/lib/core/agreementFetch", () => ({
    witnessedAgreementUri: (h: string) => mocks.witnessed(h),
    fetchAgreement: (...a: unknown[]) => mocks.fetchAgreement(...a),
}));
vi.mock("@figaro-protocol/sdk/derive", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@figaro-protocol/sdk/derive")>()),
    // One in-flight order, whatever the logs say.
    deriveInFlightOrders: () => [{ processId: `0x${"ab".repeat(32)}`, checkoutHash: CHECKOUT }],
}));

import { useWithdrawGate } from "@/lib/protocol/withdrawGate";

const TARGET = { kind: "clause", clauseKey: CLAUSE } as const;

describe("useWithdrawGate — a failed read of a witnessed body never enables the reclaim", () => {
    afterEach(() => { vi.clearAllMocks(); });

    it("witnessed order, gateway failure: the gate is absent", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        mocks.witnessed.mockReturnValue("ipfs://QmWitnessed");
        // Both the old contract (null on failure) and the new one (absent).
        mocks.fetchAgreement.mockResolvedValue({ status: "absent" });
        const { result } = renderHook(() => useWithdrawGate(TARGET));
        await waitFor(() => expect((result.current.gate as { status?: string }).status).toBe("absent"));
    });

    it("un-witnessed order: no read is made, and the gate is present with the trade unverified", async () => {
        mocks.witnessed.mockReturnValue(null);
        const { result } = renderHook(() => useWithdrawGate(TARGET));
        await waitFor(() => expect((result.current.gate as { status?: string }).status).toBe("present"));
        const gate = result.current.gate;
        expect(gate.status === "present" && gate.value.unverifiedCount).toBe(1);
        expect(gate.status === "present" && gate.value.canWithdraw).toBe(true);
        expect(mocks.fetchAgreement).not.toHaveBeenCalled();
    });
});
