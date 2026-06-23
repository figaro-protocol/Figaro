# Architecture — the whole system, read as one stack

The unifying frame the rest of the docs are shadows of. CLAUDE.md holds the **discipline**
(what not to do and why); this file holds the **shape** (where the protocol ends and a
presentation begins). Read it once and the recurring confusions — "is this silt?",
"is the frontend the product?", "what's verified vs cosmetic?" — become one *testable*
question instead of a list of prohibitions.

This is a map, not an inventory: the per-contract surfaces live in `CONTRACTS.md`, the
clause layers in `CLAUSES.md`, the routes/lib map in `FRONTEND.md`, the invariant→test
mapping in `VERIFICATION_MAP.md`. Do not duplicate those here.

## The stack

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ FigaroCore — the frozen kernel.  Bonding + buyer-dominance + atomic resolve.  │
│ Sees only LINEAR commit chains + an opaque `agreementHash` fingerprint.       │  ── protocol
├─────────────────────────────────────────────────────────────────────────────┤
│ Registries (Clause / Seller / Assembly) + RPGF.  Permissionless, content-     │
│ addressed anchors; first-write-wins; RPGF rewards contribution.               │  ── protocol
├─────────────────────────────────────────────────────────────────────────────┤
│ clause.fields  +  clause.block.tier                                           │
│   • fields  → ABI-encoded → validated A/B/C → attested → merkle-bound to       │  ── protocol
│     agreementHash → secured by bonds.  The verified SUBSTANCE.                 │     (verified)
│   • block.tier → the clause's VERIFICATION POSTURE (cross-checked / runtime /  │
│     agreement-only); governs how/whether the content enters the agreementHash. │
│ ═══════════════════════════  THE SEAM  ═══════════════════════════════════════ │
│ clause.block.{article, nestsUnder, mechanismKinds, moduleIds, attestation, …}  │  ── presentation
│   • Layer-A-only metadata.  NO on-chain or verification path reads it.         │     (replaceable)
├─────────────────────────────────────────────────────────────────────────────┤
│ UI + IPFS.  Reads registry → IPFS; uses `block` to present (group by article, │
│ nest sub-clauses, mount capability rails); lets people DO the five nouns.      │  ── presentation
│ Agreements/clauses/proofs are PINNED in IPFS, never reconstructed on-chain.    │
└─────────────────────────────────────────────────────────────────────────────┘
```

Arrows point **up**: the UI reads the registries; the registries don't know the UI exists.

## The layers

- **Kernel (`FigaroCore` + `CommitmentTypes`).** Two mechanisms — asymmetric bonding and
  buyer-dominance with atomic resolution — plus the no-escape-hatch constraint. It sees a
  monotonic cumulative-value accumulator and an opaque `agreementHash`; it takes no position
  on currency, identity, topology, or contribution. Frozen. (`THEORY.md`, `CONTRACTS.md`.)
- **Registries + RPGF.** Three parallel families, each its own anchor/identity/event stream
  (never nested): `ClauseRegistry`, `SellerRegistry`, `AssemblyRegistry`. Permissionless,
  first-write-wins, content-addressed. RPGF rewards how much a contribution helps the network
  evolve. (`CONTRACTS.md`, `PUBLIC_GRAPH_MODEL.md`, `FIG_TOKEN.md`.)
- **The clause** — the unit that straddles the seam (below).
- **UI + IPFS.** One frontend that composes catalogues and renders network state. The signed
  agreement and the clause/assembly specs live in IPFS, pinned; the chain keeps only
  fingerprints. (`FRONTEND.md`, `OPEN_WORLD.md`.)

## The seam — `clause.block`

A clause spec has three kinds of thing, and the protocol/presentation boundary runs *through*
the spec, not around it:

| Part | Who reads it | Verified? |
|---|---|---|
| **`fields`** (the content) | Layer A (`validate.ts`), Layer B (`validate.rs`, in the SP1 circuit), Layer C (`IClauseValidator`, `abi.decode`s `content`) | **Yes** — validated identically across layers, attested on-chain, merkle-bound to `agreementHash`, secured by bonds |
| **`block.tier`** | the agreementHash builder (`orderAgreement.ts`) + the prover's cross-check gate (`spec.rs::cross_checks`) | **Yes (structural)** — declares the verification posture: `cross-checked` → content byte-committed into `agreementHash`; `runtime` → attested live, empty anchor; `agreement-only` → in the signed agreement, no validator (e.g. topology, reconstructed off-chain) |
| **the rest of `block`** — `article`, `nestsUnder`, `mechanismKinds`, `moduleIds`, `attestation`, `sisterClauseId` | the UI only (drawer grouping, sub-clause nesting, capability-rail mounting) | **No** — every on-chain and verification path ignores it |

So `fields` + `block.tier` are the **protocol**; everything else in `block` is **replaceable
presentation**. The consequence is the whole thesis in one line:

> **Anyone can build a different frontend — ignore `block`, invent their own presentation — and
> still get the contracts, the mechanisms, the verified `fields`, and the RPGF.** The UI is one
> presentation atop a permissionless, verified substrate; it is never the product.

## What the seam decides

Three recurring questions collapse to "which side of the seam?":

1. **Silt vs designed.** A surface driven by `block` metadata (the drawer's article grouping,
   the capability rail, a lens panel) is the *designed presentation of verified clauses* — not
   silt. A hardcoded list, a stored role/archetype/category, or a bundled catalogue is product
   drift (closed-world). The seam is the test; the prohibitions in CLAUDE.md are its shadows.
2. **Product vs protocol.** "Am I building a product feature?" sharpens to "am I above the seam
   (presentation) or below it (verified substance)?" Below the seam, you compose from `lib/` and
   the registries; you never build an app shell, because the clause spec itself shows the UI is
   downstream.
3. **Permissionless boundary — where data ends and code begins.** `block` is *always* data,
   always permissionless. `fields` are validated: a **declarative** clause (types/enums/bounds)
   is validated by the already-generic `validate.ts`/`validate.rs` — data-only; an **imperative**
   clause (proximity-proof verification, GHG arithmetic, cross-field constraints) needs a custom
   validator — code, correctly gated behind the repo. Today the only generic Layer-C validator is
   the permissive mock; closing that gap (a spec-driven `SpecDrivenValidator`, or routing
   declarative clauses through the proof path) would make declarative clauses data-only end to
   end. (Tracked on the punch-list; see `CLAUSES.md` for the three-layer detail.)

## Related

`CLAUDE.md` (the discipline + the five nouns), `OPEN_WORLD.md` (the open-world paradigm + the
7-pattern lens), `CLAUSES.md` (the three validation layers + the clause table), `CONTRACTS.md`
(the kernel + registries + validators), `LEXICON.md` (the `block.tier` / `article` / `family`
rows), `THEORY.md` (why the kernel's two mechanisms make cooperation dominant).
