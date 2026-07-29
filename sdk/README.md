# @figaro/sdk

TypeScript SDK for the Figaro Protocol — self-enforcing agreements between strangers.

Event parsing, state reconstruction, EIP-712 commitment building, bond math,
agent coordination, the template→orders projection, and the runtime handoff
key-agreement. Three runtime dependencies: `viem`, plus `@noble/curves` +
`@noble/hashes` for the handoff ECDH/AES-GCM (audited, zero-dependency crypto).

## Install

```bash
npm install @figaro/sdk
```

## Five Entry Points

### `@figaro/sdk` — Protocol Primitives

Event parsing, state reconstruction, EIP-712 commitments, bond calculations,
chain gas ceilings. Also home to the distribution mirror —
`computeRpgfAllocations` (`src/rpgf/formula.json`): a deterministic integer
pipeline that reproduces, off chain, what `UsageCounter` + `RpgfMinter` compute
on chain for the 600M retroactive distribution. Usage is counted as the facts
happen — recorded against a resolved order — so **there is nothing to post,
nothing to bond and nothing to dispute**. The reward is UNIFORM (no tag,
category or weight — every artifact's score is `icbrt(c·d²·10^18)`, its real
usage alone) and UNCAPPED; the only eligibility gate is a two-sided live ETH
stake (usage counts only for a live-staked seller-of-record, and an author earns
only while the artifact's registration deposit stays un-withdrawn). The mirror
exists to display a distribution, predict a claim, and verify a recorded
accrual; `formula.json` is the normative prose statement of the mechanism and
the source of every constant the mirror uses.

```ts
import {
  addressesFromDeploymentRecord,
  fetchCoreEvents,
  reconstruct,
  calculateBonds,
  buildCommitment,
  buildDomain,
  Topology,
  maxOrdersResolvablePerProcess,
} from "@figaro/sdk";

// `addresses` everywhere below is a `FigaroAddresses` ({ core, token, … }).
// A PUBLISHED DEPLOYMENT RECORD uses different key names (`figaroCore`,
// `tokenAddress`, …) — do not spread it verbatim; map it once:
const addresses = addressesFromDeploymentRecord(deploymentRecord);

// Fetch all FigaroCore events from a block range. The return is a GROUPED
// object — { orderCommitted, orderResolved, processResolved }, each a typed
// array — NOT one flat log list. (Attestations are NOT in here: they live on
// the AttestationCoordinator, a separate contract — read those with
// EV_ATTESTATION + parseAttestationLogs; see @figaro/sdk/derive.)
const events = await fetchCoreEvents(client, addresses, 0n);

// Reconstruct full process/order state from events
const topology = new Topology();
topology.applyEvents(events);

const process = topology.getProcess(processId);
const active = topology.getActiveProcesses();

// Calculate bond requirements
const bonds = calculateBonds(cumulativeValue, payment);
// → { sellerBond, buyerBond, totalLocked }

// Per-process resolve ceiling on the active chain (a process grown past
// this can NEVER settle — check before every commit; the kernel cannot)
const cap = await maxOrdersResolvablePerProcess(client);

// Build EIP-712 typed data for signing
const domain = buildDomain(chainId, coreAddress);
const { commitment, typedData } = buildCommitment(
  {
    processId: "0x0000000000000000000000000000000000000000000000000000000000000000",
    buyer,
    seller,
    currency,
    payment,
    expectedCumulativeValue: payment,
    agreementHash,
  },
  domain,
);
```

**Calling the kernel without the SDK.** A `cast`-only participant talks to
`FigaroCore` directly with two functions:

```
commit((bytes32 processId, address buyer, address seller, address currency,
        uint256 payment, uint256 expectedCumulativeValue, bytes32 agreementHash,
        uint256 salt, uint256 deadline) c, bytes buyerSig, bytes sellerSig)
resolveProcess(bytes32 processId, <that same tuple>[] commitments)   // buyer only
```

A ROOT commitment signs `processId = 0` (the kernel derives the real id and
returns it); a sub-order carries the root's derived `processId`. `buyerSig` /
`sellerSig` are EIP-712 signatures over the `Commitment` struct under domain
`{ name: "FigaroCore", version: "3", chainId, verifyingContract: <core> }`. The
SDK wrappers (`buildDomain` + `buildCommitment`) encode exactly these EIP-712
type/domain details — a raw caller must reproduce them byte-for-byte or the
kernel's on-chain recovery rejects the bond. Reach for the wrappers unless you
have a reason not to; this sketch is only enough to orient a raw caller.

**Token approvals before commit — the whole per-order bond, every time.** The
kernel pulls the FULL per-order bonds on EVERY `commit`, root or sub-order, and
nets nothing against bonds it already holds from earlier orders in the process
(`src/kernel/FigaroCore.sol:208-209` — `payment × 2` from the buyer, `expectedCumulativeValue × 2`
from the seller). Approve the settlement ERC-20 for both legs before each commit:

```ts
import { calculateRootApproval, calculateSubOrderApproval } from "@figaro/sdk";

// Root order:
const { buyerApproval, sellerApproval } = calculateRootApproval(payment);
// → buyerApproval = 2 × payment,  sellerApproval = 2 × payment

// Sub-order (extends an existing process):
const approvals = calculateSubOrderApproval(payment, newCumulativeValue);
// → buyerApproval  = 2 × payment
//   sellerApproval = 2 × newCumulativeValue  — the WHOLE cumulative bond for
//   this order, NOT the increment over the previous order's bond.
```

Approving the *increment* instead of the full `2 × newCumulativeValue` is the
reverting mistake: `commit` reverts inside the settlement token with
`ERC20InsufficientAllowance`, and the bonds already pulled for the earlier
orders stay locked in the kernel until the buyer resolves the process. (The
helper was `calculateSubOrderSellerApproval` before; it is now
`calculateSubOrderApproval` and returns both legs.)

## Recovering an in-flight process

A half-committed process — the root landed but a sub-order's counter-signature
never arrived, or a client crashed mid-checkout — is recoverable from chain
state alone, because `OrderCommitted` carries the FULL commitment payload
(`processId, buyer, seller, currency, payment, cumulativeValue, agreementHash,
salt, deadline` — everything except the two signatures).

1. `const events = await fetchCoreEvents(client, addresses, fromBlock)` and read
   `events.orderCommitted` for the process (or `reconstruct(events)` for the live
   `ProcessState`).
2. Re-derive the `Commitment` struct from an event's fields — the payload IS the
   struct. `reconstruct` also gives you the running `cumulativeValue` and
   `activeOrderCount`, so a resuming sub-order signs the correct
   `expectedCumulativeValue` (previous cumulative + this order's payment).
3. Continue: re-request the missing counter-signature for that struct and
   re-broadcast the `commit`, or — as the buyer — `resolveProcess` the orders
   that DID commit. Nothing the chain can't re-derive is stranded; the bonds the
   kernel already pulled stay against their orders until the buyer resolves.

### `@figaro/sdk/agent` — Agent Coordination

Context sync, network discovery, action proposer, human-in-the-loop queue,
autonomous execution, did:web identity.

```ts
import { FigaroContext, proposeActions, proposeInitiations, ActionQueue } from "@figaro/sdk/agent";
import { commit, executeAction } from "@figaro/sdk/agent";

// Sync on-chain state into a live context — the agent's own processes AND the
// live-staked network catalogue (clauses, sellers, assemblies).
const ctx = new FigaroContext(client, addresses);
await ctx.sync();

// Discover what exists (cold start): getAssemblies() / getSellers() / getClauses()
const assemblies = ctx.getAssemblies();

// FigaroContext wraps the low-level discovery primitives, which are ROOT
// `@figaro/sdk` exports — NOT `@figaro/sdk/agent`. Use them directly for a
// one-shot catalogue read without a context:
import { fetchDiscoveryEvents, reconstructDiscovery } from "@figaro/sdk";
const discovery = reconstructDiscovery(await fetchDiscoveryEvents(client, addresses, 0n));

// Propose actions on a process the agent is in, and originations from discovery
const actions = proposeActions(ctx.getProcess(processId)!, myAddress);
const initiations = proposeInitiations(assemblies, myAddress);

// Human-in-the-loop: queue actions for approval with optional review context
type ApprovalContext = {
  bindingId?: string;
  party?: string;          // "buyer" | "seller"
  runtimeSummary?: string; // free-form context for the approver
};

const queue = new ActionQueue<ApprovalContext>();
queue.enqueueAll(actions.map((action) => ({
  action,
  approvalContext: {
    bindingId: "binding:my-seller:local-anvil",
    party: "seller",
    runtimeSummary: "Seller of record · process 0x9c2b…",
  },
})));
// ... user reviews and approves ...
const approved = queue.approve(1);
console.log(approved.approvalContext?.runtimeSummary);

// Autonomous: submit transactions directly after collecting both EIP-712 signatures
const result = await commit(walletClient, publicClient, coreAddress, commitment, buyerSig, sellerSig);
// Or dispatch from a proposed action. resolve-process is self-contained; commit/
// attest/initiate take signed `inputs` — the SDK never fabricates a signature.
const result = await executeAction(walletClient, publicClient, addresses, approvedAction);

// Attest one clause end-to-end from a hydrated Agreement. Pick the clause from
// the agreement's OWN sections — never a bundled list.
import { buildSectionInclusionProof, sectionDataHash, computeClauseKey } from "@figaro/sdk";
import { attestAsSeller } from "@figaro/sdk/agent";
import { parseClauseSpec, encodeContentFromSpec } from "@figaro/sdk/clauses";
import { keccak256 } from "viem";

const section = agreement.sections[0]; // e.g. { clause: "figaro-assembly-provenance", version, data }

// 1. Inclusion proof — buildSectionInclusionProof takes the RAW section name.
const { proof } = buildSectionInclusionProof(agreement, section.clause);
// 2. Section FINGERPRINT — keccak256 of the committed canonical bytes. The
//    coordinator takes only the hash, never the preimage, so a `private`-
//    disposition section's plaintext never touches public calldata.
const sectionHash = sectionDataHash(section);
// 3. Content FINGERPRINT — hash the ABI-encoded content (which lives OFF-chain).
//    Omit content to RE-ASSERT the committed section: contentRef = sectionHash.
const parsed = parseClauseSpec(specJson);
if (!parsed.ok) throw new Error(parsed.errors[0].message);
const content = encodeContentFromSpec(parsed.spec, section.data);
const contentRef = keccak256(content);
// 4. Attest. `clauseId` is the bytes32 HASH — NOT the raw name from step 1.
// `stage` vocabulary: 0 = the clause's COMMITTED content (encode with no
// stage option); N ≥ 1 = a runtime witness whose field shape is the spec's
// own `stages[N]` declaration (encode with `{ stage: N }`); a process-log
// ladder attests its enum's index as the stage. The vocabulary is the
// clause spec's data — the SDK and the chain assign it no meaning.
const clauseId = computeClauseKey(section.clause, section.version);
// `roleCommitment`/`targetCommitment` are the SIGNED commitment structs (a root
// order carries processId = 0), NOT the reconstruction-derived form. For
// SAME-ORDER attestation pass the SAME commitment as both role and target
// (one struct in both slots) — two distinct commitments are only the
// cross-order case (seller attesting from a different order in the process).
await attestAsSeller(
  walletClient, addresses.attestationCoordinator!,
  roleCommitment, targetCommitment, clauseId, /* stage */ 0, sectionHash, proof, contentRef,
);
// The coordinator has THREE attest entry points, all merkle-binding identically
// to the signed agreement — they differ only in how caller authority is proven:
//   • attestAsSeller     — the order's seller attests (role + target commitments;
//                          pass the same struct twice for same-order attestation).
//   • attestAsBuyer      — the root buyer attests (target commitment only; the
//                          commit invariant makes msg.sender == c.buyer the check).
//   • attestViaResolver  — the order's seller is a MECHANISM CONTRACT implementing
//                          IRoleResolver, which authorizes msg.sender via
//                          isAuthorized(orderHash, caller): delegated attestation
//                          for contract-seller mechanisms.
// The SDK ships wrappers for the first two (attestAsSeller / attestAsBuyer, both
// from @figaro/sdk/agent); attestViaResolver is in ATTESTATION_COORDINATOR_ABI —
// call it directly (writeContract) when the seller is a resolver contract.

// Autonomous origination — the two-party handshake over a coordination channel:
// buyer instantiates a discovered assembly + signs; seller validates + counter-signs.
import { originateProcess, makeSellerOfferHandler, InProcessChannel } from "@figaro/sdk/agent";
// REFUSE-ALL FLOOR: without an `accept` policy the handler declines EVERY offer.
// Autonomy is opt-in — the policy is where you bound currency/amount before the
// seller bonds against them. (A `() => true` accept-all is possible but unsafe.)
channel.register(sellerAddr, makeSellerOfferHandler(sellerWallet, publicClient, addresses, {
    accept: (offer) => offer.commitment.currency === myAcceptedToken
        && offer.commitment.expectedCumulativeValue <= myMaxBond,
}));
const tx = await originateProcess(buyerWallet, publicClient, addresses, { channel, template, seller, currency, payment, chainId, core, overrides });

// The dispatch race — market formation with zero contracts, the seller-signs-
// first INVERSE of the handshake above: a buyer relays the SAME unsigned draft
// shape to k candidates (each draft naming that candidate at their own posted
// price), candidates counter-sign to answer "available", and the buyer signs
// EXACTLY ONE winner — the single buyer signature is both the selection event
// and the seller-address answer. A draft binds nobody and cannot be broadcast
// (the kernel needs both signatures); a losing countersignature expires inert
// at the struct deadline. Same two candidate-side floors as counterSignOffer.
import { validateDraft, counterSignDraft, verifyRaceReply, selectRaceWinner } from "@figaro/sdk/agent";
const reply = await counterSignDraft(courierWallet, draft, { chainId, core }, accept, policy);
// Buyer side: exact struct-hash equality against the SENT draft, then recovery —
// a doctored reply cannot ride a valid signature.
const check = await verifyRaceReply(reply!, draft, { chainId, core });
const winner = selectRaceWinner(replies); // cheapest countersigner; ties by arrival
// Packaged fan-out + mountable responder (the RFQ leg below has the same pair):
import { requestCounterSignatures, makeSellerRaceHandler } from "@figaro/sdk/agent";
channel.register(courierAddr, makeSellerRaceHandler(courierWallet, { chainId, core }, { accept, policy }));
const race = await requestCounterSignatures(channel, drafts, { chainId, core }); // { replies, winner }

// The RFQ leg — same choreography, the CANDIDATE authors the price (bespoke
// jobs, thin markets — no posted figure fits). The request goes out at the
// buyer's CEILING (their reservation price, inside the signed struct so the
// cap is enforceable); the candidate's pricing function quotes below it; the
// counter-draft re-prices ONLY the fields the buyer named (`pricedFields` —
// the buyer names their own clause, the SDK names none). The buyer verifies
// by RECONSTRUCTION: the same substitution applied to their OWN draft must
// reproduce the reply hash-for-hash — a quote can change the price and
// nothing else. Cheapest verified quote wins; the buyer signs exactly one.
import { buildQuoteRequest, requestQuotes, makeSellerQuoteHandler } from "@figaro/sdk/agent";
channel.register(courierAddr, makeSellerQuoteHandler(courierWallet, { chainId, core }, {
    quote: (draft) => myPriceFor(draft),           // null declines; > ceiling declines
    policy: { requireRootShape: true, currencyAllowlist: [myToken], maxValue: myMaxBond },
}));
const drafts = candidates.map((seller) => buildQuoteRequest({
    template, buyer, seller, currency, ceiling, chainId, core,
    pricedFields: [{ clause: "figaro-commerce", path: "payment" },
                   { clause: "figaro-commerce", path: "lineItems.0.unitPrice" }],
    overrides,
}));
const { winner: quoted } = await requestQuotes(channel, drafts, { chainId, core });

// A relayed offer envelope is untrusted input. `deserializeCommitmentPayload`
// parses through the root-exported `strippingReviver`, dropping any
// `__proto__` / `constructor` / `prototype` keys at parse time — a malicious
// envelope cannot pollute the prototype chain of the receiving agent. Reuse
// `strippingReviver` for any other untrusted JSON you parse (IPFS bodies,
// channel payloads): `JSON.parse(body, strippingReviver)`.
import { strippingReviver } from "@figaro/sdk";
import { deserializeCommitmentPayload } from "@figaro/sdk/agent";

// did:web: an agent resolves a counterparty's DID Document, verifies the on-chain
// address it binds, and reads the coordination endpoint to route an offer to
// (build your own with buildSellerDidDocument).
import { resolveDidWeb, didDocumentMatchesAddress, extractServiceEndpoints } from "@figaro/sdk/agent";
const { document } = await resolveDidWeb("did:web:seller.example.com");
const bound = document ? didDocumentMatchesAddress(document, "0xSeller...", 1) : false;
const [endpoint] = document ? extractServiceEndpoints(document, "MCPEndpoint") : [];
```

### `@figaro/sdk/derive` — Clause-Agnostic Derivations

Clause-agnostic attestation filtering, geo math, and the commits==resolves
withdraw gate.

```ts
import {
  computeClauseKey, fetchCoreEvents, EV_ATTESTATION, parseAttestationLogs,
} from "@figaro/sdk";
import {
  filterByClause,
  haversineDistance,
  geohashesMatch,
  deriveInFlightOrders,
  deriveClauseWithdrawGate,
  deriveAssemblyWithdrawGate,
} from "@figaro/sdk/derive";

// Attestations live on the AttestationCoordinator, NOT in fetchCoreEvents
// (which returns only orderCommitted / orderResolved / processResolved). Read
// the Attestation logs straight from the coordinator, then parse them into
// typed AttestationEvents:
const attestationLogs = await client.getLogs({
  address: addresses.attestationCoordinator!,
  event: EV_ATTESTATION,
  fromBlock: 0n,
});
const attestations = parseAttestationLogs(attestationLogs);

// Derive the on-chain clause key (name, version), then filter for it. The SDK
// knows no specific clause — the stage/contentRef meaning is clause-spec data
// read at the edge, never baked in here.
const clauseId = computeClauseKey("figaro-emissions", 1);
const forClause = filterByClause(attestations, clauseId);

// Geo: check delivery proximity
const close = geohashesMatch("dr5ru7", "dr5ru8", 5); // true (5-char prefix match)
const km = haversineDistance(40.71, -74.00, 34.05, -118.24); // ~3944 km

// Withdraw gate (advisory): an artifact author must not reclaim their
// registration stake while deals composed from the artifact are in flight.
// The join is derived at read time from chain + IPFS, never stored:
const events = await fetchCoreEvents(client, addresses, 0n);
const inFlight = deriveInFlightOrders(events); // committed, process unresolved
// You resolve each ref's pinned agreement (the SDK does no IPFS I/O), pairing
// it as { processId, agreement } — a null agreement (party-private/unreachable)
// is COUNTED as unverified and surfaced, but never blocks: agreement bodies are
// party-private, and the on-chain inclusion-proof hardening doesn't lock the
// stake on unrevealed deals either. Then:
const clauseGate = deriveClauseWithdrawGate("figaro-emissions", agreements);
const assemblyGate = deriveAssemblyWithdrawGate(assemblyTemplate, agreements);
// gate.canWithdraw === (inFlightCount === 0); unverifiedCount is a caveat
```

### `@figaro/sdk/clauses` — Clause-Spec Format + Content Encoding

The single off-chain source of truth for clause-content well-formedness and
canonical ABI encoding. It is **fully generic**: it parses a clause's spec JSON
(fetched from `ClauseRegistry` → IPFS at runtime) and applies the same rules to
ANY clause — no clause is known to this module, nothing is bundled. Adding a
clause adds a spec, never a code path here.

**Validation surfaces (present state).** Well-formedness is checked in ONE place
off-chain: this Layer-A TypeScript module (frontend form gates + SDK agent-action
preflight). On-chain, the `AttestationCoordinator` merkle-binds each attestation
to its signed agreement and content-hashes the evidence — it does NOT validate
clause content. So a never-seen clause is attestable with zero per-clause on-chain
code.

> On the BATCHED path the proof apparatus (rebuilt 2026-07-16) DOES validate
> content in-proof: a Rust mirror of this same Layer A validates and re-encodes
> the content against the clause's spec supplied as a witness input, and
> `FigaroBatchVerifier` settles only if the witness's hash matches
> `ClauseRegistry.contentHashOf` — so never-seen clauses stay attestable AND
> batch-settleable with zero per-clause code. There are no per-clause validator
> contracts, permanently. The contract catalogue that states this is published
> at `/spec`; the clause-authoring path is at `/clauses`.

```ts
import {
  parseClauseSpec,
  parseFieldSpec, // parse ONE field spec (for field specs outside a clause's
                  // content `fields` — e.g. a composition's runtime-input fields)
  validateContent,
  encodeContentFromSpec,
  decodeContentFromSpec,
} from "@figaro/sdk/clauses";

// 1. Parse a clause spec (typically fetched from ClauseRegistry → IPFS)
const parsed = parseClauseSpec(specJson);
if (!parsed.ok) throw new Error(parsed.errors[0].message);
// NOTE: `parsed.spec` deliberately omits the spec's `block` slice — that is
// presentation metadata the SDK does not own. The `contentHash` you register
// on ClauseRegistry covers the RAW canonical JSON document (including
// `block`): pin and hash the raw document; never re-serialize `parsed.spec`.

// 2. Validate content against the spec (closed clauses: unknown fields rejected).
//    Content first, spec second; pass `{ stage }` for a per-stage witness shape.
const result = validateContent({ handoff: ["face-to-face"] }, parsed.spec);
if (!result.ok) throw new Error(result.errors[0].message);

// 3. Encode content to canonical ABI bytes straight from the parsed spec. ONE
//    generic encoder drives every clause — there are no per-clause encoders.
const bytes = encodeContentFromSpec(parsed.spec, { handoff: ["face-to-face"] });
// The content lives OFF-chain; pass its FINGERPRINT `keccak256(bytes)` as the
// `contentRef` arg to attestAs{Seller,Buyer} (never the preimage — calldata is public).
// `decodeContentFromSpec(parsed.spec, bytes)` is the exact inverse (readers/audit).
```

Format is a closed subset of JSON Schema. Field types: `string` (with
format `bytes32-hex` / `address-hex` / `bytes-hex` / `iso-datetime`),
`integer`, `bigint` (decimal-string for JSON safety), `boolean`, `enum`,
`array`, `object`. Per-stage overrides via `spec.stages[stage]`.

### `@figaro/sdk/handoff` — Runtime Handoff Wire Protocol

The wire vocabulary two wallets speak when a pending commitment (or a sealed
handoff key) travels between them at runtime. The SDK owns only the message
shapes, the `HandoffChannel` transport seam, and the key agreement — the
**transports live with the consumer** (XMTP, an in-memory test bus, an inert
links-only null channel), so a second frontend implements one channel and
reproduces the exact key-exchange bytes from this entry point alone.

Four `ChannelMessage` shapes cross the channel (all safe on a PUBLIC transport):
`HandoffKeyMessage` (`HANDOFF_KEY`, a bare AES key — only when the transport is
itself confidential), `EcdhPubkeyMessage` (`ECDH_PUBKEY`, the receiver's
per-order ephemeral public key), `EcdhWrappedKeyMessage` (`ECDH_WRAPPED_KEY`,
the AES key wrapped under the ECDH secret), and `CommitmentSignatureMessage`
(`COMMITMENT_PAYLOAD`, a **bare IPFS CID** — no `ipfs://` prefix — of a pinned,
JSON-serialized `CommitmentPayload` from `@figaro/sdk/agent`; the envelope stays
small and late subscribers get a durable retrieval path). This is a DIFFERENT
exchange from `@figaro/sdk/agent`'s `CoordinationChannel`, which carries the
bilateral OFFER between agents — different vocabulary, different seam.

The ECDH secret reproduces `eciesjs@0.5`'s `encapsulate`/`decapsulate` byte-for-
byte (golden-vector-pinned): the 32-byte secret is `HKDF-SHA256(senderPub ||
sharedPoint)`, no salt, no info. **Direction matters** — the SENDER's public key
is folded into the HKDF input, so the two sides call *different* halves and the
reverse pairing yields a DIFFERENT secret:

- the **sender** (who will encrypt) calls `deriveSharedSecretAsSender(myPriv, receiverPub)`,
- the **receiver** calls `deriveSharedSecretAsReceiver(senderPub, myPriv)`.

```ts
import {
  generateOrderKeypair,
  deriveSharedSecretAsSender,
  deriveSharedSecretAsReceiver,
  wrapWithSharedSecret,
  unwrapWithSharedSecret,
} from "@figaro/sdk/handoff";
import type { HandoffChannel } from "@figaro/sdk/handoff";

// RECEIVER: mint a per-order ephemeral keypair, publish the public key.
const kp = generateOrderKeypair(); // { privateKeyHex, publicKeyHex } — compressed 66-char pub
await channel.sendEcdhPubkey({ recipientAddress: senderAddr, orderId, pubKeyHex: kp.publicKeyHex });

// SENDER: on the receiver's pubkey, derive with OWN priv + receiver's pub, then
// wrap the AES handoff key (a base64url string) and send the blob publicly.
const secretS = deriveSharedSecretAsSender(myPrivHex, receiverPubHex);
const wrappedKeyB64 = await wrapWithSharedSecret(keyB64, secretS); // base64url: 12-byte IV || AES-256-GCM
await channel.sendWrappedKey({ recipientAddress: receiverAddr, orderId, wrappedKeyB64 });

// RECEIVER: derive with sender's pub + OWN priv (the same 32 bytes), unwrap.
const secretR = deriveSharedSecretAsReceiver(senderPubHex, kp.privateKeyHex);
const keyB64Back = await unwrapWithSharedSecret(wrappedKeyB64, secretR);
// keyB64Back === keyB64 → the receiver holds the AES key and opens the sealed payload.
```

A `HandoffChannel` implementation carries each `ChannelMessage` shape between two
wallet addresses with matched `send*`/`on*` pairs (`sendEcdhPubkey`/`onEcdhPubkey`,
`sendWrappedKey`/`onWrappedKey`, `sendCommitmentPayload`/`onCommitmentPayload`
plus `onAnyCommitmentPayload` for the connected wallet, and the direct
`sendHandoffKey`/`onHandoffKey`), and a `destroy()` teardown. `senderIdentity`
in each callback is transport-specific (an XMTP inbox id, a wallet address) — the
SDK does not constrain it. Full signatures: `dist/handoff/messages.d.ts` +
`dist/handoff/ecdh.d.ts`.

## Projection: from Composed Clauses to the Hashed Agreement

An adopted assembly template ships its clause maps mostly empty — an empty `{}`
means the designer *selected* the clause but set no fields, deferring them
downstream (the seller at first use, the buyer at checkout — `assembly.d.ts`).
Turning a hydrated template into the filled, hashed `Agreement` that
`buildCommitment` signs is a **deterministic projection**: both parties, and any
second frontend, must reproduce it byte-exactly because its outputs are hashed
(`agreementHash` — the merkle root the commitment signs; `compositionHash` —
assembly identity). The SDK now ships that projection (`dist/projection.d.ts`) —
you no longer hand-assemble sections.

**The SDK holds NO spec cache.** Every projection function takes a `SpecSource`
— the consumer's window onto its loaded `ClauseRegistry → IPFS` specs:

```ts
import { parseClauseSpec } from "@figaro/sdk/clauses";
import { parseProjectionHints } from "@figaro/sdk";
import type { SpecSource, ProjectionSpecView } from "@figaro/sdk";

// Build a SpecSource from the raw spec JSON you fetched from the registry.
// A view is the Layer-A spec PLUS the hash-load-bearing `block` hints
// (`design.article`, `design.scope`, `design.fills`, `checkout.catalogueFills`,
// `checkout.profileFills`) that parseProjectionHints extracts — everything
// else in `block` is presentation the SDK never reads. `design.fills` names
// the content fields the DESIGNER authors into the template (the tailoring);
// the template keeps those values and strips every other clause's to `{}`.
//
// `block.design.article` is normally your clause's own group name (free text:
// "coordination", "logistics", …). TWO values are RESERVED and change
// agreement semantics:
//   "mandatory"    — auto-folds into EVERY template agreement (specIsMandatory)
//   "attestations" — an empty anchor at commit, content attested later
//                    (specIsProcessLog)
// Pick either by accident — say you group an attestation clause under
// "attestations" — and your clause behaves differently with no error raised.
// Registration is permanent and first-write-wins, so choose before you register.
function makeSpecSource(rawSpecsByKey: Map<string, unknown>): SpecSource {
  const views = new Map<string, ProjectionSpecView>();
  for (const [key, raw] of rawSpecsByKey) {   // key = `${clauseId}@${version}`
    const parsed = parseClauseSpec(raw);
    if (!parsed.ok) throw new Error(parsed.errors[0].message);
    views.set(key, { ...parsed.spec, hints: parseProjectionHints(raw) });
  }
  return {
    get: (clauseId, version) => {
      if (version != null) return views.get(`${clauseId}@${version}`);
      // no version → the highest loaded version of this clause
      let best: ProjectionSpecView | undefined, bestV = -1;
      for (const [k, v] of views) {
        if (!k.startsWith(`${clauseId}@`)) continue;
        const n = Number(k.slice(clauseId.length + 1));
        if (n > bestV) { bestV = n; best = v; }
      }
      return best;
    },
    list: () => [...views.values()],
  };
}
```

A spec that is not (yet) loaded returns `undefined` from `get`, and the
projection degrades exactly as the registry-reading frontend does (no defaults
injected, validation skipped for that section, field lookups fall back to
data-key presence). Consumers that need strictness gate on their cache being
warm before projecting.

**One order.** `buildOrderAgreement` takes the complete clause map
(`{ [clauseId]: fieldValues }`), injects each spec's own declared-field defaults
for omitted fields (the SPEC speaks; the code injects nothing of its own), sorts
sections deterministically, and returns the `Agreement` + its merkle-root
`agreementHash`. `assertAgreementSignable` is the single Layer-A gate every
signature routes through — buyer sign, seller counter-sign, and the checkout's
pre-wallet check all call it, so no path signs an agreement whose sections
violate their specs or whose hash mismatches its recomputed root
(`validateCommitmentAgreement` is the non-throwing form, returning
`{ ok, issues }`).

```ts
import { buildOrderAgreement, assertAgreementSignable, sectionByField } from "@figaro/sdk";

// clauses: clauseId → field values (design-time ∪ runtime fill); clauseVersions:
// clauseId → the registered version composed (template-sourced; absent entries
// fall back to the loaded spec's version).
const { agreement, agreementHash } = buildOrderAgreement(
  buyer, seller, clauses, specs, clauseVersions,
);
assertAgreementSignable(agreement, agreementHash, specs, "checkout"); // throws on any Layer-A issue

// Read sections by DECLARED FIELD, never by clause id — any registered clause
// carrying the field participates.
const commerce = sectionByField(agreement, "lineItems", specs);
```

## From Adopted Template to Signed Agreement — the ONE walk

Every consumer that turns a template into kernel orders — an agent originating a
chain (`@figaro/sdk/agent` `buildChainOffers`), a checkout realizing a bound
assembly, a designer displaying a draft — performs the same walk: order the
template agreements so parents precede children, detect the root, replace
template-local parent ids with real EIP-712 order hashes, accumulate cumulative
value, and derive each order's hash and the process id from the root.
`reconstructOrdersFromTemplate` (`dist/reconstructOrders.d.ts`) is that walk's
single home — hand-assembling sections order-by-order is no longer the recipe.

**Who fills what**: the designer selected the clauses and authored any
`design.fills` values (the tailoring); the seller filled profile/catalogue
master data at first use (`checkout.profileFills` / `checkout.catalogueFills`,
folded at checkout); the buyer fills the remaining checkout values here as
per-node `overrides` — the buyer owns every content field named in no fills
list. The SDK never fabricates a
signature — the caller signs each node's `typedData` (per node via `onOrder`).

```ts
import {
  fetchDiscoveryEvents, reconstructDiscovery,
  reconstructOrdersFromTemplate, planTemplateOrders,
} from "@figaro/sdk";
import type { AssemblyTemplate } from "@figaro/sdk";

// 1. Hydrate the adopted template: discovery → the assembly pointer → IPFS.
const graph = reconstructDiscovery(await fetchDiscoveryEvents(client, addresses, 0n));
const asm = graph.getAssemblies().find((a) => a.compositionHash === compositionHash);
const template: AssemblyTemplate = await (await fetch(gateway(asm!.contentURI))).json();

// PURE STRUCTURE for display (no parties, values, or signatures): commit-ordered
// nodes with complete version maps + local parent edges.
const planned = planTemplateOrders(template);

// 2. The full realization. `specs` present ⇒ checkout semantics (spec-default
//    projection via buildOrderAgreement, process-log clauses stay empty
//    anchors); omit it for the raw override-merge (agent-origination semantics).
//    Commits MUST be submitted in the returned order — root first — so the
//    kernel sees a consistent running cumulative total.
const orders = await reconstructOrdersFromTemplate(template, {
  buyer, currency, chainId, core: addresses.core, specs,
  // One ReconstructNodeSpec per template node: who sells it, what it pays, and
  // the per-clause checkout values (keyed by clauseId — the SDK names none).
  nodes: (node) => ({
    seller: sellerFor(node.nodeId),
    payment: paymentFor(node.nodeId),
    // currency is NOT commerce content — it is signed in the kernel commitment
    // (the `currency` param above); a pinned assembly commits it through the
    // root's figaro-denomination section (readDenominationPin resolves it).
    overrides: { "figaro-commerce": { payment: paymentFor(node.nodeId).toString(), lineItems } },
  }),
  // Per-node seam, invoked in commit order as each order is realized — sign,
  // pin the party-private agreement, share, or compose here. SHARING is
  // out-of-band by design: hand the counterparty the pinned agreement URI +
  // the signed commitment over any channel you both reach (the handoff
  // coordination channel, a link, a QR); whoever ends up holding both
  // signatures may broadcast the commit — the kernel checks signatures,
  // never the sender.
  onOrder: async (order) => {
    const buyerSig = await buyerWallet.signTypedData(order.typedData);
    // order.isRoot ⇒ processId ZERO on the signed struct (kernel derives it);
    // sub-orders carry the root's derived processId and their parents' REAL
    // order hashes. order.cumulativeValue is the running total AFTER this order.
    // Pin order.agreement (party-private evidence, referenced on-chain by hash),
    // collect the seller counter-signature, then commit (see @figaro/sdk/agent).
  },
});
```

For a single non-templated order, use `buildOrderAgreement` (above) directly and
feed its `agreementHash` into `buildCommitment` as in the `@figaro/sdk` entry
point. The empty agreement hashes to `bytes32(0)`; there is no separate "root"
object — the `agreementHash` IS the merkle root over the section leaves.

## Checkout Planning

Buyer-side checkout planning — the fill-where-composed section writers, the
sub-order seller plan, live contributor pricing, and the open rate-quantity
registry — are root exports (`dist/checkoutPlan.d.ts`). Everything here shapes
COMMITTED bytes (agreement sections the merkle root hashes) or the payment
figures the commitments sign, so a second frontend must reproduce it exactly. **No
clause is ever named**: sections are found by their DECLARED FIELDS (`lineItems`,
`parentOrderHashes`, `massGrams`, `billedMassGrams`) or their spec hints
(`catalogueFills`) through the caller's `SpecSource` — a fill whose clause isn't
composed is a no-op, so the same call serves the root and every sub-order.

```ts
import {
  fillCommerceSection, writeTopologySection, fillDerivedSections,
  fillCargoSection, fillClassSections, fillProfileSections, fillDimweightSection,
  planSubOrderSellers, resolveSubOrderPricing, profileValuesFor,
  registerRateQuantitySource, getRateQuantityResolver, topologicalOrder,
} from "@figaro/sdk";
```

- **Section fills** (by declared field): `fillCommerceSection` (settlement
  terms — `lineItems` supplied only for the root cart), `writeTopologySection`
  (the REAL parent-order hashes into `parentOrderHashes`), and the logistics
  fills `fillDerivedSections` folds together — `fillCargoSection` (mass/volume
  sum × quantity), `fillClassSections` (catalogue-authored freight-class/hazmat/…),
  `fillProfileSections` (the seller's PROFILE-authored master data — dimweight's
  divisor, a declared credential id — restricted to each spec's declared
  `block.checkout.profileFills` subset, with the template's committed terms winning),
  and the DERIVED `fillDimweightSection` (`billed = max(gross, volumetric)`,
  divisor read from the profile-folded leaf).
- **Sub-order sellers**: `planSubOrderSellers` topologically orders the non-root
  orders and resolves each one's seller from the adopting seller's counterparty
  bindings via a per-clause binding cursor — a clause shared by sibling orders
  draws distinct wallets by commit order, so the ordering must match the
  checkout's commit order (throws on a cyclic topology; `topologicalOrder` is the
  underlying pure math). `seller` is `null` when no counterparty is bound.
- **Pricing**: `resolveSubOrderPricing` prices a sub-order from its contributor's
  OWN catalogue (`billedQuantity × unitPrice = payment` always holds, so the
  committed line item replays the payment with no reference back to the mutable
  catalogue); `profileValuesFor` looks up a seller's profile-authored clause
  values for the profile fold.
- **Open rate-quantity registry**: `registerRateQuantitySource(source, resolver)`
  / `getRateQuantityResolver(source)` — a `pricingPolicy: "rate"` item resolves
  its billed quantity through this last-write-wins registry (shipped tenants:
  `checkout-quantity` = the buyer enters units; `order-geodistance` = derived from
  the order's committed geolocation endpoints). A booking-window or routed-distance
  composition registers a new tenant without touching checkout code.

Signatures and the exact fold rules live in the `dist/checkoutPlan.d.ts`
docblocks — treat them as the contract; this list is the map, not the territory.

## Seller Profile + Catalogue Documents

Two off-chain JSON documents describe a seller. Both are **Layer-A** — their
types and strict parsers are exported from the ROOT `@figaro/sdk` (next to
`RegisteredSeller` / `reconstructDiscovery`), so an integrator reading a seller
learns the shape from the SDK instead of the frontend bundle. Neither document
is bundled — each is pinned to IPFS and read at runtime.

- **Profile** (`SellerProfileMetadata`) — the stable identity envelope pinned at
  `SellerRegistry.metadataURI`. `name` is the ONLY required field; everything
  else is optional (`description`, `specialty`, `location`, `branding`, `assets`,
  `acceptedTokens`, `defaultTokenAddress`, `profileClauseValues`, `assemblyBindings`,
  `services`, and `catalogueURI` — the pointer to the catalogue). Token
  acceptance is an identity declaration, not a market position. Carries no
  role / archetype / category taxonomy — what a seller does is inferred from the
  catalogue.
  - `assemblyBindings` is an array of `AssemblyBindingRecord` — one entry per
    assembly the wallet participates in, each
    `{ bindingId, subjectAddress, assemblySlug, counterpartyBindings? }`. Each
    `counterpartyBindings` entry is `{ clauseId, addresses[] }`: the wallets the
    seller designates for a sub-order carrying that process clause (e.g. a
    courier-process clause → the courier wallets checkout fills the courier
    sub-order from; order is significant — checkout takes the first reachable, or
    surfaces the list). Without this field the cart has nowhere to read a
    sub-order counterparty's wallet from. The seller's ROLE in the assembly is
    event-derived, never declared here.
- **Catalogue** (`SellerCatalogueMetadata`) — the volatile item list pinned at
  `profile.catalogueURI`. Required: `subjectAddress`, `items[]`, `version`.
  Each item requires `id`, `name`, `price`, `available`; optional are
  `description`, `category`, `image`, physical measures (`massGrams`,
  `volumeMl`, `lengthMm`/`widthMm`/`heightMm`), rate pricing
  (`pricingPolicy: "fixed" | "rate"`, `rateUnit`, `rateQuantitySource`), and
  the catalogue-sourced `clauseValues` map. Split off the profile so an item
  edit re-pins one small JSON, not the whole identity envelope.

```ts
import {
  reconstructDiscovery,
  parseSellerProfileDocument,       // throws on malformed input
  tryParseSellerProfileDocument,    // returns null on malformed input
  parseSellerCatalogueDocument,
  projectAgentServices,             // pull ERC-8004 agent endpoints from a profile
} from "@figaro/sdk";
import type { SellerProfileMetadata, SellerCatalogueMetadata } from "@figaro/sdk";

// 1. Discovery hands you the metadataURI for each registered seller.
const graph = reconstructDiscovery(events);
const seller = graph.getSellers()[0]; // → RegisteredSeller { seller, metadataURI }

// 2. Fetch + parse the profile document (IPFS/HTTP fetch is yours to make).
const profileJson = await (await fetch(gateway(seller.metadataURI))).json();
const profile: SellerProfileMetadata = parseSellerProfileDocument(profileJson);
const { isAgent, services } = projectAgentServices(profileJson);

// 3. Follow catalogueURI to the item list.
if (profile.catalogueURI) {
  const catJson = await (await fetch(gateway(profile.catalogueURI))).json();
  const catalogue: SellerCatalogueMetadata = parseSellerCatalogueDocument(catJson);
}
```

**Publish flow (write side).** Build a document, validate it by round-tripping
it through the strict parser, pin it, then anchor the URI on-chain:

```ts
import { SELLER_REGISTRY_ABI } from "@figaro/sdk";

const doc: SellerProfileMetadata = { name: "Bob Pizza", catalogueURI: "ipfs://Qm…" };
parseSellerProfileDocument(doc);                 // throws if malformed — validate before pinning
const metadataURI = await pinJSON(doc);          // your IPFS pin → "ipfs://…"

// First registration (payable — sends the registration deposit):
//   SellerRegistry.register(metadataURI)
// Subsequent profile edits (re-pin, then point the registry at the new URI):
//   SellerRegistry.updateProfile(metadataURI)
```

**All three registries take the same reclaimable ETH deposit.** `SellerRegistry`,
`ClauseRegistry`, and `AssemblyRegistry` each require a `registrationDeposit` on
the registering call (`register` / `registerClause` / `registerAssembly`, all
`payable`) — a spam-deterrent stake, not a fee: no party can seize it, and `msg.value`
must equal it EXACTLY (there is no sweep). The amount is a deploy-time immutable;
read it from the contract's `registrationDeposit()` view rather than hardcoding a
figure. The depositor reclaims the exact amount by withdrawing (`withdraw` for a
seller, `withdrawDeposit(idHash | compositionHash)` for a clause / assembly), which
de-surfaces the artifact. Withdrawing a seller CLEARS its dedup guard so the wallet
can register again; a clause's clauseId binding and an assembly's composition binding
are permanent — never cleared — because agreements committed against them keep
resolving forever.

**Reading an assembly binding.** `AssemblyRegistry.bindings(compositionHash)` returns
the tuple `(address author, uint64 registeredAt, bool depositWithdrawn, string contentURI)`.
The existence check is `registeredAt != 0`, NOT the bool: after a normal registration
`depositWithdrawn` is `false` and stays false while the deposit is still staked (the
surfaced state) — it flips to `true` only once the author reclaims the deposit. So a
freshly registered assembly correctly reads `depositWithdrawn == false`; that false is
"deposit still held," not "registration failed."

The catalogue follows the same shape: `parseSellerCatalogueDocument(cat)` →
`pinJSON(cat)` → set the resulting URI as the profile's `catalogueURI` and
`updateProfile`. First-write-wins binding means the wallet→profile edge is
permanent; `updateProfile` swaps only the pointer.

There is no on-chain getter for a profile — `SellerRegistry` has
`register`/`updateProfile`/`withdraw` and no view returning a seller's current
`metadataURI`, by design (state is event-derived; discovery reconstructs it).
The event log is the read path: verify an update landed by re-running discovery
(`reconstructDiscovery(await fetchDiscoveryEvents(client, addresses, 0n))`).

## Design Principles

- **Minimal dependencies** — `viem` for chain I/O, `@noble/curves` + `@noble/hashes`
  for the handoff key-agreement (both audited, zero-dependency). No ethers, no
  web3.js, no framework lock-in.
- **Pure where possible** — price curves, bond math, and state reconstruction are pure functions. Chain reads are isolated and clearly marked.
- **ECDSA signers only** — the SDK builds EIP-712 typed data, and any signer that
  produces a standard secp256k1 ECDSA signature works: an EOA, a hardware wallet, or
  an MPC / threshold scheme that outputs one signature. `FigaroCore` verifies both
  commitment signatures by `ECDSA.recover` alone (`src/kernel/FigaroCore.sol:161-166`) — it
  runs no ERC-1271 check — so an ERC-1271 contract wallet (a Safe or other smart
  account) CANNOT hold a kernel party role. A contract that must transact routes
  through a funded EOA it controls (this is how the DAO treasury buys — it never
  signs a commitment itself).
- **Event-sourced state** — `Topology` reconstructs the full process/order topology from on-chain events. No subgraph dependency.
- **Live kernel event contract** — reconstruction assumes `OrderCommitted` carries the full commitment payload (`agreementHash`, `salt`, `deadline`) and that order/process closure is derived from `OrderResolved` plus `ProcessResolved`.
- **Agent-native** — the proposer generates typed actions; the HITL queue and autonomous gateway are two execution modes for the same action type.

## Test

```bash
cd sdk && npm test
```

Autonomous-origination proofs (against a live devnet — `./scripts/devup.sh` first, then
`npm run build`): `node scripts/verify-origination.devnet.mjs` (single order),
`node scripts/verify-origination-chain.devnet.mjs` (multi-order chain), and
`node scripts/verify-origination-http.devnet.mjs` (the two agents talk over a real HTTP
socket via `HttpChannel`, not the in-process channel).

## License

MIT
