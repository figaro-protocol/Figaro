import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The batch case reads the chain through the real readers; each emitter
// answers its own rows (the event cache's, decoded arguments attached).
const { cachedGetLogsMock, CORE, VERIFIER } = vi.hoisted(() => ({
    cachedGetLogsMock: vi.fn(),
    CORE: "0x1111111111111111111111111111111111111111",
    VERIFIER: "0x2222222222222222222222222222222222222222",
}));
vi.mock("@/lib/core/eventCache", () => ({
    cachedGetLogs: (...args: unknown[]) => cachedGetLogsMock(...args),
    cachedGetReceiptLogs: vi.fn(),
}));
vi.mock("@/lib/registries/membersRegistryIndexer", () => ({ getAllMemberRegistered: async () => [] }));
vi.mock("@/lib/core/contracts", async (importOriginal) =>
    (await import("../support/contractsMock")).contractsMock(await importOriginal<typeof import("@/lib/core/contracts")>(), { contracts: { core: CORE, batchVerifier: VERIFIER }, coordinator: () => undefined, batchVerifier: () => VERIFIER }));

import { MemberResolutionHistory } from "@/components/runtime/MemberResolutionHistory";
import { getSellerResolutionHistory, type MemberResolutionHistory as ResolutionHistory } from "@/lib/registries/memberResolutionHistory";

const WITH_HISTORY: ResolutionHistory = {
    operatingSinceBlock: 100n,
    operatingSinceTimestamp: 1_717_200_000n,
    completedProcesses: 7,
    activeProcesses: 2,
    ordersSold: 14,
    ordersBought: 6,
    valueTransacted: [
        { currency: "0xc6b407503de64956ad3cf5ab112ca4f56aa13517", total: 5_000_000_000_000_000_000n },
    ],
    buyersServed: 9,
    sellersUsed: 4,
    attestationsEmitted: 25,
    attestationsByClause: [{ clauseId: "0xabc", count: 25 }],
};

const NO_HISTORY: ResolutionHistory = {
    operatingSinceBlock: 50n,
    operatingSinceTimestamp: 1_717_200_000n,
    completedProcesses: 0,
    activeProcesses: 0,
    ordersSold: 0,
    ordersBought: 0,
    valueTransacted: [],
    buyersServed: 0,
    sellersUsed: 0,
    attestationsEmitted: 0,
    attestationsByClause: [],
};

describe("MemberResolutionHistory", () => {
    it("renders every reconstructed indicator", () => {
        render(<MemberResolutionHistory record={WITH_HISTORY} isLoading={false} />);
        expect(screen.getByTestId("seller-track-record")).toBeInTheDocument();
        // The eight stat tiles — distinct values, one per indicator.
        for (const value of ["7", "2", "14", "6", "9", "4", "25"]) {
            expect(screen.getByText(value)).toBeInTheDocument();
        }
        // Value transacted, formatted per currency.
        expect(screen.getByTestId("track-record-value")).toHaveTextContent("5");
    });

    it("shows an honest empty state — no fabricated rating — when there is no history", () => {
        render(<MemberResolutionHistory record={NO_HISTORY} isLoading={false} />);
        expect(screen.getByTestId("track-record-empty")).toBeInTheDocument();
        expect(screen.queryByText("processes completed")).not.toBeInTheDocument();
    });

    it("renders a loading state while the graph is reconstructed", () => {
        render(<MemberResolutionHistory record={null} isLoading={true} />);
        expect(screen.getByTestId("track-record-loading")).toBeInTheDocument();
    });

    it("renders a process the batch verifier resolved as completed, read through the real readers", async () => {
        const SELLER = "0x00000000000000000000000000000000000000a1";
        const ORDER = `0x${"0b".repeat(32)}`;
        const PROCESS = `0x${"02".repeat(32)}`;
        const at = (block: bigint, args: Record<string, unknown>) => ({ args, blockNumber: block, logIndex: 0, transactionHash: `0x${"ee".repeat(32)}` });
        const verifierRows: Record<string, unknown[]> = {
            OrderSeller: [at(10n, { orderHash: ORDER, seller: SELLER })],
            OrderCommitted: [at(10n, { orderHash: ORDER, processId: PROCESS, buyer: `0x${"b1".repeat(20)}`, seller: SELLER, token: `0x${"77".repeat(20)}`, payment: 3n })],
            OrderResolved: [at(11n, { orderHash: ORDER, processId: PROCESS })],
            Attestation: [at(11n, { orderHash: ORDER, processId: PROCESS, attester: SELLER, clauseId: `0x${"dd".repeat(32)}`, stage: 0, contentRef: `0x${"00".repeat(32)}` })],
        };
        cachedGetLogsMock.mockImplementation(async (_c: unknown, _id: number, opts: { address: string; eventName: string }) =>
            opts.address === VERIFIER ? verifierRows[opts.eventName] ?? [] : []);
        const record = await getSellerResolutionHistory({} as never, 31337, SELLER);
        render(<MemberResolutionHistory record={record} isLoading={false} />);
        expect(screen.queryByTestId("track-record-empty")).toBeNull();
        expect(screen.getByTestId("track-stat-completed")).toHaveTextContent("1");
    });

    it("renders nothing when there is no record and no load in flight", () => {
        const { container } = render(<MemberResolutionHistory record={null} isLoading={false} />);
        expect(container).toBeEmptyDOMElement();
    });
});
