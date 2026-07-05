import { describe, it, expect, vi } from "vitest";
import {
    maxOrdersResolvableForGasLimit,
    maxCommitsLandableForGasLimit,
    maxOrdersResolvablePerProcess,
    readProcessResolveCapacity,
    assertOrderFitsResolveCap,
    type ResolveCapReader,
} from "../src/gasCeilings.js";

const MAINNET_GAS_LIMIT = 30_000_000n;
const ZERO_PROCESS_ID = `0x${"0".repeat(64)}` as `0x${string}`;
const PROCESS_ID = `0x${"ab".repeat(32)}` as `0x${string}`;
const CORE = `0x${"11".repeat(20)}` as `0x${string}`;

/** Stub client: a process with `activeOrderCount` on a chain with `gasLimit`. */
function stubClient(activeOrderCount: bigint, gasLimit: bigint): ResolveCapReader {
    return {
        getBlock: vi.fn(async () => ({ gasLimit })),
        readContract: vi.fn(async () => [
            `0x${"22".repeat(20)}`,
            `0x${"33".repeat(20)}`,
            123n,
            activeOrderCount,
        ]),
    };
}

describe("maxOrdersResolvableForGasLimit", () => {
    it("derives the documented ~1,240-order ceiling from a 30M block", () => {
        // (30M × 95% − 38k) ÷ 23k = 1,237 — the kernel docstring's "~1,240".
        expect(maxOrdersResolvableForGasLimit(MAINNET_GAS_LIMIT)).toBe(1237);
    });

    it("scales with the chain's gas limit rather than a hardcoded cap", () => {
        expect(maxOrdersResolvableForGasLimit(60_000_000n)).toBeGreaterThan(2400);
    });

    it("returns 0 when the budget cannot cover the fixed overhead", () => {
        expect(maxOrdersResolvableForGasLimit(30_000n)).toBe(0);
    });
});

describe("maxCommitsLandableForGasLimit", () => {
    it("derives the per-block commit landing rate", () => {
        // 30M × 95% ÷ 144k = 197
        expect(maxCommitsLandableForGasLimit(MAINNET_GAS_LIMIT)).toBe(197);
    });
});

describe("maxOrdersResolvablePerProcess", () => {
    it("reads the live block gas limit", async () => {
        const client = stubClient(0n, MAINNET_GAS_LIMIT);
        await expect(maxOrdersResolvablePerProcess(client)).resolves.toBe(1237);
        expect(client.getBlock).toHaveBeenCalledWith({ blockTag: "latest" });
    });
});

describe("readProcessResolveCapacity", () => {
    it("combines the kernel activeOrderCount with the chain ceiling", async () => {
        const client = stubClient(1200n, MAINNET_GAS_LIMIT);
        const capacity = await readProcessResolveCapacity(client, CORE, PROCESS_ID);
        expect(capacity).toEqual({ activeOrderCount: 1200, cap: 1237, remaining: 37 });
        expect(client.readContract).toHaveBeenCalledWith(
            expect.objectContaining({ address: CORE, functionName: "processes", args: [PROCESS_ID] }),
        );
    });

    it("floors remaining at 0 for a process already past the cap", async () => {
        const capacity = await readProcessResolveCapacity(
            stubClient(2000n, MAINNET_GAS_LIMIT), CORE, PROCESS_ID,
        );
        expect(capacity.remaining).toBe(0);
    });
});

describe("assertOrderFitsResolveCap", () => {
    it("passes a root commitment (zero processId) without touching the chain", async () => {
        const client = stubClient(0n, MAINNET_GAS_LIMIT);
        await expect(assertOrderFitsResolveCap(client, CORE, ZERO_PROCESS_ID)).resolves.toBeUndefined();
        expect(client.readContract).not.toHaveBeenCalled();
        expect(client.getBlock).not.toHaveBeenCalled();
    });

    it("passes a sub-order into a process below the ceiling", async () => {
        const client = stubClient(10n, MAINNET_GAS_LIMIT);
        await expect(assertOrderFitsResolveCap(client, CORE, PROCESS_ID)).resolves.toBeUndefined();
    });

    it("passes the LAST order that still fits (activeOrderCount + 1 === cap)", async () => {
        const client = stubClient(1236n, MAINNET_GAS_LIMIT);
        await expect(assertOrderFitsResolveCap(client, CORE, PROCESS_ID)).resolves.toBeUndefined();
    });

    it("refuses the order that would make the process unresolvable", async () => {
        const client = stubClient(1237n, MAINNET_GAS_LIMIT);
        await expect(assertOrderFitsResolveCap(client, CORE, PROCESS_ID)).rejects.toThrow(
            /permanently unresolvable/,
        );
    });
});
