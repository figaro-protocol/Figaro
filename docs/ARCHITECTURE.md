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
│ clause.fields  →  the verified substance                                       │
│   • fields → ABI-encoded → validated (Layer A, off-chain) →                    │  ── protocol
│     merkle-bound to agreementHash → attested → secured by bonds.               │     (verified)
│   • verification is UNIFORM — every section is a merkle leaf under             │
│     the signed agreementHash (the keccak cross-check). No per-clause tier.     │
│ ═══════════════════════════  THE SEAM  ═══════════════════════════════════════ │
│ clause.block.{article, nestsUnder, mechanismKinds, attestation, …}             │  ── presentation
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
  evolve. (`CONTRACTS.md`, `PUBLIC_GRAPH_MODEL.md`, `FLORIN_TOKEN.md`.)
- **The clause** — the unit that straddles the seam (below).
- **UI + IPFS.** One frontend that composes catalogues and renders network state. The signed
  agreement and the clause/assembly specs live in IPFS, pinned; the chain keeps only
  fingerprints. (`FRONTEND.md`, `OPEN_WORLD.md`.)

## The seam — `clause.block`

A clause spec has three kinds of thing, and the protocol/presentation boundary runs *through*
the spec, not around it:

| Part | Who reads it | Verified? |
|---|---|---|
| **`fields`** (the content) | Layer A (`validate.ts`, off-chain) | **Yes (off-chain)** — validated against the spec off-chain; the section is merkle-bound to `agreementHash` and the attestation is secured by bonds. The chain validates no content shape. |
| **all of `block`** — `article`, `nestsUnder`, `composes`, `block.fields` (runtime inputs) | the UI only (drawer grouping, sub-clause nesting, composition dispatch, runtime-input forms) | **No** — every on-chain and verification path ignores it |

There is **no `block.tier`** (it was ripped from the block model). Verification is **uniform**:
every clause section is a merkle leaf under the signed `agreementHash`, and that keccak binding
*is* the security cross-check — there is no per-clause "verification posture". What varies is the
clause's lifecycle, **derived in code, never a stored tier**: a runtime-lifecycle clause
(`clauseIsProcessLog`) is an empty anchor at commit whose content is attested later; an
agreement-only clause (topology) is committed but never attested; every
other clause commits its content at signing. "cross-checked" and "runtime" named the same
merkle-bound object.

So `fields` are the **protocol**; everything in `block` is **replaceable
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
3. **Permissionless boundary — data, not code.** `block` is *always* data, always
   permissionless, and so are `fields`: every clause's content is validated off-chain by the
   already-generic `validate.ts` against the spec — data-only, no per-clause code. Imperative
   checks (proximity-proof verification, emissions arithmetic, cross-field constraints) are off-chain /
   read-time concerns, never on-chain validators. There is no on-chain content validation at all —
   the chain registers clauses and merkle-binds attestations, nothing more. (See `CLAUSES.md`.)

## Composing the kernel — the coordinator pattern

The fifth noun (composition with other on-network contracts) has a contract-side shape,
and it is the only sanctioned way to give the network a new settlement-adjacent
capability: **a new capability is a NEW parallel contract composing kernel state — never
a kernel edit, never a tenant inside an existing registry.** The kernel is frozen and
takes no position; the artifact families stay parallel; a composer is just another
permissionless contract.

The copyable shape:

1. **Bind through a minimal, immutable surface.** Declare only the kernel functions you
   actually call and bind at construction — each coordinator declares its own local
   `interface IFigaroCore` naming exactly the surface it uses (`commit` in
   `WitnessSwapAndCommitCoordinator.sol`; `orderStatus` + `DOMAIN_SEPARATOR` in
   `AttestationCoordinator.sol`) and holds it `immutable`. The local-minimal interface
   *is* the pattern for external composers: a third party composing the deployed kernel
   cannot import this repo's files, only its ABI. (`CommitmentTypes` is the shared
   struct/hashing library both import.)
2. **Read kernel state as the single source of truth; never re-implement kernel logic.**
   A coordinator may read (`orderStatus`, `DOMAIN_SEPARATOR`), call (`commit`), and — when
   it cannot import a constant from the frozen kernel — mirror one with a comment pinning
   the source (the `2×` bond multiplier in `WitnessSwapAndCommitCoordinator`). The kernel always
   does the enforcing: the bond pull, the status transition, the atomic resolve. A
   contract that enforces bonding or resolution itself is re-implementing the kernel, not
   composing it.
3. **Hold no resolution-time discretion.** The no-escape-hatch constraint extends to
   composers: a coordinator carries setup or evidence legs (a swap before `commit`; a
   merkle-checked attestation), never a lever over a live process's settlement.
4. **The arrow points one way.** The kernel never knows the coordinator exists (its one
   mention of `AttestationCoordinator`, in the `DOMAIN_SEPARATOR` doc comment, is
   illustrative, not a dependency). Tenant names — Kleros, Uniswap, a lender — live at the
   edge: in the composing contract, in a clause's `block.composes`, in the UI dispatch.
   Never in the kernel, never in the SDK's protocol modules.

The test before building anything settlement-adjacent: *can this be a parallel contract
that reads kernel state and lets the kernel enforce?* It was yes for swapped-currency
funding (`WitnessSwapAndCommitCoordinator`), yes for merkle-gated attestation
(`AttestationCoordinator`), and it is yes for cashflow assignment at resolve (the credit
splitter: a payment-leg rail, never the bond return). If the answer seems to be no, the
proposal is adding a mechanism to the kernel — stop (CLAUDE.md § "Common Misframings").
Per-contract surfaces: `CONTRACTS.md`.

## Related

`CLAUDE.md` (the discipline + the five nouns), `OPEN_WORLD.md` (the open-world paradigm + the
7-pattern lens), `CLAUSES.md` (the three validation layers + the clause table), `CONTRACTS.md`
(the kernel + registries + validators), `LEXICON.md` (the `article` / clause-lifecycle
rows), `THEORY.md` (why the kernel's two mechanisms make cooperation dominant).
