import { describe, it, expect, vi } from "vitest";
import type { Log, PublicClient } from "viem";
import { fetchLogsChunked, DEFAULT_LOG_CHUNK_SIZE, fetchCoreEvents } from "../src/events.js";
import type { Address, FigaroAddresses } from "../src/types.js";

const ADDRESS = "0x000000000000000000000000000000000000c0de" as Address;

function fakeLog(blockNumber: bigint): Log {
    return { blockNumber } as unknown as Log;
}

/** A stub client whose `getLogs` answers from a fixed in-memory log set,
 *  filtered to the requested [fromBlock, toBlock] — so a chunked caller
 *  reconstructs exactly what an unchunked call over the same total range
 *  would return, and every call's args are recorded for assertion. */
function mockClient(allLogs: Log[], latest = 999_999n): PublicClient {
    const getLogs = vi.fn(async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) =>
        allLogs.filter((l) => (l.blockNumber as bigint) >= fromBlock && (l.blockNumber as bigint) <= toBlock),
    );
    const getBlockNumber = vi.fn(async () => latest);
    return { getLogs, getBlockNumber } as unknown as PublicClient;
}

describe("fetchLogsChunked", () => {
    it("issues one call per chunk with contiguous, non-overlapping, inclusive sub-ranges (exact boundary)", async () => {
        const client = mockClient([]);
        await fetchLogsChunked(client, { address: ADDRESS, fromBlock: 0n, toBlock: 25n, chunkSize: 10n });
        expect(client.getLogs).toHaveBeenCalledTimes(3);
        expect(client.getLogs).toHaveBeenNthCalledWith(1, { address: ADDRESS, fromBlock: 0n, toBlock: 9n });
        expect(client.getLogs).toHaveBeenNthCalledWith(2, { address: ADDRESS, fromBlock: 10n, toBlock: 19n });
        expect(client.getLogs).toHaveBeenNthCalledWith(3, { address: ADDRESS, fromBlock: 20n, toBlock: 25n });
    });

    it("concatenates results across chunks in block order", async () => {
        const logs = [fakeLog(0n), fakeLog(9n), fakeLog(10n), fakeLog(24n), fakeLog(25n)];
        const client = mockClient(logs);
        const result = await fetchLogsChunked(client, { address: ADDRESS, fromBlock: 0n, toBlock: 25n, chunkSize: 10n });
        expect(result).toEqual(logs);
    });

    it("respects a custom chunkSize", async () => {
        const client = mockClient([]);
        await fetchLogsChunked(client, { address: ADDRESS, fromBlock: 0n, toBlock: 99n, chunkSize: 25n });
        expect(client.getLogs).toHaveBeenCalledTimes(4);
        expect(client.getLogs).toHaveBeenNthCalledWith(4, { address: ADDRESS, fromBlock: 75n, toBlock: 99n });
    });

    it("issues exactly one call when the range is smaller than one chunk (devnet behavior unchanged)", async () => {
        const client = mockClient([]);
        await fetchLogsChunked(client, {
            address: ADDRESS,
            fromBlock: 5n,
            toBlock: 8n,
            chunkSize: DEFAULT_LOG_CHUNK_SIZE,
        });
        expect(client.getLogs).toHaveBeenCalledTimes(1);
        expect(client.getLogs).toHaveBeenCalledWith({ address: ADDRESS, fromBlock: 5n, toBlock: 8n });
    });

    it('resolves toBlock: "latest" once via getBlockNumber and chunks against that snapshot', async () => {
        const client = mockClient([], 22n);
        await fetchLogsChunked(client, { address: ADDRESS, fromBlock: 0n, toBlock: "latest", chunkSize: 10n });
        expect(client.getBlockNumber).toHaveBeenCalledTimes(1);
        expect(client.getLogs).toHaveBeenCalledTimes(3);
        expect(client.getLogs).toHaveBeenNthCalledWith(3, { address: ADDRESS, fromBlock: 20n, toBlock: 22n });
    });
});

describe("fetchCoreEvents chunking", () => {
    it("threads a custom chunkSize through to the underlying getLogs calls", async () => {
        const client = mockClient([]);
        const addresses: FigaroAddresses = { core: ADDRESS };
        await fetchCoreEvents(client, addresses, 0n, 25n, 10n);
        expect(client.getLogs).toHaveBeenCalledTimes(3);
    });

    it("defaults to DEFAULT_LOG_CHUNK_SIZE, issuing one call on a devnet-sized range", async () => {
        const client = mockClient([]);
        const addresses: FigaroAddresses = { core: ADDRESS };
        await fetchCoreEvents(client, addresses, 0n, 100n);
        expect(client.getLogs).toHaveBeenCalledTimes(1);
        expect(client.getLogs).toHaveBeenCalledWith({ address: ADDRESS, fromBlock: 0n, toBlock: 100n });
    });
});
