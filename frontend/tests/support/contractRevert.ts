/**
 * A decoded custom-error revert, as viem raises it from `simulateContract`,
 * built from the contract's own ABI (`@figaro-protocol/sdk`'s lists): an error
 * the contract does not declare, one renamed, or one given other arguments
 * than it declares fails here instead of standing in for a revert the
 * contract can never raise.
 */
import { ContractFunctionRevertedError, encodeErrorResult, type Abi } from "viem";

type AbiError = Extract<Abi[number], { type: "error" }>;

export function revertOf(
    abi: Abi | readonly unknown[],
    errorName: string,
    args: readonly unknown[] = [],
    functionName = "f",
): ContractFunctionRevertedError {
    const item = (abi as readonly { type?: string; name?: string }[])
        .find((entry) => entry.type === "error" && entry.name === errorName) as AbiError | undefined;
    if (!item) throw new Error(`${errorName} is not an error this contract's ABI declares`);
    if (item.inputs.length !== args.length) {
        throw new Error(`${errorName} declares ${item.inputs.length} argument(s); ${args.length} given`);
    }
    const one = [item] as const;
    const data = encodeErrorResult({ abi: one, errorName, args } as never);
    return new ContractFunctionRevertedError({ abi: one as unknown as Abi, data, functionName });
}
