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
 * - The clause mirror in `frontend/lib/shared/clauses/figaro-consent-v1.json`
 *   describes the on-chain content shape (documentHash, documentVersion,
 *   documentTitle). This module produces those three fields for the
 *   EIP-712 typed-data message; do NOT introduce drift with
 *   `encodeConsentContent` in `sdk/src/clauses/encode.ts`.
 */

import { keccak256, toBytes, type Hex } from "viem";

/**
 * Pre-launch draft — pending legal-counsel review.
 *
 * The text below is the participant-facing legal document the beta-consent
 * ceremony binds. It is the comprehensive version drafted alongside the
 * Beta NDA template and the Communications Policy; legal counsel will
 * refine the formal language before the first cohort is invited. Edits
 * after this point bump CONSENT_DOCUMENT_VERSION (semver minor).
 *
 * The hashed substance excludes signature blocks (those are filled at
 * signing time and rendered into the PDF receipt). The contracting party
 * is fixed as Alessandro Daliana, the Project Operator. Participant
 * identity is captured by the EIP-712 signature, not by name in the text.
 */
export const CONSENT_DOCUMENT_TEXT = `FIGARO BETA INFORMED CONSENT AGREEMENT

This Agreement is between Alessandro Daliana ("the Project Operator") and
the Participant who signs the EIP-712 typed-data message that anchors this
document. The Agreement takes effect on the date the Participant signs.

1. WHAT FIGARO IS

Figaro is a coordination protocol. Its core component, FigaroCore, is a
primitive that lets two strangers transact under mathematically enforced
cooperation: each party deposits collateral proportional to the value at
stake, the buyer holds the resolution key, and cooperation is the dominant
strategy for any rational participant. There is no owner, no fee, no admin
function, no escape hatch. The Project Operator does not control
transaction outcomes once parties commit.

Figaro is not a financial product, not a decentralized finance ("DeFi")
application, not a token launch, not a startup. It is closer in nature to
a foundational internet protocol — like TCP/IP — than to any consumer or
commercial product. Its long-term aim is to provide a substrate for
permissionless coordination across counterparties who have no prior trust
relationship.

The mathematical foundations of the mechanism are public. The
implementation of FigaroCore is private until the Project Operator
authorizes its public release. This Agreement governs the Participant's
access to that private implementation.

2. WHAT THE PARTICIPANT IS PARTICIPATING IN

The Participant is being granted private access to a controlled testnet
environment in which a working implementation of FigaroCore and its
surrounding protocol-layer contracts are deployed. The Participant will be
able to create bonded commitments using non-real testnet tokens, observe
and exercise the protocol's mechanisms, and examine the user-facing
surfaces that compose the runtime.

The Participant is not purchasing, investing in, lending to, borrowing
from, or otherwise engaging in any financial transaction with the Project
Seller or any other party through this beta.

3. WHAT THE PARTICIPANT COMMITS TO

3.1 Thoughtful engagement. To approach the beta as testing a coordination
primitive whose successful operation has potentially significant social
and economic implications. To read the project documentation provided at
the start of the beta before forming public characterizations. To engage
meaningfully — surfacing observed behaviors, edge cases, and gaps rather
than only confirming expected outcomes.

3.2 Constructive engagement. The Participant is encouraged — not
restricted — to talk, write, blog, post, and discuss Figaro publicly
during the beta. The Participant agrees that public communication will be
constructive, defined as: (a) speaking from personal experience and
observation, not on behalf of the project; (b) using the project's own
framing where it exists — Figaro is a coordination protocol, not DeFi, not
a financial product, not a startup, not a token launch; (c) distinguishing
the published mathematical foundations from the private implementation
details; (d) coordinating with the Project Operator before formal media
engagements (journalism interviews, podcasts, conference talks, articles
in publications with editorial reach); casual social posts and personal
blogs do not require coordination; (e) when uncertain, asking the Project
Seller before publishing. The constructive-engagement obligation expires
automatically one year from the effective date of this Agreement,
regardless of whether public release of the project has occurred.

3.3 Wallet hygiene. To create and use a fresh testnet wallet for all
interactions with the beta — not a wallet that has been previously used on
Ethereum mainnet or any other public chain on which the Participant
maintains a real-name or pseudonymous identity. This protects the
Participant from inadvertent doxxing of their beta activity through
wallet-level linking.

3.4 Confidentiality of access materials. The Participant agrees not to
disclose to any non-Participant: (a) their access code or any other
authentication artifact issued by the Project Operator; (b) contract
addresses on the beta testnet, where these are communicated to the
Participant for purposes of interacting with the protocol; (c)
architectural materials — clauses not yet anchored on a public chain,
design documents, internal diagrams, validator contract specifications,
or non-public roadmaps — that the Participant encounters incidentally
during the beta; (d) the identities of other Participants, where the
Participant becomes aware of them through the beta channel. The
mathematical and game-theoretic foundations of the Figaro Protocol as
published in the project's academic papers are not subject to this
section and may be discussed freely.

3.5 Composable-protection feedback. The protocol's kernel handles bonded
coordination. The composable protections that have historically been
bundled with employment and corporate structures — insurance, taxation,
welfare, collective bargaining, minimum-price floors — are the
responsibility of the protocol's surrounding ecosystem and have not yet
been built. The Participant commits to surfacing, through the project's
feedback channel, what compositional protections they find missing during
testing.

3.6 Artifact custody. Screenshots, PDF receipts, audit bundles,
transaction logs, and any other artifacts the Participant generates or
downloads from the beta environment are watermarked with the Participant's
unique identifier — an access-code-derived QR code visible on every page
of the runtime. The Participant agrees: (a) not to redistribute these
artifacts beyond their own personal records and private discussion with
the Project Operator or other Participants; (b) not to remove, alter, or
obscure the watermarks, identifiers, or metadata embedded in any artifact;
(c) the Participant may discuss observations and impressions of the beta
in their own words and using diagrams or visual representations they
produce themselves. They may not redistribute the underlying artifacts
produced by the system.

4. WHAT THIS IS NOT

This Agreement is not an offer to sell securities or financial
instruments, an offer of employment or compensation, an investment
contract, a guarantee that the testnet will operate continuously or that
any specific outcome will obtain, a waiver of the Participant's rights
under applicable law, or legal, financial, or tax advice.

5. RISKS AND DISCLAIMERS

The testnet uses non-real tokens; no real money is at risk on chain. The
Participant acknowledges that the testnet may reset state at any time;
on-chain records may be lost; durable records of consent and material
interactions are preserved separately by the Project Operator (the PDF
receipt of this signing ceremony is one such record). The testnet may be
unavailable, experience errors, or behave unexpectedly. The Project
Seller makes no warranties of fitness, availability, or correctness.
Beta access is provisional and may be revoked by the Project Operator at
any time, with or without cause.

6. TERM AND WITHDRAWAL

This Agreement takes effect on signing and remains in effect until the
earlier of: (a) the Project Operator publicly releases the project; (b)
one year from the effective date; or (c) the Participant or the Project
Seller terminates the Participant's access.

The Participant may withdraw from the beta at any time by notifying the
Project Operator. On withdrawal, beta access ends immediately. Sections
3.2 (constructive engagement), 3.4 (confidentiality of access materials),
and 3.6 (artifact custody) survive termination until the earlier of public
release or the one-year anniversary.

7. PERSONAL INFORMATION

The Project Operator does not collect personal identifying information
from the Participant beyond what is intrinsic to public blockchain
participation (wallet addresses are visible by nature) or necessary for
technical operation (application errors via Sentry — URL, browser, stack
trace; not session content).

Beta access is granted via private access codes communicated directly
between the Project Operator and the Participant outside the system. No
email address, name, or other personal identifier is stored in any
project-managed database or third-party service.

8. LIMITATION OF LIABILITY

To the maximum extent permitted by applicable law, the Project Operator's
liability to the Participant arising out of or in connection with this
Agreement and the beta is limited to refund of any consideration paid by
the Participant to the Project Operator. The Participant acknowledges
that no such consideration has been paid; the limitation is therefore
effectively zero.

9. BREACH AND REMEDIES

The Participant acknowledges that breaches of Sections 3.2 (constructive
engagement), 3.4 (confidentiality of access materials), and 3.6 (artifact
custody) may cause harm to the Project Operator that monetary damages
alone cannot adequately remedy. The Project Operator is therefore entitled
to seek injunctive relief and equitable remedies, in addition to any
monetary damages, to enforce these sections. The Participant shall
indemnify the Project Operator for losses arising directly from the
Participant's breach of this Agreement.

10. GOVERNING LAW AND DISPUTE RESOLUTION

Disputes arising under this Agreement shall first be submitted to Kleros,
the decentralized arbitration protocol that Figaro itself integrates as
its preferred jurisdictional layer. The parties acknowledge that this
selection reflects the project's commitment to demonstrating its own
values: ownerless coordination resolved by mechanism design, not
centralized adjudication. The Participant may invoke Kleros independently,
using their PDF receipt of this signing ceremony as evidence; no project-
operated UI is required.

The parties further acknowledge that Kleros arbitration is novel and may
not be recognized as binding in all jurisdictions. To the extent
supplementary legal venues are required — particularly for emergency
injunctive relief or where Kleros decisions are not enforceable — this
Agreement shall be governed by the laws of the State of New York, USA,
and the parties consent to the exclusive jurisdiction of the courts of
the State of New York, USA, for such matters.

11. ACKNOWLEDGEMENT

By signing the EIP-712 typed-data message that anchors this document, the
Participant acknowledges that they have read this Agreement, understand
its terms, have had the opportunity to seek independent legal counsel,
and agree to be bound by it. The signature recovers to the wallet address
that signed the EIP-712 message; the Participant warrants that they
control this wallet. A PDF receipt of the signed message is generated and
pinned to IPFS for durable preservation independent of testnet state.`;

/** Semver-style version of the document. Bump on every content edit. */
export const CONSENT_DOCUMENT_VERSION = "1.1.0";

/** Human-readable title carried into the EIP-712 message. */
export const CONSENT_DOCUMENT_TITLE = "Figaro Beta Informed Consent Agreement";

/**
 * keccak256(toBytes(CONSENT_DOCUMENT_TEXT)) — frozen at module load.
 * Any byte-level edit to `CONSENT_DOCUMENT_TEXT` rotates this hash, which
 * is the binding identifier of the document on the EIP-712 message.
 */
export const CONSENT_DOCUMENT_HASH: Hex = keccak256(toBytes(CONSENT_DOCUMENT_TEXT));
