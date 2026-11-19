/**
 * The rewards page counts a use whichever path its process resolved on.
 *
 * `UsageCounter` emits one event, `UsageRecorded`, from its own address on
 * both paths (`src/rewards/UsageCounter.sol`, `_count`). On the direct path a
 * wallet calls `recordClauseUsage` after the buyer resolves on `FigaroCore`;
 * on the batch path `FigaroBatchVerifier` calls `applyBatchAccrual` inside the
 * batch's own transaction. A log carries no sender and no transaction `to`, so
 * what tells the two apart in a log is only the process id (derived under the
 * Core's EIP-712 domain on one path and the batch verifier's on the other) and
 * the transaction it sits in. The process itself resolved on `FigaroCore` on
 * the direct path and on `FigaroBatchVerifier` on the batch path: the two
 * paths share no state, so a reader that joins a use with the Core loses the
 * batched one.
 *
 * Here the node answers `eth_getLogs` from raw logs (topics and ABI-encoded
 * data), and viem's own decoder turns them into the rows the event cache
 * returns; the real event cache runs. The counter's views answer from the same
 * logs: the last `UsageRecorded` of a key in a period carries its `c`, `d` and
 * score after that use.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import {
    encodeAbiParameters,
    encodeEventTopics,
    getAbiItem,
    parseEventLogs,
    toEventSelector,
    type Abi,
    type AbiEvent,
    type Hex,
} from "viem";
import { word } from "./__fixtures__/coreLogs";

const A = vi.hoisted(() => ({
    designer: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as `0x${string}`,
    core: "0x00000000000000000000000000000000000c0e01" as `0x${string}`,
    batchVerifier: "0x00000000000000000000000000000000000b0a01" as `0x${string}`,
    clauseRegistry: "0x00000000000000000000000000000000000c1a01" as `0x${string}`,
    processRegistry: "0x00000000000000000000000000000000000a5501" as `0x${string}`,
    membersRegistry: "0x00000000000000000000000000000000000e3b01" as `0x${string}`,
    counter: "0x00000000000000000000000000000000000c0c01" as `0x${string}`,
    minter: "0x00000000000000000000000000000000000f1001" as `0x${string}`,
    client: {} as Record<string, unknown>,
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: A.designer, isConnected: true }),
    usePublicClient: () => A.client,
    useWriteContract: () => ({ writeContractAsync: vi.fn() }),
    useChainId: () => 31337,
}));
vi.mock("@/lib/core/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/core/contracts")>();
    return {
        ...actual,
        CONTRACTS: {
            ...actual.CONTRACTS,
            core: A.core,
            batchVerifier: A.batchVerifier,
        },
    };
});
vi.mock("@/lib/registries/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/registries/contracts")>();
    return { ...actual, REGISTRY_CONTRACTS: { ...actual.REGISTRY_CONTRACTS, clauseRegistry: A.clauseRegistry, processRegistry: A.processRegistry, agreementRegistry: "", membersRegistry: A.membersRegistry } };
});
vi.mock("@/lib/rewards/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/rewards/contracts")>();
    return {
        ...actual,
        REWARDS_CONTRACTS: { ...actual.REWARDS_CONTRACTS, usageCounter: A.counter },
        getRpgfMinter: () => A.minter,
        getUsageCounter: () => A.counter,
    };
});
vi.mock("@/lib/shared/viewedWallet", () => ({ useViewedWallet: (connected: unknown) => connected }));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 18 }) }));
vi.mock("@/hooks/useTokenBalance", () => ({ default: () => ({ read: { status: "pending" }, refetch: () => undefined }) }));
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, version: 0 }) }));

import { CLAUSE_REGISTRY_ABI, EV_PROCESS_RESOLVED, USAGE_COUNTER_ABI, USAGE_KIND_CLAUSE } from "@figaro-protocol/sdk";
import { useRpgfRewards } from "@/lib/rewards/useRpgfRewards";
import { RewardsView } from "@/app/(app)/rewards/_components/RewardsView";

/** A clause used once on each path in period 0. */
const KEY_BOTH = `0x${"ab".repeat(32)}` as Hex;
/** A clause used only in a batch, in period 0. */
const KEY_BATCH_ONLY = `0x${"cd".repeat(32)}` as Hex;
const SELLER_DIRECT = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc" as `0x${string}`;
const SELLER_BATCH = "0x90f79bf6eb2c4f870365e785982e1f101e93b906" as `0x${string}`;
/** The direct process's id, derived under `FigaroCore`'s EIP-712 domain. */
const PROCESS_DIRECT = word(0xd1);
/** The batched process's id, derived under `FigaroBatchVerifier`'s domain. */
const PROCESS_BATCH = word(0xb1);
const PROCESS_BATCH_2 = word(0xb2);
const TX_DIRECT_RECORD = word(0xd0d0);
const TX_BATCH = word(0xbabe);

interface RawLog {
    address: `0x${string}`;
    topics: [Hex, ...Hex[]];
    data: Hex;
    blockNumber: bigint;
    logIndex: number;
    transactionHash: Hex;
    transactionIndex: number;
    blockHash: Hex;
    removed: boolean;
}

/** One raw log of `eventName`, as a node returns it: indexed arguments in the
 *  topics, the rest ABI-encoded in the data. */
function raw(
    address: `0x${string}`,
    abi: Abi,
    eventName: string,
    args: Record<string, unknown>,
    at: { blockNumber: bigint; logIndex: number; transactionHash: Hex },
): RawLog {
    const item = getAbiItem({ abi, name: eventName }) as unknown as AbiEvent;
    const topics = encodeEventTopics({ abi, eventName, args } as never) as [Hex, ...Hex[]];
    const unindexed = item.inputs.filter((i) => !i.indexed);
    const data = encodeAbiParameters(unindexed as never, unindexed.map((i) => args[i.name as string]) as never);
    return { address, topics, data, ...at, transactionIndex: 0, blockHash: word(Number(at.blockNumber)), removed: false };
}

const USAGE = USAGE_COUNTER_ABI as Abi;
const usage = (
    key: Hex, processId: Hex, seller: `0x${string}`, c: bigint, d: bigint, score: bigint,
    at: { blockNumber: bigint; logIndex: number; transactionHash: Hex },
) => raw(A.counter, USAGE, "UsageRecorded", {
    kind: USAGE_KIND_CLAUSE, clauseOrProcess: key, period: 0, processId, seller, c, d, score,
}, at);

/** The chain: the designer registered both clauses; one process resolved on
 *  `FigaroCore` and its use was counted by a direct call; two processes
 *  resolved in one batch on `FigaroBatchVerifier`, whose call to the counter
 *  counted their uses in the same transaction. */
const CHAIN: RawLog[] = [
    raw(A.clauseRegistry, CLAUSE_REGISTRY_ABI as Abi, "ClauseRegistered",
        { clauseKey: KEY_BOTH, contentURI: "ipfs://both", registeredBy: A.designer },
        { blockNumber: 2n, logIndex: 0, transactionHash: word(0x02) }),
    raw(A.clauseRegistry, CLAUSE_REGISTRY_ABI as Abi, "ClauseRegistered",
        { clauseKey: KEY_BATCH_ONLY, contentURI: "ipfs://batch", registeredBy: A.designer },
        { blockNumber: 3n, logIndex: 0, transactionHash: word(0x03) }),
    // Direct path: the buyer's resolve on the Core, then a separate call to
    // `recordClauseUsage` (the transaction's `to` is the counter).
    raw(A.core, [EV_PROCESS_RESOLVED] as Abi, "ProcessResolved",
        { processId: PROCESS_DIRECT, buyer: A.designer, orderCount: 1n },
        { blockNumber: 10n, logIndex: 0, transactionHash: word(0x10) }),
    usage(KEY_BOTH, PROCESS_DIRECT, SELLER_DIRECT, 1n, 1n, 1_000n,
        { blockNumber: 11n, logIndex: 0, transactionHash: TX_DIRECT_RECORD }),
    // Batch path: one transaction to the batch verifier; it emits the
    // process events itself and the counter emits the uses, from the
    // counter's address, at later log indexes of the same transaction.
    raw(A.batchVerifier, [EV_PROCESS_RESOLVED] as Abi, "ProcessResolved",
        { processId: PROCESS_BATCH, buyer: A.designer, orderCount: 1n },
        { blockNumber: 20n, logIndex: 0, transactionHash: TX_BATCH }),
    raw(A.batchVerifier, [EV_PROCESS_RESOLVED] as Abi, "ProcessResolved",
        { processId: PROCESS_BATCH_2, buyer: A.designer, orderCount: 1n },
        { blockNumber: 20n, logIndex: 1, transactionHash: TX_BATCH }),
    usage(KEY_BOTH, PROCESS_BATCH, SELLER_BATCH, 2n, 2n, 1_587n,
        { blockNumber: 20n, logIndex: 2, transactionHash: TX_BATCH }),
    usage(KEY_BATCH_ONLY, PROCESS_BATCH_2, SELLER_BATCH, 1n, 1n, 1_000n,
        { blockNumber: 20n, logIndex: 3, transactionHash: TX_BATCH }),
];
const LATEST = 30n;

/** `eth_getLogs` over CHAIN, decoded the way viem's `getLogs` decodes:
 *  filtered by address, by the event's topic and by block range. */
async function getLogs({ address, event, fromBlock, toBlock }: {
    address: `0x${string}`; event: AbiEvent; fromBlock: bigint; toBlock: bigint;
}) {
    const topic0 = toEventSelector(event);
    const hits = CHAIN.filter((l) =>
        l.address.toLowerCase() === address.toLowerCase()
        && l.topics[0] === topic0
        && l.blockNumber >= fromBlock && l.blockNumber <= toBlock);
    return parseEventLogs({ abi: [event], logs: hits, strict: true });
}

/** The counter's state after the logs above: the last `UsageRecorded` of a
 *  (kind, key, period) carries its `c`, `d` and score. */
function counterState(kind: number, key: Hex, period: number) {
    const rows = parseEventLogs({ abi: USAGE, logs: CHAIN.filter((l) => l.address === A.counter) })
        .map((l) => l.args as unknown as { kind: number; clauseOrProcess: Hex; period: number; c: bigint; d: bigint; score: bigint })
        .filter((a) => a.kind === kind && a.clauseOrProcess.toLowerCase() === key.toLowerCase() && a.period === period);
    const last = rows[rows.length - 1];
    return last ? { c: last.c, d: last.d, score: last.score } : { c: 0n, d: 0n, score: 0n };
}

beforeEach(() => {
    A.client = {
        getBlockNumber: async () => LATEST,
        getLogs,
        readContract: vi.fn(async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
            switch (functionName) {
                case "periodCount": return 1n;
                case "periodAmount": return 1_000_000n;
                case "minted": return 0n;
                case "periodClosed": return true;
                case "totalScoreIn": return counterState(0, KEY_BOTH, 0).score + counterState(0, KEY_BATCH_ONLY, 0).score;
                case "claimable": return 0n;
                case "registered": return true;
                case "claimed": return false;
                case "accrualOf": {
                    const s = counterState(Number(args?.[0]), args?.[1] as Hex, Number(args?.[2]));
                    return [s.c, s.d];
                }
                case "scoreOf": return counterState(Number(args?.[0]), args?.[1] as Hex, Number(args?.[2])).score;
                default: throw new Error(`unexpected read ${functionName}`);
            }
        }),
    };
});

describe("the rewards page counts a use from a batched trade beside one from the direct path", () => {
    it("the reader lists a key used on both paths with both uses, and a key used only in a batch", async () => {
        const { result } = renderHook(() => useRpgfRewards());
        await waitFor(() => expect(result.current.read.status).toBe("present"));
        const read = result.current.read;
        if (read.status !== "present") throw new Error("unreachable");
        const period = read.value.periods[0];
        const byKey = new Map(period.accruals.map((a) => [a.clauseOrProcess.toLowerCase(), a]));
        expect(byKey.get(KEY_BOTH)).toMatchObject({ c: 2n, d: 2n, score: 1_587n, family: "clause" });
        expect(byKey.get(KEY_BATCH_ONLY)).toMatchObject({ c: 1n, d: 1n, score: 1_000n, family: "clause" });
        expect(period.myScore).toBe(2_587n);
        expect(period.totalScore).toBe(2_587n);
    });

    it("the page shows both keys, the shared one with two resolved processes and two sellers", async () => {
        render(<RewardsView />);
        const both = await screen.findByTestId(`period-accrual-0-clause-${KEY_BOTH}`);
        expect(both.textContent).toMatch(/2 resolved processes, 2 distinct staked sellers, score 1587/);
        const batchOnly = screen.getByTestId(`period-accrual-0-clause-${KEY_BATCH_ONLY}`);
        expect(batchOnly.textContent).toMatch(/1 resolved process, 1 distinct staked seller, score 1000/);
    });
});
