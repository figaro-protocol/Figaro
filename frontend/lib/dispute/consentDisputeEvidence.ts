/**
 * Consent-dispute evidence formatting.
 *
 * Sibling of `klerosEvidence.ts`. Where that module formats the canonical
 * commerce-process audit bundle for Kleros, this module formats a *consent*
 * dispute — a participant (or the Project Operator) escalating an alleged
 * breach of the off-chain consent agreement (e.g. §3.2 / §3.4 / §3.6 of
 * the Figaro Beta Informed Consent Agreement) to Kleros, per §10 of that
 * agreement.
 *
 * The on-chain record of the consent attestation already exists as the
 * EIP-712 typed-data signature pinned in the consent receipt PDF. No new
 * Figaro schema is needed for the dispute itself — Kleros's own chain
 * carries the dispute record, and the receipt CID + canonical document
 * CID are sufficient evidence.
 *
 * Emits two ERC-1497 JSON envelopes:
 *
 *   - {@link buildConsentDisputeMetaEvidence} — the dispute-context JSON
 *     pinned once per dispute (parallels `buildFigaroMetaEvidence`).
 *
 *   - {@link buildConsentDisputeEvidence} — the per-submission Evidence
 *     JSON pointing at the receipt PDF + canonical document + claim text
 *     + claim signature (parallels `buildAuditBundleEvidence`).
 *
 * These are plain data transformations — no chain interaction, no IPFS
 * pinning here. The caller pins the JSON envelopes via the same IPFS
 * service used by the commerce-process flow (see
 * `RuntimeServices.evidenceTransport`) and submits the resulting URIs
 * via {@link createDispute} / {@link submitEvidence} in `klerosProxy.ts`.
 */

import type { Address, Hex } from "viem";
import type { KlerosMetaEvidence, KlerosEvidence } from "./klerosEvidence";
import { truncateHex } from "@/lib/shared/formatHex";
import { isValidAddress } from "@/components/operators/TokenAddressInput";

// ---------------------------------------------------------------------------
// MetaEvidence
// ---------------------------------------------------------------------------

/**
 * Build the static MetaEvidence JSON for a Figaro consent dispute.
 *
 * Parallels `buildFigaroMetaEvidence` for commerce processes: same
 * ERC-1497 shape, different question + ruling options framed for a
 * consent-agreement breach rather than a bonded-process obligation.
 *
 * The default ruling options follow §10's framing ("breach upheld" vs.
 * "no breach found"). Pass `policyFileURI` if a Figaro consent dispute
 * policy document has been pinned.
 */
export function buildConsentDisputeMetaEvidence(
    policyFileURI?: string,
    evidenceDisplayURI?: string,
): KlerosMetaEvidence {
    return {
        category: "Other",
        title: "Figaro Consent Agreement Dispute",
        description:
            "A dispute has been raised regarding alleged breach of the Figaro Beta " +
            "Informed Consent Agreement. Per §10 of that agreement, disputes are " +
            "submitted first to Kleros for arbitration. The evidence below includes " +
            "the canonical consent document, the participant's EIP-712 signature " +
            "anchoring it, and the claim text from the submitting party. Review the " +
            "evidence to determine whether the cited section of the agreement was " +
            "breached.",
        question: "Did the cited party breach the Figaro Consent Agreement?",
        rulingOptions: {
            type: "single-select",
            titles: [
                "Breach upheld",
                "No breach found",
            ],
            descriptions: [
                "The evidence shows that the cited party breached the section " +
                "of the Figaro Consent Agreement identified in the claim.",
                "The evidence does not show a breach of the Figaro Consent " +
                "Agreement; the submitter's claim is not upheld.",
            ],
        },
        ...(policyFileURI ? { fileURI: policyFileURI } : {}),
        ...(evidenceDisplayURI ? { evidenceDisplayInterfaceURI: evidenceDisplayURI } : {}),
    };
}

// ---------------------------------------------------------------------------
// Evidence — disputed consent attestation
// ---------------------------------------------------------------------------

/**
 * The submitting party of a consent dispute. Names the two sides of the
 * beta-participation consent agreement (the legal ceremony users sign
 * to participate in beta) — distinct from any kernel-protocol role.
 *
 * - `participant` — a beta participant alleging the Project Operator (or
 *   another Participant) has breached an obligation owed to them.
 * - `operator` — the Project Operator alleging a Participant has breached
 *   the agreement (e.g. §3.2 / §3.4 / §3.6).
 *
 * The label travels with the Evidence envelope so the Kleros juror can
 * frame the claim correctly without inferring it from text.
 */
export type ConsentDisputeParty = "participant" | "operator";

/**
 * The disputed consent attestation, as recovered from the receipt PDF /
 * receipt JSON. The submitter pastes (or selects from local cache) the
 * three fields below; we carry them verbatim into the Evidence envelope
 * so any Kleros juror can re-verify the EIP-712 signature without
 * needing access to the project's frontend.
 */
export interface DisputedConsentAttestation {
    /**
     * keccak256 hex digest of the canonical consent document. The
     * EIP-712 message field this hash anchors is `documentHash` per the
     * `figaro-consent-v1` schema.
     */
    documentHash: Hex;
    /** Semver document version (`figaro-consent-v1` `documentVersion`). */
    documentVersion: string;
    /** Human-readable document title (`figaro-consent-v1` `documentTitle`). */
    documentTitle: string;
    /**
     * The 65-byte EIP-712 signature produced when the participant signed
     * the consent ceremony. Recoverable to {@link signer} under the
     * domain established by the consent ceremony.
     */
    signature: Hex;
    /** Ethereum address recovered from {@link signature}. */
    signer: Address;
    /** ISO-8601 timestamp the participant signed (off-chain). */
    signedAt: string;
}

/**
 * The submitter's signed claim — a fresh signature over a digest of the
 * dispute claim text + receipt CID, bound to the submitting wallet. This
 * is not strictly required by Kleros (the on-chain `createDispute` call
 * is itself the proof of submission, paid for by the submitter's wallet)
 * but it locks the textual claim to the submitter at evidence-build time,
 * before the transaction is broadcast. Useful for two reasons:
 *
 *   1. Anti-spoof: a third party cannot pin Evidence JSON impersonating
 *      the submitter — the signature recovers to the actual submitter.
 *
 *   2. Anti-spam: Kleros itself charges an arbitration deposit, but the
 *      claim signature provides a non-monetary deterrent at the IPFS
 *      pinning layer.
 *
 * Domain + types live in the consumer (the `/dispute` page) — see
 * `CONSENT_DISPUTE_CLAIM_TYPES` in that page for the canonical
 * EIP-712 shape.
 */
export interface SubmitterClaimSignature {
    /** ISO-8601 timestamp the submitter signed the claim digest. */
    submittedAt: string;
    /** EIP-712 signature over the claim digest. */
    signature: Hex;
    /** Address recovered from {@link signature}. */
    submitter: Address;
}

/**
 * Inputs for {@link buildConsentDisputeEvidence}. Strict shape — all
 * fields are required, validated at the function entry.
 */
export interface ConsentDisputeEvidenceInput {
    /** The disputed consent attestation, lifted from the receipt PDF / JSON. */
    attestation: DisputedConsentAttestation;
    /**
     * IPFS CID of the canonical consent document text (the bytes whose
     * keccak256 equals {@link attestation.documentHash}).
     */
    documentCid: string;
    /**
     * IPFS CID of the participant's PDF receipt for the disputed
     * attestation. The PDF carries the typed-data message, the
     * signature, the signer, and the signing timestamp in a
     * single self-contained document.
     */
    receiptCid: string;
    /**
     * The free-text claim from the submitting party. Expected length
     * window: ~500–2000 chars. Shorter is rejected (insufficient
     * context); longer is accepted but truncated downstream is the
     * caller's responsibility.
     */
    claimText: string;
    /** Section of the consent agreement the submitter alleges was breached. */
    citedSection: string;
    /** Which side of the consent agreement is submitting the claim. */
    submittingParty: ConsentDisputeParty;
    /** Submitter's signed claim digest. */
    claimSignature: SubmitterClaimSignature;
    /** EVM chain ID the submission is being made on (Ethereum mainnet, Gnosis, etc.). */
    chainId: number;
}

const MIN_CLAIM_LENGTH = 200;
const MAX_CLAIM_LENGTH = 4000;

const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{55,})$/;
const HEX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const HEX_SIG_PATTERN = /^0x[0-9a-fA-F]{130}$/;
function assertCid(value: string, fieldName: string): void {
    if (!CID_PATTERN.test(value)) {
        throw new Error(
            `${fieldName} must be a valid IPFS CID (Qm... or bafy...); got "${value}"`,
        );
    }
}

function assertHash(value: string, fieldName: string): void {
    if (!HEX_HASH_PATTERN.test(value)) {
        throw new Error(`${fieldName} must be a 0x-prefixed 32-byte hex digest`);
    }
}

function assertSignature(value: string, fieldName: string): void {
    if (!HEX_SIG_PATTERN.test(value)) {
        throw new Error(`${fieldName} must be a 0x-prefixed 65-byte EIP-712 signature`);
    }
}

function assertAddress(value: string, fieldName: string): void {
    if (!isValidAddress(value)) {
        throw new Error(`${fieldName} must be a 0x-prefixed 20-byte address`);
    }
}

function assertClaimText(value: string): void {
    if (value.length < MIN_CLAIM_LENGTH) {
        throw new Error(
            `claimText must be at least ${MIN_CLAIM_LENGTH} characters; got ${value.length}`,
        );
    }
    if (value.length > MAX_CLAIM_LENGTH) {
        throw new Error(
            `claimText must be at most ${MAX_CLAIM_LENGTH} characters; got ${value.length}`,
        );
    }
}

/**
 * Build the per-submission Evidence JSON for a Figaro consent dispute.
 *
 * The result is the JSON object the caller pins to IPFS; the resulting
 * URI is then passed to `submitEvidence(...)` (or
 * `createDispute(...).metaEvidenceURI` on the first submission alongside
 * the MetaEvidence).
 *
 * Validates every field synchronously; throws `Error` on malformed input.
 * Validation surfaces are intentionally narrow — the caller is expected
 * to have collected the input through the `/dispute` flow, which gates
 * on each field already; these checks catch wiring bugs, not user
 * typos.
 *
 * The Evidence's `description` is the canonical narrative carried into
 * the Kleros juror UI; it stitches together the cited agreement section,
 * the submitter's claim text, the disputed signer, and the submitter's
 * own signature, so a juror reading only the Evidence JSON has the
 * full picture without dereferencing IPFS.
 *
 * @throws Error if any input fails validation.
 */
export function buildConsentDisputeEvidence(
    input: ConsentDisputeEvidenceInput,
): KlerosEvidence {
    // ── Validation ──────────────────────────────────────────────────
    assertHash(input.attestation.documentHash, "attestation.documentHash");
    assertSignature(input.attestation.signature, "attestation.signature");
    assertAddress(input.attestation.signer, "attestation.signer");
    if (!input.attestation.documentVersion) {
        throw new Error("attestation.documentVersion must be a non-empty string");
    }
    if (!input.attestation.documentTitle) {
        throw new Error("attestation.documentTitle must be a non-empty string");
    }
    if (!input.attestation.signedAt) {
        throw new Error("attestation.signedAt must be a non-empty ISO-8601 string");
    }

    assertCid(input.documentCid, "documentCid");
    assertCid(input.receiptCid, "receiptCid");
    assertClaimText(input.claimText);
    if (!input.citedSection) {
        throw new Error("citedSection must be a non-empty string");
    }

    assertSignature(input.claimSignature.signature, "claimSignature.signature");
    assertAddress(input.claimSignature.submitter, "claimSignature.submitter");
    if (!input.claimSignature.submittedAt) {
        throw new Error("claimSignature.submittedAt must be a non-empty ISO-8601 string");
    }

    if (!Number.isInteger(input.chainId) || input.chainId <= 0) {
        throw new Error("chainId must be a positive integer");
    }

    // ── Envelope ────────────────────────────────────────────────────
    const submitterLabel = input.submittingParty === "operator"
        ? "Project Operator"
        : "Participant";

    // Lines below are concatenated into the Evidence's `description` —
    // one self-contained narrative, no IPFS dereferencing required by
    // a juror to grasp the dispute.
    const descriptionLines = [
        `Submitter: ${submitterLabel} (${truncateHex(input.claimSignature.submitter)})`,
        `Submitted at: ${input.claimSignature.submittedAt}`,
        `Chain ID: ${input.chainId}`,
        ``,
        `Disputed consent attestation:`,
        `  Document: ${input.attestation.documentTitle} ` +
        `(v${input.attestation.documentVersion})`,
        `  Document hash: ${input.attestation.documentHash}`,
        `  Document CID: /ipfs/${input.documentCid}`,
        `  Signer: ${input.attestation.signer}`,
        `  Signed at: ${input.attestation.signedAt}`,
        `  Receipt CID: /ipfs/${input.receiptCid}`,
        ``,
        `Cited section of the Figaro Consent Agreement: ${input.citedSection}`,
        ``,
        `Claim from the ${submitterLabel}:`,
        input.claimText,
        ``,
        `The submitter's signature over this claim recovers to ` +
        `${input.claimSignature.submitter}; the disputed consent ` +
        `attestation's signature recovers to ${input.attestation.signer}. ` +
        `Both signatures can be verified independently against the ` +
        `documents pinned at the CIDs above.`,
    ];

    return {
        name:
            `Figaro Consent Dispute — ${input.citedSection} ` +
            `(${truncateHex(input.attestation.signer)})`,
        description: descriptionLines.join("\n"),
        // Point fileURI at the PDF receipt — the canonical evidentiary
        // artifact that already carries the typed-data message, the
        // signature, the recovered signer, and the document text in a
        // single self-contained PDF. The juror clicks through to the
        // PDF; the document CID is referenced inline in the
        // description above.
        fileURI: `/ipfs/${input.receiptCid}`,
        fileHash: input.receiptCid,
        fileTypeExtension: "pdf",
    };
}
