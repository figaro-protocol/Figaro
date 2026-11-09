/**
 * contractWrite — the ONE on-chain write sequence every frontend write uses:
 * simulate the call to surface a typed revert BEFORE the wallet opens, send
 * it on the build's chain (`chainId: activeChain.id`), then wait
 * for the receipt and verify it landed `success`. A revert reaches the
 * caller translated by the contract's error name: the site's own revert
 * table first, then the FigaroCore wording, then the bare error name.
 *
 * The send names the build's chain as `chainId: activeChain.id`. wagmi's
 * `writeContract` reads the chain only from `chainId`: it sets viem's `chain`
 * itself, and only when `chainId` is given does it set `assertChainId: true`,
 * so viem reads the wallet's chain (`eth_chainId`) and throws
 * `ChainMismatchError` on a mismatch. The write refuses a mismatch in the
 * page, before the wallet prompt opens.
 *
 * The client and `writeContractAsync` are injected (`usePublicClient`,
 * `useWriteContract`), so each hook keeps its own wagmi state and this stays
 * a plain function a unit test can drive.
 */

import type { Abi } from "viem";
import { activeChain } from "@/lib/shared/chains";
import { contractRevertMessage, translateContractRevert, type RevertMessage } from "@/lib/shared/errors";
import { verifyTxSuccess } from "@/lib/shared/verifyTxSuccess";

type Hex = `0x${string}`;

/** One contract call, as simulated and as sent. */
export interface ContractCall {
    address: Hex;
    abi: Abi;
    functionName: string;
    args: readonly unknown[];
    /** The ETH sent with the call (a registry's stake); omit for a non-payable function. */
    value?: bigint;
    account: Hex;
    /** The contract's own revert table; a name it leaves unmapped falls to
     *  `contractRevertMessage`. */
    revertMessage?: RevertMessage;
}

interface SimulateClient {
    simulateContract(config: Omit<ContractCall, "revertMessage">): Promise<unknown>;
}

interface WriteClient extends SimulateClient {
    waitForTransactionReceipt(args: { hash: Hex }): Promise<{ status: string }>;
}

/** The wagmi `writeContractAsync` shape this sequence sends through. */
export type WriteContractAsync = (
    config: Omit<ContractCall, "revertMessage"> & { chainId: typeof activeChain.id },
) => Promise<Hex>;

function translate(err: unknown, revertMessage: RevertMessage | undefined): Error {
    return translateContractRevert(err, (name, args) =>
        revertMessage?.(name, args) ?? contractRevertMessage(name));
}

function callOf({ address, abi, functionName, args, value, account }: ContractCall) {
    return { address, abi, functionName, args, value, account };
}

/** Simulate one call; throws its revert translated by error name. Used on
 *  its own where a flow checks every write before sending any. */
export async function simulateWrite(client: SimulateClient, call: ContractCall): Promise<void> {
    try {
        await client.simulateContract(callOf(call));
    } catch (err) {
        throw translate(err, call.revertMessage);
    }
}

/** Simulate → send (with `chainId: activeChain.id`) → verify. Returns the
 *  confirmed transaction hash; throws a revert translated by error name, or
 *  `failureMessage` for a mined-but-reverted transaction. */
export async function simulateWriteVerify(config: ContractCall & {
    client: WriteClient;
    writeContractAsync: WriteContractAsync;
    /** Consequence text for a mined-but-reverted transaction. */
    failureMessage: string;
}): Promise<Hex> {
    const { client, writeContractAsync, failureMessage, ...call } = config;
    await simulateWrite(client, call);
    let txHash: Hex;
    try {
        txHash = await writeContractAsync({ ...callOf(call), chainId: activeChain.id });
    } catch (err) {
        throw translate(err, call.revertMessage);
    }
    await verifyTxSuccess(client, txHash, failureMessage);
    return txHash;
}
