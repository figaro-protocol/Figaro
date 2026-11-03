/**
 * The withdraw gate reads the order events through the indexer's cached,
 * chunked reader. A public provider caps an eth_getLogs block range and
 * refuses the whole-range read a devnet answers in one call; a gate that
 * asked from block 0 to latest in one call never loads there, and the
 * reclaim stays disabled on every public network.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { orderCommittedLog, selectorOf, word, type FixtureLog } from "./__fixtures__/coreLogs";

const { CORE, VERIFIER, LATEST, provider } = vi.hoisted(() => {
    const LATEST = 1_500n;
    const provider = {
        logs: [] as FixtureLog[],
        selector: (_event: unknown): string => "",
        getBlockNumber: async () => LATEST,
        // The provider's cap: at most 1 000 blocks per call, and never `latest`.
        getLogs: async (params: { address: string; event?: unknown; fromBlock: bigint; toBlock: bigint | "latest" }) => {
            const to = params.toBlock;
            if (typeof to !== "bigint" || to - params.fromBlock > 1_000n) {
                throw new Error("eth_getLogs block range too large");
            }
            return provider.logs.filter((l) =>
                l.address.toLowerCase() === params.address.toLowerCase()
                && l.blockNumber >= params.fromBlock && l.blockNumber <= to
                && (!params.event || l.topics[0] === provider.selector(params.event)),
            );
        },
    };
    return {
        CORE: "0x1111111111111111111111111111111111111111",
        VERIFIER: "0x2222222222222222222222222222222222222222",
        LATEST,
        provider,
    };
});

vi.mock("@/lib/shared/wagmi", () => ({
    publicClient: provider,
    activeChain: { id: 11155111 },
}));
vi.mock("@/lib/kernel/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/kernel/contracts")>()),
    CONTRACTS: { core: CORE, batchVerifier: VERIFIER },
}));
// An un-witnessed order resolves to no agreement: the SDK gate counts it unverified.
vi.mock("@/lib/kernel/agreementFetch", () => ({ fetchAgreement: async () => null }));

import { useWithdrawGate } from "@/lib/protocol/withdrawGate";

provider.selector = selectorOf;

describe("useWithdrawGate reads through the chunked reader", () => {
    it("loads the gate from a provider that refuses a full-range getLogs", async () => {
        // One in-flight order on the direct path, one on the batch path, far apart.
        provider.logs.push(
            orderCommittedLog({ address: CORE, blockNumber: 100n, orderHash: word(0x10), processId: word(0x11), buyer: "0x00000000000000000000000000000000000000b1", seller: "0x00000000000000000000000000000000000000a1" }),
            orderCommittedLog({ address: VERIFIER, blockNumber: LATEST - 10n, orderHash: word(0x20), processId: word(0x21), buyer: "0x00000000000000000000000000000000000000b1", seller: "0x00000000000000000000000000000000000000a1" }),
        );

        const { result } = renderHook(() => useWithdrawGate({ kind: "clause", clauseKey: `0x${"ab".repeat(32)}` }));

        await waitFor(() => expect(result.current.gate).not.toBeNull());
        expect(result.current.isLoading).toBe(false);
        // Both in-flight orders are read; neither is witnessed, so both are unverified.
        expect(result.current.gate?.unverifiedCount).toBe(2);
    });
});
