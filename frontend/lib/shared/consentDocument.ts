/**
 * Figaro beta — informed-consent document.
 *
 * The placeholder text below is the participant-facing legal document the
 * beta-consent ceremony binds. Everything in `CONSENT_DOCUMENT_TEXT` is the
 * canonical document body — no headers, no markup, no signing instructions.
 * `CONSENT_DOCUMENT_HASH` is the keccak256 of that exact string at module
 * load, frozen as the on-chain anchor (pattern: off-chain semantics, on-chain
 * shared-reference integrity, per `figaro-consent-v1`).
 *
 * Beta consent runs as EIP-712 typed-data signing only — the artifact is the
 * signature + a PDF receipt, not a transaction. The `figaro-consent-v1`
 * Solidity validator stays available for any future flow that wants consent
 * as a clause inside a bonded commitment, but it is not exercised here.
 *
 * Lockstep:
 * - The text below is replaced before launch. Any byte-level change rotates
 *   the hash and produces a new attestation domain. Bump
 *   `CONSENT_DOCUMENT_VERSION` in lockstep with content edits.
 * - The schema mirror in `frontend/lib/shared/schemas/figaro-consent-v1.json`
 *   describes the on-chain content shape (documentHash, documentVersion,
 *   documentTitle). This module produces those three fields for the
 *   EIP-712 typed-data message; do NOT introduce drift with
 *   `encodeConsentContent` in `sdk/src/schemas/encode.ts`.
 */

import { keccak256, toBytes, type Hex } from "viem";

/**
 * Draft text — replaced before launch.
 *
 * The structure mirrors the Informed Consent Agreement form used by IRBs:
 * (1) what the participant is testing, (2) what data the system records,
 * (3) what the participant is asked to do, (4) compensation, (5) right to
 * withdraw, (6) confidentiality, (7) operator contact. Beta participants
 * sign the keccak256 of this exact string; the bytes are immutable for the
 * lifetime of the version.
 */
export const CONSENT_DOCUMENT_TEXT = `FIGARO BETA INFORMED CONSENT AGREEMENT

You are being invited to participate in a closed beta test of the Figaro
protocol. Figaro is a stateless settlement primitive for self-enforcing
bilateral agreements between strangers. The beta is operated by the project
team (the "Operator") under the access-code program described to you in
the invitation.

1. WHAT YOU ARE TESTING

You are testing the Figaro runtime — the user-facing surfaces (terminal,
operators, designer, financials, /verify, audit-bundle export) and the
underlying protocol (FigaroCore, AttestationCoordinator, schema validators)
on a development chain. You are not testing on mainnet; no real funds are
at risk. The wallet you connect for the beta is a test wallet whose
private key is generated locally and may be regenerated at any time.

2. WHAT THE SYSTEM RECORDS

The protocol records (a) on-chain events emitted by the kernel and the
coordinator (commitments, attestations, resolutions), (b) the off-chain
agreement manifests pinned to IPFS, (c) the EIP-712 signature produced by
this consent ceremony, and (d) the access code you used to enter the
beta. The watermark visible on every page of the runtime is the access
code; it is the link between you and the session.

3. WHAT YOU ARE ASKED TO DO

You are asked to exercise the runtime under realistic conditions and to
report bugs, friction, and surprises through the in-app feedback channel
or directly to the Operator. You may stop at any time without penalty;
participation is voluntary.

4. COMPENSATION

There is no compensation for participation. Beta participants do not
receive FIG tokens, fee credits, or any other consideration for testing.

5. RIGHT TO WITHDRAW

You may withdraw at any time. Withdrawal does not affect any other
relationship you may have with the Operator. To withdraw, stop using the
runtime and notify the Operator at the contact below.

6. CONFIDENTIALITY

The Operator does not collect personal data outside of the access code,
the wallet address you connect, the on-chain events your wallet produces,
and the off-chain artifacts (agreements, attestations) you sign. You are
asked not to share screenshots of the runtime that omit the watermark;
the watermark is the artifact-custody mechanism for the closed beta.

7. CONTACT

For questions, withdrawal, or feedback, contact the Operator at the
address provided in your beta invitation.

By signing the EIP-712 typed-data message that anchors this document, you
acknowledge that you have read, understood, and agreed to the above. The
signature is the artifact; a PDF receipt of the signed message is
generated for your records.`;

/** Semver-style version of the document. Bump on every content edit. */
export const CONSENT_DOCUMENT_VERSION = "1.0.0";

/** Human-readable title carried into the EIP-712 message. */
export const CONSENT_DOCUMENT_TITLE = "Figaro Beta Informed Consent Agreement";

/**
 * keccak256(toBytes(CONSENT_DOCUMENT_TEXT)) — frozen at module load.
 * Any byte-level edit to `CONSENT_DOCUMENT_TEXT` rotates this hash, which
 * is the binding identifier of the document on the EIP-712 message.
 */
export const CONSENT_DOCUMENT_HASH: Hex = keccak256(toBytes(CONSENT_DOCUMENT_TEXT));
