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

Clause-agnostic attestation filtering and geo math.

```ts
import { computeClauseKey } from "@figaro/sdk";
import {
  filterByClause,
  haversineDistance,
  geohashesMatch,
} from "@figaro/sdk/derive";

// Attestations: derive the on-chain clause key (name, version), then filter
// events for it. The SDK knows no specific clause — the stage/contentRef
// meaning is clause-spec data read at the edge, never baked in here.
const clauseId = computeClauseKey("figaro-ghg", 1);
const forClause = filterByClause(attestations, clauseId);

// Geo: check delivery proximity
const close = geohashesMatch("dr5ru7", "dr5ru8", 5); // true (5-char prefix match)
const km = haversineDistance(40.71, -74.00, 34.05, -118.24); // ~3944 km
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
