/**
 * Shape assertions for the two external-canonical-contract ABIs the
 * swap-funded bond path composes with: Permit2's witness transfer surface
 * (the coordinator's on-chain pull — `WitnessSwapAndCommitCoordinator._fund`)
 * and the Uniswap Universal Router's `execute` entrypoint (the production
 * sibling of the devnet route builder in
 * `frontend/lib/composition/swapFunding.ts`). These are curated constants for
 * EXTERNAL contracts (not Figaro's), same rationale as `ERC20_ABI` — so no
 * kernel/registry-style behavioral test applies. This file only pins the
 * function surface exists with the expected arity, so a future edit can't
 * silently narrow or rename it out from under integrators.
 */
import { describe, expect, it } from "vitest";
import type { AbiFunction } from "viem";
import { PERMIT2_ABI, UNIVERSAL_ROUTER_ABI } from "../src/abis.js";

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

describe("UNIVERSAL_ROUTER_ABI", () => {
    it("carries exactly the two execute overloads", () => {
        const functions = findFunctions(UNIVERSAL_ROUTER_ABI, "execute");
        expect(functions).toHaveLength(2);
    });

    it("has a (commands, inputs) overload and a (commands, inputs, deadline) overload, both payable", () => {
        const functions = findFunctions(UNIVERSAL_ROUTER_ABI, "execute");
        const arities = functions.map((f) => f.inputs.length).sort();
        expect(arities).toEqual([2, 3]);

        const twoArg = functions.find((f) => f.inputs.length === 2)!;
        expect(twoArg.inputs.map((i) => i.type)).toEqual(["bytes", "bytes[]"]);
        expect(twoArg.stateMutability).toBe("payable");

        const threeArg = functions.find((f) => f.inputs.length === 3)!;
        expect(threeArg.inputs.map((i) => i.type)).toEqual(["bytes", "bytes[]", "uint256"]);
        expect(threeArg.stateMutability).toBe("payable");
    });
});
