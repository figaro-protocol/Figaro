# @figaro/core

TypeScript SDK for the Figaro Protocol — self-enforcing agreements between strangers.

Event parsing, state reconstruction, EIP-712 commitment building, bond math,
agent coordination, and protocol extension utilities. Single dependency: `viem`.

## Install

```bash
npm install @figaro/core
```

## Four Entry Points

### `@figaro/core` — Protocol Primitives

Event parsing, state reconstruction, EIP-712 commitments, bond calculations.

```ts
import {
  fetchCoreEvents,
  reconstruct,
  calculateBonds,
  buildCommitment,
  buildDomain,
  ProcessGraph,
} from "@figaro/core";

// Fetch all FigaroCore events from a block range
const events = await fetchCoreEvents(client, addresses, 0n);

// Reconstruct full process/order state from events
const graph = new ProcessGraph();
graph.applyEvents(events);

const process = graph.getProcess(processId);
const active = graph.getActiveProcesses();

// Calculate bond requirements
const bonds = calculateBonds(cumulativeValue, payment);
// → { buyerBond, sellerBond, buyerTotal, sellerTotal }

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

### `@figaro/core/agent` — Agent Coordination

Context sync, action proposer, human-in-the-loop queue, autonomous execution.

```ts
import { FigaroContext, proposeActions, ActionQueue } from "@figaro/core/agent";
import { commit, executeAction } from "@figaro/core/agent";

// Sync on-chain state into a live context
const ctx = new FigaroContext(client, addresses);
await ctx.sync();

// Propose actions for a process
const actions = proposeActions(ctx.getProcessBriefing(processId), myAddress);

// Human-in-the-loop: queue actions for approval with optional review context
type ApprovalContext = {
  bindingId?: string;
  roleKind?: string;
  runtimeSummary?: string;
};

const queue = new ActionQueue<ApprovalContext>();
queue.enqueueAll(actions.map((action) => ({
  action,
  approvalContext: {
    bindingId: "binding:bobs-pizza-palace:local-anvil",
    roleKind: "merchant",
    runtimeSummary: "Bob's Pizza Palace · Figaro Local Commerce · Restaurant",
  },
})));
// ... user reviews and approves ...
const approved = queue.approve(1);
console.log(approved.approvalContext?.runtimeSummary);

// Autonomous: submit transactions directly after collecting both EIP-712 signatures
const result = await commit(walletClient, coreAddress, commitment, buyerSig, sellerSig);
// Or dispatch from a proposed action:
const result = await executeAction(walletClient, addresses, approvedAction);
```

### `@figaro/core/extensions` — Protocol Extensions

Dutch auction price curves, attestation/GHG utilities, geo/handoff helpers,
did:web identity resolution.

```ts
import {
  computeCurrentPrice,
  evaluateClaim,
  computeClauseId,
  buildProcessDisclosureSummary,
  haversineDistance,
  geohashesMatch,
  resolveDidWeb,
  didDocumentMatchesAddress,
  buildSellerDidDocument,
} from "@figaro/core/extensions";

// Dutch auction: compute current price on a descending curve
const price = computeCurrentPrice(maxPrice, floorBps, duration, startTime, now);

// Evaluate whether an agent should claim now
const eval = evaluateClaim(maxPrice, floorBps, duration, startTime, now, false);
// → { currentPrice, floorPrice, savingsVsMax, discountPct, secondsToFloor, claimable }

// GHG disclosure: derive clause ID, build process summary
// Standard identity is the clauseId — pick a sister clause (figaro-ghg-protocol-v1,
// figaro-ghg-iso-14064-v1, figaro-ghg-pas-2050-v1, figaro-ghg-en-16258-v1, figaro-ghg-custom-v1).
const clauseId = computeClauseId("figaro-ghg-iso-14064-v1");
const summary = buildProcessDisclosureSummary(attestations, processId, clauseId);
// → { attestationCount, commitmentCount, inventoryCount, totalActualGrams }

// Indexer hygiene: filter raw event logs by source contract before processing.
// Required when consuming events that FigaroBatchVerifier re-emits with the
// same topic hash as the direct-path contract (Attestation, ClauseRegistered,
// MechanismClauseSet, OperatorRegistered, etc.). Without this, batch and
// direct emissions get conflated.
const allLogs = await client.getLogs({ event: EV_ATTESTATION, fromBlock, toBlock });
const direct  = filterLogsBySource(allLogs, attestationCoordinatorAddress);
const batched = filterLogsBySource(allLogs, batchVerifierAddress);
// Or accept both:
const both    = filterLogsBySource(allLogs, [attestationCoordinatorAddress, batchVerifierAddress]);

// Geo: check delivery proximity
const close = geohashesMatch("dr5ru7", "dr5ru8", 5); // true (5-char prefix match)
const km = haversineDistance(40.71, -74.00, 34.05, -118.24); // ~3944 km

// did:web: resolve an operator's DID Document and verify on-chain address
const { document, error } = await resolveDidWeb("did:web:operator.example.com");
if (document) {
  const match = didDocumentMatchesAddress(document, "0xOperator...", 1);
  // → true if the DID Document contains a verification method for this address
}
```

### `@figaro/core/clauses` — Clause-Spec Format + Content Validation

Single source of truth that all three Figaro validation layers parse
identically: client (this module), SP1 prover (Rust mirror, pending),
on-chain `IClauseValidator` contracts.

```ts
import {
  parseClauseSpec,
  validateContent,
  encodeHandoffContent,
  encodeCommerceContent,
  // ... encoders for the 9 runtime-attestable local-commerce clauses
  // (topology is manifest-only and has no ABI encoder)
} from "@figaro/core/clauses";

// 1. Parse a clause spec (typically fetched from IPFS)
const parsed = parseClauseSpec(specJson);
if (!parsed.ok) throw new Error(parsed.errors[0].message);

// 2. Validate content against the spec (closed clauses: unknown fields rejected)
const result = validateContent(
  { mode: "face-to-face" },
  parsed.spec,
);

// 3. Encode TS content for the on-chain attestation call
const bytes = encodeHandoffContent("face-to-face");
// Pass `bytes` as the `content` arg to AttestationCoordinator.attestAs{Seller,Buyer}.
// The on-chain validator re-decodes it and reverts if invalid.
```

Format is a closed subset of JSON Schema. Field types: `string` (with
format `bytes32-hex` / `address-hex` / `bytes-hex` / `iso-datetime`),
`integer`, `bigint` (decimal-string for JSON safety), `boolean`, `enum`,
`array`, `object`. Per-stage overrides via `spec.stages[stage]`.

## Design Principles

- **Single dependency** — only `viem`. No ethers, no web3.js, no framework lock-in.
- **Pure where possible** — price curves, bond math, and state reconstruction are pure functions. Chain reads are isolated and clearly marked.
- **Signing-agnostic** — builds EIP-712 typed data; you sign however you want (EOA, Safe, MPC, hardware wallet).
- **Event-sourced state** — `ProcessGraph` reconstructs the full process/order graph from on-chain events. No subgraph dependency.
- **Live kernel event contract** — reconstruction assumes `OrderCommitted` carries the full commitment payload (`agreementHash`, `salt`, `deadline`) and that order/process closure is derived from `OrderResolved` plus `ProcessResolved`.
- **Agent-native** — the proposer generates typed actions; the HITL queue and autonomous gateway are two execution modes for the same action type.

## Test

```bash
cd sdk && npm test
```

## License

MIT
