# E2E Scenarios

Each scenario is its node **topology** + the **clauses** composed on each order,
plus the two specs that author it (Phase 1) and consume it (Phase 4).
`figaro-commerce-v1` and `figaro-topology-v1` are on every order (defaults) and
are not listed. `figaro-modalities-v1` is the **Modalities** clause (the buyer's
request); its `delivery.coordination` field carries the courier-resolution
mechanism. The clause model itself lives in CLAUDE.md + the clause-model memory,
not here.

---

### `kiosk-sale` — 1 node, untracked

*Models:* a street vendor / kiosk / newsstand — collect the item and go. No
lifecycle, no proximity proof. The barest sale.
*Catalogues:* the kiosk (1).
*Specs:* `scenario-kiosk-sale` · `kiosk-sale-runtime`.
```
order[0]  buyer ↔ seller  parents: []
  figaro-modalities-v1  { modality: pickup }
```

### `direct-sale` — 1 node, tracked + proximity-verified

*Models:* a café/restaurant counter — a tracked prep-and-handover lifecycle and a
proximity-verified handoff (prep-started → ready → handed-off, buyer present).
*Catalogues:* the seller (1).
*Specs:* `scenario-direct-sale` · `direct-sale-runtime`.
```
order[0]  buyer ↔ seller  parents: []
  figaro-modalities-v1        { modality: consume-onsite }
  figaro-merchant-process-v1
  figaro-handoff-v1           { handoff: face-to-face }
  figaro-proximity-policy-v1  { bands: [zone-wifi] }
```

### `local-commerce` — 2 nodes, seller-assigned delivery

*Models:* a merchant sells for delivery and arranges its own courier — a restaurant
dispatching its own rider. Two co-equal bonded relationships the buyer commits to.
*Catalogues:* merchant (goods) + courier (delivery) — 2.
*Specs:* `scenario-local-commerce` · `local-commerce-runtime`.
```
order[0]  buyer ↔ merchant  parents: []
  figaro-modalities-v1        { modality: delivery }
  figaro-coordination-v1      { coordination: seller-assigned }
  figaro-merchant-process-v1
order[1]  buyer ↔ courier   parents: [order[0]]   (value-topology edge; co-equal, not owned)
  figaro-courier-process-v1
  figaro-handoff-v1           { handoff: face-to-face }
  figaro-proximity-policy-v1  { bands: [zone-wifi] }
```

### `local-commerce-buyer-assigned` — 2 nodes, buyer-assigned delivery

*Models:* same delivery sale, but the buyer chooses the courier at checkout. Only
delta from `local-commerce` is the `delivery.coordination` value.
*Catalogues:* merchant + courier (2).
*Specs:* `scenario-local-commerce-buyer-assigned` · `local-commerce-buyer-assigned-runtime`.
```
order[0]  buyer ↔ merchant  parents: []
  figaro-modalities-v1        { modality: delivery }
  figaro-coordination-v1      { coordination: buyer-assigned }
  figaro-merchant-process-v1
order[1]  buyer ↔ courier   parents: [order[0]]
  figaro-courier-process-v1
  figaro-handoff-v1           { handoff: face-to-face }
  figaro-proximity-policy-v1  { bands: [zone-wifi] }
```

### `local-commerce-dutch` — 2 nodes, dutch-auction delivery

*Models:* same delivery sale, but the courier is the winner of a descending-price
auction; the courier order's clearing price comes from the auction, not a fixed rate.
*Catalogues:* merchant + courier (2).
*Specs:* `scenario-local-commerce-dutch` · `local-commerce-dutch-runtime`.
```
order[0]  buyer ↔ merchant  parents: []
  figaro-modalities-v1        { modality: delivery }
  figaro-coordination-v1      { coordination: dutch-auction }
  figaro-merchant-process-v1
order[1]  buyer ↔ courier   parents: [order[0]]
  figaro-courier-process-v1
  figaro-handoff-v1           { handoff: face-to-face }
  figaro-proximity-policy-v1  { bands: [zone-wifi] }
```

### `local-commerce-offset` — 2 nodes, seller-assigned delivery + GHG offset

*Models:* a seller-assigned delivery sale where merchant and courier report and
offset the delivery's emissions — a GHG disclosure on both legs.
*Catalogues:* merchant + courier (2).
*Specs:* `scenario-local-commerce-offset` · `local-commerce-offset-runtime`.
```
order[0]  buyer ↔ merchant  parents: []
  figaro-modalities-v1        { modality: delivery }
  figaro-coordination-v1      { coordination: seller-assigned }
  figaro-merchant-process-v1
  figaro-ghg-iso-14064-v1
order[1]  buyer ↔ courier   parents: [order[0]]
  figaro-courier-process-v1
  figaro-handoff-v1           { handoff: face-to-face }
  figaro-proximity-policy-v1  { bands: [zone-wifi] }
  figaro-ghg-iso-14064-v1
```

### `local-commerce-dispute` — 2 nodes, seller-assigned delivery + Kleros recourse

*Models:* same seller-assigned delivery sale, with an arbitration clause so a
dispute can be escalated to an external forum (Layer-3 recourse).
*Catalogues:* merchant + courier (2).
*Specs:* `scenario-local-commerce-dispute` · `local-commerce-dispute-runtime`.
```
order[0]  buyer ↔ merchant  parents: []
  figaro-modalities-v1          { modality: delivery }
  figaro-coordination-v1      { coordination: seller-assigned }
  figaro-merchant-process-v1
  figaro-arbitration-kleros-v1
order[1]  buyer ↔ courier   parents: [order[0]]
  figaro-courier-process-v1
  figaro-handoff-v1             { handoff: face-to-face }
  figaro-proximity-policy-v1    { bands: [zone-wifi] }
```

### `local-food-basket` — 4 nodes, aggregated multi-producer

*Models:* a local-food hub takes a basket order and coordinates independent
producers — a farm (produce) and a bakery (bread) — plus a courier who delivers the
assembled basket. Each producer is a distinct bonded relationship the buyer commits
to (kernel star-shape). The designer draws all four nodes.
*Catalogues:* hub + farm + bakery + courier — 4 (the test seeds all four).
*Specs:* (to author).
```
order[0]  buyer ↔ hub      parents: []
  figaro-modalities-v1        { modality: delivery }
  figaro-coordination-v1      { coordination: seller-assigned }
  figaro-merchant-process-v1
order[1]  buyer ↔ farm     parents: [order[0]]   (bare supply order — collected)
order[2]  buyer ↔ bakery   parents: [order[0]]   (bare supply order — collected)
order[3]  buyer ↔ courier  parents: [order[0]]
  figaro-courier-process-v1
  figaro-handoff-v1           { handoff: face-to-face }
  figaro-proximity-policy-v1  { bands: [zone-wifi] }
```
