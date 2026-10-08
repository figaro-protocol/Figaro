/**
 * useApproveThenAct — the pending action fires on the approval's success and
 * never on a LATER approval's success once its own approval was refused. A
 * wagmi refusal is asynchronous: `approve()` returns normally and the error
 * arrives as `isApproveError`. A mined approve that REVERTED reads as a
 * receipt with status "reverted": `useTokenApproval` reports that as the
 * error, never the success, so the pended action is dropped.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useApproveThenAct } from "@/hooks/useApproveThenAct";
import useTokenApproval from "@/hooks/useTokenApproval";

// The wagmi surface `useTokenApproval` reads, driven per test: the allowance
// read, the approve mutation, and the approve's receipt query.
const wagmiState = vi.hoisted(() => ({
    approveHash: undefined as `0x${string}` | undefined,
    receipt: { data: undefined as { status: "success" | "reverted" } | undefined, isLoading: false, isSuccess: false, isError: false },
    writeContract: (() => {}) as (args: unknown) => void,
}));
vi.mock("wagmi", () => ({
    useReadContract: () => ({ data: 0n, isFetched: true, isRefetching: false, refetch: vi.fn() }),
    useWriteContract: () => ({ writeContract: wagmiState.writeContract, data: wagmiState.approveHash, isPending: false, isError: false }),
    useWaitForTransactionReceipt: () => wagmiState.receipt,
}));

type Props = { isApproveSuccess: boolean; isApproveError: boolean };

function setup(approve = vi.fn()) {
    const hook = renderHook(
        ({ isApproveSuccess, isApproveError }: Props) =>
            useApproveThenAct({ needsApproval: () => true, approve, isApproveSuccess, isApproveError }),
        { initialProps: { isApproveSuccess: false, isApproveError: false } },
    );
    return { ...hook, approve };
}

describe("useApproveThenAct", () => {
    it("runs the action at once when the allowance covers the amount", () => {
        const approve = vi.fn();
        const act = vi.fn();
        const { result } = renderHook(() =>
            useApproveThenAct({ needsApproval: () => false, approve, isApproveSuccess: false, isApproveError: false }));
        result.current.runWithApproval(5n, act);
        expect(act).toHaveBeenCalledTimes(1);
        expect(approve).not.toHaveBeenCalled();
    });

    it("pends the action until the approval confirms, with a 10x approval", () => {
        const act = vi.fn();
        const { result, rerender, approve } = setup();
        result.current.runWithApproval(5n, act);
        expect(approve).toHaveBeenCalledWith(50n);
        expect(act).not.toHaveBeenCalled();
        rerender({ isApproveSuccess: true, isApproveError: false });
        expect(act).toHaveBeenCalledTimes(1);
    });

    it("drops the pending action when the wallet refuses the approval asynchronously", () => {
        const refused = vi.fn();
        const { result, rerender } = setup();
        result.current.runWithApproval(5n, refused);
        // The refusal arrives later, as the mutation's error state.
        rerender({ isApproveSuccess: false, isApproveError: true });
        // A later, unrelated approval confirms — the refused action stays dropped.
        rerender({ isApproveSuccess: false, isApproveError: false });
        rerender({ isApproveSuccess: true, isApproveError: false });
        expect(refused).not.toHaveBeenCalled();
    });

    it("a retry after a refusal fires the retried action on its success", () => {
        const refused = vi.fn();
        const retried = vi.fn();
        const { result, rerender } = setup();
        result.current.runWithApproval(5n, refused);
        rerender({ isApproveSuccess: false, isApproveError: true });
        // The retry is pended while the previous error still stands; the new
        // send resets it, then the approval confirms.
        result.current.runWithApproval(5n, retried);
        rerender({ isApproveSuccess: false, isApproveError: false });
        rerender({ isApproveSuccess: true, isApproveError: false });
        expect(refused).not.toHaveBeenCalled();
        expect(retried).toHaveBeenCalledTimes(1);
    });

    it("clears the pending action on a synchronous approve() throw and rethrows", () => {
        const act = vi.fn();
        const { result, rerender } = setup(vi.fn(() => { throw new Error("no wallet"); }));
        expect(() => result.current.runWithApproval(5n, act)).toThrow("no wallet");
        rerender({ isApproveSuccess: true, isApproveError: false });
        expect(act).not.toHaveBeenCalled();
    });
});

describe("useTokenApproval → useApproveThenAct — a reverted approve", () => {
    const TOKEN = "0x00000000000000000000000000000000000000aa" as const;
    const OWNER = "0x00000000000000000000000000000000000000bb" as const;
    const SPENDER = "0x00000000000000000000000000000000000000cc" as const;

    /** Both hooks composed as the order surfaces compose them. */
    function composed() {
        return renderHook(() => {
            const approval = useTokenApproval({ tokenAddress: TOKEN, owner: OWNER, spender: SPENDER });
            const { runWithApproval } = useApproveThenAct({
                needsApproval: approval.needsApproval,
                approve: approval.approve,
                isApproveSuccess: approval.isApproveSuccess,
                isApproveError: approval.isApproveError,
            });
            return { approval, runWithApproval };
        });
    }

    function mined(status: "success" | "reverted") {
        wagmiState.approveHash = "0x01";
        wagmiState.receipt = { data: { status }, isLoading: false, isSuccess: true, isError: false };
    }

    it("a receipt with status reverted is the error, not the success, and the action never fires", () => {
        wagmiState.approveHash = undefined;
        wagmiState.receipt = { data: undefined, isLoading: false, isSuccess: false, isError: false };
        wagmiState.writeContract = vi.fn();
        const act = vi.fn();
        const { result, rerender } = composed();
        result.current.runWithApproval(5n, act);
        expect(wagmiState.writeContract).toHaveBeenCalledTimes(1);

        mined("reverted");
        rerender();
        expect(result.current.approval.isApproveSuccess).toBe(false);
        expect(result.current.approval.isApproveError).toBe(true);
        expect(act).not.toHaveBeenCalled();

        // A later approval's success does not resurrect the dropped action.
        mined("success");
        rerender();
        expect(act).not.toHaveBeenCalled();
    });

    it("a receipt with status success is the success, and the pended action fires", () => {
        wagmiState.approveHash = undefined;
        wagmiState.receipt = { data: undefined, isLoading: false, isSuccess: false, isError: false };
        wagmiState.writeContract = vi.fn();
        const act = vi.fn();
        const { result, rerender } = composed();
        result.current.runWithApproval(5n, act);

        mined("success");
        rerender();
        expect(result.current.approval.isApproveSuccess).toBe(true);
        expect(result.current.approval.isApproveError).toBe(false);
        expect(act).toHaveBeenCalledTimes(1);
    });
});
