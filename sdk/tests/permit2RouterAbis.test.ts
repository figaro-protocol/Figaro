/**
 * Shape assertions for the external-canonical-contract ABIs the swap-funded
 * bond path composes with: Permit2's witness transfer surface (the
 * coordinator's on-chain pull — `WitnessSwapAndCommitCoordinator._fund`) and
 * the Uniswap SwapRouter02 / QuoterV2 pair the venue seam
 * (`frontend/lib/composability/swapVenue.ts`) encodes against. These are curated
 * constants for EXTERNAL contracts (not Figaro's), same rationale as
 * `ERC20_ABI` — so no FigaroCore/registry-style behavioral test applies. This file
 * pins the function surfaces with their expected arity, so a future edit can't
 * silently narrow or rename them out from under integrators — and freezes one
 * golden `exactOutputSingle` calldata vector that the frontend venue seam's
 * own suite (`frontend/tests/lib/swapVenue.test.ts`) must reproduce byte for
 * byte from `route()`: the cross-surface lockstep proof that what an
 * integrator builds from this package is what the shipped venue seam signs.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Abi, AbiFunction, AbiParameter } from "viem";
import { encodeFunctionData, getAddress } from "viem";
import { PERMIT2_ABI, QUOTER_V2_ABI, SWAP_ROUTER_02_ABI } from "../src/abis.js";

function findFunctions(abi: Abi, name: string): AbiFunction[] {
    return abi.filter((item): item is AbiFunction => item.type === "function" && item.name === name);
}

/** A tuple parameter's components; any other parameter has none. */
function components(p: AbiParameter | undefined): readonly AbiParameter[] {
    return p !== undefined && "components" in p ? p.components : [];
}

/** The coordinator's `IPermit2WitnessTransfer` interface, read from the
 *  contract source: each struct's `(type, name)` members and the one
 *  function's parameters, in declaration order. The SDK's PERMIT2_ABI is held
 *  to this, so the two cannot drift apart. */
function permit2Interface(): { structs: Record<string, [string, string][]>; params: [string, string][] } {
    const source = readFileSync(path.resolve(__dirname, "../../src/composability/WitnessSwapAndCommitCoordinator.sol"), "utf8");
    const start = source.indexOf("interface IPermit2WitnessTransfer");
    const body = source.slice(start, source.indexOf("\n}", start));
    const pairs = (text: string) => text.split(/[;,]/).map((m) => m.trim()).filter(Boolean)
        .map((m) => { const w = m.split(/\s+/).filter((x) => x !== "calldata"); return [w[0]!, w[w.length - 1]!] as [string, string]; });
    const structs: Record<string, [string, string][]> = {};
    for (const m of body.matchAll(/struct (\w+) \{([^}]*)\}/g)) structs[m[1]!] = pairs(m[2]!);
    const fn = /function permitWitnessTransferFrom\(([^)]*)\)/.exec(body);
    if (!fn) throw new Error("IPermit2WitnessTransfer.permitWitnessTransferFrom not found");
    return { structs, params: pairs(fn[1]!) };
}

/** An ABI parameter's Solidity type as a source names it: a tuple by its struct. */
function solType(p: AbiParameter, structs: Record<string, [string, string][]>): string {
    if (p.type !== "tuple") return p.type;
    const names = components(p).map((c) => c.name);
    const match = Object.entries(structs).find(([, members]) => members.map(([, n]) => n).join() === names.join());
    return match ? match[0] : "tuple";
}

describe("PERMIT2_ABI", () => {
    it("carries exactly one function: the witness variant of permitTransferFrom", () => {
        const functions = (PERMIT2_ABI as Abi).filter((item): item is AbiFunction => item.type === "function");
        expect(functions).toHaveLength(1);
        expect(functions[0]!.name).toBe("permitWitnessTransferFrom");
    });

    it("permitWitnessTransferFrom is the coordinator's IPermit2WitnessTransfer declaration, parameter by parameter and struct by struct", () => {
        const { structs, params } = permit2Interface();
        const [fn] = findFunctions(PERMIT2_ABI, "permitWitnessTransferFrom");
        expect(fn).toBeDefined();
        expect(fn!.inputs.map((i) => [solType(i, structs), i.name])).toEqual(params);
        // Each tuple's members, nested ones included, are the struct's.
        const check = (p: AbiParameter) => {
            if (p.type !== "tuple") return;
            const struct = structs[solType(p, structs)];
            expect(struct, `${p.name}: a struct of the interface`).toBeDefined();
            expect(components(p).map((c) => [solType(c, structs), c.name])).toEqual(struct);
            components(p).forEach(check);
        };
        fn!.inputs.forEach(check);
        expect(fn!.stateMutability).toBe("nonpayable");
    });
});

describe("SWAP_ROUTER_02_ABI", () => {
    it("carries exactly the venue shapes the coordinator's route composes: factory (the probe) and exactOutputSingle", () => {
        const functions = (SWAP_ROUTER_02_ABI as Abi).filter((item): item is AbiFunction => item.type === "function");
        expect(functions.map((f) => f.name).sort()).toEqual(["exactOutputSingle", "factory"]);
    });

    it("exactOutputSingle takes SwapRouter02's single 7-field params tuple (NO deadline — that was SwapRouter01), payable", () => {
        const [fn] = findFunctions(SWAP_ROUTER_02_ABI, "exactOutputSingle");
        expect(fn).toBeDefined();
        expect(fn!.inputs).toHaveLength(1);
        const params = fn!.inputs[0]!;
        expect(params.type).toBe("tuple");
        expect(components(params).map((c) => [c.name, c.type])).toEqual([
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
    it("carries exactly the two single-hop quote functions the venue seam quotes through", () => {
        const functions = (QUOTER_V2_ABI as Abi).filter((item): item is AbiFunction => item.type === "function");
        expect(functions.map((f) => f.name)).toEqual(["quoteExactOutputSingle", "quoteExactInputSingle"]);
    });

    it("quoteExactOutputSingle takes QuoterV2's 5-field params tuple and returns four values; nonpayable (read via eth_call)", () => {
        const [fn] = findFunctions(QUOTER_V2_ABI, "quoteExactOutputSingle");
        expect(fn).toBeDefined();
        expect(fn!.inputs).toHaveLength(1);
        const params = fn!.inputs[0]!;
        expect(params.type).toBe("tuple");
        expect(components(params).map((c) => [c.name, c.type])).toEqual([
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
