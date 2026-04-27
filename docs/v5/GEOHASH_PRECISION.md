# Geohash Precision — Design Decision

This document records the geohash precision choices used in Figaro Local Commerce and
the rationale behind them.

---

## Current Default: 6 Characters

The `encodeGeohash()` function in `lib/eats/manifest.ts` defaults to 6-character
precision. This is used for both pickup (restaurant) and drop-off (buyer)
geohashes stored in the manifest and used for driver job filtering.

### 6-Character Cell Size

| Chars | Cell Width | Cell Height | Use Case |
|-------|-----------|-------------|----------|
| 4 | ~39.1 km | ~19.5 km | Metro-area browsing |
| 5 | ~4.9 km | ~4.9 km | District-level filtering |
| **6** | **~1.22 km** | **~0.61 km** | **Neighborhood routing (current default)** |
| 7 | ~153 m | ~153 m | Block-level precision |
| 8 | ~38.2 m | ~19.1 m | Building-level precision |

### Why 6 Characters

1. **Routing-useful**: ~1.2 km × 0.6 km is enough for a driver to plan
   approach routes and estimate travel time. Two restaurants in the same
   6-char cell are genuinely nearby.

2. **Privacy-acceptable**: A 6-char geohash covers an area containing
   hundreds to thousands of addresses in urban areas. It reveals the
   neighborhood but not the specific building, entrance, or unit.

3. **Filter-efficient**: Driver job filtering uses 4-char prefix matching
   for coarse area search. A 6-char stored value supports both coarse
   (prefix match) and fine (exact match) queries without re-encoding.

4. **Consistent with manifest**: The v3 manifest format stores two 6-char
   geohashes concatenated (pickup + drop-off = 12 chars = 12 ASCII bytes),
   fitting cleanly in a `bytes32` on-chain field.

### Upgrade Path to 7 Characters

The original privacy/UX plan, now archived at
`docs/archive/plans/PLAN_PRIVACY_AND_UX.md`, proposed 7-char precision
(~76m × 38m) as the default. This would provide block-level precision,
useful for denser routing but closer to revealing specific buildings.

To migrate:
1. Update `encodeGeohash()` default parameter from 6 to 7
2. Update manifest format to accommodate 7 + 7 = 14 chars (still fits bytes32)
3. Update `DeliveryDetailsForm.tsx` help text
4. Existing 6-char geohashes remain valid (7-char is a superset)

The migration is backward-compatible — longer geohashes can always be
truncated for coarser matching.

---

## Public vs. Private Location Data

Geohash data is **intentionally public** (see PUBLIC_GRAPH_MODEL.md).

| Data | Storage | Visibility | Rationale |
|------|---------|------------|-----------|
| Pickup geohash (6-char) | On-chain manifest | Public | Restaurant location is public business info |
| Drop-off geohash (6-char) | On-chain manifest | Public | Zone-level demand signal for driver routing |
| Exact delivery address | Encrypted in manifest | Private (buyer + driver only) | Per-order ECDH encryption via XMTP |
| Apartment/unit number | Encrypted in manifest | Private (buyer + driver only) | Per-order ECDH encryption via XMTP |
| Delivery notes | Encrypted in manifest | Private (buyer + driver only) | Per-order ECDH encryption via XMTP |

### What 6-Character Geohash Reveals

- The neighborhood (~1.2 km × 0.6 km area)
- Approximate demand zone for analytics
- Enough for travel time estimation

### What 6-Character Geohash Does NOT Reveal

- The specific building or address
- The apartment/unit/floor
- The recipient's identity
- The exact door or entrance

---

## Dapp-Level Override

The `encodeGeohash()` function accepts a `precision` parameter, allowing
any dapp to customize:

```typescript
encodeGeohash(lat, lon, 7)  // Block-level (delivery dapps in dense cities)
encodeGeohash(lat, lon, 5)  // District-level (wholesale/B2B logistics)
encodeGeohash(lat, lon, 4)  // Metro-level (cross-city freight)
```

The precision choice is a dapp-level policy decision, not a protocol
constraint. Different archetypes may use different precision levels based
on their privacy/utility trade-off.

---

## Driver-Side Filtering

The driver page uses 4-character prefix matching for coarse area filtering:

1. Driver enters or auto-detects their zone (4-char geohash prefix)
2. Available deliveries are filtered by matching the pickup geohash prefix
3. This shows all jobs within ~39 km × 19 km — enough for a metro area

After coarse filtering, drivers see exact 6-char pickup geohashes to plan
approach routes before claiming an auction.
