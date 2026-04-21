# @figaro/core

TypeScript SDK for the Figaro Protocol — self-enforcing agreements between strangers.

Event parsing, state reconstruction, EIP-712 commitment building, bond math,
agent coordination, and protocol extension utilities. Single dependency: `viem`.

## Install

```bash
npm install @figaro/core
```

## Three Entry Points

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
    roleKind: "restaurant",
    runtimeSummary: "Bob's Pizza Palace · Figaro Eats · Restaurant",
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
  computeSchemaId,
  buildProcessDisclosureSummary,
  haversineDistance,
  geohashesMatch,
  resolveDidWeb,
  didDocumentMatchesAddress,
  buildOperatorDidDocument,
} from "@figaro/core/extensions";

// Dutch auction: compute current price on a descending curve
const price = computeCurrentPrice(maxPrice, floorBps, duration, startTime, now);

// Evaluate whether an agent should claim now
const eval = evaluateClaim(maxPrice, floorBps, duration, startTime, now, false);
// → { currentPrice, floorPrice, savingsVsMax, discountPct, secondsToFloor, claimable }

// GHG disclosure: derive schema ID, build process summary
const schemaId = computeSchemaId("figaro-ghg-disclosure-v1");
const summary = buildProcessDisclosureSummary(attestations, processId, schemaId);
// → { attestationCount, commitmentCount, inventoryCount, totalActualGrams }

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
