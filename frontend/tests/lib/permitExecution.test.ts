import { describe, expect, it, vi } from "vitest";
import { submitPermitTransaction } from "@/lib/core/permitExecution";

describe("submitPermitTransaction", () => {
    it("sends the permit transaction and waits for confirmation when a public client is available", async () => {
        const sendTransaction = vi.fn(async () => "0xabc" as `0x${string}`);
        const publicClient = {
            waitForTransactionReceipt: vi.fn(async () => undefined),
        };

        const hash = await submitPermitTransaction({
            permit: {
                target: "0x2222222222222222222222222222222222222222",
                data: "0x1234",
            },
            sendTransaction,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            publicClient: publicClient as any,
        });

        expect(hash).toBe("0xabc");
        expect(sendTransaction).toHaveBeenCalledWith({
            to: "0x2222222222222222222222222222222222222222",
            data: "0x1234",
        });
        expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: "0xabc" });
    });

    it("returns the permit transaction hash even without a public client", async () => {
        const sendTransaction = vi.fn(async () => "0xdef" as `0x${string}`);

        const hash = await submitPermitTransaction({
            permit: {
                target: "0x3333333333333333333333333333333333333333",
                data: "0x5678",
            },
            sendTransaction,
        });

        expect(hash).toBe("0xdef");
        expect(sendTransaction).toHaveBeenCalledWith({
            to: "0x3333333333333333333333333333333333333333",
            data: "0x5678",
        });
    });
});