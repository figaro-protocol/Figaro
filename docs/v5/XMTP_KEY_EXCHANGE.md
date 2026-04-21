# XMTP Key Exchange Architecture

This document describes the per-order encryption and key exchange system
used to protect private delivery details in Figaro Eats.

---

## Problem

A delivery order contains both public and private data:

| Data | Public? | Rationale |
|------|---------|-----------|
| Pickup geohash | Yes | Driver routing, demand signaling |
| Drop-off geohash | Yes | Zone-level demand signal |
| Order items / amount | Yes | On-chain settlement transparency |
| Exact delivery address | **No** | Recipient privacy |
| Apartment / unit / floor | **No** | Recipient privacy |
| Delivery notes | **No** | Recipient privacy |

The private fields must be readable by the buyer and the assigned driver,
but not by any other party.

---

## Previous Architecture (Master Key — Eliminated)

The original design derived a single master key per wallet:

1. Buyer signs a fixed message → `keccak256(signature)` → AES key
2. All deliveries encrypted with the same key
3. Key stored in `localStorage`

**Problems:**
- Wallet compromise → attacker signs the same message → decrypts ALL
  historical deliveries
- No key rotation or expiry
- Single point of failure: one key = entire delivery history

This was replaced in Phase 2.

---

## Current Architecture (Per-Order Ephemeral Keys)

### Key Generation (Checkout)

At order creation, the buyer's browser generates a fresh secp256k1 keypair
per order using `eciesjs`:

```
generateOrderKeypair() → { privateKeyHex, publicKeyHex }
```

- The public key is embedded in the v3 manifest: `epk:PUBKEY`
- The private key is stored locally in `deliveryArtifacts` (per-order record)

### Manifest Format (v3)

```
v3|pickupGeohash|dropoffGeohash|cosClass|totalMass|totalVolume|epk:PUBKEY|enc:ADDRESS|enc:NOTES
```

Fields 1–6 are plaintext (public coordination data).
Fields 7–9 carry the ephemeral public key and encrypted private data.

### Encryption

Private fields (address, notes) are encrypted with a per-order random
AES-256-GCM key. The AES key is generated at checkout and stored alongside
the ephemeral keypair in the buyer's `deliveryArtifacts`.

### Key Exchange (ECDH — Preferred)

The driver is unknown at order creation time, so ECDH cannot complete at
seal time. The AES key must be exchanged after the driver claims the
delivery job. With ECDH, both parties independently derive a shared secret
and use it to wrap/unwrap the AES key. All channel data is safe to expose
publicly.

```
1. Buyer creates order → generates ephemeral keypair + AES key
2. Buyer seals manifest with AES key → submits on-chain
3. Driver claims delivery via Dutch auction
4. Driver generates per-order ephemeral keypair
5. Driver reads buyer's EPK from manifest, derives ECDH shared secret
6. Driver sends their EPK to buyer via channel (public-safe)
7. Buyer receives driver EPK, derives same ECDH shared secret
8. Buyer wraps AES key with ECDH secret → sends wrapped key via channel (public-safe)
9. Driver unwraps AES key with ECDH secret → decrypts manifest
```

Both channel messages (driver EPK and wrapped AES key) are safe to expose
publicly — without the corresponding ephemeral private keys, an observer
cannot derive the ECDH shared secret.

### Key Exchange (Legacy — Fallback)

Falls back to direct AES key transport over XMTP when ECDH keys are unavailable
(e.g., v2 manifests without ephemeral keypairs):

```
1. Buyer creates order → generates AES key
2. Buyer seals manifest with AES key → submits on-chain
3. Driver claims delivery via Dutch auction
4. Buyer detects assigned driver
5. Buyer sends AES key to driver via XMTP DM
6. Driver decrypts manifest → sees delivery address
```

### XMTP Message Protocol

Messages are JSON text over XMTP DMs (or any transport channel):

```json
// Legacy: direct key (requires channel confidentiality)
{ "type": "DELIVERY_KEY", "orderId": "42", "keyB64": "...", "ts": 1711363200000 }

// ECDH step 1: driver offers ephemeral public key (public-safe)
{ "type": "ECDH_PUBKEY", "orderId": "42", "pubKeyHex": "02abc...", "ts": 1711363200000 }

// ECDH step 2: buyer sends wrapped AES key (public-safe)
{ "type": "ECDH_WRAPPED_KEY", "orderId": "42", "wrappedKeyB64": "...", "ts": 1711363200000 }
```

### Channel Abstraction

`DeliveryChannel` is an abstract interface with two implementations:

| Implementation | When Used | Backend |
|---------------|-----------|---------|
| `XmtpDeliveryChannel` | Production, manual devnet | `@xmtp/browser-sdk` v7, WASM |
| `MockDeliveryChannel` | e2e tests (`?e2e=mock` or `?e2e=devnet`) | In-memory bus via `window.__FIGARO_XMTP_MOCK__` |

The factory in `deliveryChannel.ts` auto-detects e2e mode and returns the
appropriate implementation.

### React Hook

`useDeliveryKeyExchange(opts)` handles both sides:

**Buyer side** (`role: "buyer"`):
1. Polls `assignedDriver(deliveryOrderId)` every 4 seconds
2. When a driver is assigned, retrieves the stored AES key
3. Opens a `DeliveryChannel` and sends the key
4. Status: `idle → sending → sent`

**Driver side** (`role: "driver"`):
1. Subscribes to incoming `DELIVERY_KEY` messages for the order
2. On receipt, exposes the key via hook return value
3. Status: `listening → received`

---

## Threat Model Comparison

| Attack | Master Key | Per-Order Legacy | Per-Order ECDH (Current) |
|--------|-----------|-----------------|------------------------|
| Wallet compromise | All historical deliveries | Orders where attacker intercepts XMTP DM | Only if attacker has ephemeral private keys |
| localStorage theft | Master key → all deliveries | Individual AES keys → stored orders | Individual AES keys + ephemeral keys |
| On-chain observer | Cannot decrypt | Cannot decrypt | Cannot decrypt |
| Channel eavesdrop | N/A | AES key exposed in plaintext | Only public keys / wrapped blobs (safe) |
| Driver collusion | N/A | Driver sees assigned orders | Driver sees assigned orders |

### Remaining Risks

1. **Buyer localStorage**: Per-order AES keys and ephemeral private keys
   are stored in `localStorage`. If the buyer's browser is compromised,
   stored keys are exposed. Mitigation: keys only exist for the buyer's
   own orders, and the delivery address is the buyer's own address.

2. **Channel availability**: If the coordination channel is unavailable,
   the fallback is manual key copy via the `<details>` disclosure panel
   in `BuyerDeliveryKeyPanel`.

3. **Hardware wallet compatibility**: ECDH uses per-order ephemeral
   secp256k1 keypairs (not wallet private keys), so hardware wallets
   are fully compatible — the wallet private key is never needed for
   the ECDH exchange.

---

## ECDH Implementation

The ECDH key exchange is now implemented. Both repos provide the primitives:

- **Prototype2**: `lib/handoff/ecdh.ts` — `deriveSharedSecret`, `wrapHandoffKey`, `unwrapHandoffKey`, fulfiller keypair persistence
- **Figaro-eats**: `lib/eats/ecdh.ts` — same primitives with delivery naming

### How It Works

Both parties use per-order ephemeral secp256k1 keypairs (not wallet keys).
The ECDH shared secret is derived via `eciesjs`:

```
buyerSecret  = PrivateKey(buyerEphPriv).encapsulate(PublicKey(driverEphPub))
driverSecret = PrivateKey(driverEphPriv).encapsulate(PublicKey(buyerEphPub))
// buyerSecret === driverSecret (32 bytes, HKDF-SHA256 derived)
```

The shared secret wraps the AES key using AES-256-GCM. The wrapped blob
is safe to transmit over any channel.

### Key Design Decision

ECDH is used for **key wrapping**, not as the encryption key itself.
The manifest is still encrypted with a random per-order AES key at order
creation time (because the driver is unknown). ECDH provides the secure
exchange mechanism after assignment — turning the channel from a
security-critical link into a convenience transport.
