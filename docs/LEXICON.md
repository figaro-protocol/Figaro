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
| ↳ clause group | — | **`block.article`** — the one grouping word (`categories` array + on-chain `family` removed 2026-06-26) | grouped by `article` | `lint-no-clause-grouping-synonyms` |
| ↳ clause lifecycle | — | uniform: every section is **merkle-bound** to `agreementHash` (the keccak cross-check — no per-clause verification tier) | derived in code, not stored: **agreement-only** (committed, never attested) vs **runtime-attested** (`clauseIsProcessLog` — empty anchor at commit) | `lint-architecture-lexicon` — retired: **`block.tier`** and its `cross-checked`/`runtime` tiers, `category-1/2`, `manifest-only` |
| reusable composition | — | **assembly** | assembly | `lint-architecture-lexicon` |
| ↳ serialized form | — | — | **`AssemblyTemplate`** (one name; `AssemblyDocument` retired → 0 occurrences) | — |
| ↳ template node | — | — | **agreement** (`AssemblyTemplateAgreement`) — the design-time draft of one buyer↔seller relationship; its `id` names the kernel-order slot (`order-<i>`) it commits into at checkout | grep-verified canonical (template `orders` array retired 2026-07-05) |
| ↳ assembly identity | — | **`compositionHash`** (AssemblyRegistry binding key; keccak of the canonical composition subset — editorial excluded) | slug = presentation, derived (`deriveAssemblySlug`) | grep-verified canonical (caller-chosen `slug`/`slugHash` retired 2026-07-05) |
| deal instance | **order** → **process** · commitment | — | order · process | `lint-architecture-lexicon` (`order-received` banned) |
| the agreement | **`agreementHash`** (the EIP-712 fingerprint field) | — | `Agreement` (off-chain JSON) · `agreementUri` (IPFS location) | grep-verified canonical |
| evidence | — | **attestation** (`contentRef` = `keccak256(content)`) | attestation | `lint-architecture-lexicon` |
| value | currency · payment | — | consumer copy via `vocab.ts` (deposit/place/complete) | — |

**Distinct concepts that are NOT drift** (do not collapse): `compositionHash` = the *assembly's*
identity (AssemblyRegistry binding key) ≠ `contentHash` (the *clause spec's* integrity digest,
ClauseRegistry) ≠ `agreementHash` (the *signed agreement's* EIP-712 fingerprint); `contentURI` =
IPFS document *location* (Clause/Assembly registries; SellerRegistry keeps `metadataURI` — its
mutable profile IS metadata) ≠ a hash; `contentRef` = the *attestation's* fingerprint ≠ any of
them. Verify-after-fetch: readers recompute `contentHash`/`compositionHash` from the fetched
document (`canonicalJson.ts` — one canonical form, sorted keys) — a mismatched pin is absence.
**The clause's GROUP is `block.article`** (geo, coordination, emissions…) — ONE word, ONE home. The
earlier `categories` array and on-chain `family` (`= keccak256(categories[0])`) were a closed-world
duplicate of the same concept that drifted across clauses; both were removed 2026-06-26, leaving
`block.article` as the sole classification. The RPGF substrate-broadening weight, when rebuilt,
derives its group key as `keccak256(block.article)` from the contentHash-verified spec — nothing is
stored on-chain (see `PUBLIC_GRAPH_MODEL.md`). The guard `lint-no-clause-grouping-synonyms` blocks any
re-introduced `category`/`family` grouper.

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
- **synonym-audit agent (PENDING)** — the reasoning backstop for a *newly-minted* synonym no static
  guard lists yet; its anchor is THIS grid (punch-list, Agent-workflow hygiene).

## Failure modes (the two ways the grid gets broken)

1. **Folding** — flattening tiers ("operator IS just seller, delete it"). Translate up/down; never
   equate. Honest form: "an operator that holds the sell side of an order *acts as* a seller."
2. **Over-collapsing** — merging concepts that exist for a reason. `figaro-merchant-process` and
   `figaro-courier-process` are TWO clauses (byte-identical validator logic except `MAX_EVENT_INDEX`;
   different event vocabularies = different work lifecycles) — clause-bound, NOT party names.

**Homonym (not a synonym):** `provider` = the wallet provider · the arbitration/ODR provider (the
`figaro-arbitration-<provider>` sister-clause pattern) — distinct concepts, intentionally same word.
(The `DutchAuction` `provider` sense retired with the contract, 2026-07-02; the `OffsetProvider` sense
with the offset apparatus, 2026-07-03.)

**New-term admission rule.** A product-flavored term — a named vertical ("eats"), a
platform role ("driver", "restaurant"), a closed category ("archetype", "role",
"businessType") — must not enter a hard-to-change surface (clauseId, ABI field,
contract name, route segment) until the operator has confirmed it. Use a
protocol-neutral term, or a working name in a soft surface (local variable, draft),
first. The V3–V5 history of expensive de-product-ification renames (`figaro-eats` →
`local-commerce`, `driver` → `courier`, `roleKind`/`archetypeId` deleted) is the
why; on a live chain a registered clauseId makes such a rename unrecoverable, not
just costly.

Related: `CLAUDE.md` "Three-Tier Naming"; `OPEN_WORLD.md` §1 (the projection
distinction).
