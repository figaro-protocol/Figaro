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
 * A batched attestation carries exactly what `AttestationCoordinator`
 * takes on the direct path: the `clauseDataHash`, the agreement inclusion
 * proof and the `contentRef` — fingerprints only, so the relay and the
 * proving network see what the chain sees and never the parties' data.
 * No operation carries a party's content.
 */

import { isAddressHex, isBytes32Hex, type Hex, type Address, type Commitment, type EIP712Domain } from "../types.js";
import { buildDomain, computeCommitmentProcessId, computeOrderHash } from "../commitments.js";
import { readCappedBytes } from "../cappedRead.js";
import { strippingReviver } from "../safeJson.js";

// ── Sequencer operation types (match Rust KernelOp variants) ────────────────

export interface SequencerSignature {
    v: number;
    r: Hex;
    s: Hex;
}

/** What a batched attestation carries — the Rust `AttestationWitness`:
 *  the coordinator's arguments beside the signed `contentRef`. */
export interface SequencerAttestationWitness {
    /** `keccak256` of the committed clauseData. */
    clause_data_hash: Hex;
    /** Sorted-pair Merkle proof binding the clause leaf to the target
     *  order's signed checkoutHash. Empty for a single-clause agreement. */
    inclusion_proof: Hex[];
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
        /** The cumulative value the buyer's signature accepts (decimal
         *  string): the proof applies the resolve only while the process
         *  holds it. */
        running_total: string;
        commitments: SequencerCommitment[];
        buyer_sig: SequencerSignature;
    }
    | {
        type: "ResolveByWalletCode";
        process_id: Hex;
        /** The cumulative value the authorization accepts (decimal string),
         *  as for `Resolve`. */
        running_total: string;
        commitments: SequencerCommitment[];
        /** Bytes the buyer's own account code validates for
         *  `hashResolveProcess(process_id, running_total)` (ERC-1271). */
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
    }
    | {
        type: "AttestByWalletCode";
        /** The attesting party: the target's seller or its buyer. */
        role: "Seller" | "Buyer";
        target: SequencerCommitment;
        clause_id: Hex;
        stage: number;
        content_ref: Hex;
        /** Bytes the party's own account code validates for the role's
         *  `AttestSeller` / `AttestBuyer` digest under the verifier's domain
         *  (ERC-1271). */
        authorization: Hex;
        proof: SequencerAttestationWitness;
    };

/** Commitment in the sequencer's wire format (snake_case, string-encoded bigints). */
export interface SequencerCommitment {
    process_id: Hex;
    buyer: Address;
    seller: Address;
    token: Address;
    payment: string;
    running_total: string;
    checkout_hash: Hex;
    salt: string;
    commit_deadline: string;
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
    | { Agreement: { process_design_hash: Hex } }
    | { Process: { agreement_hash: Hex; agreement_content_hash: Hex; membership_proof: Hex[] } };

export interface SequencerUsageClaim {
    order: SequencerCommitment;
    /** Clause key (kind `Clause`), agreement hash (kind `Agreement`) or
     *  assembly processDesignHash (kind `Process`). Field name mirrors the Rust
     *  guest's `UsageClaim.clause_or_process` (prover/lib/src/types.rs) — a
     *  wire-protocol identity; any change must land in lockstep with the Rust side. */
    clause_or_process: Hex;
    /** serde's externally-tagged encoding of the Rust `UsageClaimKind`;
     *  codes 0 / 2 / 1 (`usageClaimKindCode`). */
    kind: SequencerUsageClaimKind;
    /** Sorted-pair proof against the order's `checkout_hash`: of the clause
     *  leaf (Clause) or of the provenance leaf (Agreement, Assembly). */
    inclusion_proof: Hex[];
}

// ── The typed data a batched attestation is signed over ─────────────────────

/** EIP-712 types of the seller's batch-path attestation authorization, the
 *  signed form of the coordinator's `msg.sender == target.seller`. Signed
 *  under the verifier's domain (`buildDomain(chainId, batchVerifier)`);
 *  `orderHash` is the order's id there (`computeOrderHash` with the verifier's
 *  address). The proof recovers the signer from the same struct
 *  (`prover/lib/src/eip712.rs`). */
export const ATTEST_SELLER_TYPES = {
    AttestSeller: [
        { name: "orderHash", type: "bytes32" },
        { name: "clauseId", type: "bytes32" },
        { name: "stage", type: "uint8" },
        { name: "contentRef", type: "bytes32" },
    ],
} as const;

/** EIP-712 types of the buyer's batch-path attestation authorization, as
 *  {@link ATTEST_SELLER_TYPES} with the order's process id first. */
export const ATTEST_BUYER_TYPES = {
    AttestBuyer: [
        { name: "processId", type: "bytes32" },
        { name: "orderHash", type: "bytes32" },
        { name: "clauseId", type: "bytes32" },
        { name: "stage", type: "uint8" },
        { name: "contentRef", type: "bytes32" },
    ],
} as const;

/** One attestation a party files on the batch path: the attested order as
 *  signed (a root's processId 0) and the coordinator's arguments, the same
 *  on both paths. `clauseDataHash` and `contentRef` are fingerprints, never
 *  the preimages. */
export interface BatchAttestation {
    target: Commitment;
    clauseId: Hex;
    stage: number;
    contentRef: Hex;
    clauseDataHash: Hex;
    proof: readonly Hex[];
}

/** The attesting party's role in the attested order. */
export type BatchAttestationRole = "seller" | "buyer";

/** The EIP-712 typed data of one batch-path attestation, typed loosely so
 *  one value serves either role's signer: `types` and `primaryType` are
 *  {@link ATTEST_SELLER_TYPES} and `AttestSeller`, or
 *  {@link ATTEST_BUYER_TYPES} and `AttestBuyer`. */
export interface BatchAttestationTypedData {
    domain: EIP712Domain;
    types: Record<string, readonly { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, unknown>;
}

/**
 * The typed data the attesting party signs for `at` on the batch path:
 * `AttestSeller` or `AttestBuyer` under the verifier's domain
 * (`buildDomain(chainId, verifier)`), over the order's id there
 * (`computeOrderHash` with the verifier's address) and, for the buyer, the
 * order's process id there. The caller signs it with its own wallet and
 * hands the signature to {@link SequencerClient.submitSignedAttestation}.
 */
export function batchAttestationTypedData(
    role: BatchAttestationRole,
    at: BatchAttestation,
    chainId: number,
    verifier: Address,
): BatchAttestationTypedData {
    const domain = buildDomain(chainId, verifier);
    const orderHash = computeOrderHash(at.target, chainId, verifier);
    const signed = { orderHash, clauseId: at.clauseId, stage: at.stage, contentRef: at.contentRef };
    if (role === "seller") {
        return { domain, types: ATTEST_SELLER_TYPES, primaryType: "AttestSeller", message: signed };
    }
    const processId = computeCommitmentProcessId(at.target, chainId, verifier);
    return { domain, types: ATTEST_BUYER_TYPES, primaryType: "AttestBuyer", message: { processId, ...signed } };
}

// ── Response types ──────────────────────────────────────────────────────────

export interface SubmitResult {
    id: number;
}

/**
 * The version of the relay's HTTP interface this client speaks, published as
 * `relay-wire.schema.json` beside this file. A relay serves its own on
 * `/status` (`wire_format_version`); `status()` refuses any other.
 */
export const RELAY_WIRE_FORMAT_VERSION = 1;

export interface SequencerStatus {
    /** The version of the relay's HTTP interface ({@link RELAY_WIRE_FORMAT_VERSION}). */
    wire_format_version: number;
    /** The chain the relay reads, as its RPC answers. */
    chain_id: number;
    /** The `FigaroBatchVerifier` the relay lands its batches at. A wallet compares it
     *  with the verifier it reads from the deployment before sending. */
    batch_verifier: Address;
    /** The fingerprint of the guest the relay proves with. A proof verifies
     *  only when the verifier holds the same value as its `programVKey`. */
    program_vkey: Hex;
    /** The page origins the relay's operator lets submit from a browser
     *  (`BROWSER_SUBMIT_ORIGINS`); empty, none. A page whose origin is not
     *  listed cannot POST to this relay from a browser. */
    browser_submit_origins: string[];
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
    /** Operations waiting in the isolation: a refused batch whose revert
     *  named nobody is split until the operation that reverts alone is
     *  found, and the queue waits meanwhile. A non-zero figure means the
     *  relay is isolating, not stalled for another reason. Absent on a relay
     *  predating the isolation. */
    isolating_ops?: number;
}

/**
 * A `/status` body read as {@link SequencerStatus}, or a SequencerError.
 * Refused: a body that is not an object; a `wire_format_version` other than
 * {@link RELAY_WIRE_FORMAT_VERSION}; a `chain_id` that is not a positive
 * integer; a `batch_verifier` that is not a 20-byte hex address; a
 * `program_vkey` that is not 32 bytes of hex; a `browser_submit_origins`
 * that is not a list of strings; a `state_root` that is not a
 * string; a queue count that is not a non-negative integer.
 */
export function parseSequencerStatus(body: unknown, statusCode = 200): SequencerStatus {
    const refuse = (what: string): never => {
        throw new SequencerError(`the relay's /status answer ${what}`, statusCode);
    };
    if (body === null || typeof body !== "object" || Array.isArray(body)) refuse("is not an object");
    const s = body as Record<string, unknown>;
    if (s.wire_format_version !== RELAY_WIRE_FORMAT_VERSION) {
        refuse(`names wire format version ${String(s.wire_format_version)}, and this client speaks ${RELAY_WIRE_FORMAT_VERSION}`);
    }
    if (typeof s.chain_id !== "number" || !Number.isSafeInteger(s.chain_id) || s.chain_id <= 0) refuse("names no chain id");
    if (!isAddressHex(s.batch_verifier)) refuse("names no batch verifier address");
    if (!isBytes32Hex(s.program_vkey)) refuse("names no 32-byte program key");
    if (!Array.isArray(s.browser_submit_origins) || !s.browser_submit_origins.every((o) => typeof o === "string")) {
        refuse("names no list of browser origins");
    }
    if (typeof s.state_root !== "string") refuse("names no state root");
    for (const count of ["pending_ops", "pending_usage_claims", "batches_settled"] as const) {
        const n = s[count];
        if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) refuse(`carries no ${count} count`);
    }
    return s as unknown as SequencerStatus;
}

export function toSequencerCommitment(c: Commitment): SequencerCommitment {
    return {
        process_id: c.processId,
        buyer: c.buyer,
        seller: c.seller,
        token: c.token,
        payment: c.payment.toString(),
        running_total: c.runningTotal.toString(),
        checkout_hash: c.checkoutHash,
        salt: c.salt.toString(),
        commit_deadline: c.commitDeadline.toString(),
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

/** The witness a convenience submission carries. */
function attestationWitness(args: { clauseDataHash: Hex; inclusionProof: Hex[] }): SequencerAttestationWitness {
    return { clause_data_hash: args.clauseDataHash, inclusion_proof: args.inclusionProof };
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
        let url = config.url;
        while (url.endsWith("/")) url = url.slice(0, -1);
        this.url = url;
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
     * and `runningTotal`, the process's cumulative value when the buyer
     * signed; the proof refuses the resolve unless the process still holds
     * it, so a later commit calls for a new signature.
     */
    async submitResolve(
        processId: Hex,
        runningTotal: bigint,
        commitments: Commitment[],
        buyerSig: Hex,
    ): Promise<SubmitResult> {
        return this.submit({
            type: "Resolve",
            process_id: processId,
            running_total: runningTotal.toString(),
            commitments: commitments.map(toSequencerCommitment),
            buyer_sig: toSequencerSig(buyerSig),
        });
    }

    /**
     * Submit a resolve authorized by the buyer's wallet code: `authorization`
     * is bytes the buyer's own account code validates for
     * `hashResolveProcess(processId, runningTotal, { chainId, core:
     * verifier })` through ERC-1271's `isValidSignature` — the form a wallet
     * whose key is lost resolves with, through code it installed while it held
     * the key. The wallet's code validates the bytes; the wallet's signer or
     * its session key produces them, never this SDK's `signTypedData`. The
     * proof checks the process, the value and the order list and publishes the
     * bytes; `FigaroBatchVerifier` asks the buyer's code at resolution and
     * reverts the batch on any answer but the magic value. The relay asks the
     * same code at its door and refuses bytes the code does not validate.
     */
    async submitResolveByWalletCode(
        processId: Hex,
        runningTotal: bigint,
        commitments: Commitment[],
        authorization: Hex,
    ): Promise<SubmitResult> {
        return this.submit({
            type: "ResolveByWalletCode",
            process_id: processId,
            running_total: runningTotal.toString(),
            commitments: commitments.map(toSequencerCommitment),
            authorization,
        });
    }

    /**
     * Submit a seller attestation using SDK types. `target` is the seller's
     * own order — the signer must be `target.seller` — and carries the
     * checkoutHash the inclusion proof opens against.
     *
     * The submission carries the coordinator's arguments alone:
     * `clauseDataHash` and `inclusionProof`, with `contentRef` under the
     * signature.
     */
    async submitAttestAsSeller(args: {
        target: Commitment;
        clauseId: Hex;
        stage: number;
        contentRef: Hex;
        sellerSig: Hex;
        clauseDataHash: Hex;
        inclusionProof: Hex[];
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

    /** Submit a buyer attestation using SDK types, as
     *  {@link SequencerClient.submitAttestAsSeller} does for the seller. */
    async submitAttestAsBuyer(args: {
        target: Commitment;
        clauseId: Hex;
        stage: number;
        contentRef: Hex;
        buyerSig: Hex;
        clauseDataHash: Hex;
        inclusionProof: Hex[];
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

    /** Submit `at` as `role`, with the party's
     *  signature over {@link batchAttestationTypedData} for the same role. */
    async submitSignedAttestation(role: BatchAttestationRole, at: BatchAttestation, signature: Hex): Promise<SubmitResult> {
        const witness = {
            target: at.target,
            clauseId: at.clauseId,
            stage: at.stage,
            contentRef: at.contentRef,
            clauseDataHash: at.clauseDataHash,
            inclusionProof: [...at.proof],
        };
        return role === "seller"
            ? this.submitAttestAsSeller({ ...witness, sellerSig: signature })
            : this.submitAttestAsBuyer({ ...witness, buyerSig: signature });
    }

    /**
     * Submit an attestation authorized by the attesting party's wallet code:
     * `authorization` is bytes the party's own account code validates for the
     * role's digest (`AttestSeller(orderHash, clauseId, stage, contentRef)` for
     * the seller, `AttestBuyer(processId, orderHash, clauseId, stage,
     * contentRef)` for the buyer, under the verifier's domain) through
     * ERC-1271's `isValidSignature` — the form a wallet whose key is lost
     * attests with, through code it installed while it held the key. The
     * wallet's code validates the bytes; the wallet's signer or its session
     * key produces them, never this SDK's `signTypedData`. The proof runs
     * every check of the signed form but the signer's recovery and publishes
     * the bytes; `FigaroBatchVerifier` asks the party's code and emits the
     * `Attestation` on the magic value; any other answer, a call that ran out
     * of gas included, reverts the whole batch, so a batch that lands carries
     * the attestation. The relay asks the same code at its door and refuses bytes
     * the code does not validate. The witness is that of
     * {@link SequencerClient.submitAttestAsSeller}.
     */
    async submitAttestByWalletCode(args: {
        role: "Seller" | "Buyer";
        target: Commitment;
        clauseId: Hex;
        stage: number;
        contentRef: Hex;
        authorization: Hex;
        clauseDataHash: Hex;
        inclusionProof: Hex[];
    }): Promise<SubmitResult> {
        return this.submit({
            type: "AttestByWalletCode",
            role: args.role,
            target: toSequencerCommitment(args.target),
            clause_id: args.clauseId,
            stage: args.stage,
            content_ref: args.contentRef,
            authorization: args.authorization,
            proof: attestationWitness(args),
        });
    }

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

    /**
     * The relay's state and what it proves for: the chain, the batch verifier
     * and the guest fingerprint. Refuses an answer that lacks any of the
     * three or speaks another wire format version
     * ({@link parseSequencerStatus}).
     */
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
        return parseSequencerStatus(await readSequencerJson<unknown>(res), res.status);
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
