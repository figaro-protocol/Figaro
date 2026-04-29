# Roles: TradeLens replacement

One factotum per role-bound wallet. The `factotum` reference at `agents/factotum/` is the runner; this file shows the per-role *policy* — the `shouldExecute` rule for autonomous mode, or the HITL prompts the operator sees.

The proposer infers role from process state: same factotum binary, different role per process membership. Wallet identity is the only configuration distinction.

## Shipper

The shipment originator. Rare actions (one process per shipment), high stakes (whole-cargo value). HITL by default.

```ts
import { makeHitlPolicy } from "@figaro/factotum/policy";

export const shipperPolicy = makeHitlPolicy<ProposedAction, { processId: string }>();
```

Operator reviews each proposed action — `commit-sub-order` to the forwarder, `resolve-process` at the end of the journey. No autonomous defaults; the cargo value justifies human approval.

## Forwarder

Pass-through actor. Receives cargo from shipper, hands off to carrier. Volume-driven business; threshold-and-whitelist autonomous.

```ts
import { makeAutonomousPolicy } from "@figaro/factotum/policy";

const FORWARDER_MAX_BOND = 50_000_000_000n; // $50K in 6-decimal stablecoin
const TRUSTED_CARRIERS: Set<`0x${string}`> = new Set([
  "0xMaerskWallet...",
  "0xMSC...",
  // ...
]);

export const forwarderPolicy = makeAutonomousPolicy<ProposedAction, { processId: string }>(
  (action) => {
    if (action.type === "commit-sub-order") {
      if (action.currentCumulativeValue > FORWARDER_MAX_BOND) {
        return { execute: false, reason: "value exceeds forwarder bond limit; escalate" };
      }
      return { execute: true };
    }
    if (action.type === "resolve-process") {
      // Resolve only when downstream attestations are complete
      return { execute: true };
    }
    return { execute: false, reason: "unhandled action type" };
  },
);
```

Demonstrates the threshold + whitelist pattern for medium-trust autonomous operation.

## Ocean carrier

The most complex factotum. Acts as seller-of-record to forwarder AND as buyer of terminal-services, fueling, etc. at sub-processes. Most actions are routine attestations (vessel-position every 4 hours, handoff-v1 at each port); a few are high-value commitments.

Recommended structure: a *split policy* — autonomous for attestations and routine sub-procurement under threshold, HITL for resolutions and exceptional sub-procurement.

```ts
const ATTESTATION_TYPES: ProposedAction["type"][] = ["attest-as-seller", "attest-as-buyer"];
const ROUTINE_PROCUREMENT_LIMIT = 10_000_000_000n; // $10K

export const carrierPolicy = makeAutonomousPolicy<ProposedAction, { processId: string }>(
  (action) => {
    if (ATTESTATION_TYPES.includes(action.type)) return { execute: true };
    if (action.type === "commit-sub-order" && action.currentCumulativeValue < ROUTINE_PROCUREMENT_LIMIT) {
      return { execute: true };
    }
    return { execute: false, reason: "escalate: large commitment or resolution" };
  },
);
```

Pair with a HITL fallback factotum for the rejected actions.

## Port-of-loading / port-of-discharge

Terminal operators. Bidders on Dutch auctions surfaced by the carrier; attesters for handoffs and seal events.

```ts
const MIN_PROFITABILITY_BPS = 500n; // 5% margin minimum

function estimatePortCost(action: CommitSubOrderAction): bigint {
  // Operator-specific cost model: dock fee + crane time + container count + ...
  return 0n; // pseudo-code
}

export const portPolicy = makeAutonomousPolicy<ProposedAction, { processId: string }>(
  (action) => {
    if (action.type === "attest-as-seller") return { execute: true };
    if (action.type === "commit-sub-order") {
      const offered = action.currentCumulativeValue;
      const myCost = estimatePortCost(action);
      const marginBps = ((offered - myCost) * 10000n) / myCost;
      return marginBps >= MIN_PROFITABILITY_BPS
        ? { execute: true }
        : { execute: false, reason: "below margin threshold" };
    }
    return { execute: false };
  },
);
```

Ports compete on Dutch auctions. Whoever's `myCost` is lowest at the current price clears.

## Customs broker, trucking, consignee

Smaller variants of the same patterns:

- **Customs broker**: HITL for the commit (consignee-side) — these are infrequent and clearance failures are expensive. Attestations autonomous (jurisdiction-v1 reflects what the customs authority told the broker; the broker just records it).
- **Trucking**: Same shape as port — Dutch auction claim with margin threshold. Last-mile is competitive.
- **Consignee**: HITL — final receipt and resolution authority sits with the buyer; this is the protocol's buyer-dominance invariant in operational form.

## Cross-cutting: the security floor

Every autonomous policy in this assembly inherits the factotum's default refuse-all behavior unless `shouldExecute` is explicitly written. A fresh fork running `POLICY=autonomous` with no rule does nothing on chain — that's the design. See `agents/factotum/src/policy.ts`.

## Identity and discoverability

Each factotum's wallet should register an `OperatorRegistry` entry with `services` keys per `docs/v5/AI_AGENT_COORDINATION.md` (ERC-8004 / `did:web` interop):

- Carriers should declare `services.mcp` and `services.a2a` for inbound bookings.
- Ports should declare `capabilities: ["container-handling", "rail-connection", ...]`.
- Customs brokers should declare jurisdiction(s) under `capabilities`.

Discoverability is metadata, not protocol — the bonding mechanism is the trust layer. ERC-8004 service descriptors are how agents *find* each other; bonded commitments are how they *trust* each other.
