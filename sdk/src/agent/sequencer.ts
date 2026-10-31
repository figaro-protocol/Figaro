/**
 * @figaro-protocol/sdk/agent — Sequencer Client
 *
 * Submits signed FigaroCore operations to the off-chain batch sequencer
 * for proof-based resolution via FigaroBatchVerifier.
 *
 * The sequencer is a coordination convenience, not a trust assumption.
 * All operations require valid EIP-712 signatures — the sequencer
 * cannot fabricate, censor selectively, or violate FigaroCore invariants.
 * Participants can always fall back to direct FigaroCore submission.
 *
 * The batched surface is FigaroCore + attestation ops only. Registry
 * mutations (clause/seller/assembly registration) are once-per-registration
 * ETH-staked intents that stay on the direct path.
 *
 * A batched attestation carries, by default, exactly what
 * `AttestationCoordinator` takes on the direct path: the `clauseDataHash`,
 * the agreement inclusion proof and the `contentRef` — fingerprints only,
 * so the relay sees what the chain sees and never the parties' data. The
 * plaintext form — the clause's pinned spec bytes, the content and the
 * committed clauseData — is sent only when the caller sets
 * `checkContentInProof`, to have the content validated inside the proof;
 * the relay then receives that plaintext and, when it proves on the
 * Succinct network (`SP1_PROVER=network`), forwards it there.
 */

import { keccak256, stringToHex } from "viem";
import type { Hex, Address, Commitment } from "../types.js";
import { readCappedBytes } from "../cappedRead.js";
import { strippingReviver } from "../safeJson.js";

// ── Sequencer operation types (match Rust KernelOp variants) ────────────────

export interface SequencerSignature {
    v: number;
    r: Hex;
    s: Hex;
}

/** How the attestation's content bytes relate to the clause spec. */
export type SequencerContentKind = "RuntimeWitness" | "ReAssert";

/** The plaintext form of a batched attestation's witness — mirrors the
 *  Rust `AttestationContentProof`. Sent only at the attesting party's
 *  choice (`checkContentInProof`): it hands the relay the clause's
 *  content. */
export interface SequencerContentProof {
    /** The clause's spec JSON — the EXACT pinned bytes (`keccak256` of them
     *  is the clause key the attestation names). */
    spec_json: string;
    /** The structured content validated (and, for a RuntimeWitness,
     *  generically ABI-encoded) in-proof. */
    content_json: string;
    /** Canonical-JSON clauseData bytes — the committed agreement
     *  clause this attestation declares against. */
    clause_data: string;
    /** Sorted-pair Merkle proof binding the clause leaf to the target
     *  order's signed checkoutHash. Empty for a single-clause agreement. */
    inclusion_proof: Hex[];
    content_kind: SequencerContentKind;
}

/** What a batched attestation carries — serde's externally tagged encoding
 *  of the Rust `AttestationWitness`. `HashOnly` is the coordinator's
 *  arguments (the default); `Plaintext` has the content checked in the
 *  proof. */
export type SequencerAttestationWitness =
    | { HashOnly: { clause_data_hash: Hex; inclusion_proof: Hex[] } }
    | { Plaintext: SequencerContentProof };

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
        /** The cumulative value the buyer's signature accepts (decimal
         *  string): the proof applies the resolve only while the process
         *  holds it. */
        cumulative_value: string;
        commitments: SequencerCommitment[];
        buyer_sig: SequencerSignature;
    }
    | {
        type: "ResolveByWalletCode";
        process_id: Hex;
        /** The cumulative value the authorization accepts (decimal string),
         *  as for `Resolve`. */
        cumulative_value: string;
        commitments: SequencerCommitment[];
        /** Bytes the buyer's own account code validates for
         *  `hashResolveProcess(process_id, cumulative_value)` (ERC-1271). */
        authorization: Hex;
    }
    | {
        type: "AttestAsSeller";
        target: SequencerCommitment;
        clause_id: Hex;
        stage: number;
        content_ref: Hex;
        seller_sig: SequencerSignature;
        proof: SequencerAttestationWitness;
    }
    | {
        type: "AttestAsBuyer";
        target: SequencerCommitment;
        clause_id: Hex;
        stage: number;
        content_ref: Hex;
        buyer_sig: SequencerSignature;
        proof: SequencerAttestationWitness;
    };

/** Commitment in the sequencer's wire format (snake_case, string-encoded bigints). */
export interface SequencerCommitment {
    process_id: Hex;
    buyer: Address;
    seller: Address;
    currency: Address;
    payment: string;
    expected_cumulative_value: string;
    checkout_hash: Hex;
    salt: string;
    deadline: string;
}

/**
 * A claim that one RESOLVED BATCH order used one clause, registered agreement
 * or assembly — the wire form of the Rust guest's `UsageClaim`. Build these
 * with `buildUsageClaims` (rpgf), which proves each clause from its clause,
 * the agreement from the agreement's provenance leaf, and the assembly from
 * the same leaf plus the agreement's membership proof; never hand-roll one.
 *
 * Nothing here is trusted. The guest re-proves that the order resolved and that
 * the clause or assembly was in the signed agreement; the counter then applies the
 * reward's own gates on chain. A claim is a REQUEST to be counted, never an
 * assertion that counts.
 */
export type SequencerUsageClaimKind =
    | { Clause: { clause_data_hash: Hex } }
    | { Agreement: { assembly_hash: Hex } }
    | { Assembly: { agreement_hash: Hex; slot_content_hash: Hex; membership_proof: Hex[] } };

export interface SequencerUsageClaim {
    order: SequencerCommitment;
    /** Clause key (kind `Clause`), agreement hash (kind `Agreement`) or
     *  assembly assemblyHash (kind `Assembly`). Field name mirrors the Rust
     *  guest's `UsageClaim.clause_or_assembly` (prover/lib/src/types.rs) — a
     *  wire-protocol identity; any change must land in lockstep with the Rust side. */
    clause_or_assembly: Hex;
    /** serde's externally-tagged encoding of the Rust `UsageClaimKind`;
     *  codes 0 / 2 / 1 (`usageClaimKindCode`). */
    kind: SequencerUsageClaimKind;
    /** Sorted-pair proof against the order's `checkout_hash`: of the clause
     *  leaf (Clause) or of the provenance leaf (Agreement, Assembly). */
    inclusion_proof: Hex[];
}

// ── Response types ──────────────────────────────────────────────────────────

export interface SubmitResult {
    id: number;
}

export interface SequencerStatus {
    state_root: string;
    pending_ops: number;
    /** Usage claims waiting to ride the next batch. */
    pending_usage_claims: number;
    batches_settled: number;
    /** Cumulative ops the relay dropped without resolving (deterministic
     *  resolve revert, prove failure). A GROWING figure during a wait means
     *  the wait is over, whatever `batches_settled` says — poll this beside
     *  it. Absent on a relay predating the failure surface. */
    dead_lettered_ops?: number;
    /** The most recent dead-letter reason, verbatim; null while clean. */
    last_settle_error?: string | null;
    /** Cumulative usage claims the relay dropped without landing, counted
     *  apart from the operations. Absent on a relay predating the count. */
    dropped_usage_claims?: number;
    /** The most recent claim drop's reason, verbatim; null while clean. */
    last_dropped_claim_error?: string | null;
}

export function toSequencerCommitment(c: Commitment): SequencerCommitment {
    return {
        process_id: c.processId,
        buyer: c.buyer,
        seller: c.seller,
        currency: c.currency,
        payment: c.payment.toString(),
        expected_cumulative_value: c.expectedCumulativeValue.toString(),
        checkout_hash: c.checkoutHash,
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
        checkoutHash: c.checkout_hash,
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

/**
 * The witness a convenience submission carries: the hash-only form unless
 * the caller set `checkContentInProof`. The plaintext form's clauseData
 * must hash to `clauseDataHash`, so the two forms name the same leaf.
 */
function attestationWitness(args: {
    clauseDataHash: Hex;
    inclusionProof: Hex[];
    checkContentInProof?: Omit<SequencerContentProof, "inclusion_proof">;
}): SequencerAttestationWitness {
    const content = args.checkContentInProof;
    if (content === undefined) {
        return { HashOnly: { clause_data_hash: args.clauseDataHash, inclusion_proof: args.inclusionProof } };
    }
    if (keccak256(stringToHex(content.clause_data)).toLowerCase() !== args.clauseDataHash.toLowerCase()) {
        throw new SequencerError("checkContentInProof.clause_data does not hash to clauseDataHash", 0);
    }
    return { Plaintext: { ...content, inclusion_proof: args.inclusionProof } };
}

// ── Response reads ──────────────────────────────────────────────────────────

/**
 * Byte ceiling on any sequencer response. A sequencer is anyone's (the
 * client takes whatever URL its caller names), so its body is
 * attacker-sizable: read whole, an oversized one exhausts the agent's memory.
 * Every answer the API gives is bytes-scale (an id, a pending count, the
 * status figures and one error string); 1 MiB clears them with margin.
 */
export const MAX_SEQUENCER_RESPONSE_BYTES = 1024 * 1024;

/** The body's text under `MAX_SEQUENCER_RESPONSE_BYTES`, or a SequencerError
 *  carrying the response's status. */
async function readSequencerText(res: Response): Promise<string> {
    const bytes = await readCappedBytes(res, MAX_SEQUENCER_RESPONSE_BYTES);
    if (bytes === null) {
        throw new SequencerError(`sequencer response exceeds the ${MAX_SEQUENCER_RESPONSE_BYTES}-byte cap`, res.status);
    }
    return new TextDecoder().decode(bytes);
}

/** A successful response's JSON, read under the cap. */
async function readSequencerJson<T>(res: Response): Promise<T> {
    return JSON.parse(await readSequencerText(res), strippingReviver) as T;
}

/** The refusal a non-ok response carries: its JSON body's `error` field, or
 *  "Sequencer returned <status>" when the JSON names none, or the status text
 *  when the body is not JSON. A body over the cap throws the cap's refusal
 *  instead. */
async function sequencerRefusal(res: Response): Promise<SequencerError> {
    const text = await readSequencerText(res);
    let body: { error?: string } | null;
    try {
        body = JSON.parse(text, strippingReviver) as { error?: string } | null;
    } catch {
        return new SequencerError(res.statusText, res.status);
    }
    return new SequencerError(body?.error ?? `Sequencer returned ${res.status}`, res.status);
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
     * Submit a signed FigaroCore operation to the sequencer.
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
        if (!res.ok) throw await sequencerRefusal(res);
        const body = await readSequencerJson<{ id: number }>(res);
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
     * `buyerSig` is the buyer's `ResolveProcess` signature over `processId`
     * and `cumulativeValue`, the process's cumulative value when the buyer
     * signed; the proof refuses the resolve unless the process still holds
     * it, so a later commit calls for a new signature.
     */
    async submitResolve(
        processId: Hex,
        cumulativeValue: bigint,
        commitments: Commitment[],
        buyerSig: Hex,
    ): Promise<SubmitResult> {
        return this.submit({
            type: "Resolve",
            process_id: processId,
            cumulative_value: cumulativeValue.toString(),
            commitments: commitments.map(toSequencerCommitment),
            buyer_sig: toSequencerSig(buyerSig),
        });
    }

    /**
     * Submit a resolve authorized by the buyer's wallet code: `authorization`
     * is bytes the buyer's own account code validates for
     * `hashResolveProcess(processId, cumulativeValue, { chainId, core:
     * verifier })` through ERC-1271's `isValidSignature` — the form a wallet
     * whose key is lost resolves with, through code it installed while it held
     * the key. The wallet's code produces the bytes, never `signTypedData`. The
     * proof checks the process, the value and the order list and publishes the
     * bytes; `FigaroBatchVerifier` asks the buyer's code at resolution and
     * reverts the batch on any answer but the magic value. The relay asks the
     * same code at its door and refuses bytes the code does not validate.
     */
    async submitResolveByWalletCode(
        processId: Hex,
        cumulativeValue: bigint,
        commitments: Commitment[],
        authorization: Hex,
    ): Promise<SubmitResult> {
        return this.submit({
            type: "ResolveByWalletCode",
            process_id: processId,
            cumulative_value: cumulativeValue.toString(),
            commitments: commitments.map(toSequencerCommitment),
            authorization,
        });
    }

    /**
     * Submit a seller attestation using SDK types. `target` is the seller's
     * own order — the signer must be `target.seller` — and carries the
     * checkoutHash the inclusion proof opens against.
     *
     * By default the submission carries the coordinator's arguments alone:
     * `clauseDataHash` and `inclusionProof` (with `contentRef` under the
     * signature). Set `checkContentInProof` to have the content validated
     * inside the proof: it sends the spec, the content and the clauseData
     * in plaintext to the relay, and on to the proving network when the
     * relay proves there.
     */
    async submitAttestAsSeller(args: {
        target: Commitment;
        clauseId: Hex;
        stage: number;
        contentRef: Hex;
        sellerSig: Hex;
        clauseDataHash: Hex;
        inclusionProof: Hex[];
        checkContentInProof?: Omit<SequencerContentProof, "inclusion_proof">;
    }): Promise<SubmitResult> {
        return this.submit({
            type: "AttestAsSeller",
            target: toSequencerCommitment(args.target),
            clause_id: args.clauseId,
            stage: args.stage,
            content_ref: args.contentRef,
            seller_sig: toSequencerSig(args.sellerSig),
            proof: attestationWitness(args),
        });
    }

    /** Submit a buyer attestation using SDK types; the two forms as for
     *  {@link SequencerClient.submitAttestAsSeller}. */
    async submitAttestAsBuyer(args: {
        target: Commitment;
        clauseId: Hex;
        stage: number;
        contentRef: Hex;
        buyerSig: Hex;
        clauseDataHash: Hex;
        inclusionProof: Hex[];
        checkContentInProof?: Omit<SequencerContentProof, "inclusion_proof">;
    }): Promise<SubmitResult> {
        return this.submit({
            type: "AttestAsBuyer",
            target: toSequencerCommitment(args.target),
            clause_id: args.clauseId,
            stage: args.stage,
            content_ref: args.contentRef,
            buyer_sig: toSequencerSig(args.buyerSig),
            proof: attestationWitness(args),
        });
    }

    /** Query sequencer status: state root, pending ops, batches resolved. */
    /**
     * Submit an RPGF usage claim for an order the BATCH path has resolved.
     *
     * Its own endpoint, not `/submit`, because a claim is not a FigaroCore
     * operation: it changes no FigaroCore state and the guest applies it against
     * the batch's POST-state, so a claim for an order the same batch resolves
     * is still credited by that batch.
     *
     * Build claims with `buildUsageClaims` — never hand-roll one.
     */
    async submitUsageClaim(claim: SequencerUsageClaim): Promise<{ pending: number }> {
        const res = await this._fetch(`${this.url}/submit-usage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ claim }),
        });
        if (!res.ok) throw await sequencerRefusal(res);
        return { pending: (await readSequencerJson<{ pending: number }>(res)).pending };
    }

    async status(): Promise<SequencerStatus> {
        const res = await this._fetch(`${this.url}/status`, {
            method: "GET",
            headers: { "Accept": "application/json" },
        });
        if (!res.ok) {
            await res.body?.cancel().catch(() => {});
            throw new SequencerError(
                `Status request failed: ${res.statusText}`,
                res.status,
            );
        }
        return readSequencerJson<SequencerStatus>(res);
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
