/**
 * The SDK's shared predicates and readers, from the package entry: one home
 * for each shape check (`types.ts`) and the chunked log reader other surfaces
 * adopt in place of their own copies.
 */
import { describe, expect, it, vi } from "vitest";
import type { Log, PublicClient } from "viem";
import * as sdk from "../src/index.js";

describe("the shape predicates (src/types.ts)", () => {
    it("isBytes32Hex and isAddressHex take exactly 32 and 20 bytes of hex, either case", () => {
        expect(sdk.isBytes32Hex(`0x${"aB".repeat(32)}`)).toBe(true);
        expect(sdk.isBytes32Hex(`0x${"ab".repeat(31)}`)).toBe(false);
        expect(sdk.isBytes32Hex(`0x${"ab".repeat(32)}0`)).toBe(false);
        expect(sdk.isBytes32Hex(`0x${"zz".repeat(32)}`)).toBe(false);
        expect(sdk.isBytes32Hex(32)).toBe(false);
        expect(sdk.isAddressHex(`0x${"Cd".repeat(20)}`)).toBe(true);
        expect(sdk.isAddressHex(`0x${"cd".repeat(21)}`)).toBe(false);
        expect(sdk.isAddressHex(`${"cd".repeat(20)}`)).toBe(false);
    });

    it("isDecimalIntegerString takes the published format's decimal integer and nothing BigInt would coerce", () => {
        for (const ok of ["0", "-1", "123456789012345678901234567890", "007"]) expect(sdk.isDecimalIntegerString(ok), ok).toBe(true);
        for (const no of ["", "-", "+1", " 1", "1 ", "0x10", "1.0", "1e3", "١٢"]) expect(sdk.isDecimalIntegerString(no), no).toBe(false);
        expect(sdk.isDecimalIntegerString(12)).toBe(false);
    });

    it("isPlainRecord takes an object, never null or an array", () => {
        expect(sdk.isPlainRecord({})).toBe(true);
        expect(sdk.isPlainRecord(Object.create(null))).toBe(true);
        expect(sdk.isPlainRecord(new Date(0))).toBe(true);
        for (const no of [null, undefined, [], "x", 1, true]) expect(sdk.isPlainRecord(no), String(no)).toBe(false);
    });
});

describe("the chunked log reader, from the package entry", () => {
    it("DEFAULT_LOG_CHUNK_SIZE is 9,500 blocks, under the 10,000-block cap public RPCs set", () => {
        expect(sdk.DEFAULT_LOG_CHUNK_SIZE).toBe(9_500n);
    });

    it("fetchLogsChunked reads a range in chunks of the default size, each range inclusive", async () => {
        const getLogs = vi.fn(async () => [] as Log[]);
        await sdk.fetchLogsChunked({ getLogs } as unknown as PublicClient, {
            address: "0x0000000000000000000000000000000000000001", fromBlock: 0n, toBlock: 19_000n,
        });
        expect(getLogs.mock.calls.map((c) => {
            const { fromBlock, toBlock } = (c as unknown as [{ fromBlock: bigint; toBlock: bigint }])[0];
            return [fromBlock, toBlock];
        })).toEqual([[0n, 9_499n], [9_500n, 18_999n], [19_000n, 19_000n]]);
    });
});
