/**
 * A process is read whichever path made it. The Core's `processes(id)` getter
 * answers a process made on the direct path; for one made on the batch path it
 * answers zeros for good, and `FigaroBatchVerifier` keeps no getter. The
 * verifier emits the Core's own `OrderCommitted` and `OrderResolved` under its
 * own address, so the batch path's state is read from those logs.
 *
 * The logs are encoded with the Core's ABI, as a node returns them. The client
 * answers the getter from a table and the logs by address and topic.
 */
import { describe, it, expect, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters, toEventSelector, type Log, type PublicClient } from "viem";
import { CORE_ABI } from "../src/abis.js";
import { buildCommitmentSafe, buildDomain, fetchRunningTotal } from "../src/commitments.js";
import { readProcessResolveCapacity, assertOrderFitsResolveCap } from "../src/gasCeilings.js";
import type { Address, Hex } from "../src/types.js";

const CORE = "0x00000000000000000000000000000000000c0e00" as Address;
const VERIFIER = "0x0000000000000000000000000000000000ba7c00" as Address;
const BUYER = "0x00000000000000000000000000000000000b0b00" as Address;
const SELLER = "0x0000000000000000000000000000000000005e11" as Address;
const TOKEN = "0x0000000000000000000000000000000000007070" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const word = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const MAINNET_GAS_LIMIT = 30_000_000n;

const BATCHED = word(0xba7c);
const OTHER_BATCHED = word(0xba7d);
const DIRECT = word(0xd1ec);
const NOWHERE = word(0x0404);

/** An `OrderCommitted` log under `address`, encoded with the Core's ABI. */
function committedLog(address: Address, processId: Hex, orderN: number, payment: bigint, runningTotal: bigint, blockNumber: bigint): Log {
    return {
        address,
        blockNumber,
        logIndex: orderN,
        transactionHash: word(0x7000 + orderN),
        topics: encodeEventTopics({
            abi: CORE_ABI,
            eventName: "OrderCommitted",
            args: { orderHash: word(orderN), processId, buyer: BUYER },
        }),
        data: encodeAbiParameters(
            parseAbiParameters("address, address, uint256, uint256, bytes32, uint256, uint256"),
            [SELLER, TOKEN, payment, runningTotal, word(0xc4ec), 1n, 2_000_000_000n],
        ),
    } as unknown as Log;
}

/** An `OrderResolved` log under `address`, encoded with the Core's ABI. */
function resolvedLog(address: Address, processId: Hex, orderN: number, blockNumber: bigint): Log {
    return {
        address,
        blockNumber,
        logIndex: 100 + orderN,
        topics: encodeEventTopics({
            abi: CORE_ABI,
            eventName: "OrderResolved",
            args: { orderHash: word(orderN), processId },
        }),
        data: encodeAbiParameters(parseAbiParameters("uint256, uint256"), [30n, 10n]),
    } as unknown as Log;
}

/** The getter answers from `state` (an unknown id reads as the zero struct, as
 *  the mapping does); `getLogs` answers the logs under the queried address and
 *  range, of the queried events when the query names them. */
function mockClient(state: Record<string, readonly [Address, Address, bigint, bigint]>, logs: Log[]) {
    const readContract = vi.fn(async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
        if (functionName !== "processes") throw new Error(`unexpected read ${functionName}`);
        return state[(args?.[0] as string).toLowerCase()] ?? [ZERO, ZERO, 0n, 0n];
    });
    const getLogs = vi.fn(async ({ address, fromBlock, toBlock, events }: {
        address: Address; fromBlock: bigint; toBlock: bigint; events?: readonly unknown[];
    }) => {
        const topics = events?.map((e) => toEventSelector(e as Parameters<typeof toEventSelector>[0]));
        return logs.filter((l) =>
            l.address.toLowerCase() === address.toLowerCase()
            && (l.blockNumber as bigint) >= fromBlock && (l.blockNumber as bigint) <= toBlock
            && (!topics || topics.includes(l.topics[0] as Hex)));
    });
    const getBlockNumber = vi.fn(async () => 50n);
    const getBlock = vi.fn(async () => ({ gasLimit: MAINNET_GAS_LIMIT }));
    return { readContract, getLogs, getBlockNumber, getBlock };
}

// BATCHED: three orders landed through batches, payments 100, 40 and 25, so
// running totals 100, 140 and 165; none resolved. OTHER_BATCHED: one order,
// resolved. DIRECT: open on the Core with two orders at 700. The Core also
// emits a log for DIRECT, which the batch read never takes.
const STATE = { [DIRECT]: [BUYER, TOKEN, 700n, 2n] as const };
const LOGS = [
    committedLog(VERIFIER, BATCHED, 1, 100n, 100n, 10n),
    committedLog(VERIFIER, OTHER_BATCHED, 2, 900n, 900n, 10n),
    committedLog(VERIFIER, BATCHED, 3, 40n, 140n, 12n),
    resolvedLog(VERIFIER, OTHER_BATCHED, 2, 13n),
    committedLog(VERIFIER, BATCHED, 4, 25n, 165n, 14n),
    committedLog(CORE, DIRECT, 5, 999n, 999n, 15n),
];
const READ = { batchVerifier: VERIFIER, fromBlock: 0n };

describe("fetchRunningTotal reads a process on either path", () => {
    it("returns the latest landed running total of a process the Core does not know", async () => {
        const client = mockClient(STATE, LOGS) as unknown as PublicClient;
        await expect(fetchRunningTotal(client, CORE, BATCHED, READ)).resolves.toBe(165n);
    });

    it("answers a direct process from the Core's getter, never the verifier's logs", async () => {
        const client = mockClient(STATE, LOGS);
        await expect(fetchRunningTotal(client as unknown as PublicClient, CORE, DIRECT, READ)).resolves.toBe(700n);
        expect(client.getLogs).not.toHaveBeenCalled();
    });

    it("answers zero for a process neither contract knows", async () => {
        const client = mockClient(STATE, LOGS) as unknown as PublicClient;
        await expect(fetchRunningTotal(client, CORE, NOWHERE, READ)).resolves.toBe(0n);
        await expect(fetchRunningTotal(client, CORE, NOWHERE)).resolves.toBe(0n);
    });
});

describe("buildCommitmentSafe builds a further order of a batched process", () => {
    it("sets runningTotal to the landed total plus the payment, the proof program's rule", async () => {
        const client = mockClient(STATE, LOGS) as unknown as PublicClient;
        const payment = 35n;
        const { commitment } = await buildCommitmentSafe(
            client,
            { core: CORE, batchVerifier: VERIFIER },
            {
                processId: BATCHED, buyer: BUYER, seller: SELLER, token: TOKEN, payment,
                checkoutHash: word(0xc4ec), salt: 1n, commitDeadline: 2_000_000_000n,
            },
            buildDomain(31337, VERIFIER),
            { fromBlock: 0n },
        );
        // The proof program (prover/lib) refuses a sub-order unless its
        // running total equals the process's running total plus its payment.
        const previous = 165n;
        expect(commitment.runningTotal).toBe(previous + payment);
    });
});

describe("readProcessResolveCapacity reads a process on either path", () => {
    it("counts the open orders of a batched process: committed less resolved", async () => {
        const capacity = await readProcessResolveCapacity(mockClient(STATE, LOGS), CORE, BATCHED, undefined, READ);
        expect(capacity).toEqual({ activeOrderCount: 3, cap: 546, remaining: 543 });
        const closed = await readProcessResolveCapacity(mockClient(STATE, LOGS), CORE, OTHER_BATCHED, undefined, READ);
        expect(closed.activeOrderCount).toBe(0);
    });

    it("answers a direct process from the Core's getter", async () => {
        const client = mockClient(STATE, LOGS);
        const capacity = await readProcessResolveCapacity(client, CORE, DIRECT, undefined, READ);
        expect(capacity.activeOrderCount).toBe(2);
        expect(client.getLogs).not.toHaveBeenCalled();
    });

    it("answers no active order for a process neither contract knows", async () => {
        const capacity = await readProcessResolveCapacity(mockClient(STATE, LOGS), CORE, NOWHERE, undefined, READ);
        expect(capacity.activeOrderCount).toBe(0);
    });

    it("refuses a batched order past the ceiling counted from the verifier's logs", async () => {
        // 546 landed orders of one batched process, none resolved: one more passes the ceiling.
        const full = Array.from({ length: 546 }, (_, i) => committedLog(VERIFIER, BATCHED, 1000 + i, 1n, BigInt(i + 1), 10n));
        await expect(assertOrderFitsResolveCap(mockClient(STATE, full), CORE, BATCHED, undefined, READ))
            .rejects.toThrow(/permanently unresolvable/);
    });
});
