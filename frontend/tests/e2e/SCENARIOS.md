# E2E Scenarios — the assembly-template model, creation → runtime

One document. Every scenario expressed **only** in the template-driven model we
are using and testing: per-order design-time `clauses` (no hashes, no agreements
map), walked through the four lifecycle phases from assembly creation to runtime
use.

**Source of truth — the agreement drawer, never a scenario.** The Registry-tab
drawer (`AgreementDrawer.tsx`) reads every clause registered on `ClauseRegistry`
live (`useAllRegisteredClauses`) and each clause's design-time fields from its
spec (`getClauseSpec`). That drawer defines what any template can contain. A
**scenario is one set of selections made in that drawer** over a topology drawn
on the canvas. `direct-sale`, `local-commerce`, and the rest are *implementations*
of the drawer — not the authority for it.

> **Model note (2026-06-03 — see memory `feedback_fulfilment_retired_modality_derived`).**
> This doc was rewritten when `figaro-fulfilment-v2` was **retired**. There is no
> fulfilment clause and no "delivery" checkbox. The two ⚠️ OPEN questions below are
> genuine design decisions not yet settled — they are flagged, not fabricated.

---

## The four phases

| # | Phase | Actor | What happens | Where |
|---|-------|-------|--------------|-------|
| 1 | **Design** | designer | Build the assembly template: topology + per-order design-time `clauses`. No hashes. | `/builders/designer` |
| 2 | **Adoption** | seller | Bind the template into profile/catalogue; set the courier-resolution mechanism (roster / picker / auction), currency/token, pricing. | seller profile / catalogue |
| 3 | **Checkout** | buyer | Supply address/quantity; price resolves; the commitment + agreement merkle fingerprint forms here. | `/s/[seller]` |
| 4 | **Runtime** | all parties | Process unfurls: attestations, handoffs, resolution/settlement. | `/orders/[processId]`, `/inbox` |

---

## How clauses compose: meaning lives in clauses + topology, never a flat field

The drawer lists **every** clause on `ClauseRegistry`; the designer composes any of
them onto the nodes it **draws** (grievance #3 — nothing auto-adds a node).
`buildOrderAgreement` is a pure projection: an order's agreement carries a clause
iff the template carries it, never re-derived at checkout.

**Fulfilment is DERIVED, not a clause.** There is no `figaro-fulfilment-v2`, no
`modalities` / `coordinations` / `handoffPoints` fields, and no delivery checkbox.
The "modality" is read from the graph:

- **delivery** ⇒ a second, **co-equal** buyer↔courier order carrying
  `figaro-courier-process-v1` (+ `figaro-proximity-policy-v1`). The courier order's
  existence + clauses ARE the delivery. The designer **draws** that order — it is
  not spawned by a side-effect.
- **single node** ⇒ on-site / pickup, distinguished by which clauses are present
  (`merchant-process` + `proximity-policy` ⇒ tracked; bare commerce ⇒ untracked).

**Coordination lives in the process clauses**, not a fulfilment field:
`figaro-merchant-process-v1` on the merchant order (prep → ready → handed-off),
`figaro-courier-process-v1` on the courier order (pickup → in-transit → delivered).

**Nodes are co-equal** (kernel star-shape: buyer == rootBuyer on every order). The
courier order is not "owned" by the merchant; both are the buyer's bonds. The DAG
parent edge is value-topology (cumulative-value accumulation), not dominance.

**Coordination variants are separate assemblies**, distinguished at **adoption /
checkout** by the courier-resolution mechanism — NOT by a stored clause field:
- `local-commerce` — **seller-assigned**: the merchant designates its courier via
  its `counterpartyBindings` roster (`figaro-courier-process-v1` → addresses).
- `local-commerce-buyer-assigned` — **buyer-assigned**: the buyer picks the courier
  at checkout.
- `local-commerce-dutch` — **dutch-auction**: the courier is the winner of a
  descending-price auction (the `DutchAuction` mechanism).
These three carry the **same clause content**; they differ only by slug + the
resolution mechanism.

**Activation (a clause surfaces another, written into the template at design time):**
`figaro-proximity-policy-v1` activates `figaro-proximity-proof-v1`; any
`figaro-ghg-*` disclosure activates `figaro-ghg-measurement-v1`. (There is no
delivery activation — that machinery was removed.)

**Clauses are a nestable hierarchy: article → clause → sub-clause.** Articles =
`block.drawerArticle` in the clause JSON (surfaced by the existing grouping
component). Sub-clauses are nested in the JSON and rendered recursively by the
drawer (never hardcoded): the proximity **bands** (`zone-wifi` / `nearby-ble` /
`contact-nfc`) nest under `figaro-proximity-policy-v1`; the process clauses have no
sub-clauses.

Some field values — geo origin/destination/mass, quantity, price — are completed by
the **buyer at checkout**, not the designer.

---

## The scenarios (template form)

Each scenario carries a **Models** line (the real-world situation) and a
**Catalogues** line (every node's seller prices its own node from its own catalogue
— `assemblySubOrderPlan.ts` resolves each node to a `CounterpartyBinding` by
clauseId and reads that seller's catalogue; a multi-node test must seed *each*
listed catalogue). Then the topology + per-order design-time `clauses` (defaults —
`figaro-commerce-v1` currency/payment/line-items and `figaro-topology-v1` DAG
parents — are on every order and not shown).

### `kiosk-sale` — 1 node, bare (untracked)

*Models:* a street vendor / kiosk / newsstand — you hand over and go. No lifecycle,
no proximity proof. The barest sale; derived modality = pickup, untracked.
*Catalogues:* the kiosk (1).
```
order[0]  buyer ↔ seller  parents: []
  (no design-time clauses — commerce + topology defaults only)
```

### `direct-sale` — 1 node, tracked + proximity-verified

*Models:* a café/restaurant counter — a **tracked** prep-and-handover lifecycle and
a **proximity-verified** handoff (prep-started → ready → handed-off, buyer present;
arrival + acceptance are the bilateral commit, not lifecycle events). Derived
modality = on-site/pickup, tracked.
*Catalogues:* the seller (1).
```
order[0]  buyer ↔ seller  parents: []
  figaro-merchant-process-v1
  figaro-proximity-policy-v1 { bands: [zone-wifi] }
```

> ⚠️ **OPEN #1 — does `local-commerce-pickup` collapse into `direct-sale`?** Under
> derived modality the two have an **identical** clause shape (single node,
> `merchant-process` + `proximity-policy`). The old on-site-vs-pickup distinction
> was a `fulfilment` modality that no longer exists. Decide: (a) they are one
> scenario; (b) they stay separate assemblies (same clauses, different slug/name)
> for discovery, with modality derived partly from assembly identity; (c) some
> distinguishing clause remains. Until decided, `local-commerce-pickup` is omitted
> below as a duplicate of `direct-sale`.

### `local-commerce` — 2 nodes, seller-assigned delivery

*Models:* a merchant sells for delivery and **arranges its own courier** — a
restaurant dispatching its own rider (seller-assigned: the merchant designates the
courier). Two co-equal bonded relationships the buyer commits to.
*Catalogues:* merchant (goods) + courier (delivery, from the courier's catalogue) — 2.
```
order[0]  buyer ↔ merchant  parents: []
  figaro-merchant-process-v1
order[1]  buyer ↔ courier   parents: [order[0]]   (value-topology edge; co-equal, not owned)
  figaro-courier-process-v1
  figaro-proximity-policy-v1 { bands: [zone-wifi] }
```

### `local-commerce-buyer-assigned` — 2 nodes, buyer-assigned delivery

*Models:* same delivery sale, but the **buyer chooses the courier** at checkout.
Same clauses as `local-commerce`; the only delta is the resolution mechanism.
*Catalogues:* merchant + courier (2).
```
order[0]  buyer ↔ merchant  parents: []          figaro-merchant-process-v1
order[1]  buyer ↔ courier   parents: [order[0]]  figaro-courier-process-v1 · figaro-proximity-policy-v1 { bands: [zone-wifi] }
```

### `local-commerce-dutch` — 2 nodes, dutch-auction delivery

*Models:* same delivery sale, but the courier is the winner of a **descending-price
auction**; the courier order's clearing price comes from the auction, not a fixed
catalogue rate. Same clauses as `local-commerce`.
*Catalogues:* merchant + courier (2).
```
order[0]  buyer ↔ merchant  parents: []          figaro-merchant-process-v1
order[1]  buyer ↔ courier   parents: [order[0]]  figaro-courier-process-v1 · figaro-proximity-policy-v1 { bands: [zone-wifi] }
```

### `local-commerce-offset` — 2 nodes, seller-assigned delivery + GHG offset

*Models:* a seller-assigned delivery sale where merchant and courier **report and
offset the delivery's emissions** — a GHG disclosure on both legs
(`figaro-ghg-measurement-v1` is activated by the disclosure, surfaced at checkout).
*Catalogues:* merchant + courier (2).
```
order[0]  buyer ↔ merchant  parents: []          figaro-merchant-process-v1 · figaro-ghg-iso-14064-v1
order[1]  buyer ↔ courier   parents: [order[0]]  figaro-courier-process-v1 · figaro-proximity-policy-v1 { bands: [zone-wifi] } · figaro-ghg-iso-14064-v1
```

### `local-food-basket` — 4 nodes, aggregated multi-producer

*Models:* a local-food hub takes a basket order and coordinates independent
producers — a **farm** (produce) and a **bakery** (bread) — plus a **courier** who
delivers the assembled basket. Each producer is a distinct bonded relationship the
buyer commits to (kernel star-shape). The realistic multi-contributor /
multi-catalogue case; it replaces the old leftover-clause `kit-assembly`. The
designer **draws** all four nodes.
*Catalogues:* hub + farm + bakery + courier — **4; the test seeds all four**.
```
order[0]  buyer ↔ hub      parents: []          figaro-merchant-process-v1
order[1]  buyer ↔ farm     parents: [order[0]]  (bare supply order — collected)
order[2]  buyer ↔ bakery   parents: [order[0]]  (bare supply order — collected)
order[3]  buyer ↔ courier  parents: [order[0]]  figaro-courier-process-v1 · figaro-proximity-policy-v1 { bands: [zone-wifi] }
```

> ⚠️ **OPEN #2 — do the farm/bakery supply orders carry `merchant-process`?** Old
> model marked them `fulfilment { pickup }`; with fulfilment gone, a producer order
> is bare unless the scenario wants the producer's prep lifecycle tracked. Decide
> per the real-world need (probably bare for a simple producer, `merchant-process`
> if the hub tracks each producer's handoff).

---

## The 4-phase walk (one walk; per-scenario deltas are above)

The walk is identical for every scenario — only the topology + design-time
`clauses` (above) and the runtime roles differ.

1. **Design** — designer opens `/builders/designer`, draws the nodes, and in the
   Registry-tab drawer checks each clause and selects its design-time fields
   (including any nested sub-clauses). The published template is the per-order
   `clauses` shown above — nothing else.
2. **Adoption** — a seller binds the template into their profile/catalogue and sets
   the courier-resolution mechanism (seller-assigned roster, buyer-assigned picker,
   or dutch-auction), currency/token, and catalogue pricing. In a **multi-node**
   assembly each node's seller binds independently and prices *its* node from *its
   own* catalogue (`assemblySubOrderPlan` resolves the binding by clauseId) — so the
   **Catalogues** line on each scenario is the set a runtime test must seed.
3. **Checkout** — the buyer commits the orders; the projection adds the commit-time
   clauses; the agreement merkle fingerprint forms from the completed leaf values.
4. **Runtime** — every party drives its own role: merchant runs the merchant-process
   lifecycle, courier delivers with proximity-proof handoffs, GHG contributors file
   measurements, buyer resolves the process. A scenario is covered only when each
   composed clause is exercised through its driving role.

---

## Scenario ↔ specs

All runtime specs below predate the fulfilment retirement and read the dead
`figaro-fulfilment-v2` — they are REWRITE targets (memory
`feedback_fulfilment_retired_modality_derived`), not refactors.

| Scenario | Phase 1 (authoring) spec | Phase 4 (runtime) spec |
|---|---|---|
| `kiosk-sale` | `scenario-kiosk-sale` | `kiosk-sale-runtime` |
| `direct-sale` | `scenario-direct-sale` | `direct-sale-runtime` |
| `local-commerce` | `scenario-local-commerce` | `local-commerce-runtime` |
| `local-commerce-buyer-assigned` | `scenario-local-commerce-buyer-assigned` | `local-commerce-buyer-assigned-runtime` |
| `local-commerce-dutch` | `scenario-local-commerce-dutch` | `local-commerce-dutch-runtime` |
| `local-commerce-offset` | `scenario-local-commerce-offset` | `local-commerce-offset-runtime` |
| `local-food-basket` | (to author) | (to author) |

`direct-sale-runtime` is the mainnet-compliant direct-sale runtime against the
roster-onboarded Aurora Café (anvil[6]). (Its legacy predecessor `onsite-purchase`,
which ran against the deleted `scripts/seed-devnet.mjs`, was removed.)
