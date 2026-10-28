import { describe, expect, it } from "vitest";
import { BaseError, ContractFunctionRevertedError, RpcRequestError } from "viem";

import { extractErrorMessage, rpcErrorText } from "@/lib/shared/errors";

describe("extractErrorMessage", () => {
    describe("FigaroCore revert decoding", () => {
        it("maps a known FigaroCore errorName to its friendly message", () => {
            const revert = new ContractFunctionRevertedError({
                abi: [],
                data: "0x" as `0x${string}`,
                functionName: "resolveProcess",
            });
            // Hand-set the decoded errorName (viem populates this via the ABI).
            (revert as unknown as { data: { errorName: string } }).data = {
                errorName: "ProcessAlreadyResolved",
            };
            const wrapped = new BaseError("wrapper", { cause: revert });
            expect(extractErrorMessage(wrapped, "fallback")).toBe(
                "Process has already been resolved",
            );
        });

        it("returns the raw errorName for an unrecognized contract error", () => {
            const revert = new ContractFunctionRevertedError({
                abi: [],
                data: "0x" as `0x${string}`,
                functionName: "foo",
            });
            (revert as unknown as { data: { errorName: string } }).data = {
                errorName: "SomeNonFigaroError",
            };
            const wrapped = new BaseError("wrapper", { cause: revert });
            expect(extractErrorMessage(wrapped, "fallback")).toBe("SomeNonFigaroError");
        });
    });

    describe("wallet rejection", () => {
        it("recognizes a 'User rejected' viem BaseError", () => {
            const err = new BaseError("User rejected the request");
            expect(extractErrorMessage(err, "fallback")).toBe("Transaction was rejected");
        });
    });

    describe("generic viem / mempool errors", () => {
        it("falls back to BaseError.shortMessage", () => {
            const err = new BaseError("long message");
            (err as unknown as { shortMessage: string }).shortMessage = "out of gas";
            expect(extractErrorMessage(err, "fallback")).toBe("out of gas");
        });
    });

    describe("plain Error / object inputs", () => {
        it("prefers shortMessage on a plain object", () => {
            expect(
                extractErrorMessage({ shortMessage: "short", message: "long" }, "fallback"),
            ).toBe("short");
        });

        it("uses Error.message before falling back", () => {
            expect(extractErrorMessage(new Error("boom"), "fallback")).toBe("boom");
            expect(extractErrorMessage(undefined, "fallback")).toBe("fallback");
        });

        it("truncates messages when maxLength is provided", () => {
            expect(
                extractErrorMessage({ message: "abcdefghij" }, "fallback", { maxLength: 5 }),
            ).toBe("abcde");
        });
    });
});

describe("rpcErrorText", () => {
    it("returns the provider's own JSON-RPC message, not viem's generic short message", () => {
        // The error the live /registries page caught from publicnode's Sepolia endpoint.
        const err = new RpcRequestError({
            body: { method: "eth_getLogs" },
            error: { code: 4444, message: "pruned history unavailable" },
            url: "https://ethereum-sepolia-rpc.publicnode.com",
        });
        expect(extractErrorMessage(err, "fallback")).toBe("RPC Request failed.");
        expect(rpcErrorText(err)).toBe("pruned history unavailable");
    });
    it("falls back to the message of an error with no details", () => {
        expect(rpcErrorText(new Error("HTTP request failed. Status: 429"))).toBe("HTTP request failed. Status: 429");
    });
});
