import { describe, it, expect } from "vitest";
import { getLogsAdaptive, isLogRangeCapError } from "@/lib/kernel/eventCache";

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
    ])("recognises %s", (msg) => {
        expect(isLogRangeCapError(new Error(msg))).toBe(true);
    });
    it("does not mistake other failures for a range cap", () => {
        expect(isLogRangeCapError(new Error("HTTP request failed. Status: 429"))).toBe(false);
    });
});
