/**
 * Shape assertions for the external-canonical-contract ABIs the swap-funded
 * bond path composes with: Permit2's witness transfer surface (the
 * coordinator's on-chain pull — `WitnessSwapAndCommitCoordinator._fund`) and
 * the Uniswap SwapRouter02 / QuoterV2 pair the venue seam
 * (`frontend/lib/composition/swapVenue.ts`) encodes against. These are curated
 * constants for EXTERNAL contracts (not Figaro's), same rationale as
 * `ERC20_ABI` — so no kernel/registry-style behavioral test applies. This file
 * pins the function surfaces with their expected arity, so a future edit can't
 * silently narrow or rename them out from under integrators — and freezes one
 * golden `exactOutputSingle` calldata vector that the frontend venue seam's
 * own suite (`frontend/tests/lib/swapVenue.test.ts`) must reproduce byte for
 * byte from `route()`: the cross-surface lockstep proof that what an
 * integrator builds from this package is what the shipped venue seam signs.
 */
import { describe, expect, it } from "vitest";
import type { AbiFunction } from "viem";
import { encodeFunctionData, getAddress } from "viem";
import { PERMIT2_ABI, QUOTER_V2_ABI, SWAP_ROUTER_02_ABI } from "../src/abis.js";

function findFunctions(abi: readonly unknown[], name: string): AbiFunction[] {
    return (abi as AbiFunction[]).filter((item) => item.type === "function" && item.name === name);
}

describe("PERMIT2_ABI", () => {
    it("carries exactly one function: the witness variant of permitTransferFrom", () => {
        const functions = (PERMIT2_ABI as AbiFunction[]).filter((item) => item.type === "function");
        expect(functions).toHaveLength(1);
        expect(functions[0]!.name).toBe("permitWitnessTransferFrom");
    });

    it("permitWitnessTransferFrom takes the six args the coordinator's IPermit2WitnessTransfer interface declares", () => {
        const [fn] = findFunctions(PERMIT2_ABI, "permitWitnessTransferFrom");
        expect(fn).toBeDefined();
        expect(fn!.inputs).toHaveLength(6);
        expect(fn!.inputs.map((i) => i.name)).toEqual([
            "permit",
            "transferDetails",
            "owner",
            "witness",
            "witnessTypeString",
            "signature",
        ]);
        expect(fn!.inputs.map((i) => i.type)).toEqual([
            "tuple",
            "tuple",
            "address",
            "bytes32",
            "string",
            "bytes",
        ]);
        // permit = PermitTransferFrom { TokenPermissions permitted; uint256 nonce; uint256 deadline }
        const permitTuple = fn!.inputs[0] as { components: { name: string; type: string }[] };
        expect(permitTuple.components.map((c) => c.name)).toEqual(["permitted", "nonce", "deadline"]);
        const tokenPermissions = permitTuple.components[0] as unknown as {
            components: { name: string; type: string }[];
        };
        expect(tokenPermissions.components.map((c) => c.name)).toEqual(["token", "amount"]);
        // transferDetails = SignatureTransferDetails { address to; uint256 requestedAmount }
        const transferDetailsTuple = fn!.inputs[1] as { components: { name: string; type: string }[] };
        expect(transferDetailsTuple.components.map((c) => c.name)).toEqual(["to", "requestedAmount"]);
        expect(fn!.stateMutability).toBe("nonpayable");
    });
});

describe("SWAP_ROUTER_02_ABI", () => {
    it("carries exactly the venue shapes the coordinator's route composes: factory (the probe) and exactOutputSingle", () => {
        const functions = (SWAP_ROUTER_02_ABI as AbiFunction[]).filter((item) => item.type === "function");
        expect(functions.map((f) => f.name).sort()).toEqual(["exactOutputSingle", "factory"]);
    });

    it("exactOutputSingle takes SwapRouter02's single 7-field params tuple (NO deadline — that was SwapRouter01), payable", () => {
        const [fn] = findFunctions(SWAP_ROUTER_02_ABI, "exactOutputSingle");
        expect(fn).toBeDefined();
        expect(fn!.inputs).toHaveLength(1);
        const params = fn!.inputs[0] as { type: string; components: { name: string; type: string }[] };
        expect(params.type).toBe("tuple");
        expect(params.components.map((c) => [c.name, c.type])).toEqual([
            ["tokenIn", "address"],
            ["tokenOut", "address"],
            ["fee", "uint24"],
            ["recipient", "address"],
            ["amountOut", "uint256"],
            ["amountInMaximum", "uint256"],
            ["sqrtPriceLimitX96", "uint160"],
        ]);
        expect(fn!.stateMutability).toBe("payable");
        expect(fn!.outputs.map((o) => o.type)).toEqual(["uint256"]);
    });

    it("factory is the view probe the venue seam derives the venue kind from", () => {
        const [fn] = findFunctions(SWAP_ROUTER_02_ABI, "factory");
        expect(fn).toBeDefined();
        expect(fn!.inputs).toHaveLength(0);
        expect(fn!.stateMutability).toBe("view");
        expect(fn!.outputs.map((o) => o.type)).toEqual(["address"]);
    });

    // The golden vector: these exact parameters appear again in
    // frontend/tests/lib/swapVenue.test.ts, where the venue's route() must
    // produce this same byte string — regenerate BOTH from a fresh encode if
    // the ABI ever legitimately changes, never by editing one side's hex.
    it("encodes exactOutputSingle calldata under the canonical SwapRouter02 selector 0x5023b4df (golden vector)", () => {
        const calldata = encodeFunctionData({
            abi: SWAP_ROUTER_02_ABI,
            functionName: "exactOutputSingle",
            args: [{
                tokenIn: ("0x" + "11".repeat(20)) as `0x${string}`,
                tokenOut: ("0x" + "22".repeat(20)) as `0x${string}`,
                fee: 100,
                recipient: getAddress("0x" + "c0".repeat(20)),
                amountOut: 3_000_000n,
                amountInMaximum: 1_255n,
                sqrtPriceLimitX96: 0n,
            }],
        });
        expect(calldata).toBe(
            "0x5023b4df" +
            "0000000000000000000000001111111111111111111111111111111111111111" +
            "0000000000000000000000002222222222222222222222222222222222222222" +
            "0000000000000000000000000000000000000000000000000000000000000064" +
            "000000000000000000000000c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0" +
            "00000000000000000000000000000000000000000000000000000000002dc6c0" +
            "00000000000000000000000000000000000000000000000000000000000004e7" +
            "0000000000000000000000000000000000000000000000000000000000000000",
        );
    });
});

describe("QUOTER_V2_ABI", () => {
    it("carries exactly quoteExactOutputSingle — the read-side sibling the venue seam quotes through", () => {
        const functions = (QUOTER_V2_ABI as AbiFunction[]).filter((item) => item.type === "function");
        expect(functions.map((f) => f.name)).toEqual(["quoteExactOutputSingle"]);
    });

    it("quoteExactOutputSingle takes QuoterV2's 5-field params tuple and returns four values; nonpayable (read via eth_call)", () => {
        const [fn] = findFunctions(QUOTER_V2_ABI, "quoteExactOutputSingle");
        expect(fn).toBeDefined();
        expect(fn!.inputs).toHaveLength(1);
        const params = fn!.inputs[0] as { type: string; components: { name: string; type: string }[] };
        expect(params.type).toBe("tuple");
        expect(params.components.map((c) => [c.name, c.type])).toEqual([
            ["tokenIn", "address"],
            ["tokenOut", "address"],
            ["amount", "uint256"],
            ["fee", "uint24"],
            ["sqrtPriceLimitX96", "uint160"],
        ]);
        expect(fn!.stateMutability).toBe("nonpayable");
        expect(fn!.outputs.map((o) => [o.name, o.type])).toEqual([
            ["amountIn", "uint256"],
            ["sqrtPriceX96After", "uint160"],
            ["initializedTicksCrossed", "uint32"],
            ["gasEstimate", "uint256"],
        ]);
    });
});
