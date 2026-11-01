import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    maxOrdersResolvableForGasLimit,
    TRANSACTION_GAS_CAP,
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
    it("is bounded by the chain's cap on one transaction, whatever the block holds", () => {
        // 73k + 30k·N + (23·N)²/512 ≤ 2^24 at N = 546 — the resolve is one transaction.
        expect(TRANSACTION_GAS_CAP).toBe(16_777_216n);
        expect(maxOrdersResolvableForGasLimit(MAINNET_GAS_LIMIT)).toBe(546);
        expect(maxOrdersResolvableForGasLimit(60_000_000n)).toBe(546);
        expect(maxOrdersResolvableForGasLimit(200_000_000n)).toBe(546);
    });

    it("scales with the chain's gas limit on a chain without the cap", () => {
        // 73k + 30k·N + (23·N)²/512 ≤ 30M × 95% at N = 918 — the block alone.
        const uncapped = 1n << 62n;
        expect(maxOrdersResolvableForGasLimit(MAINNET_GAS_LIMIT, uncapped)).toBe(918);
        expect(maxOrdersResolvableForGasLimit(60_000_000n, uncapped)).toBe(1787);
        // A block smaller than the cap is the bound.
        expect(maxOrdersResolvableForGasLimit(10_000_000n)).toBe(maxOrdersResolvableForGasLimit(10_000_000n, uncapped));
    });

    it("carries the memory the resolve expands into, quadratic in the orders", () => {
        // The receipt line alone (73k + 30k·N) admits 556 under 2^24; the
        // resolve's memory, (23·N)²/512, takes ten of them back.
        const uncapped = 1n << 62n;
        const at = (n: number) => 73_000n + 30_000n * BigInt(n) + (23n * BigInt(n)) ** 2n / 512n;
        expect(at(546) <= TRANSACTION_GAS_CAP && at(547) > TRANSACTION_GAS_CAP).toBe(true);
        expect(maxOrdersResolvableForGasLimit(at(546) * 100n / 95n + 1n, uncapped)).toBe(546);
    });

    it("returns 0 when the budget cannot cover the fixed overhead", () => {
        expect(maxOrdersResolvableForGasLimit(30_000n)).toBe(0);
    });
});

describe("maxCommitsLandableForGasLimit", () => {
    it("derives the per-block commit landing rate", () => {
        // 30M × 95% ÷ 383k = 74
        expect(maxCommitsLandableForGasLimit(MAINNET_GAS_LIMIT)).toBe(74);
    });
});

describe("maxOrdersResolvablePerProcess", () => {
    it("reads the live block gas limit", async () => {
        const client = stubClient(0n, MAINNET_GAS_LIMIT);
        await expect(maxOrdersResolvablePerProcess(client)).resolves.toBe(546);
        expect(client.getBlock).toHaveBeenCalledWith({ blockTag: "latest" });
    });
});

describe("readProcessResolveCapacity", () => {
    it("combines FigaroCore's activeOrderCount with the chain ceiling", async () => {
        const client = stubClient(500n, MAINNET_GAS_LIMIT);
        const capacity = await readProcessResolveCapacity(client, CORE, PROCESS_ID);
        expect(capacity).toEqual({ activeOrderCount: 500, cap: 546, remaining: 46 });
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
        const client = stubClient(545n, MAINNET_GAS_LIMIT);
        await expect(assertOrderFitsResolveCap(client, CORE, PROCESS_ID)).resolves.toBeUndefined();
    });

    it("refuses the order that would make the process unresolvable", async () => {
        const client = stubClient(546n, MAINNET_GAS_LIMIT);
        await expect(assertOrderFitsResolveCap(client, CORE, PROCESS_ID)).rejects.toThrow(
            /permanently unresolvable/,
        );
    });
});

// The resolve model's memory term lives in two copies: the SDK's ceiling and the Foundry test that
// measures it at the published cap. Each is read from its source, so a figure changed on one side
// fails here, in CI, before the cap it publishes drifts from what was measured.
describe("the resolve memory constants, SDK and Foundry in lockstep", () => {
    const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const read = (rel: string) => readFileSync(path.join(repo, rel), "utf8");
    const constant = (src: string, name: string): string => {
        const m = src.match(new RegExp(`\\b${name}\\s*=\\s*(\\d[\\d_]*)n?\\s*;`));
        if (!m) throw new Error(`${name} not found`);
        return m[1].replace(/_/g, "");
    };
    const sdk = read("sdk/src/gasCeilings.ts");
    const forge = read("test/core/kernel/GasCeilingTest.t.sol");
    for (const name of ["RESOLVE_MEMORY_WORDS_PER_ORDER", "RESOLVE_MEMORY_QUADRATIC_DIVISOR"]) {
        it(`${name} is the same in sdk/src/gasCeilings.ts and GasCeilingTest.t.sol`, () => {
            expect(constant(sdk, name)).toBe(constant(forge, name));
        });
    }
});
