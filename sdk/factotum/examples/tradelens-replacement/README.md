# TradeLens replacement

Replace the failed IBM/Maersk shipping consortium with a permissionless, ownerless container-shipping assembly built on Figaro.

## What TradeLens was

TradeLens (2018–2023) was a blockchain platform for global container shipping co-developed by IBM and Maersk. Goal: a shared, tamper-proof record of every container's journey — bills of lading, customs filings, port handoffs, vessel positions — accessible to all parties in a shipment.

By 2022, only one major carrier other than Maersk had joined (CMA CGM). MSC, Hapag-Lloyd, ONE, and Evergreen stayed out. In November 2022, IBM and Maersk announced the shutdown; production ended Q1 2023.

## What went wrong

Three failure modes, each structural:

1. **Centralized governance.** IBM and Maersk controlled the platform. Other carriers refused to join: signing on meant ratifying a competitor's gatekeeping over an industry resource. The "neutral platform" framing didn't survive contact with consortium dynamics.
2. **No network effects without all majors.** Shippers want one ledger covering 90%+ of their volume; without MSC and Hapag-Lloyd, the data was incomplete; without complete data, shippers wouldn't pay; without revenue, carriers had no reason to join. Reflexive collapse.
3. **High integration cost with no settlement guarantee.** The platform was an information ledger, not a coordination protocol. Joining cost integration time. Leaving cost nothing. No bond, no skin in the game.

## What Figaro fixes structurally

Figaro is *ownerless*: no IBM, no Maersk, no foundation. The kernel has no admin function (per `CLAUDE.md`'s six invariants — "no escape hatches"). Joining is permissionless: any wallet can hold any role. Public clauses are content-addressable specs anyone can integrate against without an API key.

The replacement isn't a "shared ledger" framing — it's a *bonded coordination protocol*. Each leg of a shipment is a bilateral commitment with asymmetric bonds. Cumulative upstream bonding scales the bilateral primitive across the multi-party process DAG (Paper A). Cooperation is the dominant strategy at every leg because cheating costs more than cooperating.

The clauses largely already exist. The assembly DAG (this scenario's main artifact) is what makes it a shipping protocol rather than a generic Figaro deployment. See `assembly.md`.

## What you'd build

- **Clauses to author**: roughly 1–2 new clauses (see `clauses.md`). Most existing clauses (`geo-v1`, `handoff-v1`, `jurisdiction-v1`, `commerce-v1`, GHG family) cover the primitives.
- **Assembly DAG**: 6–8 process nodes from origin to consignee, currently human work on the designer canvas. See `assembly.md`.
- **Factotums**: one per role-bound wallet — shipper, forwarder, carrier, ports (origin + destination), customs broker, last-mile trucking, consignee. See `roles.md`.

## Provenance

The structural fix here is *not novel* — it's the application of the existing protocol to an existing failure mode. The interesting work is what the agents handle versus what they don't. See `sdk/factotum/examples/README.md` for the overall gap statement.
