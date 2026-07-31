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
import { readCappedResponseText } from "./httpChannel.js";

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

/**
 * A claim that one SETTLED BATCH order used one artifact — the wire form of the
 * Rust guest's `UsageClaim`. Build these with `buildUsageClaims` (rpgf), which
 * knows which artifacts the counter excludes; never hand-roll one.
 *
 * Nothing here is trusted. The guest re-proves that the order settled and that
 * the artifact was in the signed agreement; the counter then applies the
 * reward's own gates on chain. A claim is a REQUEST to be counted, never an
 * assertion that counts.
 */
export interface SequencerUsageClaim {
    order: SequencerCommitment;
    artifact: Hex;
    /** serde's externally-tagged encoding of the Rust `UsageClaimKind`. */
    kind: { Clause: { section_hash: Hex } } | "Assembly";
    inclusion_proof: Hex[];
}

// ── Response types ──────────────────────────────────────────────────────────

export interface SubmitResult {
    id: number;
}

/** The relay's retention window. A relay is bounded, so a cursor older than
 *  `first_batch` means the gap has already been dropped — read this BEFORE
 *  replaying so eviction is visible rather than silent. */
export interface SequencerRetentionWindow {
    first_batch: number | null;
    last_batch: number | null;
    retained_batches: number;
    max_batches: number;
}

export interface SequencerStatus {
    state_root: string;
    pending_ops: number;
    /** Usage claims waiting to ride the next batch. */
    pending_usage_claims: number;
    batches_settled: number;
    /** The publication window. Absent on a relay predating the read routes. */
    archive?: SequencerRetentionWindow;
}

// ── Publication reads — the kernel's events, for the batch universe ─────────
//
// `FigaroCore` both SETTLES an order and PUBLISHES it (OrderCommitted /
// OrderSeller / OrderCurrency carry the struct; the signatures sit in the
// commit calldata). The batch path settles the same trade and publishes none
// of it — `FigaroBatchVerifier`'s public values carry no order hashes and
// `BatchSettled` names no order — so a batched order's buyer, seller, payment
// and agreementHash exist only under the proven state root. These read types
// mirror the relay's publication routes, which close that gap.
//
// NOTHING HERE IS AUTHORITY. A relay can omit or delay, never forge: every
// field is checkable by the reader (the struct hashes to `order_hash` under
// the VERIFIER's EIP-712 domain, the signatures recover to the parties named
// inside that struct, the payouts are a pure function of the struct, and the
// batch is anchored on chain by its state-root transition). Consumers MUST
// verify before displaying — see `frontend/lib/audit/batchRelay.ts`.

/** Where a published fact was settled, so the reader can anchor it on chain.
 *  `batch` is THIS relay's own sequence number — a cursor, not a protocol
 *  identity; another relay numbers differently. The chain-anchored identity is
 *  `new_state_root` + `settlement_tx`. */
export interface SequencerBatchRef {
    batch: number;
    chain_id: number;
    /** The EIP-712 `verifyingContract` for this batch's signatures — the
     *  VERIFIER, not FigaroCore. */
    verifying_contract: Address;
    prev_state_root: Hex;
    new_state_root: Hex;
    /** null on a dry run: the batch proved but was never settled on chain. */
    settlement_tx: Hex | null;
    block_timestamp: number;
}

export interface SequencerCommitView {
    /** The 9-field struct exactly as signed — `process_id` is zero for a root
     *  order. Amounts are hex quantities; use `fromSequencerCommitment`. */
    commitment: SequencerCommitment;
    buyer_signature: SequencerSignature;
    seller_signature: SequencerSignature;
    batch: SequencerBatchRef;
}

export interface SequencerResolutionView {
    seller: Address;
    /** Hex quantity. `2 × expectedCumulativeValue + payment`. */
    seller_payout: string;
    /** Hex quantity. `payment`. */
    buyer_payout: string;
    batch: SequencerBatchRef;
}

/** One published order. Either leg may be absent: `commit` is null when the
 *  committing batch aged out of retention, `resolution` is null while the
 *  process is still open. */
export interface SequencerOrderView {
    order_hash: Hex;
    process_id: Hex;
    commit: SequencerCommitView | null;
    resolution: SequencerResolutionView | null;
}

export interface SequencerProcessResolutionView {
    buyer: Address;
    order_count: number;
    /** The signature that authorized resolution — the batched form of the
     *  kernel's `msg.sender == rootBuyer`. */
    buyer_signature: SequencerSignature;
    batch: SequencerBatchRef;
}

export interface SequencerProcessView {
    process_id: Hex;
    orders: SequencerOrderView[];
    resolution: SequencerProcessResolutionView | null;
}

export interface SequencerBatchRecord extends SequencerBatchRef {
    commits: Array<{
        order_hash: Hex;
        process_id: Hex;
        commitment: SequencerCommitment;
        buyer_signature: SequencerSignature;
        seller_signature: SequencerSignature;
    }>;
    resolutions: Array<{
        process_id: Hex;
        buyer: Address;
        order_count: number;
        buyer_signature: SequencerSignature;
        orders: Array<{
            order_hash: Hex;
            seller: Address;
            seller_payout: string;
            buyer_payout: string;
        }>;
    }>;
}

export interface SequencerBatchPage {
    batches: SequencerBatchRecord[];
    /** Pass as `from` to continue; null means the end of what this relay has
     *  settled. */
    next_cursor: number | null;
    retained: SequencerRetentionWindow;
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

/** The wire's unsigned-integer grammar for READS: a hex quantity (`"0x7d0"`),
 *  which is what alloy's `U256` serializes to. Deliberately TIGHTER than bare
 *  `BigInt()` — which coerces `""` to `0n` and tolerates padded whitespace, so
 *  a truncated or empty amount would silently read as ZERO rather than as a
 *  parse failure. Decimal is also accepted because `toSequencerCommitment`
 *  WRITES decimal (alloy deserializes both), so a caller round-tripping its own
 *  submission must not be rejected. */
const WIRE_QUANTITY_RE = /^(0x[0-9a-fA-F]+|[0-9]+)$/;

/**
 * Parse a wire quantity into a bigint, or throw.
 *
 * THE LANDMINE THIS EXISTS FOR: the relay serializes `U256` as a HEX QUANTITY
 * (`"0x7d0"`), while `toSequencerCommitment` sends DECIMAL. Reading a hex
 * quantity as decimal (or vice versa) silently corrupts every amount — a
 * payment of `0x7d0` read as decimal is 0, and `"2000"` read as hex is 8192.
 * `BigInt()` handles both prefixed-hex and decimal correctly; the regex is what
 * stops `""`/`" "`/`"0x"` from becoming a plausible-looking zero.
 */
export function parseWireQuantity(value: string, field: string): bigint {
    if (typeof value !== "string" || !WIRE_QUANTITY_RE.test(value)) {
        throw new SequencerError(
            `malformed quantity for ${field}: expected a hex quantity ("0x7d0") or decimal string, got ${JSON.stringify(value)}`,
            0,
        );
    }
    return BigInt(value);
}

/**
 * Convert a wire commitment back to an SDK `Commitment` — the inverse of
 * `toSequencerCommitment`, and the ONLY sanctioned way to read one. Amounts go
 * through {@link parseWireQuantity}, so a malformed field throws instead of
 * defaulting to zero.
 *
 * The result is the struct EXACTLY as signed: a root order keeps
 * `processId == 0`, which is what the parties' signatures cover. Pass it to
 * `computeCommitmentProcessId`/`computeOrderHash` to derive the ids.
 */
export function fromSequencerCommitment(c: SequencerCommitment): Commitment {
    return {
        processId: c.process_id,
        buyer: c.buyer,
        seller: c.seller,
        currency: c.currency,
        payment: parseWireQuantity(c.payment, "payment"),
        expectedCumulativeValue: parseWireQuantity(
            c.expected_cumulative_value,
            "expected_cumulative_value",
        ),
        agreementHash: c.agreement_hash,
        salt: parseWireQuantity(c.salt, "salt"),
        deadline: parseWireQuantity(c.deadline, "deadline"),
    };
}

/** Convert a wire `{v, r, s}` back to the 65-byte signature hex the EIP-712
 *  verifiers take. Inverse of `toSequencerSig`. */
export function fromSequencerSig(sig: SequencerSignature): Hex {
    const strip = (h: string) => (h.startsWith("0x") ? h.slice(2) : h);
    const r = strip(sig.r).padStart(64, "0");
    const s = strip(sig.s).padStart(64, "0");
    if (r.length !== 64 || s.length !== 64 || !Number.isInteger(sig.v)) {
        throw new SequencerError(
            `malformed signature: r/s must be 32 bytes and v an integer`,
            0,
        );
    }
    return `0x${r}${s}${sig.v.toString(16).padStart(2, "0")}` as Hex;
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
    /**
     * Submit an RPGF usage claim for an order the BATCH path has settled.
     *
     * Its own endpoint, not `/submit`, because a claim is not a kernel
     * operation: it changes no kernel state and the guest applies it against
     * the batch's POST-state, so a claim for an order the same batch resolves
     * is still credited by that batch.
     *
     * Build claims with `buildUsageClaims` — never hand-roll one, and never
     * include an artifact the counter excludes: `applyBatchAccrual` reverts on
     * it and takes the whole batch, every other party's settlement included.
     */
    async submitUsageClaim(claim: SequencerUsageClaim): Promise<{ pending: number }> {
        const res = await this._fetch(`${this.url}/submit-usage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ claim }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({ error: res.statusText }));
            throw new SequencerError(
                body.error ?? `Sequencer returned ${res.status}`,
                res.status,
            );
        }
        return { pending: (await res.json()).pending };
    }

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

    // ── Publication reads ───────────────────────────────────────────────────

    /**
     * GET a publication route, returning null on `404`.
     *
     * The null is load-bearing and MUST NOT be widened: `404` from a relay
     * means "not in THIS relay's archive" — settled by another relay, settled
     * directly against FigaroCore, or aged out of retention (check
     * `status().archive`). It NEVER means the trade did not happen. Every other
     * failure throws, because an unreachable or broken relay is a different
     * fact from an absent record and callers must be able to tell them apart.
     */
    private async read<T>(path: string): Promise<T | null> {
        let res: Response;
        try {
            res = await this._fetch(`${this.url}${path}`, {
                method: "GET",
                headers: { "Accept": "application/json" },
            });
        } catch (e) {
            throw new SequencerError(
                `relay unreachable at ${this.url}${path}: ${e instanceof Error ? e.message : String(e)}`,
                0,
            );
        }
        if (res.status === 404) return null;
        if (!res.ok) {
            const body = await res.json().catch(() => ({ error: res.statusText }));
            throw new SequencerError(
                body.error ?? `Relay returned ${res.status}`,
                res.status,
            );
        }
        // A relay is untrusted transport, so its body is attacker-influenceable:
        // read it under a hard byte ceiling rather than letting `res.json()`
        // buffer whatever arrives.
        const text = await readCappedResponseText(res);
        try {
            return JSON.parse(text) as T;
        } catch {
            throw new SequencerError(`relay returned malformed JSON for ${path}`, res.status);
        }
    }

    /** One published order by its order hash, or null when this relay has no
     *  leg of it. Verify before displaying — the relay is transport. */
    async order(orderHash: Hex): Promise<SequencerOrderView | null> {
        return this.read<SequencerOrderView>(`/orders/${orderHash}`);
    }

    /** A published process — its orders and its resolution facts — or null when
     *  this relay has none of it. The primary route for reading batched trade. */
    async process(processId: Hex): Promise<SequencerProcessView | null> {
        return this.read<SequencerProcessView>(`/processes/${processId}`);
    }

    /**
     * A bounded page of settled batches, for replaying the batch universe the
     * way an indexer replays kernel logs. `limit` is clamped to 50 by the relay
     * whatever is asked; follow `next_cursor` until it is null, and check
     * `retained` against your cursor first — a cursor older than `first_batch`
     * means this relay already dropped the gap.
     */
    async batches(range?: { from?: number; limit?: number }): Promise<SequencerBatchPage> {
        const params = new URLSearchParams();
        if (range?.from !== undefined) params.set("from", String(range.from));
        if (range?.limit !== undefined) params.set("limit", String(range.limit));
        const query = params.toString();
        const page = await this.read<SequencerBatchPage>(
            `/batches${query ? `?${query}` : ""}`,
        );
        // /batches has no 404: an empty relay returns an empty page.
        if (!page) throw new SequencerError("relay returned no batch page", 404);
        return page;
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
