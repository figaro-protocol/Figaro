/**
 * Cross-endpoint log agreement: divergent public-RPC answers over the SAME
 * pinned range must surface as a verdict, never stay a silent under-report.
 * The fixtures mirror the observed failure shape — one endpoint of a
 * load-balanced provider answering short.
 */
import { describe, it, expect, vi } from "vitest";
import type { Log, PublicClient } from "viem";
import {
    checkEndpointLogAgreement,
    fetchEndpointLogAgreement,
} from "../src/logAgreement.js";
import type { Address } from "../src/types.js";

const ADDRESS = "0x000000000000000000000000000000000000c0de" as Address;
const RANGE = { fromBlock: 100n, toBlock: 200n };

interface Ev { id: string }
const ev = (id: string): Ev => ({ id });
const keyOf = (e: Ev) => e.id;

describe("checkEndpointLogAgreement", () => {
    it("agreeing endpoints: empty delta, verdict 'agree'", () => {
        const report = checkEndpointLogAgreement(RANGE, [
            { endpoint: "a", events: [ev("x"), ev("y")] },
            { endpoint: "b", events: [ev("y"), ev("x")] },
        ], keyOf);
        expect(report.verdict).toBe("agree");
        expect(report.unionCount).toBe(2);
        expect(report.intersectionCount).toBe(2);
        expect(report.disputedKeys).toEqual([]);
        expect(report.endpoints).toEqual([
            { endpoint: "a", count: 2, missing: [] },
            { endpoint: "b", count: 2, missing: [] },
        ]);
        expect(report.fromBlock).toBe(100n);
        expect(report.toBlock).toBe(200n);
    });

    it("an endpoint answering short: its missing keys named, verdict 'diverge'", () => {
        // The observed shape: same range, one endpoint returns 2 events, the
        // other 0 — the short endpoint's reader would have seen nothing.
        const report = checkEndpointLogAgreement(RANGE, [
            { endpoint: "rpc-1", events: [ev("x"), ev("y")] },
            { endpoint: "rpc-2", events: [] },
        ], keyOf);
        expect(report.verdict).toBe("diverge");
        expect(report.unionCount).toBe(2);
        expect(report.intersectionCount).toBe(0);
        expect(report.disputedKeys).toEqual(["x", "y"]);
        expect(report.endpoints).toEqual([
            { endpoint: "rpc-1", count: 2, missing: [] },
            { endpoint: "rpc-2", count: 0, missing: ["x", "y"] },
        ]);
    });

    it("three endpoints, each missing something different: every gap attributed", () => {
        const report = checkEndpointLogAgreement(RANGE, [
            { endpoint: "a", events: [ev("x"), ev("y")] },
            { endpoint: "b", events: [ev("y"), ev("z")] },
            { endpoint: "c", events: [ev("x"), ev("y"), ev("z")] },
        ], keyOf);
        expect(report.verdict).toBe("diverge");
        expect(report.unionCount).toBe(3);
        expect(report.intersectionCount).toBe(1); // only "y" is unanimous
        expect(report.disputedKeys).toEqual(["x", "z"]);
        expect(report.endpoints).toEqual([
            { endpoint: "a", count: 2, missing: ["z"] },
            { endpoint: "b", count: 2, missing: ["x"] },
            { endpoint: "c", count: 3, missing: [] },
        ]);
    });

    it("duplicate events within one endpoint collapse to one key", () => {
        const report = checkEndpointLogAgreement(RANGE, [
            { endpoint: "a", events: [ev("x"), ev("x")] },
            { endpoint: "b", events: [ev("x")] },
        ], keyOf);
        expect(report.verdict).toBe("agree");
        expect(report.endpoints[0]!.count).toBe(1);
    });

    it("a single endpoint is 'unchecked' — corroboration needs a second witness", () => {
        const report = checkEndpointLogAgreement(RANGE, [
            { endpoint: "only", events: [ev("x")] },
        ], keyOf);
        expect(report.verdict).toBe("unchecked");
        expect(report.unionCount).toBe(1);
        expect(report.disputedKeys).toEqual([]);
    });

    it("no endpoints at all is 'unchecked' with an empty report, never a throw", () => {
        const report = checkEndpointLogAgreement(RANGE, [], keyOf);
        expect(report.verdict).toBe("unchecked");
        expect(report.endpoints).toEqual([]);
        expect(report.unionCount).toBe(0);
        expect(report.intersectionCount).toBe(0);
    });

    it("both endpoints empty: they agree on absence", () => {
        const report = checkEndpointLogAgreement(RANGE, [
            { endpoint: "a", events: [] },
            { endpoint: "b", events: [] },
        ], keyOf);
        expect(report.verdict).toBe("agree");
        expect(report.unionCount).toBe(0);
    });
});

describe("fetchEndpointLogAgreement", () => {
    function fakeLog(blockNumber: bigint, transactionHash: string, logIndex: number): Log {
        return { blockNumber, transactionHash, logIndex } as unknown as Log;
    }

    /** A stub client answering the pinned range from a fixed log set. */
    function mockClient(allLogs: Log[]): PublicClient {
        const getLogs = vi.fn(async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) =>
            allLogs.filter((l) => (l.blockNumber as bigint) >= fromBlock && (l.blockNumber as bigint) <= toBlock),
        );
        return { getLogs } as unknown as PublicClient;
    }

    const L1 = fakeLog(110n, "0xaaa", 0);
    const L2 = fakeLog(150n, "0xbbb", 3);

    it("fetches the same pinned range from every client and reports divergence", async () => {
        const full = mockClient([L1, L2]);
        const short = mockClient([L1]);
        const report = await fetchEndpointLogAgreement(
            [
                { endpoint: "https://rpc-full.example", client: full },
                { endpoint: "https://rpc-short.example", client: short },
            ],
            { address: ADDRESS, fromBlock: 100n, toBlock: 200n },
        );
        expect(report.verdict).toBe("diverge");
        expect(report.unionCount).toBe(2);
        expect(report.endpoints).toEqual([
            { endpoint: "https://rpc-full.example", count: 2, missing: [] },
            { endpoint: "https://rpc-short.example", count: 1, missing: ["150:0xbbb:3"] },
        ]);
        // Every client was asked the SAME pinned range.
        expect(full.getLogs).toHaveBeenCalledWith({ address: ADDRESS, fromBlock: 100n, toBlock: 200n });
        expect(short.getLogs).toHaveBeenCalledWith({ address: ADDRESS, fromBlock: 100n, toBlock: 200n });
    });

    it("identical answers agree", async () => {
        const report = await fetchEndpointLogAgreement(
            [
                { endpoint: "a", client: mockClient([L1, L2]) },
                { endpoint: "b", client: mockClient([L1, L2]) },
            ],
            { address: ADDRESS, fromBlock: 100n, toBlock: 200n },
        );
        expect(report.verdict).toBe("agree");
        expect(report.disputedKeys).toEqual([]);
    });

    it("a client that throws propagates — an unreachable endpoint is not a divergent one", async () => {
        const bad = {
            getLogs: vi.fn(async () => { throw new Error("endpoint down"); }),
        } as unknown as PublicClient;
        await expect(fetchEndpointLogAgreement(
            [
                { endpoint: "a", client: mockClient([L1]) },
                { endpoint: "b", client: bad },
            ],
            { address: ADDRESS, fromBlock: 100n, toBlock: 200n },
        )).rejects.toThrow("endpoint down");
    });
});
