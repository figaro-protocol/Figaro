import { vi, describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import useTokenApproval from "@/hooks/core/useTokenApproval";

// Valid 65-byte signature: r (32 bytes) + s (32 bytes) + v (1 byte = 0x1b = 27)
const fakeSignature = "0x" + "a".repeat(128) + "1b";

vi.mock("wagmi", () => {
    return {
        useReadContract: (opts: any) => {
            const fn = opts?.functionName;
            if (fn === "allowance") return { data: 0n, refetch: vi.fn() };
            if (fn === "nonces") return { data: 0n };
            if (fn === "name") return { data: "MockToken" };
            return { data: undefined };
        },
        useWriteContract: () => ({
            writeContract: vi.fn((call: any) => Promise.resolve({ hash: "0xdead" })),
            data: undefined,
            isLoading: false,
        }),
        useWaitForTransactionReceipt: () => ({ isLoading: false, isSuccess: true }),
        useSignTypedData: () => ({ signTypedDataAsync: vi.fn(() => Promise.resolve(fakeSignature)) }),
        useChainId: () => 1,
    };
});

describe("useTokenApproval", () => {
    it("needsApproval returns true when allowance is zero and approve writes", async () => {
        let hookResult: any = null;
        function Test() {
            // call hook inside component
            // @ts-ignore
            hookResult = useTokenApproval({ tokenAddress: "0x0000000000000000000000000000000000000001", owner: "0x0000000000000000000000000000000000000002", spender: "0x0000000000000000000000000000000000000003" });
            return null;
        }

        render(<Test />);

        expect(hookResult).toBeTruthy();
        const needs = hookResult.needsApproval(1000n);
        expect(needs).toBe(true);

        await act(async () => {
            const res = await hookResult.approve(1000n);
            expect(res).toBeDefined();
        });
    });

    it("permit signs typed data and calls permit write", async () => {
        let hookResult: any = null;
        function Test() {
            // @ts-ignore
            hookResult = useTokenApproval({ tokenAddress: "0x0000000000000000000000000000000000000001", owner: "0x0000000000000000000000000000000000000002", spender: "0x0000000000000000000000000000000000000003" });
            return null;
        }

        render(<Test />);

        await act(async () => {
            await expect(hookResult.permit(500n)).resolves.toBeDefined();
        });
    });
});
