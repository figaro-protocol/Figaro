/**
 * Sealed handoff data is purged when an order resolves on EITHER path:
 * FigaroBatchVerifier emits the Core's own `OrderResolved` for every batched
 * order, so the watcher must cover both addresses.
 *
 * Proves: `useHandoffCleanup` watches `OrderResolved` at the Core and at the
 * verifier, and schedules the purge for a resolved order it is handed.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useHandoffCleanup } from "@/lib/handoff/useHandoffCleanup";
import { word } from "./__fixtures__/coreLogs";

const { CORE, VERIFIER, WALLET, watchMock } = vi.hoisted(() => ({
    CORE: "0x3333333333333333333333333333333333333333",
    VERIFIER: "0x2222222222222222222222222222222222222222",
    WALLET: "0x1234567890123456789012345678901234567890",
    watchMock: vi.fn(),
}));
const publicClient = { getBlockNumber: async () => 100n, watchContractEvent: (...a: unknown[]) => watchMock(...a) };

vi.mock("wagmi", () => ({
    usePublicClient: () => publicClient,
    useChainId: () => 31337,
    useAccount: () => ({ address: WALLET }),
}));
vi.mock("@/lib/shared/e2e", () => ({ isE2EMockSession: () => false }));
vi.mock("@/lib/kernel/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/kernel/contracts")>()),
    CONTRACTS: { core: CORE, batchVerifier: VERIFIER },
    getBatchVerifier: () => VERIFIER,
}));

describe("useHandoffCleanup on both paths", () => {
    it("watches OrderResolved at the Core and at the batch verifier, and purges a resolved order", async () => {
        watchMock.mockReset().mockReturnValue(() => undefined);
        const handoffPersistence = { purgeHandoffArtifacts: vi.fn(), schedulePurge: vi.fn(), sweepDuePurges: vi.fn() };
        renderHook(() => useHandoffCleanup({ handoffPersistence }));
        await waitFor(() => expect(watchMock).toHaveBeenCalledTimes(1));
        const [{ address, eventName, onLogs }] = watchMock.mock.calls[0] as [{ address: string[]; eventName: string; onLogs: (l: unknown[]) => void }];
        expect(eventName).toBe("OrderResolved");
        expect([address].flat().map((a) => a.toLowerCase()).sort()).toEqual([CORE, VERIFIER].sort());
        act(() => onLogs([{ args: { orderHash: word(0x0d), processId: word(0xab) } }]));
        expect(handoffPersistence.schedulePurge).toHaveBeenCalledWith(WALLET, word(0xab), word(0x0d), 0);
    });
});
