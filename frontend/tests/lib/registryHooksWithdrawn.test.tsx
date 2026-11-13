/**
 * A withdrawn clause, agreement or assembly leaves view in the registry hooks
 * (K4: surfacing derives from the LIVE stake). Each hook reads real encoded
 * `Registered` and `DepositWithdrawn` logs through its own row projection:
 *  - `usePublishedAgreements` and `useAllPublishedAssemblies` (the network-wide
 *    read) drop a withdrawn entry; the registering wallet's read and
 *    `includeWithdrawn` keep it, flagged.
 *  - `useAllRegisteredClauses` keeps every row flagged (spec loading never
 *    filters on the stake); the offering surfaces apply `isLiveRegistration`,
 *    which drops the flagged row.
 * A read that fails is `absent`, never an empty list (docs/OPEN_WORLD.md § 1).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { encodeAbiParameters, encodeEventTopics, getAbiItem, type Abi, type Hex } from "viem";

const REGISTRANT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const KEY_LIVE = `0x${"11".repeat(32)}` as Hex;
const KEY_GONE = `0x${"22".repeat(32)}` as Hex;

const mocks = vi.hoisted(() => ({ cachedGetContractEvents: vi.fn() }));

vi.mock("wagmi", () => ({
    usePublicClient: () => ({ chain: { id: 31337 } }),
    useChainId: () => 31337,
    useAccount: () => ({ address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }),
    useWatchContractEvent: () => undefined,
    useReadContract: () => ({ data: undefined }),
    useWriteContract: () => ({}),
    useWaitForTransactionReceipt: () => ({}),
}));
vi.mock("@/lib/kernel/eventCache", () => ({
    cachedGetContractEvents: (...a: unknown[]) => mocks.cachedGetContractEvents(...a),
}));
vi.mock("@/lib/kernel/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/kernel/contracts")>();
    return {
        ...actual,
        CONTRACTS: {
            ...actual.CONTRACTS,
            clauseRegistry: "0x3333333333333333333333333333333333333333",
            agreementRegistry: "0x4444444444444444444444444444444444444444",
            assemblyRegistry: "0x5555555555555555555555555555555555555555",
        },
    };
});

import {
    AGREEMENT_REGISTRY_ABI,
    ASSEMBLY_REGISTRY_ABI,
    CLAUSE_REGISTRY_ABI,
} from "@figaro-protocol/sdk";
import { useAllRegisteredClauses } from "@/lib/protocol/useClauseRegistry";
import { usePublishedAgreements } from "@/lib/protocol/useAgreementRegistry";
import { useAllPublishedAssemblies, usePublishedAssemblies } from "@/lib/protocol/useAssemblyRegistry";
import { isLiveRegistration } from "@/lib/shared/clauseSpecSource";

/** One raw log of `eventName` as a node returns it: topics and data, ABI-encoded. */
function rawLog(abi: Abi, eventName: string, args: Record<string, unknown>, blockNumber: bigint) {
    const item = getAbiItem({ abi, name: eventName }) as unknown as { inputs: { name: string; type: string; indexed?: boolean }[] };
    const topics = encodeEventTopics({ abi, eventName, args } as never);
    const unindexed = item.inputs.filter((i) => !i.indexed);
    const data = encodeAbiParameters(
        unindexed as never,
        unindexed.map((i) => args[i.name]) as never,
    );
    return { args, eventName, topics, data, blockNumber, logIndex: 0, transactionHash: `0x${"ee".repeat(32)}` };
}

/** Serve the two streams the scan asks for, by event name. */
function chainHolds(registered: unknown[], withdrawn: unknown[], registeredEvent: string) {
    mocks.cachedGetContractEvents.mockImplementation(
        async (_client: unknown, _chainId: number, q: { eventName: string }) =>
            q.eventName === registeredEvent ? registered : withdrawn,
    );
}

async function settled(result: { current: { read: { status: string } } }) {
    await waitFor(() => expect(result.current.read.status).not.toBe("pending"));
    return result.current.read as unknown as { status: string; value?: Array<Record<string, unknown>> };
}

describe("a withdrawn entry leaves view in the registry hooks", () => {
    beforeEach(() => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        mocks.cachedGetContractEvents.mockReset();
    });

    it("agreements: the network-wide read drops the withdrawn one; the wallet's read and includeWithdrawn keep it flagged", async () => {
        const abi = AGREEMENT_REGISTRY_ABI as Abi;
        chainHolds(
            [
                rawLog(abi, "AgreementRegistered", { agreementHash: KEY_LIVE, registeredBy: REGISTRANT, contentURI: "ipfs://live" }, 5n),
                rawLog(abi, "AgreementRegistered", { agreementHash: KEY_GONE, registeredBy: REGISTRANT, contentURI: "ipfs://gone" }, 4n),
            ],
            [rawLog(abi, "DepositWithdrawn", { agreementHash: KEY_GONE, registeredBy: REGISTRANT, amount: 1n }, 6n)],
            "AgreementRegistered",
        );

        const all = renderHook(() => usePublishedAgreements(undefined));
        const allRead = await settled(all.result);
        expect(allRead.status).toBe("present");
        expect(allRead.value?.map((r) => r.agreementHash)).toEqual([KEY_LIVE]);

        const own = renderHook(() => usePublishedAgreements(REGISTRANT));
        const ownRead = await settled(own.result);
        expect(ownRead.value?.map((r) => [r.agreementHash, r.stakeWithdrawn])).toEqual([
            [KEY_LIVE, false],
            [KEY_GONE, true],
        ]);

        const opted = renderHook(() => usePublishedAgreements(undefined, { includeWithdrawn: true }));
        const optedRead = await settled(opted.result);
        expect(optedRead.value?.map((r) => r.agreementHash)).toEqual([KEY_LIVE, KEY_GONE]);
    });

    it("assemblies: the network-wide read drops the withdrawn one; the wallet's read keeps it flagged", async () => {
        const abi = ASSEMBLY_REGISTRY_ABI as Abi;
        chainHolds(
            [
                rawLog(abi, "AssemblyRegistered", { assemblyHash: KEY_LIVE, registeredBy: REGISTRANT, contentURI: "ipfs://live" }, 5n),
                rawLog(abi, "AssemblyRegistered", { assemblyHash: KEY_GONE, registeredBy: REGISTRANT, contentURI: "ipfs://gone" }, 4n),
            ],
            [rawLog(abi, "DepositWithdrawn", { assemblyHash: KEY_GONE, registeredBy: REGISTRANT, amount: 1n }, 6n)],
            "AssemblyRegistered",
        );

        const all = renderHook(() => useAllPublishedAssemblies());
        const allRead = await settled(all.result);
        expect(allRead.status).toBe("present");
        expect(allRead.value?.map((r) => r.assemblyHash)).toEqual([KEY_LIVE]);

        const own = renderHook(() => usePublishedAssemblies(REGISTRANT));
        const ownRead = await settled(own.result);
        expect(ownRead.value?.map((r) => [r.assemblyHash, r.stakeWithdrawn])).toEqual([
            [KEY_LIVE, false],
            [KEY_GONE, true],
        ]);
    });

    it("clauses: the hook flags the withdrawn one, and the offering predicate drops it", async () => {
        const abi = CLAUSE_REGISTRY_ABI as Abi;
        chainHolds(
            [
                rawLog(abi, "ClauseRegistered", { clauseKey: KEY_LIVE, contentURI: "ipfs://live", registeredBy: REGISTRANT }, 5n),
                rawLog(abi, "ClauseRegistered", { clauseKey: KEY_GONE, contentURI: "ipfs://gone", registeredBy: REGISTRANT }, 4n),
            ],
            [rawLog(abi, "DepositWithdrawn", { clauseKey: KEY_GONE, registeredBy: REGISTRANT, amount: 1n }, 6n)],
            "ClauseRegistered",
        );

        const { result } = renderHook(() => useAllRegisteredClauses());
        const read = await settled(result);
        expect(read.value?.map((r) => [r.clauseKey, r.stakeWithdrawn])).toEqual([
            [KEY_LIVE, false],
            [KEY_GONE, true],
        ]);
        const offered = (read.value as Array<{ clauseKey: string; stakeWithdrawn: boolean }>).filter(isLiveRegistration);
        expect(offered.map((r) => r.clauseKey)).toEqual([KEY_LIVE]);
    });

    it("a failed read is absent in all three hooks, never an empty list", async () => {
        mocks.cachedGetContractEvents.mockRejectedValue(new Error("fetch failed: RPC unreachable"));
        const hooks = [
            renderHook(() => useAllRegisteredClauses()),
            renderHook(() => usePublishedAgreements(undefined)),
            renderHook(() => useAllPublishedAssemblies()),
        ];
        for (const h of hooks) {
            const read = await settled(h.result);
            expect(read).toEqual({ status: "absent" });
        }
    });
});
