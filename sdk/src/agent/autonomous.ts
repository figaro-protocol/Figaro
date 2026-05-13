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
    // Kernel invariant: every commitment.buyer === rootBuyer (FigaroCore.sol:188),
    // and only rootBuyer can resolve (FigaroCore.sol:260). Fail fast with a
    // clearer error than the contract's NotProcessBuyer revert.
    if (commitments.length > 0) {
        const account = walletClient.account?.address;
        const buyer = commitments[0].buyer;
        if (!account || account.toLowerCase() !== buyer.toLowerCase()) {
            throw new Error(
                `resolveProcess: wallet account ${account ?? "(none)"} is not the rootBuyer ${buyer}. ` +
                `Only the buyer can resolve a process.`,
            );
        }
    }
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
 *
 * @param role   Commitment proving seller identity in the target's process.
 * @param target Commitment for the order being attested (carries the
 *               `agreementHash` the merkle proof opens against). Pass the
 *               same commitment twice for same-order attestation.
 * @param sectionData The raw clause bytes committed in the agreement manifest.
 *               Use `canonicalizeSectionData(section.data)` + encode to Hex.
 * @param proof  Merkle inclusion proof produced by `buildSectionInclusionProof`.
 * @param content ABI-encoded content per the schema's encoding (use the
 *                encoders in `@figaro/core/schemas`).
 */
export async function attestAsSeller(
    walletClient: WalletClient,
    coordinatorAddress: Address,
    role: Commitment,
    target: Commitment,
    schemaId: Hex,
    stage: number,
    sectionData: Hex,
    proof: readonly Hex[],
    content: Hex,
): Promise<TxResult> {
    const hash = await walletClient.writeContract({
        chain: walletClient.chain ?? null,
        account: walletClient.account!,
        address: coordinatorAddress,
        abi: ATTESTATION_COORDINATOR_ABI,
        functionName: "attestAsSeller",
        args: [role, target, schemaId, stage, sectionData, proof, content],
    });
    return { hash };
}

/**
 * Submit an attestation as a buyer. Caller must equal `target.buyer` (which
 * equals `rootBuyer` of the process by commit invariant).
 */
export async function attestAsBuyer(
    walletClient: WalletClient,
    coordinatorAddress: Address,
    target: Commitment,
    schemaId: Hex,
    stage: number,
    sectionData: Hex,
    proof: readonly Hex[],
    content: Hex,
): Promise<TxResult> {
    const hash = await walletClient.writeContract({
        chain: walletClient.chain ?? null,
        account: walletClient.account!,
        address: coordinatorAddress,
        abi: ATTESTATION_COORDINATOR_ABI,
        functionName: "attestAsBuyer",
        args: [target, schemaId, stage, sectionData, proof, content],
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
