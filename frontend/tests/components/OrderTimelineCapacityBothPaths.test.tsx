/**
 * The order page (`/orders/view`) states how many orders of an open process
 * can still resolve in one call, whichever path made the process. The Core's
 * `processes(id)` getter answers zeros for good for a process made on the
 * batch path, and the batch verifier keeps no getter. The verifier emits the
 * Core's own `OrderCommitted` and `OrderResolved`, so the line counts a
 * batched process's open orders from those logs.
 *
 * The logs are the bytes a node returns. They are read through the real hook
 * (`useProcessResolveCapacity`) and the real SDK reader
 * (`readProcessResolveCapacity`, `readProcessState`), and shown by the real
 * page (`OrderTimelineView`). The page's own order reads go through the event
 * cache, stood in for as in `OrderTimelineResolvedBothPaths.test.tsx`; the
 * capacity read goes through the public client, whose getter, block and log
 * answers are stood in for: the log answer is every log under the queried
 * address, and the SDK's parsers keep the events they decode.
 *
 * Proves: for an open batched process with two landed orders, the line reads
 * "2 / 546"; for an open direct process the Core's getter gives the count.
 * Does not prove: that a relay lands the batch (the devnet spec
 * `batch-events.devnet.spec.ts` does).
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { Hex } from "viem";
import { orderCommittedLog, word, type FixtureLog } from "../lib/__fixtures__/coreLogs";
import { ZERO_ADDRESS } from "@/lib/shared/evm";

const { cachedGetLogsMock, chainLogs, coreState, account, CORE, VERIFIER, CLIENT, BUYER } = vi.hoisted(() => {
    const chainLogs: { address: string; topics: string[]; blockNumber: bigint }[] = [];
    const coreState = new Map<string, readonly [string, string, bigint, bigint]>();
    return {
        cachedGetLogsMock: vi.fn(),
        chainLogs,
        coreState,
        account: { address: "0x00000000000000000000000000000000000000b1" as `0x${string}` | undefined },
        CORE: "0x1111111111111111111111111111111111111111",
        VERIFIER: "0x2222222222222222222222222222222222222222",
        BUYER: "0x00000000000000000000000000000000000000b1" as const,
        // The public client the capacity hook reads through: the Core's getter
        // from a table (an unknown id reads as the zero struct, as the mapping
        // does), the block's gas limit, and the logs under the queried address,
        // whatever events the query names.
        CLIENT: {
            chain: { id: 31337 },
            readContract: vi.fn(async ({ functionName, args }: { functionName: string; args: readonly unknown[] }) => {
                if (functionName !== "processes") throw new Error(`unexpected read ${functionName}`);
                return coreState.get((args[0] as string).toLowerCase()) ?? [ZERO_ADDRESS, ZERO_ADDRESS, 0n, 0n];
            }),
            getBlock: vi.fn(async () => ({ gasLimit: 30_000_000n })),
            getBlockNumber: vi.fn(async () => 50n),
            getLogs: vi.fn(async ({ address }: { address: string }) =>
                chainLogs.filter((l) => l.address.toLowerCase() === address.toLowerCase())),
        },
    };
});

vi.mock("wagmi", async () => (await import("../support/wagmiMock")).wagmiMock({ address: () => account.address, client: () => CLIENT }, {
    useWaitForTransactionReceipt: () => ({ isLoading: false, isSuccess: false }),
    useWatchContractEvent: () => undefined,
    useReadContract: () => ({ data: undefined, isLoading: false }),
    useSignTypedData: () => ({ signTypedDataAsync: vi.fn() }),
}));
vi.mock("@/lib/core/eventCache", () => ({
    cachedGetLogs: (...args: unknown[]) => cachedGetLogsMock(...args),
    cachedGetReceiptLogs: vi.fn(),
    deploymentBlock: () => 0n,
}));
vi.mock("@/lib/core/contracts", async (importOriginal) =>
    (await import("../support/contractsMock")).contractsMock(await importOriginal<typeof import("@/lib/core/contracts")>(), { contracts: { core: CORE, batchVerifier: VERIFIER }, batchVerifier: () => VERIFIER }));
vi.mock("@/lib/shared/publicClient", () => ({ publicClient: CLIENT }));
vi.mock("@/lib/shared/e2e", () => ({ isE2EMockSession: () => false }));

vi.mock("@/hooks/useProcessAgreements", () => ({ useProcessAgreements: () => new Map() }));
vi.mock("@/lib/core/attestationIndexer", () => ({ getAttestationsByProcess: async () => [] }));
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true }) }));
vi.mock("@/lib/registries/useMemberListings", () => ({ useMemberListings: () => ({ read: { status: "present", value: [] } }) }));
vi.mock("@/hooks/useTokenDecimals", async () => (await import("../support/tokenDecimalsMock")).tokenDecimalsMock(18));
vi.mock("@/hooks/useTokenSymbol", () => ({ useTokenSymbol: () => ({ data: "TKN" }) }));
vi.mock("@/hooks/useTokenApproval", () => ({ default: () => ({ needsApproval: () => false, approve: vi.fn(), refetchAllowance: vi.fn() }) }));
vi.mock("@/lib/core/useFigaroActions", () => ({ useFigaroActions: () => ({ resolveProcess: vi.fn(), hash: undefined, isPending: false }) }));
vi.mock("@/lib/rewards/useUsageRecorder", () => ({ useUsageRecorder: () => ({}) }));
vi.mock("@/lib/core/useAttestationCoordinatorActions", () => ({
    useAttestationCoordinatorActions: () => ({ isPending: false, isConfirming: false, isSuccess: false, submitAttestation: vi.fn() }),
}));
vi.mock("@/lib/registries/useMembersRegistry", () => ({
    useRegisterMember: () => ({ register: vi.fn(), isPending: false, isConfirming: false, isSuccess: false }),
    useUpdateProfile: () => ({ updateProfile: vi.fn(), isPending: false, isConfirming: false, isSuccess: false }),
    useWithdrawDeposit: () => ({ withdraw: vi.fn(), isPending: false, isConfirming: false, isSuccess: false }),
    useWithdrawalCooldown: () => ({ data: 60n }),
}));
vi.mock("@/lib/composability/usePayoutRoutingActions", () => ({
    usePayoutRoutingActions: () => ({ routeTokenPayout: vi.fn(), isRouting: false, isAvailable: true }),
}));
vi.mock("@/lib/semantic/createCapabilityExecutors", () => ({ createCapabilityExecutors: () => ({ executorCallbacks: {} }) }));

import { OrderTimelineView } from "@/app/(app)/orders/_components/OrderTimelineView";

const PROCESS = word(0xba7c);
const SELLER = "0x00000000000000000000000000000000000000a1" as const;

/** Two landed orders of one open process under `emitter`, payments 7 and 3. */
function twoOrders(emitter: string): FixtureLog[] {
    return [
        orderCommittedLog({ address: emitter, blockNumber: 4n, orderHash: word(0x0bd1), processId: PROCESS, buyer: BUYER, seller: SELLER, payment: 7n, runningTotal: 7n }),
        orderCommittedLog({ address: emitter, blockNumber: 6n, orderHash: word(0x0bd2), processId: PROCESS, buyer: BUYER, seller: SELLER, payment: 3n, runningTotal: 10n }),
    ];
}

/** The page's own reads: `emitter` emits the orders, the other emitter nothing. */
function pageReads(emitter: string, logs: FixtureLog[]) {
    cachedGetLogsMock.mockImplementation(async (_c: unknown, _id: number, opts: { address: string; eventName: string }) =>
        opts.address.toLowerCase() === emitter.toLowerCase() && opts.eventName === "OrderCommitted" ? logs : [],
    );
}

describe("/orders/view: the line on how many orders of an open process can still resolve", () => {
    beforeEach(() => {
        cachedGetLogsMock.mockReset();
        chainLogs.splice(0, chainLogs.length);
        coreState.clear();
        CLIENT.getLogs.mockClear();
        account.address = BUYER;
    });

    it("counts a batched process's landed orders from the verifier's logs", async () => {
        const logs = twoOrders(VERIFIER);
        pageReads(VERIFIER, logs);
        chainLogs.push(...(logs as unknown as typeof chainLogs));
        render(<OrderTimelineView processId={PROCESS} />);

        const line = await screen.findByTestId("order-process-capacity", {}, { timeout: 5000 });
        await waitFor(() => expect(line.textContent).toMatch(/2 \/ 546 resolvable in one call/));
        const read = CLIENT.getLogs.mock.calls.map((c) => (c[0] as { address: string }).address.toLowerCase());
        expect(read).toContain(VERIFIER);
    });

    it("counts a direct process's orders from the Core's getter", async () => {
        const logs = twoOrders(CORE);
        pageReads(CORE, logs);
        coreState.set(PROCESS.toLowerCase(), [BUYER, "0x00000000000000000000000000000000000000c1", 10n, 2n]);
        render(<OrderTimelineView processId={PROCESS as Hex} />);

        const line = await screen.findByTestId("order-process-capacity", {}, { timeout: 5000 });
        await waitFor(() => expect(line.textContent).toMatch(/2 \/ 546 resolvable in one call/));
        expect(CLIENT.getLogs).not.toHaveBeenCalled();
    });
});
