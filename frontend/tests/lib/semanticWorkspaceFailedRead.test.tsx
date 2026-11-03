/**
 * useSemanticProcessWorkspace — failed reads take no action:
 *  - a failed attestation read is never `[]`: no process model and so no
 *    attest/resolve capability is derived on it;
 *  - a failed `registrationDeposit` read sends no register transaction (never
 *    a value of 0).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const PROCESS = `0x${"ab".repeat(32)}`;
const ORDER = { orderHash: `0x${"01".repeat(32)}`, processId: PROCESS, checkoutHash: `0x${"cd".repeat(32)}`, currency: "0x0000000000000000000000000000000000000001", state: 0 };

const mocks = vi.hoisted(() => ({
    attestations: vi.fn(),
    derive: vi.fn(),
    executorDeps: null as null | { registerMember: (uri: string) => Promise<unknown> },
    register: vi.fn(),
    deposit: undefined as unknown,
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }),
    usePublicClient: () => ({ chain: { id: 31337 } }),
    useWaitForTransactionReceipt: () => ({ isLoading: false, isSuccess: false }),
}));
vi.mock("@/hooks/useWalletProcessIds", () => ({ useWalletProcessIds: () => [] }));
// Both shapes: an array for the old hook, a present read for the new one.
const ORDERS = Object.assign([ORDER], { status: "present", value: [ORDER] });
vi.mock("@/hooks/useProcessOrders", () => ({ useProcessOrders: () => ORDERS }));
vi.mock("@/hooks/useProcessAgreements", () => ({ useProcessAgreements: () => new Map() }));
vi.mock("@/hooks/useTokenApproval", () => ({ default: () => ({ needsApproval: () => false, approve: vi.fn(), refetchAllowance: vi.fn() }) }));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 18, ready: true }) }));
vi.mock("@/lib/kernel/useFigaroActions", () => ({ useFigaroActions: () => ({ resolveProcess: vi.fn(), hash: undefined, isPending: false }) }));
vi.mock("@/lib/protocol/useUsageRecorder", () => ({ useUsageRecorder: () => ({}) }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0 }) }));
vi.mock("@/lib/composition/useAttestationCoordinatorActions", () => ({
    useAttestationCoordinatorActions: () => ({ isPending: false, isConfirming: false, isSuccess: false, submitAttestation: vi.fn() }),
}));
vi.mock("@/lib/member/useMembersRegistry", () => ({
    useRegisterMember: () => ({ register: mocks.register, isPending: false, isConfirming: false, isSuccess: false }),
    useUpdateProfile: () => ({ updateProfile: vi.fn(), isPending: false, isConfirming: false, isSuccess: false }),
    useWithdrawDeposit: () => ({ withdraw: vi.fn(), isPending: false, isConfirming: false, isSuccess: false }),
    useRegistrationDeposit: () => mocks.deposit,
    useWithdrawalCooldown: () => ({ data: 60n }),
}));
vi.mock("@/lib/composition/indexer", () => ({ getAttestationsByProcess: (...a: unknown[]) => mocks.attestations(...a) }));
vi.mock("@/lib/semantic/deriveProcessModelFromRuntime", () => ({
    deriveProcessModelFromRuntime: (...a: unknown[]) => mocks.derive(...a),
}));
vi.mock("@/lib/semantic/createCapabilityExecutors", () => ({
    createCapabilityExecutors: (deps: { registerMember: (uri: string) => Promise<unknown> }) => {
        mocks.executorDeps = deps;
        return { executorCallbacks: {} };
    },
}));

import { useSemanticProcessWorkspace } from "@/hooks/useSemanticProcessWorkspace";

const MODEL = { capabilities: [{ id: "attest" }], orders: [] };

describe("useSemanticProcessWorkspace — failed reads take no action", () => {
    afterEach(() => { vi.clearAllMocks(); });

    it("a failed attestation read derives no model and offers no capability", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        mocks.deposit = { status: "present", value: 1n, data: 1n };
        mocks.attestations.mockRejectedValue(new Error("fetch failed: RPC unreachable"));
        mocks.derive.mockReturnValue(MODEL);
        const { result } = renderHook(() => useSemanticProcessWorkspace({ processId: PROCESS }));
        await waitFor(() => expect(mocks.attestations).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 20));
        expect(result.current.processModel).toBeNull();
        expect(result.current.runtimeCapabilities).toEqual([]);
        expect(mocks.derive).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(), []);
    });

    it("a failed registrationDeposit read sends no register transaction", async () => {
        mocks.deposit = { status: "absent", data: undefined };
        mocks.attestations.mockResolvedValue([]);
        mocks.derive.mockReturnValue(MODEL);
        renderHook(() => useSemanticProcessWorkspace({ processId: PROCESS }));
        await waitFor(() => expect(mocks.executorDeps).not.toBeNull());
        await mocks.executorDeps!.registerMember("ipfs://profile");
        expect(mocks.register).not.toHaveBeenCalled();
    });
});
