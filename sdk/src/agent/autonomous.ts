/**
 * @figaro/core/agent — Autonomous Gateway
 *
 * Direct execution module for agents that hold their own keys.
 * Signs and submits transactions via a viem WalletClient.
 *
 * Two usage patterns:
 *
 * 1. Action-based: pass a ProposedAction from the proposer.
 *    await executeAction(walletClient, publicClient, addresses, action);
 *
 * 2. Direct: call specific contract functions.
 *    await resolveProcess(walletClient, coreAddress, processId, commitments);
 */

import type { WalletClient, PublicClient } from "viem";
import { CORE_ABI, ATTESTATION_COORDINATOR_ABI } from "../abis.js";
import type { Hex, Address, FigaroAddresses, Commitment } from "../types.js";
import type { ProposedAction, ResolveProcessAction } from "./proposer.js";

// ── Transaction result ──────────────────────────────────────────────────────

export interface TxResult {
    /** Transaction hash. */
    hash: Hex;
}

// ── Direct contract calls ───────────────────────────────────────────────────

/**
 * Submit a commitment to FigaroCore.commit.
 * Both signatures must be provided (obtained via signTypedData).
 */
export async function commit(
    walletClient: WalletClient,
    coreAddress: Address,
    commitment: Commitment,
    buyerSig: Hex,
    sellerSig: Hex,
): Promise<TxResult> {
    const hash = await walletClient.writeContract({
        chain: walletClient.chain ?? null,
        account: walletClient.account!,
        address: coreAddress,
        abi: CORE_ABI,
        functionName: "commit",
        args: [commitment, buyerSig, sellerSig],
    });
    return { hash };
}

/**
 * Resolve a process (buyer-only). Settles all active orders atomically.
 * Takes the original Commitment structs so the kernel can verify hashes.
 */
export async function resolveProcess(
    walletClient: WalletClient,
    coreAddress: Address,
    processId: Hex,
    commitments: Commitment[],
): Promise<TxResult> {
    const hash = await walletClient.writeContract({
        chain: walletClient.chain ?? null,
        account: walletClient.account!,
        address: coreAddress,
        abi: CORE_ABI,
        functionName: "resolveProcess",
        args: [processId, commitments],
    });
    return { hash };
}

/**
 * Submit an attestation as a seller.
 */
export async function attestAsSeller(
    walletClient: WalletClient,
    coordinatorAddress: Address,
    roleCommitment: Commitment,
    orderHash: Hex,
    schemaId: Hex,
    stage: number,
    contentRef: Hex,
): Promise<TxResult> {
    const hash = await walletClient.writeContract({
        chain: walletClient.chain ?? null,
        account: walletClient.account!,
        address: coordinatorAddress,
        abi: ATTESTATION_COORDINATOR_ABI,
        functionName: "attestAsSeller",
        args: [roleCommitment, orderHash, schemaId, stage, contentRef],
    });
    return { hash };
}

/**
 * Submit an attestation as a buyer.
 */
export async function attestAsBuyer(
    walletClient: WalletClient,
    coordinatorAddress: Address,
    processId: Hex,
    orderHash: Hex,
    schemaId: Hex,
    stage: number,
    contentRef: Hex,
): Promise<TxResult> {
    const hash = await walletClient.writeContract({
        chain: walletClient.chain ?? null,
        account: walletClient.account!,
        address: coordinatorAddress,
        abi: ATTESTATION_COORDINATOR_ABI,
        functionName: "attestAsBuyer",
        args: [processId, orderHash, schemaId, stage, contentRef],
    });
    return { hash };
}

// ── Action-based execution ──────────────────────────────────────────────────

/**
 * Execute a ProposedAction. Only supports actions that don't require
 * additional parameters beyond what's in the action itself.
 *
 * Currently supports:
 *   - resolve-process: calls resolveProcess with the stored commitments
 *
 * Actions that require additional input (commit, attest) must use
 * the direct functions above.
 */
export async function executeAction(
    walletClient: WalletClient,
    addresses: FigaroAddresses,
    action: ProposedAction,
): Promise<TxResult> {
    switch (action.type) {
        case "resolve-process": {
            const a = action as ResolveProcessAction;
            return resolveProcess(walletClient, addresses.core, a.processId, a.commitments);
        }
        default:
            throw new Error(
                `Cannot auto-execute action type "${action.type}". ` +
                `Use the direct functions (commit, attestAsSeller, etc.) instead.`,
            );
    }
}
