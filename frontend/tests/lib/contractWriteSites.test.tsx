/**
 * Every on-chain write goes through the one simulate → send → verify helper:
 * each write site sends with `chain: activeChain` and waits for a `success`
 * receipt, and a simulate-time revert reaches the caller translated by the
 * contract's error name, before the wallet opens.
 *
 * Member registration reads the registry's stake from the chain at call
 * time; a stake that cannot be read sends nothing (no default deposit).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ContractFunctionRevertedError, encodeErrorResult, type Abi } from "viem";
import { PROVENANCE_LEAF_KEY, USAGE_KIND_CLAUSE, type Commitment } from "@figaro-protocol/sdk";

const w = vi.hoisted(() => {
    process.env.NEXT_PUBLIC_FIGARO_CORE = "0x00000000000000000000000000000000000c0e01";
    process.env.NEXT_PUBLIC_CLAUSE_REGISTRY = "0x00000000000000000000000000000000000c1a01";
    process.env.NEXT_PUBLIC_MEMBERS_REGISTRY = "0x00000000000000000000000000000000000e3b01";
    process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY = "0x00000000000000000000000000000000000a5501";
    process.env.NEXT_PUBLIC_AGREEMENT_REGISTRY = "0x00000000000000000000000000000000000a9e01";
    process.env.NEXT_PUBLIC_USAGE_COUNTER = "0x00000000000000000000000000000000000c0c01";
    return {
        address: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as `0x${string}`,
        key: `0x${"ab".repeat(32)}` as `0x${string}`,
        orderHash: `0x${"0d".repeat(32)}` as `0x${string}`,
        reads: {} as Record<string, unknown>,
        client: {} as Record<string, unknown>,
        write: undefined as unknown as ReturnType<typeof vi.fn>,
    };
});

const KEY = w.key;
const ORDER_HASH = w.orderHash;
const TX = `0x${"77".repeat(32)}` as `0x${string}`;
const STAKE = 10n ** 16n;
const COMMITMENT: Commitment = {
    processId: `0x${"00".repeat(32)}`,
    buyer: "0x1111111111111111111111111111111111111111",
    seller: "0x2222222222222222222222222222222222222222",
    currency: "0x3333333333333333333333333333333333333333",
    payment: 100n,
    expectedCumulativeValue: 100n,
    checkoutHash: `0x${"cc".repeat(32)}`,
    salt: 1n,
    deadline: 9_999_999_999n,
};

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: w.address, isConnected: true }),
    usePublicClient: () => w.client,
    useWriteContract: () => ({ writeContractAsync: w.write, data: undefined, isPending: false, error: null }),
    useWaitForTransactionReceipt: () => ({ isLoading: false, isSuccess: false, data: undefined }),
    useChainId: () => 31337,
    useReadContract: () => ({ data: undefined, isLoading: false, refetch: () => {} }),
}));
vi.mock("@/lib/shared/wagmi", async () => {
    const { activeChain } = await import("@/lib/shared/chains");
    return { publicClient: {}, activeChain };
});
vi.mock("@/lib/composition/contracts", () => ({
    getMultisender: () => "0x00000000000000000000000000000000000d1501",
    getWitnessSwapAndCommitCoordinator: () => "0x00000000000000000000000000000000000c0a01",
    getAttestationCoordinator: () => "0x00000000000000000000000000000000000a7701",
    getRpgfMinter: () => "0x00000000000000000000000000000000000f1001",
    getUsageCounter: () => "0x00000000000000000000000000000000000c0c01",
}));
vi.mock("@/lib/kernel/eventCache", () => ({
    cachedGetContractEvents: async (_client: unknown, _chainId: number, { eventName }: { eventName: string }) => {
        if (eventName === "ClauseRegistered") return [{ args: { registeredBy: w.address, clauseKey: w.key } }];
        if (eventName === "UsageRecorded") return [{ args: { kind: 0, clauseOrAssembly: w.key, period: 0 } }];
        return [];
    },
}));
vi.mock("@/lib/kernel/indexer", () => ({
    getAllOrderCommitted: async () => [{
        args: {
            orderHash: w.orderHash,
            processId: `0x${"00".repeat(32)}`,
            buyer: "0x1111111111111111111111111111111111111111",
            seller: "0x2222222222222222222222222222222222222222",
            currency: "0x3333333333333333333333333333333333333333",
            payment: 100n,
            cumulativeValue: 100n,
            checkoutHash: `0x${"cc".repeat(32)}`,
            salt: 1n,
            deadline: 9_999_999_999n,
        },
    }],
    getStringArg: (log: { args: Record<string, unknown> }, key: string) => String(log.args[key]),
}));
vi.mock("@/lib/kernel/signedCommitment", () => ({ restoreSignedProcessId: (c: unknown) => c }));
vi.mock("@/lib/kernel/agreementFetch", () => ({
    fetchAgreement: async () => ({ clauses: [], provenance: { agreementHash: w.key, assemblyHash: w.key } }),
}));
vi.mock("@/lib/composition/witnessContent", () => ({ publishWitnessContent: async () => undefined }));
vi.mock("@/lib/shared/ipfsService", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/shared/ipfsService")>()),
    DEFAULT_IPFS_SERVICE: {
        pinBlob: async () => "bafyclause",
        buildURI: (cid: string) => `ipfs://${cid}`,
        publishJSON: async () => ({ uri: "ipfs://bafyprofile" }),
    },
}));

import { activeChain } from "@/lib/shared/chains";
import { useRegisterMember, useUpdateProfile } from "@/lib/member/useMembersRegistry";
import { useRegisterClause, useWithdrawClause } from "@/lib/protocol/useClauseRegistry";
import { usePayoutRoutingActions } from "@/lib/composition/usePayoutRoutingActions";
import { useSwapAndCommitActions } from "@/lib/composition/useSwapAndCommitActions";
import { useFigaroActions } from "@/lib/kernel/useFigaroActions";
import { useUsageRecorder, type UsageWrite } from "@/lib/protocol/useUsageRecorder";
import { useRpgfRewards } from "@/lib/composition/useRpgfRewards";
import { useAttestationCoordinatorActions } from "@/lib/composition/useAttestationCoordinatorActions";

/** A decoded custom-error revert, as viem raises it from `simulateContract`. */
function revert(errorName: string): ContractFunctionRevertedError {
    const abi = [{ type: "error", name: errorName, inputs: [] }] as const satisfies Abi;
    const data = encodeErrorResult({ abi, errorName } as never);
    return new ContractFunctionRevertedError({ abi, data, functionName: "f" });
}

beforeEach(() => {
    w.reads = {
        registrationDeposit: STAKE,
        allowance: 0n,
        periodCount: 1n,
        registered: true,
        periodAmount: 100n,
        minted: 0n,
        periodClosed: true,
        totalScoreIn: 10n,
        claimed: false,
        claimable: 5n,
        accrualOf: [1n, 1n],
        scoreOf: 3n,
    };
    w.client = {
        chain: { id: 31337 },
        readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
            if (!(functionName in w.reads)) throw new Error(`unstubbed read ${functionName}`);
            const value = w.reads[functionName];
            if (value instanceof Error) throw value;
            return value;
        }),
        simulateContract: vi.fn(async () => ({ request: {} })),
        waitForTransactionReceipt: vi.fn(async () => ({ status: "success" })),
    };
    w.write = vi.fn(async () => TX);
});

const simulate = () => w.client.simulateContract as ReturnType<typeof vi.fn>;
const receipt = () => w.client.waitForTransactionReceipt as ReturnType<typeof vi.fn>;

/** Render a hook outside `act`, and hand back a call that reads its latest value. */
function rendered<T>(hook: () => T): { current: T } {
    return renderHook(hook).result;
}

/** Each moved site: how to prepare its write (render, outside `act`), and
 *  the revert it is shown with. */
const SITES: Array<{
    site: string;
    prepare: () => Promise<() => Promise<unknown>>;
    errorName: string;
    message: string | RegExp;
}> = [
    {
        site: "useRegisterMember",
        prepare: async () => { const h = rendered(() => useRegisterMember()); return () => h.current.register("ipfs://profile"); },
        errorName: "AlreadyRegistered",
        message: /already registered/i,
    },
    {
        site: "useUpdateProfile",
        prepare: async () => { const h = rendered(() => useUpdateProfile()); return () => h.current.updateProfile("ipfs://profile"); },
        errorName: "NotRegistered",
        message: /not registered/i,
    },
    {
        site: "useWithdrawClause",
        prepare: async () => { const h = rendered(() => useWithdrawClause()); return () => h.current.withdraw(KEY); },
        errorName: "AlreadyWithdrawn",
        message: "This clause's registration stake has already been reclaimed.",
    },
    {
        site: "useRegisterClause",
        prepare: async () => {
            const h = rendered(() => useRegisterClause());
            return () => h.current.register({ clauseId: "figaro-probe", version: 1, fields: [] });
        },
        errorName: "ZeroClauseKey",
        message: /zero clause key/i,
    },
    {
        site: "usePayoutRoutingActions",
        prepare: async () => {
            const h = rendered(() => usePayoutRoutingActions());
            return () => h.current.routeTokenPayout(COMMITMENT.currency, [{ recipient: COMMITMENT.seller, amount: 5n }]);
        },
        errorName: "BatchTooLarge",
        message: "BatchTooLarge",
    },
    {
        site: "useSwapAndCommitActions",
        prepare: async () => { const h = rendered(() => useSwapAndCommitActions()); return () => h.current.swapAndCommit(COMMITMENT, "0x01", "0x02"); },
        errorName: "OutputBelowBond",
        message: "OutputBelowBond",
    },
    {
        site: "useFigaroActions.commit",
        prepare: async () => { const h = rendered(() => useFigaroActions()); return () => h.current.commit(COMMITMENT, "0x01", "0x02"); },
        errorName: "DeadlineExpired",
        message: "Commitment deadline has expired",
    },
    {
        site: "useFigaroActions.resolveProcess",
        prepare: async () => { const h = rendered(() => useFigaroActions()); return () => h.current.resolveProcess(KEY, [COMMITMENT]); },
        errorName: "NotProcessBuyer",
        message: "Only the process buyer can resolve",
    },
    {
        site: "useUsageRecorder.recordUsage",
        prepare: async () => {
            const write: UsageWrite = { kind: "clause", order: COMMITMENT, key: KEY, clauseDataHash: KEY, proof: [] };
            const h = rendered(() => useUsageRecorder());
            return () => h.current.recordUsage(write);
        },
        errorName: "AlreadyCounted",
        message: "AlreadyCounted",
    },
    {
        site: "useAttestationCoordinatorActions.submitAttestation",
        prepare: async () => {
            const h = rendered(() => useAttestationCoordinatorActions());
            return () => h.current.submitAttestation("buyer", { orderHash: ORDER_HASH, clauseId: PROVENANCE_LEAF_KEY, stage: 0 });
        },
        errorName: "NotParty",
        message: "NotParty",
    },
    {
        site: "useRpgfRewards.claim",
        prepare: async () => {
            const h = rendered(() => useRpgfRewards());
            await waitFor(() => expect(h.current.periods).toHaveLength(1));
            return () => h.current.claim(0);
        },
        errorName: "AlreadyClaimed",
        message: "AlreadyClaimed",
    },
];

async function invokeCaught(call: () => Promise<unknown>): Promise<unknown> {
    let caught: unknown;
    await act(async () => {
        try { await call(); } catch (e) { caught = e; }
    });
    return caught;
}

describe("every write site — one simulate → send → verify", () => {
    it("the usage event in the fixture is a clause's", () => {
        expect(USAGE_KIND_CLAUSE).toBe(0);
    });

    for (const { site, prepare, errorName, message } of SITES) {
        it(`${site} sends with chain: activeChain and waits for a success receipt`, async () => {
            const call = await prepare();
            const caught = await invokeCaught(call);
            expect(caught).toBeUndefined();
            expect(w.write).toHaveBeenCalled();
            for (const [config] of w.write.mock.calls) {
                expect(config.chain).toBe(activeChain);
            }
            expect(receipt()).toHaveBeenCalledWith({ hash: TX });
        });

        it(`${site} reports a simulate-time revert by its error name and sends nothing`, async () => {
            const call = await prepare();
            simulate().mockRejectedValue(revert(errorName));
            const caught = await invokeCaught(call);
            expect(caught).toBeInstanceOf(Error);
            const text = (caught as Error).message;
            if (typeof message === "string") expect(text).toBe(message);
            else expect(text).toMatch(message);
            expect(w.write).not.toHaveBeenCalled();
        });
    }
});

describe("member registration — the stake is read from the chain at call time", () => {
    it("sends the registry's registrationDeposit as the value", async () => {
        const h = rendered(() => useRegisterMember());
        expect(await invokeCaught(() => h.current.register("ipfs://profile"))).toBeUndefined();
        expect(w.write.mock.calls[0][0].value).toBe(STAKE);
    });

    it("sends no transaction when the deposit cannot be read", async () => {
        w.reads.registrationDeposit = new Error("RPC down");
        const h = rendered(() => useRegisterMember());
        const caught = await invokeCaught(() => h.current.register("ipfs://profile"));
        expect(caught).toBeInstanceOf(Error);
        expect(simulate()).not.toHaveBeenCalled();
        expect(w.write).not.toHaveBeenCalled();
    });
});
