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

---

## The four phases

| # | Phase | Actor | What happens | Where |
|---|-------|-------|--------------|-------|
| 1 | **Design** | designer | Build the assembly template: topology + per-order design-time `clauses`. No hashes. | `/builders/designer` |
| 2 | **Adoption** | seller | Bind the template into profile/catalogue; set counterparty bindings, currency/token, pricing. | seller profile / catalogue |
| 3 | **Checkout** | buyer | Supply address/quantity; price resolves; the commitment + agreement merkle fingerprint forms here. | `/s/[seller]` |
| 4 | **Runtime** | all parties | Process unfurls: attestations, handoffs, resolution/settlement. | `/orders/[processId]`, `/inbox` |

---

## How clauses compose: full availability, defaults, activation

The drawer lists **every** clause on `ClauseRegistry` because the designer can use
any of them — there is no "design-time subset." The template records the
designer's composition; `buildOrderAgreement` then **surfaces all the clauses** —
chosen, default, and activated — into the agreement at checkout, and they carry
into runtime ([orderAgreement.ts:154-256](../../lib/core/orderAgreement.ts)).

Three behaviors shape what ends up in the agreement beyond the bare selections:

- **Defaults — always present.** `figaro-commerce-v1` (currency + payment + line items) and `figaro-topology-v1` (the order's DAG parents) are on every order regardless of selection.
- **Activation — selecting one clause surfaces another, written into the template at design time.** `figaro-proximity-policy-v1` activates `figaro-proximity-proof-v1`; any `figaro-ghg-*` disclosure activates `figaro-ghg-measurement-v1`; choosing the **delivery** modality on `figaro-fulfilment-v2` activates `figaro-merchant-process-v1` on that order. The activated clause belongs in the template — `buildOrderAgreement` must remain a pure projection, never re-derive a clause at checkout.
- **Order creation — a clause adds a new order.** Choosing **delivery** also makes the canvas add a courier sub-order, which carries `figaro-courier-process-v1` in its template.

Both delivery activations are materialized into the template at design time
([DesignerCanvas.tsx](../../app/(app)/builders/designer/_components/DesignerCanvas.tsx),
`handleDeliverySelected`): selecting delivery writes `figaro-merchant-process-v1`
into the root order's `clausesByOrderId` and `figaro-courier-process-v1` into the
courier order's; deselecting reverses both. `buildOrderAgreement` is a pure
projection — it includes a clause iff the template carries it, never re-derives
one at checkout (fixed 2026-06-02; previously merchant-process was re-derived via
`|| deliveryOffered` and courier-process reached only the synthetic agreement).

Everything else is a clause the designer selects directly — `figaro-fulfilment-v2`
(modalities / coordinations / handoffPoints), `figaro-proximity-policy-v1` (bands),
a `figaro-ghg-*` standard (scope), `figaro-arbitration-kleros-v1` (court / min
jurors), consent. Some of their field values — geo origin/destination/mass,
quantity, price — are completed by the **buyer at checkout**, not the designer.

---

## The scenarios (template form)

Each scenario carries a **Models** line (the real-world situation, so selections
can be sanity-checked) and a **Catalogues** line (every node's seller prices its
own node from its own catalogue — `assemblySubOrderPlan.ts` resolves each node to
a `CounterpartyBinding` by clauseId and reads that seller's catalogue; a multi-node
test must seed *each* listed catalogue or pricing fails). Then the topology and
per-order design-time `clauses` (the exact shape the designer publishes; defaults
like commerce/topology are surfaced at checkout and not shown here).

### `direct-sale` — 1 node, consume-onsite, tracked + verified

*Models:* a café/restaurant counter — on-premise consumption, a **tracked** prep-and-handover lifecycle, and a **proximity-verified** handoff (prep-started → ready → handed-off, buyer confirmed present; arrival + acceptance are the bilateral commit, not lifecycle events). The tracked counterpart of `kiosk-sale`.
*Catalogues:* the café (1).
```
order[0]  buyer ↔ seller  parents: []
  figaro-fulfilment-v2     { modalities: [consume-onsite], handoffPoints: [face-to-face] }
  figaro-proximity-policy-v1 { bands: [zone-wifi] }
  figaro-merchant-process-v1
```

### `kiosk-sale` — 1 node, pickup, no process, no proof

*Models:* a street vendor / kiosk / newsstand — you collect the item and go. No tracked lifecycle, no proximity proof. The bare, **no-merchant-process** pickup; the only design-time selection is the modality. (Contrast `local-commerce-pickup`, which is a *tracked* pickup.)
*Catalogues:* the kiosk (1).
```
order[0]  buyer ↔ seller  parents: []
  figaro-fulfilment-v2     { modalities: [pickup] }
```

### `local-commerce` — 2 nodes, seller-assigned delivery

*Models:* a merchant sells for delivery and **arranges its own courier** — e.g. a restaurant dispatching its own rider. The merchant picks the courier directly (seller-assigned, no auction, no buyer choice).
*Catalogues:* merchant (the goods) + courier (the delivery, priced from the courier's own catalogue) — 2.
```
order[0]  buyer ↔ merchant  parents: []
  figaro-fulfilment-v2     { modalities: [delivery], coordinations: [seller-assigned], handoffPoints: [face-to-face] }
order[1]  courier sub-order parents: [order[0]]
  figaro-courier-process-v1
  figaro-proximity-policy-v1 { bands: [zone-wifi] }
```

### `local-commerce-buyer-assigned` — 2 nodes, buyer-assigned delivery

*Models:* same delivery sale, but the **buyer chooses the courier** — ordering goods and picking your own delivery service. Identical to `local-commerce` except the coordination value.
*Catalogues:* merchant + courier (2).
```
order[0]  parents: []        figaro-fulfilment-v2 { modalities: [delivery], coordinations: [buyer-assigned], handoffPoints: [face-to-face] }
order[1]  parents: [order[0]] figaro-courier-process-v1 · figaro-proximity-policy-v1 { bands: [zone-wifi] }
```

### `local-commerce-dutch` — 2 nodes, dutch-auction delivery

*Models:* same delivery sale, but the courier is chosen by a **descending-price auction** — the delivery job is posted to a pool of riders and claimed as the price rises. The courier order is deferred to the auction and joins the process when a rider claims it.
*Catalogues:* merchant + courier (the courier's clearing price comes from the auction, not a fixed catalogue rate) — 2.
```
order[0]  parents: []        figaro-fulfilment-v2 { modalities: [delivery], coordinations: [dutch-auction], handoffPoints: [face-to-face] }
order[1]  parents: [order[0]] figaro-courier-process-v1 · figaro-proximity-policy-v1 { bands: [zone-wifi] }
```

### `local-commerce-offset` — 2 nodes, delivery + GHG offset

*Models:* a seller-assigned delivery sale where merchant and courier **report and offset the delivery's emissions** — a GHG disclosure on both legs. (`figaro-ghg-measurement-v1` is activated by the disclosure and surfaced at checkout, not stored in the template.)
*Catalogues:* merchant + courier (2).
```
order[0]  parents: []        figaro-fulfilment-v2 { modalities: [delivery], coordinations: [seller-assigned], handoffPoints: [face-to-face] } · figaro-ghg-iso-14064-v1
order[1]  parents: [order[0]] figaro-courier-process-v1 · figaro-proximity-policy-v1 { bands: [zone-wifi] } · figaro-ghg-iso-14064-v1
```

### `local-commerce-pickup` — 1 node, pickup (no courier)

*Models:* the buyer **collects in person** from the merchant — no courier — with a proximity-verified handoff. Order-ahead pickup at a shop. One node (pickup ≠ delivery → no courier order), with the proximity stack + merchant-process on the root.
*Catalogues:* the merchant (1).
```
order[0]  buyer ↔ merchant  parents: []
  figaro-fulfilment-v2     { modalities: [pickup], handoffPoints: [face-to-face] }
  figaro-proximity-policy-v1 { bands: [zone-wifi] }
  figaro-merchant-process-v1
```

### `local-food-basket` — 4 nodes, aggregated multi-producer

*Models:* a local-food hub takes a basket order and coordinates independent producers — a **farm** (produce) and a **bakery** (bread) — plus a **courier** who delivers the assembled basket. Each producer is a distinct bonded relationship the buyer commits to (kernel star-shape: buyer == rootBuyer on every order), priced from that producer's own catalogue. This is the realistic multi-contributor / multi-catalogue case — it replaces the old leftover-clause `kit-assembly`. The hub's delivery activates merchant-process on the hub and auto-adds the courier; farm and bakery are added as supply sub-orders, each pickup-collected.
*Catalogues:* hub (coordination/basket) + farm (produce) + bakery (bread) + courier (delivery) — **4; the test seeds all four**.
```
order[0]  buyer ↔ hub      parents: []         figaro-fulfilment-v2 { modalities: [delivery], coordinations: [seller-assigned], handoffPoints: [face-to-face] }
order[1]  buyer ↔ farm     parents: [order[0]] figaro-fulfilment-v2 { modalities: [pickup] }
order[2]  buyer ↔ bakery   parents: [order[0]] figaro-fulfilment-v2 { modalities: [pickup] }
order[3]  courier sub-order parents: [order[0]] figaro-courier-process-v1 · figaro-proximity-policy-v1 { bands: [zone-wifi] }
```

---

## The 4-phase walk (one walk; per-scenario deltas are above)

The walk is identical for every scenario — only the topology + design-time
`clauses` (above) and the runtime roles differ.

1. **Design** — designer opens `/builders/designer`, draws the nodes, and in the
   Registry-tab drawer checks each clause and selects its design-time fields. The
   published template is the per-order `clauses` shown above — nothing else.
2. **Adoption** — a seller binds the template into their profile/catalogue and
   sets bindings (seller-assigned courier roster, buyer-assigned picker, or
   dutch-auction), currency/token, and catalogue pricing. In a **multi-node**
   assembly each node's seller binds independently and prices *its* node from
   *its own* catalogue (`assemblySubOrderPlan` resolves the binding by clauseId)
   — so the **Catalogues** line on each scenario above is the set a runtime test
   must seed.
3. **Checkout** — the buyer commits the root order (and any deferred sub-orders
   join the process); the projection adds the commit-time clauses; the agreement
   merkle fingerprint forms from the completed leaf values.
4. **Runtime** — every party drives its own role: merchant runs the
   merchant-process lifecycle, courier delivers with proximity-proof handoffs,
   GHG contributors file measurements, buyer resolves the process. A scenario is
   covered only when each composed clause is exercised through its driving role.

---

## Scenario ↔ specs

| Scenario | Phase 1 (authoring) spec | Phase 4 (runtime) spec |
|---|---|---|
| `direct-sale` | `scenario-direct-sale` | `onsite-purchase` |
| `kiosk-sale` | (to author) | (to author) |
| `local-commerce` | (to re-author) | `local-commerce-scenario` |
| `local-commerce-buyer-assigned` | (to re-author) | `buyer-assigned-checkout` |
| `local-commerce-dutch` | (to re-author) | `dutch-auction-checkout` |
| `local-commerce-offset` | (to re-author) | `local-commerce-offset-scenario` |
| `local-commerce-pickup` | (to re-author) | `local-commerce-pickup-runtime` |
| `local-food-basket` | (to author) | (to author) |
