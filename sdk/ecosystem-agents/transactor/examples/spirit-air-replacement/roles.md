# Roles: Spirit Air replacement

One transactor per role-bound wallet, same shape as the TradeLens example. Per-role policies reflect the operational tempo: passenger does one thing rarely, airline does many things constantly.

## Passenger

Single ticket, infrequent, bounded stakes (full ticket value at risk). Default to HITL — passengers are humans and will use the runtime UI for this. The transactor is the *autonomous fallback* for the rare passenger-as-agent case (e.g., a corporate booking agent acting on behalf of frequent travelers).

```ts
import { makeHitlPolicy } from "@figaro/transactor/policy";

export const passengerPolicy = makeHitlPolicy<ProposedAction, { processId: string }>();
```

For the corporate-booking-agent autonomous case:

```ts
const TRUSTED_AIRLINES: Set<`0x${string}`> = new Set([/* registered airline wallets */]);
const MAX_TICKET_VALUE = 2_000_000_000n; // $2K — beyond this, escalate

export const corporatePassengerPolicy = makeAutonomousPolicy<ProposedAction, { processId: string }>(
  (action) => {
    if (action.type === "commit-sub-order") {
      if (action.currentCumulativeValue > MAX_TICKET_VALUE) {
        return { execute: false, reason: "above corporate booking limit" };
      }
      // (further checks: airline registered, schedule fits travel window, etc.)
      return { execute: true };
    }
    if (action.type === "resolve-process") {
      // Passenger arrived; release bonds
      return { execute: true };
    }
    return { execute: false };
  },
);
```

## Airline

The fan-out actor. Acts as seller to passengers AND buyer at every sub-procurement. By volume, this is the busiest transactor in the assembly.

Recommended structure: a *split policy* — autonomous for routine procurement under threshold and routine attestations; HITL for resolutions and exceptional sub-procurement.

```ts
const ROUTINE_PROCUREMENT_LIMIT = 5_000_000_000n; // $5K — routine sub-services

export const airlinePolicy = makeAutonomousPolicy<ProposedAction, { processId: string }>(
  (action) => {
    if (action.type === "attest-as-seller" || action.type === "attest-as-buyer") {
      // Boarding-flow handoffs are routine; the data is operational
      return { execute: true };
    }
    if (action.type === "commit-sub-order") {
      // Sub-procurement under threshold — autonomous
      if (action.currentCumulativeValue > ROUTINE_PROCUREMENT_LIMIT) {
        return { execute: false, reason: "above routine threshold" };
      }
      // (registered-supplier check would key by sub-service type; omitted)
      return { execute: true };
    }
    // Resolutions: HITL — the airline-side resolution decides settlement
    return { execute: false, reason: "escalate to operations team" };
  },
);
```

## Sub-suppliers (gate-ops, fuel, crew, catering, maintenance)

Common shape: profitability-gated acceptance of an offered commit, or fixed-price commitment partner; routine attestations. A typical sub-supplier policy — accept the airline's offered sub-order only if it clears cost plus margin:

```ts
function estimateMyCost(action: CommitSubOrderAction): bigint {
  // Sub-supplier-specific cost model
  return 0n; // pseudo-code
}

const MIN_PROFITABILITY_BPS = 800n; // 8% margin

export const subSupplierPolicy = makeAutonomousPolicy<ProposedAction, { processId: string }>(
  (action) => {
    if (action.type === "attest-as-seller") return { execute: true };
    if (action.type === "commit-sub-order") {
      const myCost = estimateMyCost(action);
      const offered = action.currentCumulativeValue;
      const marginBps = ((offered - myCost) * 10000n) / myCost;
      return marginBps >= MIN_PROFITABILITY_BPS
        ? { execute: true }
        : { execute: false, reason: "below margin threshold" };
    }
    return { execute: false };
  },
);
```

Per-sub-supplier specializations:

- **Fuel**: cost is a function of jet-fuel index + airport delivery margin. Fast-moving market; price each offered commit against the fuel index in real time.
- **Gate-ops**: cost is a function of slot allocation + contracted rate. Low-frequency; commit per flight.
- **Crew agency**: cost is a function of crew availability + dispatch + certification overhead. Medium-frequency.
- **Catering**: cost is a function of meal count + airline-specified menu. Per-flight bilateral.
- **Maintenance**: cost is a function of inspection scope. Pre-flight only; frequent-but-routine.

The key parameter is the margin threshold — set it according to your operational reserve. Below threshold = decline; bond stays unposted; the airline must find another supplier or accept the slip risk.

## Cross-cutting: weakest-link pressure

Each sub-supplier's seller-bond is at risk if their slip causes the parent to miss tolerance. The threshold rule above is *not* the operational rule — once committed, the supplier is bonded regardless of subsequent margin pressure. The threshold gates *whether to commit*, not *whether to perform*. Performance is enforced by the bond, period.

This is the design intent: routine sub-procurement is autonomous, but performance once committed is unconditional. The bond is the difference between "missed our schedule, sorry" and "missed our schedule, here's the proportional damages, automatically."

## Identity

Each transactor's wallet should register an `SellerRegistry` entry per `docs/v5/AI_AGENT_COORDINATION.md`. Capabilities and service descriptors per role:

- **Airline**: `capabilities: ["scheduled-passenger-air"]`, `services.mcp` (for inbound bookings via MCP).
- **Sub-suppliers**: `capabilities` describing the sub-service (`"fuel-jet-a"`, `"gate-ops-domestic"`, etc.) plus jurisdiction(s).

ERC-8004 service descriptors are how agents *find* each other; bonded commitments are how they *trust* each other. This is the same pattern as the TradeLens example — repeats because it's the protocol's universal coordination shape.
