# Architecture Lexicon — canonical name per concept, per tier

The **documented half** of the architecture lexicon. The *enforced* half is the guards
(below); this file is the grid they enforce against and the anchor the synonym-audit agent
checks code drift against. Promoted from the `reference_layered_vocabulary` memory (2026-06-22)
so the canonical names live in the committed, verified tier — read this, don't reconstruct it.

**The rule:** one canonical name per concept. The *same entity* wears a *different correct
name at each tier* — these are PROJECTIONS, not synonyms. Translate across tiers; never flatten
(fold) or equate, and never collapse two concepts that exist for a reason (over-collapse).

## The grid

| Concept | core / kernel | registry / protocol | frontend / runtime | verified by |
|---|---|---|---|---|
| paying party | **buyer** | buyer | buyer | `lint-no-product-party-terms` |
| value-adding party | **seller** | operator · author · provider | merchant · courier · driver · vendor · supplier *(projections)* | `lint-no-product-party-terms` |
| relationship unit | — | **clause** (+ validator) | clause | `lint-no-clause-grouping-synonyms` (grouping word = `article`; `category`/`family` banned *as a grouping word* — distinct from the substrate row) |
| ↳ substrate class | — | **`categories`** (spec) → **`family`** = `keccak256(categories[0])` (on-chain; RPGF weight + geo/flow public-graph axis) | — | `lint-substrate-broadening-weight` — a DISTINCT concept, **not** a grouping synonym |
| ↳ attestation tier | — | **`block.tier`**: `cross-checked` · `runtime` · `agreement-only` (bounded enum) | derived `designer-time`/`runtime` | `lint-architecture-lexicon` — retired: `category-1/2`, `manifest-only` |
| reusable composition | — | **assembly** | assembly | `lint-architecture-lexicon` |
| ↳ serialized form | — | — | **`AssemblyTemplate`** (one name; `AssemblyDocument` retired → 0 occurrences) | — |
| deal instance | **order** → **process** · commitment | — | order · process | `lint-architecture-lexicon` (`order-received` banned) |
| the agreement | **`agreementHash`** (the EIP-712 fingerprint field) | — | `Agreement` (off-chain JSON) · `agreementUri` (IPFS location) | grep-verified canonical |
| evidence | — | **attestation** (`contentRef` = `keccak256(content)`) | attestation | `lint-architecture-lexicon` |
| value | currency · payment | — | consumer copy via `vocab.ts` (deposit/place/complete) | — |

**Distinct concepts that are NOT drift** (do not collapse): `contentHash` = the *assembly's*
fingerprint (AssemblyRegistry) ≠ `agreementHash` (the *agreement's*); `agreementUri` = IPFS
*location* ≠ a hash; `contentRef` = the *attestation's* fingerprint ≠ either.
**`family`/`categories` (the substrate class — RPGF + geo/flow graph) ≠ `article` (the drawer
grouping):** orthogonal axes that diverge per clause (geo's `family` is `geo`, its `article`
`logistics`); the `category`/`family` ban targets *grouping* uses only, never the substrate —
which is load-bearing (`PUBLIC_GRAPH_MODEL.md`, `lint-substrate-broadening-weight.sh`).

## Drift status (conformance check, 2026-06-22)

All rows above **CONFORMANT** in the live tree: `buyer`-as-"customer"/"user" = 0; `agreementHash`
canonical across kernel + SDK + frontend (225 uses), rivals (`agreementId`/`Ref`/`Cid`) = 0;
`AssemblyDocument` = 0 (the rename to `AssemblyTemplate` is complete). No vocabulary drift found.
*(Re-run the conformance grep when adding a row or after a parallel-agent burst — that's when drift enters.)*

## Verifiers

- **`lint-no-product-party-terms.sh`** — party rows: blocks `merchant`/`operator`/etc. as a *party*
  on permanent surfaces (routes, types, hooks, test-ids); ALLOWS the `merchant-process` clause id.
- **`lint-no-clause-grouping-synonyms.sh`** — clause row: bans `category`/`family`/`clauseCategories`.
- **`lint-no-closed-world-vocab.sh`** — bans stored taxonomy fields (`roleKind`/`archetypeId`/etc.).
- **`lint-architecture-lexicon.sh`** — cross-cutting retired terms (`process tree`, `progressive
  collateralization`, `schema`, `order-received`, the retired clause tiers `category-1/2` /
  `manifest-only`, and `manifest` as off-chain-content); grows tier by tier.
- **`lint-substrate-broadening-weight.sh`** — protects the `family` / `w_category`
  substrate-broadening incentive: a distinct, load-bearing concept (not cruft, not a grouping synonym).
- **synonym-audit agent (PENDING)** — the reasoning backstop for a *newly-minted* synonym no static
  guard lists yet; its anchor is THIS grid (punch-list, Agent-workflow hygiene).

## Failure modes (the two ways the grid gets broken)

1. **Folding** — flattening tiers ("operator IS just seller, delete it"). Translate up/down; never
   equate. Honest form: "an operator that holds the sell side of an order *acts as* a seller."
2. **Over-collapsing** — merging concepts that exist for a reason. `figaro-merchant-process` and
   `figaro-courier-process` are TWO clauses (byte-identical validator logic except `MAX_EVENT_INDEX`;
   different event vocabularies = different work lifecycles) — clause-bound, NOT party names.

**Homonym (not a synonym):** `provider` = `OffsetProvider` (klima/toucan) · the wallet provider ·
`DutchAuction`'s `provider` (auction claimer) — three distinct concepts, intentionally same word.

Related: `CLAUDE.md` "Three-Tier Naming" + "Layered vocabulary"; `OPEN_WORLD.md` §1 (the projection
distinction); `reference_layered_vocabulary` memory (the failure-mode "why").
