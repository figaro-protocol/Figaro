# Clauses: Spirit Air replacement

Most existing clauses cover the primitives. One new clause is the airline-specific binding: scheduled-departure.

## Existing clauses (no agent work needed)

| Clause | Use in this assembly |
|---|---|
| `figaro-commerce-v1` | Ticket commitment (passenger ↔ airline); sub-procurement commitments (airline ↔ gate-ops / fuel / crew / catering / maintenance) |
| `figaro-courier-process-v1` | Boarding-flow stages (check-in → security → gate → boarding → cabin closed → pushback → takeoff → cruise → landing → arrival → deplane) |
| `figaro-geolocation` | Departure airport / arrival airport (ICAO or geohash) |
| `figaro-cargo` | Cargo mass + volume |
| `figaro-jurisdiction-v1` | International flights — passport / visa attestation by border authority |
| `figaro-handoff-v1` | Each operational handoff — boarding, cabin closed, etc. |

The boarding flow is well-covered by `courier-process-v1` per stage. Use the existing clause; do not author a new one.

## New clause: `figaro-scheduled-departure-v1`

The single missing primitive: a binding between the airline's seller commitment and a specific scheduled departure time. Without this, the ticket is just "fly me from A to B sometime"; with it, the ticket is "fly me from A to B with departure at 14:30 local on Friday." The departure-time binding is what makes cascading-delay enforcement work.

This satisfies the decision rule: cross-party shared interpretation (passenger, airline, downstream connections), settlement-relevant (the resolution path checks against the bound ETD/ETA), stable over the duration of the ticket (cannot be silently mutated by the airline).

**Prompt:**

```
Use the figaro-clause-author agent to draft figaro-scheduled-departure-v1.

Purpose: bind a commerce-v1 ticket commitment to a specific scheduled
departure / arrival pair, so the resolution path can verify whether the
seller (airline) delivered against schedule.

Fields (Layer A spec, closed clause):
- flightDesignator: string (IATA, e.g. "NK1234")
- scheduledDeparture: iso-datetime (with explicit timezone)
- scheduledArrival: iso-datetime
- originAirport: string (ICAO 4-char, e.g. "KORD")
- destinationAirport: string
- aircraftType: string (optional, IATA aircraft code; omitted if airline reserves
  substitution right)
- toleranceSeconds: integer (the agreed slip below which no penalty applies;
  e.g. 900 = 15 min)

Family: scheduled-service (new family; later extensions could cover scheduled
ground transport, scheduled deliveries with tight windows).

Constraints to enforce:
- toleranceSeconds <= 7200 (no clauses with >2-hour tolerance — defeats the
  point of scheduled binding).
- scheduledArrival > scheduledDeparture.

Verify before declaring done:
- No kernel changes.
- Validator-contract pattern: 1:1 clauseId↔contract, ABI-encoded content,
  first-write-wins.
- Forge tests cover well-formed input, every field-level revert (including
  the tolerance and ordering constraints), gas bound.
- Clause-lockstep coverage matrix shows all required surfaces present.
- Kernel-reviewer reports zero kernel-tier touches.
```

What you'd see the clause-author do:

1. Read `CLAUSES.md` and the kernel-discipline skill.
2. Argue out loud whether this is genuinely a "shared reference" need vs per-instance payload (yes — the schedule needs to be canonical across passenger, airline, downstream connections).
3. Push back on the `aircraftType` field: it might be too operational for protocol scope — let it stay as optional metadata on the commerce-v1 commit instead. The agent should flag and ask. (Author it anyway if you confirm; the agent is rule-bound but not paternalistic about scope you've decided.)
4. Produce the seven artifacts (Layer A spec, TS encoder, validator contract, Foundry tests, registration entry, listing-page row, optionally Layer B integrator doc).
5. Run forge / halmos / vitest / type-check.
6. Print a verification report and return control. No auto-commit.

## What the clause-author would refuse

- **"Make scheduled-departure-v1 mutable so the airline can reschedule."** Append-only identity rule. A reschedule is a new commitment with new clauseId or new instance. The agent would refuse and explain.
- **"Add a force-majeure escape clause that lets the airline avoid bond loss in weather events."** This is a kernel-level no-escape-hatches violation in disguise. The right answer is composition: write a separate insurance-process where the passenger can opt to buy weather insurance against the airline; don't bake the escape into the commitment.
- **"Add governance over which delays count toward bond loss."** Reintroduces discretionary power. Refusal cites the kernel's no-DAO-for-disputes anti-pattern.

These refusals are why you'd use the agent rather than write the clause yourself — the rules are easy to forget under product pressure.
