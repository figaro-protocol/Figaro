/**
 * @figaro/sdk/agent — Autonomous Gateway
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
import { CORE_ABI, ATTESTATION_COORDINATOR_ABI, USAGE_COUNTER_ABI } from "../abis.js";
import { assertOrderFitsResolveCap } from "../gasCeilings.js";
import { restoreSignedProcessId } from "../commitments.js";
import { buildSectionInclusionProof, sectionDataHash, type Agreement } from "../agreement.js";
import { computeClauseKey } from "../discovery.js";
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
 * Both signatures must be provided (obtained via signTypedData). EITHER
 * party — or any relayer holding the signed payload — may broadcast: the
 * kernel verifies the two signatures, never the sender.
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

// ── Usage recording at settlement ───────────────────────────────────────────

/** One resolved order's inputs for usage recording: the ORIGINAL commitment
 *  struct (the counter re-verifies it against the kernel) and its hydrated
 *  agreement (the leaves whose usage is being claimed). */
export interface UsageRecordingEntry {
    commitment: Commitment;
    agreement: Agreement;
}

export interface UsageRecordingReport {
    /** Section legs attempted (clause legs; the assembly leg is counted by flag). */
    attempted: number;
    /** Clause legs that landed. */
    recorded: number;
    /** Whether the once-per-process assembly (designer) credit landed. */
    assemblyRecorded: boolean;
    /** Per-leg failures. An EXCLUDED clause reverting (`figaro-commerce`,
     *  `figaro-topology`, the provenance clause) is routine by design, not a
     *  fault — the counter refuses the protocol floor, never the open set. */
    failures: string[];
}

/**
 * Record direct-path usage for a just-resolved process — the headless twin of
 * the frontend's at-settlement recording, and the step the RPGF path depends
 * on: usage is recorded AT SETTLEMENT or the credit is deniable later
 * (docs/DESIGN_DECISIONS.md §21 — a seller can unstake, a period can close;
 * a deferred record is permanently refusable). A buyer agent that resolves
 * without calling this credits no clause author and no assembly designer.
 *
 * Per order: every committed section gets a CLAUSE leg
 * (`UsageCounter.recordClauseUsage` — only the section FINGERPRINT reaches
 * calldata, never plaintext, so private sections stay off-chain), and the
 * first section carrying a well-formed `compositionHash` gets the INDEPENDENT
 * once-per-process ASSEMBLY leg (`recordAssemblyUsage` — content derived
 * on-chain from the hash). The two legs are independent on purpose: the
 * provenance clause's own clause leg always reverts (excluded), and
 * sequencing the assembly credit behind it would kill designer credit.
 * Tolerate-the-revert per leg; the report says what landed.
 */
export async function recordProcessUsage(
    walletClient: WalletClient,
    publicClient: PublicClient,
    usageCounter: Address,
    entries: readonly UsageRecordingEntry[],
): Promise<UsageRecordingReport> {
    const account = walletClient.account;
    if (!account) throw new Error("recordProcessUsage: wallet has no account");
    // The counter names its own kernel; the signed-processId restoration needs
    // the kernel's EIP-712 domain, so both derive from the composition itself.
    const [chainId, core] = await Promise.all([
        publicClient.getChainId(),
        publicClient.readContract({ address: usageCounter, abi: USAGE_COUNTER_ABI, functionName: "core" }) as Promise<Address>,
    ]);
    const report: UsageRecordingReport = { attempted: 0, recorded: 0, assemblyRecorded: false, failures: [] };
    const send = async (functionName: "recordClauseUsage" | "recordAssemblyUsage", args: readonly unknown[]) => {
        const hash = await walletClient.writeContract({
            chain: walletClient.chain ?? null, account, address: usageCounter,
            abi: USAGE_COUNTER_ABI, functionName, args: args as never,
        });
        await publicClient.waitForTransactionReceipt({ hash });
    };
    for (const { commitment: given, agreement } of entries) {
        // The counter re-hashes the SIGNED struct to find the order — a root
        // signed processId 0, so a derived-id commitment (the proposer's
        // event-reconstructed shape) must be restored exactly as the resolve
        // path restores it, or every leg reverts UnknownOrder.
        const commitment = restoreSignedProcessId(given, chainId, core);
        for (const section of agreement.sections) {
            report.attempted++;
            const { proof } = buildSectionInclusionProof(agreement, section.clause);
            try {
                await send("recordClauseUsage", [
                    commitment, computeClauseKey(section.clause, section.version), sectionDataHash(section), proof,
                ]);
                report.recorded++;
            } catch (error) {
                report.failures.push(`${section.clause}: ${error instanceof Error ? error.message : String(error)}`);
            }
            const composition = (section.data as Record<string, unknown> | undefined)?.compositionHash;
            if (report.assemblyRecorded || composition === undefined) continue;
            if (typeof composition !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(composition)) {
                report.failures.push(`${section.clause}: compositionHash present but malformed: ${JSON.stringify(composition)}`);
                continue;
            }
            try {
                await send("recordAssemblyUsage", [commitment, composition, proof]);
                report.assemblyRecorded = true;
            } catch (error) {
                report.failures.push(`assembly ${composition}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    return report;
}

/**
 * Submit an attestation as a seller.
 *
 * @param role   Commitment proving seller identity in the target's process.
 *               Pass the SIGNED commitment struct (a root order carries
 *               `processId = 0`), not the reconstruction-derived form whose
 *               root `processId` is the DERIVED id — the coordinator re-hashes
 *               and recovery would miss.
 * @param target Commitment for the order being attested (carries the
 *               `agreementHash` the merkle proof opens against). Also the SIGNED
 *               struct (root: `processId = 0`). For SAME-ORDER attestation pass
 *               the SAME commitment as both `role` and `target` — one struct in
 *               both args, not two distinct commitments.
 * @param clauseId The `computeClauseKey(clause, version)` bytes32 HASH — NOT
 *               the raw clause name that `buildSectionInclusionProof` takes as
 *               its `clauseKey`. Same value used as the merkle leaf id.
 * @param sectionHash The section FINGERPRINT — `sectionDataHash(section)` =
 *               `keccak256` of the committed canonical bytes, NEVER the preimage.
 *               The coordinator takes only the hash, so a `private`-disposition
 *               section's plaintext never touches public calldata.
 * @param proof  Merkle inclusion proof produced by `buildSectionInclusionProof`.
 * @param contentRef The content FINGERPRINT — `keccak256(content)` (the content
 *                lives off-chain), or `sectionHash` to RE-ASSERT the committed
 *                section. Never the content preimage.
 */
export async function attestAsSeller(
    walletClient: WalletClient,
    coordinatorAddress: Address,
    role: Commitment,
    target: Commitment,
    clauseId: Hex,
    stage: number,
    sectionHash: Hex,
    proof: readonly Hex[],
    contentRef: Hex,
): Promise<TxResult> {
    const hash = await walletClient.writeContract({
        chain: walletClient.chain ?? null,
        account: walletClient.account!,
        address: coordinatorAddress,
        abi: ATTESTATION_COORDINATOR_ABI,
        functionName: "attestAsSeller",
        args: [role, target, clauseId, stage, sectionHash, proof, contentRef],
    });
    return { hash };
}

/**
 * Submit an attestation as a buyer. Caller must equal `target.buyer` (which
 * equals `rootBuyer` of the process by commit invariant).
 *
 * @param target Pass the SIGNED commitment struct (a root order carries
 *               `processId = 0`), not the reconstruction-derived form whose
 *               root `processId` is the DERIVED id — the coordinator re-hashes
 *               the struct, and a derived-id root would miss.
 * @param clauseId The `computeClauseKey(clause, version)` bytes32 HASH — NOT
 *               the raw clause name that `buildSectionInclusionProof` takes as
 *               its `clauseKey`. Same value used as the merkle leaf id.
 */
export async function attestAsBuyer(
    walletClient: WalletClient,
    coordinatorAddress: Address,
    target: Commitment,
    clauseId: Hex,
    stage: number,
    sectionHash: Hex,
    proof: readonly Hex[],
    contentRef: Hex,
): Promise<TxResult> {
    const hash = await walletClient.writeContract({
        chain: walletClient.chain ?? null,
        account: walletClient.account!,
        address: coordinatorAddress,
        abi: ATTESTATION_COORDINATOR_ABI,
        functionName: "attestAsBuyer",
        args: [target, clauseId, stage, sectionHash, proof, contentRef],
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
        /** The `computeClauseKey(clause, version)` bytes32 HASH — NOT the raw
         *  clause name `buildSectionInclusionProof` takes as its `clauseKey`. */
        clauseId: Hex;
        stage: number;
        /** The section FINGERPRINT — `sectionDataHash(section)` (keccak256 of the
         *  committed bytes), never the preimage. */
        sectionHash: Hex;
        proof: readonly Hex[];
        /** The content FINGERPRINT — `keccak256(content)` (content lives
         *  off-chain), or `sectionHash` to re-assert. Never the preimage. */
        contentRef: Hex;
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
                    `{ target, clauseId, stage, sectionHash, proof, contentRef } built from the hydrated agreement.`,
                );
            }
            if (!addresses.attestationCoordinator) {
                throw new Error(`${action.type}: addresses.attestationCoordinator is not configured.`);
            }
            return action.type === "attest-as-seller"
                ? attestAsSeller(
                    walletClient, addresses.attestationCoordinator,
                    at.role ?? at.target, at.target, at.clauseId, at.stage, at.sectionHash, at.proof, at.contentRef,
                )
                : attestAsBuyer(
                    walletClient, addresses.attestationCoordinator,
                    at.target, at.clauseId, at.stage, at.sectionHash, at.proof, at.contentRef,
                );
        }
        default:
            throw new Error(`Cannot execute unknown action type "${(action as { type: string }).type}".`);
    }
}
