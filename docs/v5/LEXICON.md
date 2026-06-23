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
| relationship unit | — | **clause** (+ validator) | clause | `lint-no-clause-grouping-synonyms` (one grouping mechanism, by `article`) |
| ↳ clause group | — | ONE concept, three names (residue): **`categories[0]`** (slug) → **`family`** `= keccak256(…)` (on-chain, RPGF) ; **`block.article`** (the grouping word) | grouped by `article` | `lint-no-clause-grouping-synonyms` + `lint-substrate-broadening-weight` |
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
**`categories` / `family` / `article` are ONE concept — the clause's GROUP** (geo, coordination,
emissions…), scattered across three names + locations: a closed-world residue. They should carry
one value per clause; today some diverge (geo's `family` `geo` vs its `article` `logistics`) — the
bug, not a design. The RPGF substrate-broadening weight applies to this one group (`family` is its
on-chain fingerprint; see `PUBLIC_GRAPH_MODEL.md`, `lint-substrate-broadening-weight.sh`). Frontend
grouping uses the one word `article`; the guard blocks a *second* grouper named `category`/`family`.

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
- **`lint-substrate-broadening-weight.sh`** — protects the substrate-broadening weight on the clause
  group (`family` = the group's on-chain fingerprint, RPGF-weighted) — load-bearing, not cruft.
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
