/**
 * @figaro/sdk/agent — Sequencer Client
 *
 * Submits signed kernel operations to the off-chain batch sequencer
 * for proof-based settlement via FigaroBatchVerifier.
 *
 * The sequencer is a coordination convenience, not a trust assumption.
 * All operations require valid EIP-712 signatures — the sequencer
 * cannot fabricate, censor selectively, or violate kernel invariants.
 * Participants can always fall back to direct FigaroCore submission.
 *
 * The batched surface is the kernel + attestation ops only. Registry
 * mutations (clause/seller/assembly registration) are once-per-artifact
 * ETH-staked intents that stay on the direct path.
 *
 * Every batched attestation carries the full witness payload: the
 * clause's canonical spec bytes (bound on-chain to
 * `ClauseRegistry.contentHashOf` at settlement), the content, the
 * committed sectionData, and the agreement inclusion proof. The batched
 * path validates everything in-proof or the batch cannot settle.
 */

import type { Hex, Address, Commitment } from "../types.js";

// ── Sequencer operation types (match Rust KernelOp variants) ────────────────

export interface SequencerSignature {
    v: number;
    r: Hex;
    s: Hex;
}

/** How the attestation's content bytes relate to the clause spec. */
export type SequencerContentKind = "RuntimeWitness" | "ReAssert";

/** The witness payload every batched attestation carries — mirrors the
 *  Rust `AttestationContentProof`. */
export interface SequencerContentProof {
    /** The clause's canonical spec JSON — EXACT registered bytes
     *  (`keccak256` of them must equal the registry's `contentHashOf`). */
    spec_json: string;
    /** The structured content validated (and, for a RuntimeWitness,
     *  generically ABI-encoded) in-proof. */
    content_json: string;
    /** Canonical-JSON sectionData bytes — the committed agreement
     *  section this attestation declares against. */
    section_data: string;
    /** Sorted-pair Merkle proof binding the section leaf to the target
     *  order's signed agreementHash. Empty for a single-section agreement. */
    inclusion_proof: Hex[];
    content_kind: SequencerContentKind;
}

export type SequencerOp =
    | {
        type: "Commit";
        commitment: SequencerCommitment;
        buyer_sig: SequencerSignature;
        seller_sig: SequencerSignature;
    }
    | {
        type: "Resolve";
        process_id: Hex;
        commitments: SequencerCommitment[];
        buyer_sig: SequencerSignature;
    }
    | {
        type: "AttestAsSeller";
        role: SequencerCommitment;
        target: SequencerCommitment;
        clause_id: Hex;
        stage: number;
        content_ref: Hex;
        seller_sig: SequencerSignature;
        proof: SequencerContentProof;
    }
    | {
        type: "AttestAsBuyer";
        target: SequencerCommitment;
        clause_id: Hex;
        stage: number;
        content_ref: Hex;
        buyer_sig: SequencerSignature;
        proof: SequencerContentProof;
    };

/** Commitment in the sequencer's wire format (snake_case, string-encoded bigints). */
export interface SequencerCommitment {
    process_id: Hex;
    buyer: Address;
    seller: Address;
    currency: Address;
    payment: string;
    expected_cumulative_value: string;
    agreement_hash: Hex;
    salt: string;
    deadline: string;
}

// ── Response types ──────────────────────────────────────────────────────────

export interface SubmitResult {
    id: number;
}

export interface SequencerStatus {
    state_root: string;
    pending_ops: number;
    batches_settled: number;
}

// ── Conversion helpers ──────────────────────────────────────────────────────

/** Convert an SDK Commitment to the sequencer wire format. */
export function toSequencerCommitment(c: Commitment): SequencerCommitment {
    return {
        process_id: c.processId,
        buyer: c.buyer,
        seller: c.seller,
        currency: c.currency,
        payment: c.payment.toString(),
        expected_cumulative_value: c.expectedCumulativeValue.toString(),
        agreement_hash: c.agreementHash,
        salt: c.salt.toString(),
        deadline: c.deadline.toString(),
    };
}

/** Convert an EIP-712 signature hex (65 bytes) to the sequencer's {v, r, s} format. */
export function toSequencerSig(sig: Hex): SequencerSignature {
    const clean = sig.startsWith("0x") ? sig.slice(2) : sig;
    if (clean.length !== 130) {
        throw new Error(`Invalid signature length: expected 130 hex chars, got ${clean.length}`);
    }
    return {
        r: `0x${clean.slice(0, 64)}` as Hex,
        s: `0x${clean.slice(64, 128)}` as Hex,
        v: parseInt(clean.slice(128, 130), 16),
    };
}

// ── Sequencer client ────────────────────────────────────────────────────────

export interface SequencerClientConfig {
    /** Base URL of the sequencer HTTP API (e.g. "http://127.0.0.1:3001"). */
    url: string;
    /** Optional fetch implementation (defaults to global fetch). */
    fetch?: typeof globalThis.fetch;
}

export class SequencerClient {
    private readonly url: string;
    private readonly _fetch: typeof globalThis.fetch;

    constructor(config: SequencerClientConfig) {
        this.url = config.url.replace(/\/+$/, "");
        this._fetch = config.fetch ?? globalThis.fetch.bind(globalThis);
    }

    /**
     * Submit a signed kernel operation to the sequencer.
     * Returns the operation ID assigned by the sequencer's mempool.
     */
    async submit(op: SequencerOp): Promise<SubmitResult> {
        // The Rust API expects { "operation": <KernelOp> } where KernelOp
        // is a tagged enum serialized as { "Commit": { ... } }.
        const operation = SequencerClient.toRustEnum(op);
        const res = await this._fetch(`${this.url}/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ operation }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({ error: res.statusText }));
            throw new SequencerError(
                body.error ?? `Sequencer returned ${res.status}`,
                res.status,
            );
        }
        const body = await res.json();
        return { id: body.id };
    }

    /**
     * Submit a Commit operation using SDK types.
     * Convenience wrapper that converts Commitment + signatures.
     */
    async submitCommit(
        commitment: Commitment,
        buyerSig: Hex,
        sellerSig: Hex,
    ): Promise<SubmitResult> {
        return this.submit({
            type: "Commit",
            commitment: toSequencerCommitment(commitment),
            buyer_sig: toSequencerSig(buyerSig),
            seller_sig: toSequencerSig(sellerSig),
        });
    }

    /**
     * Submit a Resolve operation using SDK types.
     * Convenience wrapper that converts commitments + buyer signature.
     */
    async submitResolve(
        processId: Hex,
        commitments: Commitment[],
        buyerSig: Hex,
    ): Promise<SubmitResult> {
        return this.submit({
            type: "Resolve",
            process_id: processId,
            commitments: commitments.map(toSequencerCommitment),
            buyer_sig: toSequencerSig(buyerSig),
        });
    }

    /**
     * Submit a seller attestation using SDK types. `role` proves seller
     * identity + process membership; `target` carries the attested order
     * and the agreementHash the witness proof opens against (pass the
     * same commitment twice for same-order attestation).
     */
    async submitAttestAsSeller(args: {
        role: Commitment;
        target: Commitment;
        clauseId: Hex;
        stage: number;
        contentRef: Hex;
        sellerSig: Hex;
        proof: SequencerContentProof;
    }): Promise<SubmitResult> {
        return this.submit({
            type: "AttestAsSeller",
            role: toSequencerCommitment(args.role),
            target: toSequencerCommitment(args.target),
            clause_id: args.clauseId,
            stage: args.stage,
            content_ref: args.contentRef,
            seller_sig: toSequencerSig(args.sellerSig),
            proof: args.proof,
        });
    }

    /** Submit a buyer attestation using SDK types. */
    async submitAttestAsBuyer(args: {
        target: Commitment;
        clauseId: Hex;
        stage: number;
        contentRef: Hex;
        buyerSig: Hex;
        proof: SequencerContentProof;
    }): Promise<SubmitResult> {
        return this.submit({
            type: "AttestAsBuyer",
            target: toSequencerCommitment(args.target),
            clause_id: args.clauseId,
            stage: args.stage,
            content_ref: args.contentRef,
            buyer_sig: toSequencerSig(args.buyerSig),
            proof: args.proof,
        });
    }

    /** Query sequencer status: state root, pending ops, batches settled. */
    async status(): Promise<SequencerStatus> {
        const res = await this._fetch(`${this.url}/status`, {
            method: "GET",
            headers: { "Accept": "application/json" },
        });
        if (!res.ok) {
            throw new SequencerError(
                `Status request failed: ${res.statusText}`,
                res.status,
            );
        }
        return res.json();
    }

    /** Check if the sequencer is reachable (returns true/false, never throws). */
    async isAvailable(): Promise<boolean> {
        try {
            const res = await this._fetch(`${this.url}/status`, {
                method: "GET",
                signal: AbortSignal.timeout(3000),
            });
            return res.ok;
        } catch {
            return false;
        }
    }

    /**
     * Convert a typed SequencerOp to the Rust serde enum format.
     * Rust expects: { "Commit": { commitment, buyer_sig, seller_sig } }
     */
    static toRustEnum(op: SequencerOp): Record<string, unknown> {
        const { type: tag, ...fields } = op;
        return { [tag]: fields };
    }
}

// ── Error type ──────────────────────────────────────────────────────────────

export class SequencerError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number,
    ) {
        super(message);
        this.name = "SequencerError";
    }
}
