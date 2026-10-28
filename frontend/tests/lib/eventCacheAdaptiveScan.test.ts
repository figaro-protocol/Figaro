import { describe, it, expect } from "vitest";
import { getLogsAdaptive, isLogRangeCapError, isPrunedHistoryError } from "@/lib/kernel/eventCache";

/** A provider that refuses any range wider than `cap` blocks the way public
 *  gateways do, and otherwise returns one synthetic log per block that
 *  carries a log (so coverage — nothing skipped, nothing doubled — is
 *  checkable from the result). */
function cappingProvider(cap: bigint, latest: bigint, logBlocks: bigint[], message: string) {
    const calls: Array<[bigint, bigint]> = [];
    return {
        calls,
        getBlockNumber: async () => latest,
        getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint; address: `0x${string}`; event: unknown }) => {
            calls.push([fromBlock, toBlock]);
            if (toBlock - fromBlock + 1n > cap) throw new Error(message);
            return logBlocks
                .filter((b) => b >= fromBlock && b <= toBlock)
                .map((b) => ({ blockNumber: b, transactionHash: `0x${b.toString(16)}`, logIndex: 0 }));
        },
    };
}

const ADDRESS = "0x992f81049444A5275b4F92e69805a2F8c88B6386" as const;

describe("getLogsAdaptive", () => {
    it("reads the whole range in ONE call when the provider allows it", async () => {
        const p = cappingProvider(1_000_000n, 11_500_000n, [11_488_800n, 11_499_999n], "unused");
        const logs = await getLogsAdaptive(p, { address: ADDRESS, event: undefined, fromBlock: 11_488_797n });
        expect(p.calls).toEqual([[11_488_797n, 11_500_000n]]);
        expect(logs.map((l) => l.blockNumber)).toEqual([11_488_800n, 11_499_999n]);
    });

    it("halves the window on a range-cap error and covers every block exactly once", async () => {
        // thirdweb's wording, 1 000-block cap, ~20k-block range: the scan
        // must shrink to ≤ 1 000 and walk the range without gaps or overlap.
        const latest = 11_508_790n;
        const from = 11_488_797n;
        const logBlocks = [from, from + 999n, from + 1_000n, 11_500_123n, latest];
        const p = cappingProvider(1_000n, latest, logBlocks,
            "error code -32005: Log response size exceeded. Maximum allowed number of requested blocks is 1000");
        const logs = await getLogsAdaptive(p, { address: ADDRESS, event: undefined, fromBlock: from });
        expect(logs.map((l) => l.blockNumber)).toEqual(logBlocks);
        // Successful calls tile [from, latest] contiguously.
        const ok = p.calls.filter(([a, b]) => b - a + 1n <= 1_000n);
        expect(ok[0][0]).toBe(from);
        expect(ok[ok.length - 1][1]).toBe(latest);
        for (let i = 1; i < ok.length; i++) expect(ok[i][0]).toBe(ok[i - 1][1] + 1n);
    });

    it("propagates a non-range error unchanged", async () => {
        const p = {
            getBlockNumber: async () => 100n,
            getLogs: async (): Promise<unknown[]> => { throw new Error("HTTP 429 Too Many Requests"); },
        };
        await expect(getLogsAdaptive(p, { address: ADDRESS, event: undefined, fromBlock: 0n })).rejects.toThrow(/429/);
    });

    // publicnode's keyless Sepolia endpoint, as the live site meets it: the
    // same eth_getLogs answers code 4444 "pruned history unavailable" from a
    // pruned backend and the logs from the next one. The error is viem's
    // RpcRequestError shape — `code` and `details` carry the RPC's answer.
    const prunedHistory = () => Object.assign(new Error("RPC Request failed.\n\nDetails: pruned history unavailable"), {
        name: "RpcRequestError", code: 4444, details: "pruned history unavailable", shortMessage: "RPC Request failed.",
    });

    it("asks the same range again on a pruned-history answer and returns its logs", async () => {
        let failures = 3;
        const calls: Array<[bigint, bigint]> = [];
        const p = {
            getBlockNumber: async () => 12_013_795n,
            getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
                calls.push([fromBlock, toBlock]);
                if (failures-- > 0) throw prunedHistory();
                return [{ blockNumber: 11_922_700n, transactionHash: "0x01", logIndex: 0 }];
            },
        };
        const logs = await getLogsAdaptive(p, { address: ADDRESS, event: undefined, fromBlock: 11_922_698n }, { retryDelayMs: () => 0 });
        expect(logs.map((l) => l.blockNumber)).toEqual([11_922_700n]);
        expect(calls).toEqual(Array(4).fill([11_922_698n, 12_013_795n]));
    });

    it("propagates the RPC's own pruned-history error once every ask is spent", async () => {
        let calls = 0;
        const p = {
            getBlockNumber: async () => 100n,
            getLogs: async (): Promise<unknown[]> => { calls++; throw prunedHistory(); },
        };
        await expect(getLogsAdaptive(p, { address: ADDRESS, event: undefined, fromBlock: 0n }, { retryDelayMs: () => 0 }))
            .rejects.toMatchObject({ code: 4444, details: "pruned history unavailable" });
        expect(calls).toBeGreaterThan(1);
    });

    it("returns nothing when the cursor is already past latest", async () => {
        const p = cappingProvider(10n, 5n, [1n], "unused");
        expect(await getLogsAdaptive(p, { address: ADDRESS, event: undefined, fromBlock: 6n })).toEqual([]);
        expect(p.calls).toEqual([]);
    });
});

describe("isLogRangeCapError", () => {
    it.each([
        "Log response size exceeded. Maximum allowed number of requested blocks is 1000",
        "ranges over 10000 blocks are not supported on free plan",
        "exceed maximum block range: 50000",
        "eth_getLogs is limited to 0 - 50 blocks range",
        "query returned more than 10000 results",
    ])("recognizes %s", (msg) => {
        expect(isLogRangeCapError(new Error(msg))).toBe(true);
    });
    it("does not mistake other failures for a range cap", () => {
        expect(isLogRangeCapError(new Error("HTTP request failed. Status: 429"))).toBe(false);
    });
});

describe("isPrunedHistoryError", () => {
    it("recognizes publicnode's answer by its code and by its text", () => {
        expect(isPrunedHistoryError(Object.assign(new Error("RPC Request failed."), { code: 4444 }))).toBe(true);
        expect(isPrunedHistoryError(new Error("Details: pruned history unavailable"))).toBe(true);
    });
    it("does not mistake a range cap or a rate limit for it", () => {
        expect(isPrunedHistoryError(new Error("exceed maximum block range: 50000"))).toBe(false);
        expect(isPrunedHistoryError(new Error("HTTP request failed. Status: 429"))).toBe(false);
    });
});
