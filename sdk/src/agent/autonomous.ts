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
import { assertOrderFitsResolveCap } from "../gasCeilings.js";
import { restoreSignedProcessId } from "../commitments.js";
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
 *
 * Refuses a sub-order commit that would push the live process past the
 * chain's resolve ceiling (`assertOrderFitsResolveCap`) — past it, every
 * bond in the process is locked forever. The kernel cannot enforce the
 * ceiling, so the write path does; an agent must never bond into an
 * unresolvable process.
 */
export async function commit(
    walletClient: WalletClient,
    publicClient: PublicClient,
    coreAddress: Address,
    commitment: Commitment,
    buyerSig: Hex,
    sellerSig: Hex,
): Promise<TxResult> {
    await assertOrderFitsResolveCap(publicClient, coreAddress, commitment.processId);
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
 * @param sectionData The raw clause bytes committed in the agreement.
 *               Use `canonicalizeSectionData(section.data)` + encode to Hex.
 * @param proof  Merkle inclusion proof produced by `buildSectionInclusionProof`.
 * @param content ABI-encoded content per the clause's encoding (use the
 *                encoders in `@figaro/core/clauses`).
 */
export async function attestAsSeller(
    walletClient: WalletClient,
    coordinatorAddress: Address,
    role: Commitment,
    target: Commitment,
    clauseId: Hex,
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
        args: [role, target, clauseId, stage, sectionData, proof, content],
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
    clauseId: Hex,
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
        args: [target, clauseId, stage, sectionData, proof, content],
    });
    return { hash };
}

// ── Action-based execution ──────────────────────────────────────────────────

/**
 * Extra inputs an action needs at execution time that the (pure) proposer
 * cannot produce. The SDK executes GIVEN these; it never fabricates a signature.
 */
export interface ActionExecutionInputs {
    /** resolve-process: the Commitment structs for the process's active orders.
     *  Defaults to the action's own reconstructed `commitments`; supply only to
     *  override. Each is passed through `restoreSignedProcessId` before submit. */
    commitments?: Commitment[];
    /** initiate-process: the fully-formed commitment and BOTH signatures.
     *  The seller's signature comes from a coordination handshake — the SDK
     *  never fabricates it. */
    commitment?: Commitment;
    buyerSig?: Hex;
    sellerSig?: Hex;
    /** attest-as-seller / attest-as-buyer: the merkle-bound payload the agent
     *  builds from its hydrated agreement (proof + content + section bytes). */
    attestation?: {
        /** seller-attest only: distinct role commitment for cross-order
         *  attestation; omit for same-order (role = target). */
        role?: Commitment;
        target: Commitment;
        clauseId: Hex;
        stage: number;
        sectionData: Hex;
        proof: readonly Hex[];
        content: Hex;
    };
}

/**
 * Execute a ProposedAction — the single dispatch point for every action the
 * proposer can surface. What each needs:
 *
 *   - resolve-process — self-contained: the action carries the reconstructed
 *     commitments; the executor restores each root's signed processId and submits.
 *     An agent (buyer) resolves autonomously with no further input.
 *   - initiate-process — a two-party commit: pass
 *     `{ commitment, buyerSig, sellerSig }`. The counterparty signature is
 *     gathered off-SDK; without it this throws rather than fabricate one.
 *     (There is NO runtime compose verb — extending a live process ad hoc was
 *     the deleted commit-sub-order arm; multi-order processes originate from
 *     an assembly template.)
 *   - attest-as-seller / attest-as-buyer — pass `inputs.attestation` (the
 *     merkle-bound payload built from the hydrated agreement).
 *
 * Throws a clear, typed error when a chosen action's inputs are absent.
 */
export async function executeAction(
    walletClient: WalletClient,
    publicClient: PublicClient,
    addresses: FigaroAddresses,
    action: ProposedAction,
    inputs: ActionExecutionInputs = {},
): Promise<TxResult> {
    switch (action.type) {
        case "resolve-process": {
            const a = action as ResolveProcessAction;
            const raw = inputs.commitments ?? a.commitments;
            if (!raw || raw.length === 0) {
                throw new Error(
                    "resolve-process: no commitments to resolve. The proposer reconstructs " +
                    "them from the process's active orders — pass a populated action or inputs.commitments.",
                );
            }
            const chainId = await publicClient.getChainId();
            const commitments = raw.map((c) => restoreSignedProcessId(c, chainId, addresses.core));
            return resolveProcess(walletClient, addresses.core, a.processId, commitments);
        }
        case "initiate-process": {
            if (!inputs.commitment || !inputs.buyerSig || !inputs.sellerSig) {
                throw new Error(
                    `${action.type}: requires a signed commitment plus BOTH buyer and seller ` +
                    `signatures. Originating a process is a two-party handshake — gather ` +
                    `the counterparty signature via a coordination channel and pass ` +
                    `{ commitment, buyerSig, sellerSig }. The SDK will not fabricate a signature.`,
                );
            }
            return commit(
                walletClient, publicClient, addresses.core,
                inputs.commitment, inputs.buyerSig, inputs.sellerSig,
            );
        }
        case "attest-as-seller":
        case "attest-as-buyer": {
            const at = inputs.attestation;
            if (!at) {
                throw new Error(
                    `${action.type}: requires inputs.attestation ` +
                    `{ target, clauseId, stage, sectionData, proof, content } built from the hydrated agreement.`,
                );
            }
            if (!addresses.attestationCoordinator) {
                throw new Error(`${action.type}: addresses.attestationCoordinator is not configured.`);
            }
            return action.type === "attest-as-seller"
                ? attestAsSeller(
                    walletClient, addresses.attestationCoordinator,
                    at.role ?? at.target, at.target, at.clauseId, at.stage, at.sectionData, at.proof, at.content,
                )
                : attestAsBuyer(
                    walletClient, addresses.attestationCoordinator,
                    at.target, at.clauseId, at.stage, at.sectionData, at.proof, at.content,
                );
        }
        default:
            throw new Error(`Cannot execute unknown action type "${(action as { type: string }).type}".`);
    }
}
