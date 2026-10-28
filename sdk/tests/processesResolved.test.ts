import { describe, it, expect, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters, type Log, type PublicClient } from "viem";
import { CORE_ABI } from "../src/abis.js";
import { fetchProcessesResolved } from "../src/events.js";
import type { Address } from "../src/types.js";

const CORE = "0x00000000000000000000000000000000000c0e00" as Address;
const VERIFIER = "0x0000000000000000000000000000000000ba7c00" as Address;
const BUYER = "0x00000000000000000000000000000000000b0b00" as Address;
const TOKEN = "0x0000000000000000000000000000000000007070" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;

/** A real `ProcessResolved` log, encoded with the Core's ABI, under `address`. */
function processResolvedLog(address: Address, processN: number, blockNumber: bigint): Log {
    return {
        address,
        blockNumber,
        logIndex: 0,
        data: encodeAbiParameters(parseAbiParameters("uint256"), [1n]),
        topics: encodeEventTopics({
            abi: CORE_ABI,
            eventName: "ProcessResolved",
            args: { processId: id(processN), buyer: BUYER },
        }),
    } as unknown as Log;
}

/** `readContract` answers the Core's `processes(id)` getter from a fixed
 *  table (unknown ids read as the zero struct, as the mapping does);
 *  `getLogs` answers with the logs under the queried address and range. */
function mockClient(
    state: Record<string, readonly [Address, Address, bigint, bigint]>,
    logs: Log[],
    latest = 50n,
): PublicClient {
    const readContract = vi.fn(async ({ functionName, args }: { functionName: string; args: readonly unknown[] }) => {
        if (functionName !== "processes") throw new Error(`unexpected read ${functionName}`);
        return state[(args[0] as string).toLowerCase()] ?? [ZERO, ZERO, 0n, 0n];
    });
    const getLogs = vi.fn(async ({ address, fromBlock, toBlock }: { address: Address; fromBlock: bigint; toBlock: bigint }) =>
        logs.filter((l) =>
            l.address.toLowerCase() === address.toLowerCase()
            && (l.blockNumber as bigint) >= fromBlock && (l.blockNumber as bigint) <= toBlock),
    );
    const getBlockNumber = vi.fn(async () => latest);
    return { readContract, getLogs, getBlockNumber } as unknown as PublicClient;
}

describe("fetchProcessesResolved", () => {
    // id(1): resolved on the Core at block 8. id(2): open on the Core.
    // id(3): unknown to the Core, resolved on the batch path at block 9.
    // id(4): unknown everywhere.
    const STATE = {
        [id(1)]: [BUYER, TOKEN, 10n, 0n] as const,
        [id(2)]: [BUYER, TOKEN, 10n, 2n] as const,
    };
    const LOGS = [processResolvedLog(CORE, 1, 8n), processResolvedLog(VERIFIER, 3, 9n)];

    it("reads resolution from the Core's getter and the block from ProcessResolved, both paths", async () => {
        const client = mockClient(STATE, LOGS);
        const out = await fetchProcessesResolved(client, { core: CORE, batchVerifier: VERIFIER }, [id(1), id(2), id(3), id(4)], 0n);
        expect(out).toEqual([
            { processId: id(1), resolved: true, resolvedBlock: 8 },
            { processId: id(2), resolved: false, resolvedBlock: null },
            { processId: id(3), resolved: true, resolvedBlock: 9 },
            { processId: id(4), resolved: false, resolvedBlock: null },
        ]);
        expect(client.readContract).toHaveBeenCalledWith(expect.objectContaining({ address: CORE, functionName: "processes", args: [id(1)] }));
    });

    it("a process the getter shows open is not resolved, whatever a log says", async () => {
        // A node that answers with a ProcessResolved for an open process is
        // outvoted by the Core's own state.
        const client = mockClient(STATE, [processResolvedLog(CORE, 2, 7n)]);
        const [r] = await fetchProcessesResolved(client, { core: CORE }, [id(2)], 0n);
        expect(r).toEqual({ processId: id(2), resolved: false, resolvedBlock: null });
    });

    it("without a batch verifier, a process unknown to the Core is not resolved", async () => {
        const client = mockClient(STATE, LOGS);
        const out = await fetchProcessesResolved(client, { core: CORE }, [id(3)], 0n);
        expect(out).toEqual([{ processId: id(3), resolved: false, resolvedBlock: null }]);
        expect(client.getLogs).toHaveBeenCalledWith({ address: CORE, fromBlock: 0n, toBlock: 50n });
        expect(client.getLogs).not.toHaveBeenCalledWith(expect.objectContaining({ address: VERIFIER }));
    });

    it("resolved on the Core but outside the scanned range: resolved, block unknown", async () => {
        const client = mockClient(STATE, LOGS);
        const [r] = await fetchProcessesResolved(client, { core: CORE }, [id(1)], 20n);
        expect(r).toEqual({ processId: id(1), resolved: true, resolvedBlock: null });
    });

    it("matches process ids in any letter case", async () => {
        const upper = id(0xab).toUpperCase().replace("0X", "0x") as `0x${string}`;
        const state = { [id(0xab)]: [BUYER, TOKEN, 1n, 0n] as const };
        const c2 = mockClient(state, [processResolvedLog(CORE, 0xab, 4n)]);
        const [r] = await fetchProcessesResolved(c2, { core: CORE }, [upper], 0n);
        expect(r).toEqual({ processId: upper, resolved: true, resolvedBlock: 4 });
    });
});
