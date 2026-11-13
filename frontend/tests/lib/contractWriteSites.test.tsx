/**
 * Every on-chain write goes through the one simulate → send → verify helper:
 * each write site simulates exactly the call it then sends — the contract,
 * the function and its arguments (and the stake, where one is sent) — sends
 * it with `chainId: activeChain.id`, and waits for a `success` receipt, in that
 * order; a simulate-time revert reaches the caller translated by the
 * contract's error name, before the wallet opens.
 *
 * The census below lists every place in the frontend's source that opens the
 * wallet or sends through the helper, and the test that pins what it writes;
 * a write site that is not listed (or a listed one that moved) fails it.
 *
 * Member registration reads the registry's stake from the chain at call
 * time; a stake that cannot be read sends nothing (no default deposit).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ContractFunctionRevertedError, encodeErrorResult, keccak256, type Abi } from "viem";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
    DISABLED_SWAP_FUNDING_LEG,
    PROVENANCE_LEAF_KEY,
    USAGE_KIND_CLAUSE,
    computeClauseKey,
    provenanceLeafAttestation,
    provenanceLeafBytes,
    type Agreement,
    type Commitment,
} from "@figaro-protocol/sdk";

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
    fetchAgreement: async () => ({ status: "present", value: { clauses: [], provenance: { agreementHash: w.key, assemblyHash: w.key } } }),
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
import { useRequestWithdrawal, useWithdrawDeposit } from "@/lib/member/useMembersRegistry";
import { useWithdrawAssembly } from "@/lib/protocol/useAssemblyRegistry";
import { useWithdrawAgreement } from "@/lib/protocol/useAgreementRegistry";
import { createCapabilityExecutors, type CapabilityExecutorDeps } from "@/lib/semantic/createCapabilityExecutors";

// The configured addresses each write is sent to (set in the hoisted block
// and in the `@/lib/composition/contracts` mock above).
const CORE = "0x00000000000000000000000000000000000c0e01";
const CLAUSE_REGISTRY = "0x00000000000000000000000000000000000c1a01";
const MEMBERS_REGISTRY = "0x00000000000000000000000000000000000e3b01";
const ASSEMBLY_REGISTRY = "0x00000000000000000000000000000000000a5501";
const AGREEMENT_REGISTRY = "0x00000000000000000000000000000000000a9e01";
const USAGE_COUNTER = "0x00000000000000000000000000000000000c0c01";
const MULTISENDER = "0x00000000000000000000000000000000000d1501";
const SWAP_COORDINATOR = "0x00000000000000000000000000000000000c0a01";
const ATTESTATION_COORDINATOR = "0x00000000000000000000000000000000000a7701";
const RPGF_MINTER = "0x00000000000000000000000000000000000f1001";
const PROBE_SPEC = { clauseId: "figaro-probe", version: 1, fields: [] };
// The signed agreement the `fetchAgreement` mock serves: no clause, its
// provenance leaf naming KEY as both the agreement and the assembly.
const SERVED_AGREEMENT = { clauses: [], provenance: { agreementHash: KEY, assemblyHash: KEY } } as unknown as Agreement;
const PROVENANCE_RECEIPT = provenanceLeafAttestation(SERVED_AGREEMENT);

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

/** One write as simulated and as sent: the contract, the function, its
 *  arguments, and the ETH stake where one is sent. */
interface Written {
    address: string;
    functionName: string;
    args: readonly unknown[];
    value?: bigint;
}

function writtenOf(config: { address: string; functionName: string; args: readonly unknown[]; value?: bigint }): Written {
    return { address: config.address.toLowerCase(), functionName: config.functionName, args: config.args, ...(config.value === undefined ? {} : { value: config.value }) };
}

/** Each write site: how to prepare its write (render, outside `act`), every
 *  write it sends in order, and the revert it is shown with. */
const SITES: Array<{
    site: string;
    prepare: () => Promise<() => Promise<unknown>>;
    writes: () => Written[];
    errorName: string;
    message: string | RegExp;
}> = [
    {
        site: "useRegisterMember",
        prepare: async () => { const h = rendered(() => useRegisterMember()); return () => h.current.register("ipfs://profile"); },
        writes: () => [{ address: MEMBERS_REGISTRY, functionName: "register", args: ["ipfs://profile"], value: STAKE }],
        errorName: "AlreadyRegistered",
        message: /already registered/i,
    },
    {
        site: "useUpdateProfile",
        prepare: async () => { const h = rendered(() => useUpdateProfile()); return () => h.current.updateProfile("ipfs://profile"); },
        writes: () => [{ address: MEMBERS_REGISTRY, functionName: "updateProfile", args: ["ipfs://profile"] }],
        errorName: "NotRegistered",
        message: /not registered/i,
    },
    {
        site: "useRequestWithdrawal",
        prepare: async () => { const h = rendered(() => useRequestWithdrawal()); return () => h.current.requestWithdrawal(); },
        writes: () => [{ address: MEMBERS_REGISTRY, functionName: "requestWithdrawal", args: [] }],
        errorName: "NotRegistered",
        message: /not registered/i,
    },
    {
        site: "useWithdrawDeposit",
        prepare: async () => { const h = rendered(() => useWithdrawDeposit()); return () => h.current.withdraw(); },
        writes: () => [{ address: MEMBERS_REGISTRY, functionName: "withdraw", args: [] }],
        errorName: "CooldownActive",
        message: "The stake is still locked: the withdrawal cooldown has not elapsed.",
    },
    {
        site: "useWithdrawClause",
        prepare: async () => { const h = rendered(() => useWithdrawClause()); return () => h.current.withdraw(KEY); },
        writes: () => [{ address: CLAUSE_REGISTRY, functionName: "withdrawDeposit", args: [KEY] }],
        errorName: "AlreadyWithdrawn",
        message: "This clause's registration stake has already been reclaimed.",
    },
    {
        site: "useWithdrawAssembly",
        prepare: async () => { const h = rendered(() => useWithdrawAssembly()); return () => h.current.withdraw(KEY); },
        writes: () => [{ address: ASSEMBLY_REGISTRY, functionName: "withdrawDeposit", args: [KEY] }],
        errorName: "AlreadyWithdrawn",
        message: "This assembly's registration stake has already been reclaimed.",
    },
    {
        site: "useWithdrawAgreement",
        prepare: async () => { const h = rendered(() => useWithdrawAgreement()); return () => h.current.withdraw(KEY); },
        writes: () => [{ address: AGREEMENT_REGISTRY, functionName: "withdrawDeposit", args: [KEY] }],
        errorName: "AlreadyWithdrawn",
        message: "This agreement's registration stake has already been reclaimed.",
    },
    {
        site: "useRegisterClause",
        prepare: async () => {
            const h = rendered(() => useRegisterClause());
            return () => h.current.register(PROBE_SPEC);
        },
        writes: () => [{ address: CLAUSE_REGISTRY, functionName: "registerClause", args: [computeClauseKey(PROBE_SPEC), "ipfs://bafyclause"], value: STAKE }],
        errorName: "ZeroClauseKey",
        message: /zero clause key/i,
    },
    {
        site: "usePayoutRoutingActions",
        prepare: async () => {
            const h = rendered(() => usePayoutRoutingActions());
            return () => h.current.routeTokenPayout(COMMITMENT.currency, [{ recipient: COMMITMENT.seller, amount: 5n }]);
        },
        // The allowance reads 0n, so the multisender is approved for the
        // batch total first, then the batch is dispersed.
        writes: () => [
            { address: COMMITMENT.currency.toLowerCase(), functionName: "approve", args: [MULTISENDER, 5n] },
            { address: MULTISENDER, functionName: "disperseToken", args: [COMMITMENT.currency, [COMMITMENT.seller], [5n]] },
        ],
        errorName: "BatchTooLarge",
        message: "BatchTooLarge",
    },
    {
        site: "useSwapAndCommitActions",
        prepare: async () => { const h = rendered(() => useSwapAndCommitActions()); return () => h.current.swapAndCommit(COMMITMENT, "0x01", "0x02"); },
        writes: () => [{
            address: SWAP_COORDINATOR,
            functionName: "swapAndCommit",
            args: [COMMITMENT, "0x01", "0x02", DISABLED_SWAP_FUNDING_LEG, DISABLED_SWAP_FUNDING_LEG],
        }],
        errorName: "OutputBelowBond",
        message: "OutputBelowBond",
    },
    {
        site: "useFigaroActions.commit",
        prepare: async () => { const h = rendered(() => useFigaroActions()); return () => h.current.commit(COMMITMENT, "0x01", "0x02"); },
        writes: () => [{ address: CORE, functionName: "commit", args: [COMMITMENT, "0x01", "0x02"] }],
        errorName: "DeadlineExpired",
        message: "Commitment deadline has expired",
    },
    {
        site: "useFigaroActions.resolveProcess",
        prepare: async () => { const h = rendered(() => useFigaroActions()); return () => h.current.resolveProcess(KEY, [COMMITMENT]); },
        writes: () => [{ address: CORE, functionName: "resolveProcess", args: [KEY, [COMMITMENT]] }],
        errorName: "NotProcessBuyer",
        message: "Only the process buyer can resolve",
    },
    {
        site: "useUsageRecorder.recordUsage (clause)",
        prepare: async () => {
            const write: UsageWrite = { kind: "clause", order: COMMITMENT, key: KEY, clauseDataHash: ORDER_HASH, proof: [KEY] };
            const h = rendered(() => useUsageRecorder());
            return () => h.current.recordUsage(write);
        },
        writes: () => [{ address: USAGE_COUNTER, functionName: "recordClauseUsage", args: [COMMITMENT, KEY, ORDER_HASH, [KEY]] }],
        errorName: "AlreadyCounted",
        message: "AlreadyCounted",
    },
    {
        site: "useUsageRecorder.recordUsage (agreement)",
        prepare: async () => {
            const write: UsageWrite = { kind: "agreement", order: COMMITMENT, key: KEY, assemblyHash: ORDER_HASH, proof: [KEY] };
            const h = rendered(() => useUsageRecorder());
            return () => h.current.recordUsage(write);
        },
        writes: () => [{ address: USAGE_COUNTER, functionName: "recordAgreementUsage", args: [COMMITMENT, KEY, ORDER_HASH, [KEY]] }],
        errorName: "AlreadyCounted",
        message: "AlreadyCounted",
    },
    {
        site: "useUsageRecorder.recordUsage (assembly)",
        prepare: async () => {
            const write: UsageWrite = {
                kind: "assembly", order: COMMITMENT, key: KEY, agreementHash: ORDER_HASH, slotContentHash: TX,
                proof: [KEY], membershipProof: [ORDER_HASH],
            };
            const h = rendered(() => useUsageRecorder());
            return () => h.current.recordUsage(write);
        },
        writes: () => [{ address: USAGE_COUNTER, functionName: "recordAssemblyUsage", args: [COMMITMENT, KEY, ORDER_HASH, TX, [KEY], [ORDER_HASH]] }],
        errorName: "AlreadyCounted",
        message: "AlreadyCounted",
    },
    {
        site: "useAttestationCoordinatorActions.submitAttestation",
        prepare: async () => {
            const h = rendered(() => useAttestationCoordinatorActions());
            return () => h.current.submitAttestation("buyer", { orderHash: ORDER_HASH, clauseId: PROVENANCE_LEAF_KEY, stage: 0 });
        },
        // A re-assertion (no content): the content reference is the
        // committed leaf's own fingerprint.
        writes: () => [{
            address: ATTESTATION_COORDINATOR,
            functionName: "attestAsBuyer",
            args: [COMMITMENT, PROVENANCE_LEAF_KEY, 0, PROVENANCE_RECEIPT.clauseDataHash, PROVENANCE_RECEIPT.proof, PROVENANCE_RECEIPT.clauseDataHash],
        }],
        errorName: "NotParty",
        message: "NotParty",
    },
    {
        site: "createCapabilityExecutors.attestProvenanceLeaf",
        prepare: async () => {
            const h = rendered(() => useAttestationCoordinatorActions());
            const deps = { submitAttestation: (...a: Parameters<typeof h.current.submitAttestation>) => h.current.submitAttestation(...a) };
            const { executorCallbacks } = createCapabilityExecutors(deps as unknown as CapabilityExecutorDeps);
            return () => executorCallbacks.attestProvenanceLeaf({
                executionType: "transaction", kind: "attest-provenance-leaf",
                orderHash: ORDER_HASH, agreementHash: KEY, assemblyHash: KEY, party: "buyer",
            });
        },
        // The buyer's attestation of the provenance leaf, stage 0, its content
        // the leaf's own bytes, bound by their hash.
        writes: () => [{
            address: ATTESTATION_COORDINATOR,
            functionName: "attestAsBuyer",
            args: [COMMITMENT, PROVENANCE_LEAF_KEY, 0, PROVENANCE_RECEIPT.clauseDataHash, PROVENANCE_RECEIPT.proof, keccak256(provenanceLeafBytes(KEY, KEY))],
        }],
        errorName: "NotParty",
        message: "NotParty",
    },
    {
        site: "useRpgfRewards.claim",
        prepare: async () => {
            const h = rendered(() => useRpgfRewards());
            await waitFor(() => expect(h.current.read).toMatchObject({ status: "present", value: { periods: [expect.anything()] } }));
            return () => h.current.claim(0);
        },
        // The wallet's one accruing clause (the `UsageRecorded` fixture), by
        // its (kind, key) pair, for period 0.
        writes: () => [{ address: RPGF_MINTER, functionName: "claim", args: [0, [{ kind: USAGE_KIND_CLAUSE, key: KEY }]] }],
        errorName: "NothingToClaim",
        message: "NothingToClaim",
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

    for (const { site, prepare, writes, errorName, message } of SITES) {
        it(`${site} simulates, then sends with chainId: activeChain.id, exactly the calls it writes, and waits for each success receipt`, async () => {
            const call = await prepare();
            const caught = await invokeCaught(call);
            expect(caught).toBeUndefined();
            const expected = writes();
            const sent = w.write.mock.calls.map(([config]) => config);
            expect(sent.map(writtenOf)).toEqual(expected);
            for (const config of sent) expect(config.chainId).toBe(activeChain.id);
            // The call simulated is the call sent, each simulated before it is
            // sent and its receipt read after.
            expect(simulate().mock.calls.map(([config]) => writtenOf(config))).toEqual(expected);
            expect(receipt().mock.calls).toEqual(expected.map(() => [{ hash: TX }]));
            expected.forEach((_, i) => {
                expect(simulate().mock.invocationCallOrder[i]).toBeLessThan(w.write.mock.invocationCallOrder[i]);
                expect(w.write.mock.invocationCallOrder[i]).toBeLessThan(receipt().mock.invocationCallOrder[i]);
            });
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

    it("a mined-but-reverted write is never reported as sent", async () => {
        receipt().mockResolvedValue({ status: "reverted" });
        const h = rendered(() => useRequestWithdrawal());
        const caught = await invokeCaught(() => h.current.requestWithdrawal());
        expect(caught).toBeInstanceOf(Error);
        expect((caught as Error).message).toBe(`Transaction reverted on-chain (tx ${TX}). The withdrawal was not requested.`);
    });
});

/**
 * The census: every file under the frontend's source that opens the wallet
 * (`useWriteContract`, `useSignTypedData`, a raw `signTypedData` or
 * `sendTransaction`) or sends through the shared helper (`simulateWrite`,
 * `simulateWriteVerify`), with how many times it does, the sites it holds and
 * the test file that pins what each one writes. A new write anywhere — or one
 * moved — changes the scan and fails this until it is listed with its test.
 */
const WRITE_TOKENS = ["useWriteContract", "useSignTypedData", "signTypedDataAsync", "signTypedData", "sendTransaction", "simulateWriteVerify", "simulateWrite"] as const;
type Census = Record<string, { tokens: Partial<Record<(typeof WRITE_TOKENS)[number], number>>; sites: string[]; pinnedBy: string } | { tokens: Partial<Record<(typeof WRITE_TOKENS)[number], number>>; notASite: string }>;

const THIS_FILE = "tests/lib/contractWriteSites.test.tsx";
const CENSUS: Census = {
    "hooks/useTokenApproval.ts": { tokens: { useWriteContract: 1, simulateWrite: 1 }, sites: ["useTokenApproval"], pinnedBy: "tests/lib/useTokenApproval.test.tsx" },
    "lib/checkout/orderCommitmentFlow.ts": { tokens: { useSignTypedData: 1, signTypedDataAsync: 2 }, sites: ["signCommitment", "signAndShare", "acceptOrder"], pinnedBy: "tests/lib/orderCommitmentFlowSign.test.tsx" },
    "lib/composition/swapFunding.ts": { tokens: { signTypedData: 1 }, sites: ["signFundingLeg"], pinnedBy: "tests/lib/swapFundingQuoteSign.test.ts" },
    "lib/composition/useAttestationCoordinatorActions.ts": { tokens: { useWriteContract: 1, simulateWriteVerify: 1 }, sites: ["useAttestationCoordinatorActions.submitAttestation", "createCapabilityExecutors.attestProvenanceLeaf"], pinnedBy: THIS_FILE },
    "lib/composition/usePayoutRoutingActions.ts": { tokens: { useWriteContract: 1, simulateWriteVerify: 2 }, sites: ["usePayoutRoutingActions"], pinnedBy: THIS_FILE },
    "lib/composition/useRpgfRewards.ts": { tokens: { useWriteContract: 1, simulateWriteVerify: 1 }, sites: ["useRpgfRewards.claim"], pinnedBy: THIS_FILE },
    "lib/composition/useSwapAndCommitActions.ts": { tokens: { useWriteContract: 1, simulateWriteVerify: 1 }, sites: ["useSwapAndCommitActions"], pinnedBy: THIS_FILE },
    "lib/composition/useSwapFunding.ts": { tokens: {}, sites: ["useSwapFunding"], pinnedBy: "tests/lib/useSwapFunding.test.tsx" },
    "lib/designer/publishAssembly.ts": { tokens: { useWriteContract: 2, simulateWrite: 2, simulateWriteVerify: 3 }, sites: ["usePublishAgreement", "usePublishAssembly"], pinnedBy: "tests/lib/publishAssemblyWrites.test.tsx" },
    "lib/kernel/useFigaroActions.ts": { tokens: { useWriteContract: 1, simulateWriteVerify: 1 }, sites: ["useFigaroActions.commit", "useFigaroActions.resolveProcess"], pinnedBy: THIS_FILE },
    "lib/member/useMembersRegistry.ts": { tokens: { useWriteContract: 1, simulateWriteVerify: 1 }, sites: ["useRegisterMember", "useUpdateProfile", "useRequestWithdrawal", "useWithdrawDeposit"], pinnedBy: THIS_FILE },
    "lib/member/usePublishMemberProfile.ts": { tokens: { useWriteContract: 1, simulateWriteVerify: 2 }, sites: ["register", "updateProfile"], pinnedBy: "tests/lib/publishMemberProfileNoCatalog.test.tsx" },
    "lib/protocol/useClauseRegistry.ts": { tokens: { useWriteContract: 1, simulateWriteVerify: 1 }, sites: ["useRegisterClause"], pinnedBy: THIS_FILE },
    "lib/protocol/useUsageRecorder.ts": { tokens: { useWriteContract: 1, simulateWrite: 1, simulateWriteVerify: 1 }, sites: ["useUsageRecorder.recordUsage (clause)", "useUsageRecorder.recordUsage (agreement)", "useUsageRecorder.recordUsage (assembly)"], pinnedBy: THIS_FILE },
    "lib/protocol/useWithdrawStake.ts": { tokens: { useWriteContract: 1, simulateWriteVerify: 1 }, sites: ["useWithdrawClause", "useWithdrawAssembly", "useWithdrawAgreement"], pinnedBy: THIS_FILE },
    "lib/shared/contractWrite.ts": { tokens: { simulateWrite: 2, simulateWriteVerify: 1 }, notASite: "the shared helper itself: its two definitions and simulateWriteVerify's own simulate" },
    "lib/shared/devShims.ts": { tokens: { sendTransaction: 1 }, notASite: "the dev signer's EIP-1193 transport, which forwards a write the wallet was asked for" },
};

/** Files whose writes reach the wallet only through a write hook listed
 *  above, so the scan has no token in them; each is still a site. */
const INDIRECT = ["lib/composition/useSwapFunding.ts"];

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) return sourceFiles(full);
        return /\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name) ? [full] : [];
    });
}

function scanWriteTokens(): Record<string, Partial<Record<(typeof WRITE_TOKENS)[number], number>>> {
    const found: Record<string, Partial<Record<(typeof WRITE_TOKENS)[number], number>>> = {};
    for (const file of ["app", "components", "hooks", "lib"].flatMap(sourceFiles)) {
        const text = readFileSync(file, "utf8");
        for (const token of WRITE_TOKENS) {
            const count = (text.match(new RegExp(`\\b${token}\\s*\\(`, "g")) ?? []).length;
            if (count === 0) continue;
            (found[file.split(path.sep).join("/")] ??= {})[token] = count;
        }
    }
    return found;
}

describe("the write-site census", () => {
    it("every file that opens the wallet or sends through the helper is listed, with its count", () => {
        const listed = Object.fromEntries(Object.entries(CENSUS).filter(([file]) => !INDIRECT.includes(file)).map(([file, entry]) => [file, entry.tokens]));
        expect(scanWriteTokens()).toEqual(listed);
    });

    it("every listed site is pinned by a test file that exists and names it", () => {
        for (const [file, entry] of Object.entries(CENSUS)) {
            expect(existsSync(file), file).toBe(true);
            if ("notASite" in entry) continue;
            expect(existsSync(entry.pinnedBy), `${file} → ${entry.pinnedBy}`).toBe(true);
            const test = readFileSync(entry.pinnedBy, "utf8");
            for (const site of entry.sites) expect(test.includes(site), `${entry.pinnedBy} names ${site}`).toBe(true);
        }
    });

    it("the sites this file pins are exactly the SITES above", () => {
        const pinnedHere = Object.values(CENSUS).flatMap((entry) => ("pinnedBy" in entry && entry.pinnedBy === THIS_FILE ? entry.sites : []));
        expect(SITES.map((s) => s.site).sort()).toEqual([...pinnedHere].sort());
    });
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
