# @figaro/sdk

TypeScript SDK for the Figaro Protocol — self-enforcing agreements between strangers.

Event parsing, state reconstruction, EIP-712 commitment building, bond math,
agent coordination, and protocol composition utilities. Single dependency: `viem`.

## Install

```bash
npm install @figaro/sdk
```

## Four Entry Points

### `@figaro/sdk` — Protocol Primitives

Event parsing, state reconstruction, EIP-712 commitments, bond calculations,
chain gas ceilings.

```ts
import {
  fetchCoreEvents,
  reconstruct,
  calculateBonds,
  buildCommitment,
  buildDomain,
  Topology,
  maxOrdersResolvablePerProcess,
} from "@figaro/sdk";

// Fetch all FigaroCore events from a block range
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
import { buildSectionInclusionProof, getSectionDataBytes, computeClauseKey } from "@figaro/sdk";
import { attestAsSeller } from "@figaro/sdk/agent";
import { parseClauseSpec, encodeContentFromSpec } from "@figaro/sdk/clauses";

const section = agreement.sections[0]; // e.g. { clause: "figaro-provenance", version, data }

// 1. Inclusion proof — buildSectionInclusionProof takes the RAW section name.
const { proof } = buildSectionInclusionProof(agreement, section.clause);
// 2. Section bytes — the canonical JSON that formed the leaf.
const sectionData = getSectionDataBytes(section);
// 3. Content — ABI-encoded per the clause spec (fetched from ClauseRegistry → IPFS).
const parsed = parseClauseSpec(specJson);
if (!parsed.ok) throw new Error(parsed.errors[0].message);
const content = encodeContentFromSpec(parsed.spec, section.data);
// 4. Attest. `clauseId` is the bytes32 HASH — NOT the raw name from step 1.
const clauseId = computeClauseKey(section.clause, section.version);
await attestAsSeller(
  walletClient, addresses.attestationCoordinator!,
  roleCommitment, targetCommitment, clauseId, /* stage */ 0, sectionData, proof, content,
);

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

> On-chain clause-content validation (the per-clause validators) and the SP1
> prover mirror are **DEFERRED** — removed 2026-06-25, rebuilt before launch. Until
> they return, the merkle binding is the integrity floor; a rebuilt validator must
> preserve permissionless attestation of never-seen clauses. Canonical teardown
> state: `docs/CONTRACTS.md` § "Deferred vs permanent".

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
// Pass `bytes` as the `content` arg to AttestationCoordinator.attestAs{Seller,Buyer}.
// `decodeContentFromSpec(parsed.spec, bytes)` is the exact inverse (readers/audit).
```

Format is a closed subset of JSON Schema. Field types: `string` (with
format `bytes32-hex` / `address-hex` / `bytes-hex` / `iso-datetime`),
`integer`, `bigint` (decimal-string for JSON safety), `boolean`, `enum`,
`array`, `object`. Per-stage overrides via `spec.stages[stage]`.

## From Adopted Template to Signed Agreement

An adopted assembly template ships its clause maps mostly empty — an empty `{}`
means the designer *selected* the clause but set no fields, deferring them
downstream (the seller at first use, the buyer at checkout — `assembly.d.ts`).
This is the fold every checkout crosses: turn a hydrated template into the
filled, hashed `Agreement` that `buildCommitment` signs. No clause spec is
baked into the SDK — each clause's fillable fields come from its own spec,
fetched from `ClauseRegistry` → IPFS at runtime; the shapes below (`Agreement`,
`AgreementSection`, `TemplateAgreement`) are the ones the SDK does own, verified
against `dist/agreement.d.ts` + `dist/assembly.d.ts`.

```ts
import {
  fetchDiscoveryEvents, reconstructDiscovery,
  computeAgreementHash, buildCommitment, buildDomain, ZERO_PROCESS_ID,
} from "@figaro/sdk";
import type { Agreement, AssemblyTemplate } from "@figaro/sdk";
import { parseClauseSpec, validateContent } from "@figaro/sdk/clauses";

// 1. Hydrate the adopted template: discovery → the assembly pointer → IPFS.
const graph = reconstructDiscovery(await fetchDiscoveryEvents(client, addresses, 0n));
const asm = graph.getAssemblies().find((a) => a.compositionHash === compositionHash);
const template: AssemblyTemplate = await (await fetch(gateway(asm!.contentURI))).json();

// One TemplateAgreement per future kernel order; `order-0` is the root order.
// `agreement.clauses` is clauseId → the design-time fields (often {}).
const order0 = template.agreements.find((a) => a.id === "order-0")!;

// 2. The runtime fill — the checkout/first-use values, keyed by clause. These
//    field NAMES belong to each clause's registry spec, never to the SDK; shown
//    here for the clauses this assembly composed. Prices flow from the seller's
//    catalogue item (see the next section); bigints are decimal strings.
const runtimeFill: Record<string, Record<string, unknown>> = {
  "figaro-topology": { parentOrderHashes: [] },   // root order: no parents
  "figaro-commerce": { currency, payment: payment.toString(), lineItems },
  // ...one entry per composed clause that needs a runtime value
};

// 3. For each composed clause: fetch its spec, merge design-time + runtime data,
//    validate against the spec (Layer-A well-formedness), collect the section.
const sections = [];
for (const [clauseName, designFields] of Object.entries(order0.clauses)) {
  const reg = graph.getClauses().find((c) => c.clauseId === clauseName);
  if (!reg) throw new Error(`clause ${clauseName} not on registry`);
  const parsed = parseClauseSpec(await (await fetch(gateway(reg.contentURI))).json());
  if (!parsed.ok) throw new Error(parsed.errors[0].message);

  const data = { ...designFields, ...(runtimeFill[clauseName] ?? {}) };
  const check = validateContent(data, parsed.spec);
  if (!check.ok) throw new Error(check.errors[0].message);

  // The composed VERSION comes from the registry entry (AgreementSection.version).
  sections.push({ clause: clauseName, version: reg.version, data });
}

// 4. Build the Agreement document (exact shape — agreement.d.ts). `version` is
//    the literal "a1"; sections are sorted into the merkle tree internally.
const agreement: Agreement = { version: "a1", buyer, seller, sections };

// 5. The on-chain agreementHash IS the merkle root over the section leaves —
//    there is no separate "root" object; an empty agreement hashes to bytes32(0).
const agreementHash = computeAgreementHash(agreement);

// 6. Pin the canonical Agreement as party-private evidence (your IPFS pin). It
//    is referenced by hash on-chain, never uploaded to the kernel; runtime
//    attestations later prove a section was committed via
//    buildSectionInclusionProof (see @figaro/sdk/agent above).
const agreementURI = await pinJSON(agreement);

// 7. Feed the hash into the root commitment; sign both sides + commit as in the
//    @figaro/sdk entry point.
const domain = buildDomain(chainId, addresses.core);
const { commitment, typedData } = buildCommitment({
  processId: ZERO_PROCESS_ID,
  buyer, seller, currency, payment,
  expectedCumulativeValue: payment, // root order: equals payment
  agreementHash,
}, domain);
```

## Seller Profile + Catalogue Documents

Two off-chain JSON documents describe a seller. Both are **Layer-A** — their
types and strict parsers are exported from the ROOT `@figaro/sdk` (next to
`RegisteredSeller` / `reconstructDiscovery`), so an integrator reading a seller
learns the shape from the SDK instead of the frontend bundle. Neither document
is bundled — each is pinned to IPFS and read at runtime.

- **Profile** (`SellerProfileMetadata`) — the stable identity envelope pinned at
  `SellerRegistry.metadataURI`. `name` is the ONLY required field; everything
  else is optional (`description`, `specialty`, `location`, `branding`, `assets`,
  `acceptedTokens`, `defaultTokenAddress`, `dimWeightDivisor`, `assemblyBindings`,
  `services`, and `catalogueURI` — the pointer to the catalogue). Token
  acceptance is an identity declaration, not a market position. Carries no
  role / archetype / category taxonomy — what a seller does is inferred from the
  catalogue.
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

The catalogue follows the same shape: `parseSellerCatalogueDocument(cat)` →
`pinJSON(cat)` → set the resulting URI as the profile's `catalogueURI` and
`updateProfile`. First-write-wins binding means the wallet→profile edge is
permanent; `updateProfile` swaps only the pointer.

## Design Principles

- **Single dependency** — only `viem`. No ethers, no web3.js, no framework lock-in.
- **Pure where possible** — price curves, bond math, and state reconstruction are pure functions. Chain reads are isolated and clearly marked.
- **Signing-agnostic** — builds EIP-712 typed data; you sign however you want (EOA, Safe, MPC, hardware wallet).
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
