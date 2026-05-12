# Assembly: Spirit Air replacement

The DAG of bonded commitments. Like the TradeLens example, **this is the human work** — no `figaro-assembly-author` agent today. See the gap.

## DAG

The defining feature of this assembly is the airline as a *fan-out seller-of-record*: one parent process (ticket), N child processes (sub-procurements). Cascading delays aggregate up the tree because each sub-process's slip propagates to the parent's bond.

```
                 passenger (root buyer)
                         │
                         │  commerce-v1 + scheduled-departure-v1
                         │  + courier-process-v1 (boarding flow)
                         ▼
                     airline (seller-of-record)
                ┌────┬─────┬────┬─────┬─────────┐
                │    │     │    │     │         │
                ▼    ▼     ▼    ▼     ▼         ▼
           gate-ops fuel  crew catering maint  ground-handling

           (each is a sub-process under the airline's parent process,
            with its own bilateral bonded commitment)
```

## Per-edge mechanism

| Edge | Mechanism | Notes |
|---|---|---|
| passenger → airline | bilateral commit (commerce-v1) + scheduled-departure-v1 clause | Fixed price, schedule-bound |
| airline → gate-ops | bilateral commit | Per-flight gate access fee |
| airline → fuel | Dutch auction (fuel suppliers compete) OR bilateral with the airport's incumbent | Choose based on market structure at the airport |
| airline → crew agency | bilateral commit | Per-flight crew dispatch |
| airline → catering | bilateral commit | Per-flight catering load |
| airline → maintenance | bilateral commit | Pre-flight inspection / sign-off |
| gate-ops → airline (handoff) | handoff-v1 attestation | "boarding complete" |
| crew → airline (handoff) | handoff-v1 attestation | "crew on board" |
| airline → passenger (delivery) | fulfilment-v1 attestation at deplane | "passenger arrived" |

## Per-node clauses

**Passenger ticket (parent process):**
- commerce-v1 commitment (price, currency, agreementHash)
- scheduled-departure-v1 (ETD, ETA, flight designator, tolerance window)
- courier-process-v1: required attestations through the boarding-to-deplane flow
- Optional jurisdiction-v1 for international flights

**Airline sub-procurements (one per sub-seller):**
- commerce-v1 commitment per sub-process
- handoff-v1 at each operational stage
- Plus sub-supplier-specific schemas (e.g., crew-certification-v1 if you choose to author it)

## Cascading-delay mechanics

Per Paper A's progressive collateralization: when fuel slips by 30 minutes, the fuel sub-process's seller-bond is at risk. The airline's seller-bond to the passenger is also at risk because the parent commitment's scheduled-departure-v1 will be violated. *Both* bonds reflect the slip, proportionally.

The settlement rule:

1. Passenger arrives within tolerance → all bonds release, payouts settle in the standard pattern.
2. Passenger arrives outside tolerance → buyer dominance: the passenger holds the resolution key. `resolveProcess` produces a non-trivial settlement: airline forfeits proportional bond to passenger; airline's sub-procurement commitments unwind with proportional forfeiture from whichever sub-seller caused the slip; uncaused sub-sellers are made whole.

The kernel doesn't compute "who caused the slip" — that's an off-chain dispute the bonded evidence (handoff-v1 timestamps, attestations) can adjudicate. The kernel just enforces atomic resolution: the whole tree settles or none of it does.

## What this fixes vs. status quo

In a non-Figaro airline, when fuel slips, the airline absorbs the schedule slip and offers passengers a voucher. Passengers can't easily recover proportional damages; the fuel supplier owes a contractual penalty that typically doesn't track passenger impact. The losses are diffuse and small relative to the airline's accounting; they don't drive operational improvement.

In this assembly, fuel-supplier slip directly costs the fuel supplier proportional bond. Airline slip directly costs the airline proportional bond. Passenger captures damages at point of resolution, automatically, without litigation. Operational improvement is incentivized at the unit causing the slip, not blanket-distributed.

## The gap

Same as the TradeLens example: there is no `figaro-assembly-author` agent. The DAG above is human work on the designer canvas at `/builders/designer/new`. A future agent would propose this composition given a target scenario ("airline ticketing assembly"); today, you draw it.

The interesting agent work in this scenario specifically would be at the *parameter* level: bond budgets vary widely between domestic and international flights, between budget and premium carriers, between turn-around-time-tight regional ops and slack long-haul. An assembly-author agent could produce the parameterized DAG from a scenario brief.
