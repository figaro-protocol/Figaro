import { describe, it, expect, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters, type Log, type PublicClient } from "viem";
import { CORE_ABI } from "../src/abis.js";
import { fetchLogsChunked, DEFAULT_LOG_CHUNK_SIZE, fetchCoreEvents, PRUNED_HISTORY_ATTEMPTS, RATE_LIMIT_ATTEMPTS, logReadRetry } from "../src/events.js";
import { fetchDiscoveryEvents } from "../src/discovery.js";
import type { Address, FigaroAddresses } from "../src/types.js";

const ADDRESS = "0x000000000000000000000000000000000000c0de" as Address;

function fakeLog(blockNumber: bigint, address: string = ADDRESS): Log {
    return { blockNumber, address } as unknown as Log;
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
    it("refuses a node that answers with another contract's log", async () => {
        // The parsers decode by topic: another contract's event with the same
        // signature would read as this one's.
        const foreign = "0x000000000000000000000000000000000000beef";
        const client = mockClient([fakeLog(1n), fakeLog(2n, foreign)]);
        await expect(fetchLogsChunked(client, { address: ADDRESS, fromBlock: 0n, toBlock: 5n }))
            .rejects.toThrow(/answered a log query for .* with a log from 0x0+beef/i);
    });

    it("accepts the queried address in any letter case", async () => {
        const client = mockClient([fakeLog(1n, ADDRESS.toUpperCase().replace("0X", "0x"))]);
        const logs = await fetchLogsChunked(client, { address: ADDRESS, fromBlock: 0n, toBlock: 5n });
        expect(logs).toHaveLength(1);
    });

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

describe("fetchCoreEvents folds both resolution paths", () => {
    const CORE = "0x00000000000000000000000000000000000c0e00" as Address;
    const VERIFIER = "0x0000000000000000000000000000000000ba7c00" as Address;
    const BUYER = "0x00000000000000000000000000000000000b0b00" as Address;
    const SELLER = "0x0000000000000000000000000000000000005e11" as Address;
    const TOKEN = "0x0000000000000000000000000000000000007070" as Address;
    const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;

    /** A real `OrderCommitted` log, encoded with the Core's ABI, under `address`. */
    function committed(address: Address, orderN: number, blockNumber: bigint, logIndex: number): Log {
        const { data, topics } = {
            data: encodeAbiParameters(
                parseAbiParameters("address, address, uint256, uint256, bytes32, uint256, uint256"),
                [SELLER, TOKEN, 10n, 10n, id(0xc0), 1n, 2n],
            ),
            topics: encodeEventTopics({
                abi: CORE_ABI,
                eventName: "OrderCommitted",
                args: { orderHash: id(orderN), processId: id(orderN), buyer: BUYER },
            }),
        };
        return { address, blockNumber, logIndex, data, topics, transactionHash: id(0xf0 + orderN) } as unknown as Log;
    }

    function resolved(address: Address, orderN: number, blockNumber: bigint, logIndex: number): Log {
        return {
            address,
            blockNumber,
            logIndex,
            data: encodeAbiParameters(parseAbiParameters("uint256, uint256"), [10n, 20n]),
            topics: encodeEventTopics({
                abi: CORE_ABI,
                eventName: "OrderResolved",
                args: { orderHash: id(orderN), processId: id(orderN) },
            }),
        } as unknown as Log;
    }

    /** Answers each `getLogs` with the logs under the queried address only. */
    function twoContractClient(allLogs: Log[]): PublicClient {
        const getLogs = vi.fn(async ({ address, fromBlock, toBlock }: { address: Address; fromBlock: bigint; toBlock: bigint }) =>
            allLogs.filter((l) =>
                l.address.toLowerCase() === address.toLowerCase()
                && (l.blockNumber as bigint) >= fromBlock && (l.blockNumber as bigint) <= toBlock),
        );
        const getBlockNumber = vi.fn(async () => 50n);
        return { getLogs, getBlockNumber } as unknown as PublicClient;
    }

    const LOGS = [
        committed(CORE, 1, 3n, 0),
        committed(VERIFIER, 2, 3n, 4),
        committed(VERIFIER, 3, 5n, 1),
        committed(CORE, 4, 5n, 7),
        resolved(VERIFIER, 2, 9n, 0),
        resolved(CORE, 1, 8n, 2),
    ];

    it("parses the verifier's order events beside the Core's and returns them in chain order", async () => {
        const client = twoContractClient(LOGS);
        const events = await fetchCoreEvents(client, { core: CORE, batchVerifier: VERIFIER }, 0n);
        expect(events.orderCommitted.map((e) => e.orderHash)).toEqual([id(1), id(2), id(3), id(4)]);
        expect(events.orderCommitted.map((e) => e.blockNumber)).toEqual([3, 3, 5, 5]);
        expect(events.orderCommitted.every((e) => e.seller === SELLER && e.payment === 10n)).toBe(true);
        expect(events.orderResolved.map((e) => e.orderHash)).toEqual([id(1), id(2)]);
        // "latest" is resolved once, so both addresses are read over one range.
        expect(client.getBlockNumber).toHaveBeenCalledTimes(1);
        expect(client.getLogs).toHaveBeenCalledWith({ address: CORE, fromBlock: 0n, toBlock: 50n });
        expect(client.getLogs).toHaveBeenCalledWith({ address: VERIFIER, fromBlock: 0n, toBlock: 50n });
    });

    it("reads the Core alone when no batch verifier is configured", async () => {
        const client = twoContractClient(LOGS);
        const events = await fetchCoreEvents(client, { core: CORE }, 0n, 50n);
        expect(client.getLogs).toHaveBeenCalledTimes(1);
        expect(client.getLogs).toHaveBeenCalledWith({ address: CORE, fromBlock: 0n, toBlock: 50n });
        expect(events.orderCommitted.map((e) => e.orderHash)).toEqual([id(1), id(4)]);
        expect(events.orderResolved.map((e) => e.orderHash)).toEqual([id(1)]);
    });
});

describe("fetchLogsChunked on a pruned-history answer (publicnode's keyless Sepolia, code 4444)", () => {
    /** viem's wrapping of the node's JSON-RPC error: the code on the error and
     *  the node's message in `details`. */
    function prunedError(): Error {
        return Object.assign(new Error("RPC Request failed."), { code: 4444, details: "pruned history unavailable" });
    }

    /** Answers `failures` pruned-history errors first, then the logs in range. */
    function prunedThenServing(allLogs: Log[], failures: number, error: () => unknown = prunedError): PublicClient {
        let left = failures;
        const getLogs = vi.fn(async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
            if (left > 0) {
                left -= 1;
                throw error();
            }
            return allLogs.filter((l) => (l.blockNumber as bigint) >= fromBlock && (l.blockNumber as bigint) <= toBlock);
        });
        return { getLogs, getBlockNumber: vi.fn(async () => 25n) } as unknown as PublicClient;
    }
    const noDelay = () => 0;

    it("asks the same sub-range again and returns its logs", async () => {
        const logs = [fakeLog(3n), fakeLog(12n)];
        const client = prunedThenServing(logs, 2);
        const result = await fetchLogsChunked(client, { address: ADDRESS, fromBlock: 0n, toBlock: 25n, chunkSize: 10n, retryDelayMs: noDelay });
        expect(result).toEqual(logs);
        // Two refusals of the first sub-range, then the three sub-ranges.
        expect(client.getLogs).toHaveBeenCalledTimes(5);
        expect(client.getLogs).toHaveBeenNthCalledWith(1, { address: ADDRESS, fromBlock: 0n, toBlock: 9n });
        expect(client.getLogs).toHaveBeenNthCalledWith(3, { address: ADDRESS, fromBlock: 0n, toBlock: 9n });
        expect(client.getLogs).toHaveBeenNthCalledWith(4, { address: ADDRESS, fromBlock: 10n, toBlock: 19n });
    });

    it("recognizes the answer by its text when the code is not on the error", async () => {
        const client = prunedThenServing([fakeLog(1n)], 1, () => new Error("HTTP request failed. Details: pruned history unavailable"));
        const result = await fetchLogsChunked(client, { address: ADDRESS, fromBlock: 0n, toBlock: 5n, retryDelayMs: noDelay });
        expect(result).toHaveLength(1);
    });

    it("gives up after PRUNED_HISTORY_ATTEMPTS asks of one sub-range and throws the node's last answer", async () => {
        const client = prunedThenServing([], Number.MAX_SAFE_INTEGER);
        await expect(fetchLogsChunked(client, { address: ADDRESS, fromBlock: 0n, toBlock: 5n, retryDelayMs: noDelay }))
            .rejects.toMatchObject({ code: 4444 });
        expect(client.getLogs).toHaveBeenCalledTimes(PRUNED_HISTORY_ATTEMPTS);
    });

    it("propagates any other error on the first answer", async () => {
        const client = prunedThenServing([], 1, () => new Error("execution reverted"));
        await expect(fetchLogsChunked(client, { address: ADDRESS, fromBlock: 0n, toBlock: 5n, retryDelayMs: noDelay }))
            .rejects.toThrow(/execution reverted/);
        expect(client.getLogs).toHaveBeenCalledTimes(1);
    });

    it("carries the retry into fetchCoreEvents and fetchDiscoveryEvents", async () => {
        const core = prunedThenServing([], 1);
        await expect(fetchCoreEvents(core, { core: ADDRESS }, 0n, 25n)).resolves.toMatchObject({ orderCommitted: [] });
        expect(core.getLogs).toHaveBeenCalledTimes(2);

        const registries = prunedThenServing([], 1);
        await expect(fetchDiscoveryEvents(registries, { core: ADDRESS, clauseRegistry: ADDRESS } as FigaroAddresses, 0n, 25n))
            .resolves.toBeDefined();
        expect(registries.getLogs).toHaveBeenCalledTimes(2);
    });
});

describe("fetchLogsChunked on a rate-limit answer (HTTP 429, the keyless node under concurrent readers)", () => {
    /** viem's HttpRequestError for a 429: the status on the error, the
     *  node's body in `details`. */
    function http429(): Error {
        return Object.assign(new Error("HTTP request failed.\n\nStatus: 429\nDetails: Rate limit exceeded"), {
            name: "HttpRequestError", status: 429, details: "Rate limit exceeded", shortMessage: "HTTP request failed.",
        });
    }
    /** The same refusal as a JSON-RPC error body, which carries no status. */
    function rpcRateLimit(): Error {
        return Object.assign(new Error("RPC Request failed.\n\nDetails: Rate limit exceeded"), {
            name: "RpcRequestError", code: -32005, details: "Rate limit exceeded",
        });
    }
    function failingThenServing(allLogs: Log[], failures: number, error: () => unknown): PublicClient {
        let left = failures;
        const getLogs = vi.fn(async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
            if (left > 0) {
                left -= 1;
                throw error();
            }
            return allLogs.filter((l) => (l.blockNumber as bigint) >= fromBlock && (l.blockNumber as bigint) <= toBlock);
        });
        return { getLogs, getBlockNumber: vi.fn(async () => 25n) } as unknown as PublicClient;
    }
    const noDelay = () => 0;

    it.each([["an HTTP 429", http429], ["a JSON-RPC rate-limit body", rpcRateLimit]])(
        "asks the same sub-range again after %s and returns its logs",
        async (_label, error) => {
            const logs = [fakeLog(3n), fakeLog(12n)];
            const client = failingThenServing(logs, 2, error);
            const result = await fetchLogsChunked(client, { address: ADDRESS, fromBlock: 0n, toBlock: 25n, chunkSize: 10n, retryDelayMs: noDelay });
            expect(result).toEqual(logs);
            expect(client.getLogs).toHaveBeenCalledTimes(5);
            expect(client.getLogs).toHaveBeenNthCalledWith(3, { address: ADDRESS, fromBlock: 0n, toBlock: 9n });
        },
    );

    it("gives up after RATE_LIMIT_ATTEMPTS asks of one sub-range and throws the node's last answer", async () => {
        const client = failingThenServing([], Number.MAX_SAFE_INTEGER, http429);
        await expect(fetchLogsChunked(client, { address: ADDRESS, fromBlock: 0n, toBlock: 5n, retryDelayMs: noDelay }))
            .rejects.toMatchObject({ status: 429 });
        expect(client.getLogs).toHaveBeenCalledTimes(RATE_LIMIT_ATTEMPTS);
    });

    it("keeps a rate limit's budget and pause apart from a run of pruned-history answers before it", async () => {
        const pruned = () => Object.assign(new Error("RPC Request failed."), { code: 4444, details: "pruned history unavailable" });
        const answers: Array<() => unknown> = [...Array(10).fill(pruned), http429];
        const getLogs = vi.fn(async () => {
            const next = answers.shift();
            if (next) throw next();
            return [fakeLog(1n)];
        });
        const client = { getLogs, getBlockNumber: vi.fn(async () => 5n) } as unknown as PublicClient;
        const pauses: number[] = [];
        const result = await fetchLogsChunked(client, {
            address: ADDRESS, fromBlock: 0n, toBlock: 5n,
            retryDelayMs: (attempt) => { pauses.push(attempt); return 0; },
        });
        expect(result).toHaveLength(1);
        expect(getLogs).toHaveBeenCalledTimes(12);
        // The 429 is that kind's first ask, so its pause starts at attempt 1.
        expect(pauses).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1]);
    });
});

describe("logReadRetry", () => {
    it("names a retry for pruned history and for a rate limit, by code, status and text", () => {
        expect(logReadRetry(Object.assign(new Error("RPC Request failed."), { code: 4444 }))?.attempts).toBe(PRUNED_HISTORY_ATTEMPTS);
        expect(logReadRetry(new Error("Details: pruned history unavailable"))?.attempts).toBe(PRUNED_HISTORY_ATTEMPTS);
        expect(logReadRetry(Object.assign(new Error("HTTP request failed."), { status: 429 }))?.attempts).toBe(RATE_LIMIT_ATTEMPTS);
        expect(logReadRetry(new Error("HTTP request failed. Status: 429"))?.attempts).toBe(RATE_LIMIT_ATTEMPTS);
        expect(logReadRetry(new Error("Rate limit exceeded"))?.attempts).toBe(RATE_LIMIT_ATTEMPTS);
        expect(logReadRetry(new Error("429 Too Many Requests"))?.attempts).toBe(RATE_LIMIT_ATTEMPTS);
        // viem nests the transport's error under `cause`.
        const wrapped = Object.assign(new Error("An unknown RPC error occurred."), { cause: Object.assign(new Error("HTTP request failed."), { status: 429 }) });
        expect(logReadRetry(wrapped)?.attempts).toBe(RATE_LIMIT_ATTEMPTS);
    });
    it("backs a rate limit off further than pruned history, and never past its ceiling", () => {
        const pruned = logReadRetry(Object.assign(new Error("x"), { code: 4444 }))!;
        const limited = logReadRetry(Object.assign(new Error("x"), { status: 429 }))!;
        expect(limited.delayMs(1)).toBeGreaterThanOrEqual(pruned.delayMs(1));
        for (let a = 1; a < RATE_LIMIT_ATTEMPTS; a++) {
            expect(limited.delayMs(a + 1)).toBeGreaterThan(0);
            expect(limited.delayMs(a)).toBeLessThanOrEqual(8_000);
        }
    });
    it("names no retry for a range cap, a revert or a malformed answer", () => {
        expect(logReadRetry(new Error("exceed maximum block range: 50000"))).toBeNull();
        expect(logReadRetry(new Error("error code -32005: Log response size exceeded. Maximum allowed number of requested blocks is 1000"))).toBeNull();
        expect(logReadRetry(new Error("execution reverted"))).toBeNull();
        expect(logReadRetry(null)).toBeNull();
        expect(logReadRetry("boom")).toBeNull();
    });
});
