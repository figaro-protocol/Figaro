# Architecture Lexicon — canonical name per concept, per tier

The **documented half** of the architecture lexicon. The *enforced* half is the guards
(below); this file is the grid they enforce against and the anchor the synonym-audit agent
checks code drift against. Promoted from the memory tier (2026-06-22)
so the canonical names live in the committed, verified tier — read this, don't reconstruct it.

**The rule:** one canonical name per concept. The *same entity* wears a *different correct
name at each tier* — these are PROJECTIONS, not synonyms. Translate across tiers; never flatten
(fold) or equate, and never collapse two concepts that exist for a reason (over-collapse).

**The three tiers, in one breath:** the **kernel** is `FigaroCore` — the irreducible
settlement primitive (bond, commit, resolve). The **protocol** is the kernel plus the
public registries, coordinators, and composition doctrine anchored on chain. The
**runtime** is everything people touch — the semantic layer, builder surfaces, and UI
that read protocol state. A name is only right *at its tier*; the grid below gives each
concept's name per tier.

## The grid

| Concept | core / kernel | registry / protocol | frontend / runtime | verified by |
|---|---|---|---|---|
| paying party | **buyer** | buyer | buyer | `lint-no-product-party-terms` |
| value-adding party | **seller** | operator · author · provider | merchant · courier · driver · vendor · supplier *(projections)* | `lint-no-product-party-terms` |
| relationship unit | — | **clause** (+ the Layer-A SDK validator — per-clause validator *contracts* do not exist, permanently) | clause | `lint-no-clause-grouping-synonyms` (one grouping mechanism, by `article`) |
| ↳ clause group | — | **`block.design.article`** — the one grouping word (`categories` array + on-chain `family` removed 2026-06-26) | grouped by `article` | `lint-no-clause-grouping-synonyms` |
| ↳ clause lifecycle | — | uniform: every section is **merkle-bound** to `agreementHash` (the keccak cross-check — no per-clause verification tier) | derived in code, not stored: **runtime event logs** (`clauseIsProcessLog` — empty anchor at commit) and **witness stages** (`spec.stages[N≥1]`) vs content committed at signing (stage 0); all one runtime-evidence category — coordination attestations | `lint-architecture-lexicon` — retired: **`block.tier`** and its `cross-checked`/`runtime` tiers, `category-1/2`, `manifest-only` |
| reusable composition | — | **assembly** | assembly | `lint-architecture-lexicon` |
| ↳ serialized form | — | — | **`AssemblyTemplate`** (one name; `AssemblyDocument` retired → 0 occurrences) | — |
| ↳ template node | — | — | **agreement** (`AssemblyTemplateAgreement`) — the design-time draft of one buyer↔seller relationship; its `id` names the kernel-order slot (`order-<i>`) it commits into at checkout | grep-verified canonical (template `orders` array retired 2026-07-05) |
| ↳ assembly identity | — | **`compositionHash`** (AssemblyRegistry binding key; keccak of the canonical composition subset — editorial excluded) | slug = presentation, derived (`deriveAssemblySlug`) | grep-verified canonical (caller-chosen `slug`/`slugHash` retired 2026-07-05) |
| deal instance | **order** → **process** · commitment | — | order · process | `lint-architecture-lexicon` (`order-received` banned) |
| the agreement | **`agreementHash`** (the EIP-712 fingerprint field) | — | `Agreement` (off-chain JSON) · `agreementUri` (IPFS location) | grep-verified canonical |
| evidence | — | **attestation** (`contentRef` = `keccak256(content)`) | attestation | `lint-architecture-lexicon` |
| value | currency · payment | — | consumer copy via `vocab.ts` (deposit/place/complete) | — |
| token concepts | `currency` = ANY ERC-20 (the kernel is token-agnostic) | **three distinct, never assimilated**: the **florin** (a pure Schelling point — NOTHING is conditioned on it) ≠ **`figaro-utility-token`** (a generic pin: the designer names any ERC-20; no economics in the clause) ≠ the **privileged token** (VISION doctrine: an assembly-author's OWN token) | florin · utility-token pin | `lint-architecture-lexicon` (same-line florin↔pin / florin↔privileged coupling banned) |

**Distinct concepts that are NOT drift** (do not collapse): `compositionHash` = the *assembly's*
identity (AssemblyRegistry binding key) ≠ `contentHash` (the *clause spec's* integrity digest,
ClauseRegistry) ≠ `agreementHash` (the *signed agreement's* EIP-712 fingerprint); `contentURI` =
IPFS document *location* (Clause/Assembly registries; MembersRegistry keeps `metadataURI` — its
mutable profile IS metadata) ≠ a hash; `contentRef` = the *attestation's* fingerprint ≠ any of
them. Verify-after-fetch: readers recompute `contentHash`/`compositionHash` from the fetched
document (`canonicalJson.ts` — one canonical form, sorted keys) — a mismatched pin is absence.
**The three token concepts stay apart** (maintainer, 2026-07-17 — the thrice-recurring drift):
the **florin** is a pure Schelling point — no structural role anywhere, its only couplings are
its own issuance (genesis + RpgfMinter); **`figaro-utility-token`** is a generic settlement-token
pin carrying no economics; the **privileged token** is an assembly-author's own value-capture
token (`VISION.md` § "Value Capture After the Firm" — which itself says "distinct from
denomination"). Writing any of these in terms of another — "the florin's structural demand",
"florin-pinned" as a strategy object, the pin as "THE privileged token" — is drift.
**THE TOKEN-LAYER GRID** (maintainer Q&A, 2026-07-20 — each layer answers a DIFFERENT question;
naming one with another's word is the recurring drift):

| Layer | Token | Role |
|---|---|---|
| Unit of account | the seller's **default** (`defaultTokenAddress`, one of the accepted array) | what the catalogue QUOTES in; the conversion basis |
| Medium of payment & bond | the buyer's **pick** from the seller's **accepted array** (`acceptedTokens[]` — the SOCIAL layer: each entry declares a value system the seller coordinates with) | THE process denomination: recorded in the commitment, bonds 2×, payment — the seller RECEIVES it and SPENDS it onward. Circulation is the point: velocity and market liquidity for the accepted token, never mere LP demand |
| Designer override | the **utility-token pin** (`figaro-utility-token`, assembly-scoped — `design.scope: "assembly"`, a designer fill folded into every agreement) | replaces the buyer's pick; the whole assembly is valued in the pinned token, and the sign gate asserts the pin matches BOTH the `figaro-commerce` currency leaf and the commitment struct's `currency` field |
| On-ramp | **swap-and-commit** (`WitnessSwapAndCommitCoordinator`, buyer and/or seller funding legs) | either party short of the process denomination converts what they hold INTO it, atomically at commit/accept. A funding input is never the order's denomination |
| No structural role | the **florin** | one more ERC-20 on the network — may be accepted, picked, or pinned like any other; nothing is conditioned on it |
| Doctrine, not machinery | the **privileged token** | VISION § "Value Capture After the Firm": an assembly-author's own ERC-20 doing the work of a corporate stock certificate, priced through USE — a strategy that may use the pin, never the pin itself |

**THE VAULT-REGISTRAR SEAM** (maintainer-ruled 2026-08-14 — two words an agent
keeps collapsing into a phantom protocol object and a phantom global role):
**treasury = the DAO's VAULT** — a custody *wallet* (mainnet: a canonical Safe at
`DAO_WALLET`, config never code; devnet/testnet: `MockTreasuryMultisig` as the
stand-in) holding the DAO's 300M-florin allocation plus whatever ETH it chooses
to stake. It is NOT a protocol contract: no protocol flow pays into it, and
registration deposits NEVER go to it — stakes sit in the registry that took them,
reclaimable only by their registrar (withdraw = de-surface). **registrar** = a
PER-WALLET role, never a global one: the wallet that registered an artifact and
holds its live stake. Every wallet is registrar of ONLY what it claims ownership
of — the DAO's vault for the genesis seed set and donated keys (the 2026-08-13
endowment ruling), the founder's address for the founder's own artifacts, any
stranger's wallet for theirs. "The registrar" without an owner qualifier is the
drift tell; seeding tooling acts FOR one designated registrar per invocation
(an EOA key, or a vault via its owners' approvals) and confers no special role.

**SYSTEM A (trade) ≠ SYSTEM B (funding) — three words the deleted optimistic/QF apparatus
overloaded, now SINGLE-REFERENT** (the System-B meanings were deleted, so each word has ONE
live sense — but an agent porting pre-07-29 text will re-conflate them, which cost most of the
2026-07-27 session): **proof / SP1** = the KERNEL BATCH-SCALING path ONLY (`FigaroBatchVerifier`
+ the Rust `prover/` — a validity proof over batched settlements); the 600M RPGF has NO proof
program — usage is counted at resolve and `sdk/src/rpgf` only MIRRORS chain state, never posts
an answer. **merkle root** = ONE agreement's clauses (`agreementHash`, the root over its signed
sections); the RPGF posts NO payout root — nothing is posted at all. **Kleros** = an optional
TRADE-dispute forum a DESIGNER composes (the `figaro-arbitration-kleros` clause +
`block.composes.forumUrl`, config only — the parties' own recourse); the RPGF has NO bond referee
(the `KlerosRpgfAdapter` / bond-arbitrator apparatus was deleted). **The crease:** System B — the
600M RPGF (`UsageCounter` → `RpgfMinter`) — is COUNT-AT-RESOLVE and has NO proof apparatus of its
own: no posted payout root, no bond, no referee, gated only by the two-sided live ETH stake.
Owner of the funding side: `CONTRACTS.md` § RPGF.

⚠️ **One precise qualification, since 2026-07-30 (the batch-usage bridge):** batch-settled trade
is counted by System A's proof, as a PASSENGER. The guest proves each clause's or assembly's cumulative
`(c, d)` inside the batch it is already proving, and `FigaroBatchVerifier` writes it to
`UsageCounter.applyBatchAccrual`. This does NOT give System B a proof apparatus — there is still
no RPGF program, no payout root, no bond and no referee; the reward simply rides the settlement
proof that already exists, because a batch-settled process never acquires kernel status and the
counter's direct path could otherwise never see it (see the settlement-universes crease below).
Say "the batch proof also carries usage", never "the RPGF is proved".

**TWO SETTLEMENT UNIVERSES — `FigaroCore` vs `FigaroBatchVerifier`** (crease stated 2026-07-30;
owner: `SCALING_STRATEGY.md` § "Two settlement paths, two DISJOINT state universes"). The two
share no state and never call each other: a batch-settled process NEVER acquires kernel status,
so `core.orderStatus` returns UNKNOWN for it permanently, and anything gated on that status —
`AttestationCoordinator`, `UsageCounter`'s direct path — cannot see batched trade at all. This is
why the RPGF counter silently missed it (found by writing the soundness argument, not by any
harness: both contracts were individually correct), why guest-owned idempotence in the batch is
sound, and why every indexer must fold BOTH streams. Exactly one thing crosses the crease: the
usage accrual, as proved numbers. Do not describe the direct path as a "migration" target — the
fallback means starting a NEW process, never moving a batched one.

Resolution precedence: **pin ?? buyer's pick ?? seller default**. Every token decision happens at
or before `commit`; `resolveProcess` inherits what the commit recorded and decides nothing.

**REGISTER ≠ registry** (2026-07-20, with `figaro-credential`): a **register** is an EXTERNAL
authority's public record (the NYC TLC's active-drivers dataset, an airman registry, a state
medical board) — referenced by a clause's committed content (`credentialRegisterUri`), read by
counterparties at verification time, never mirrored on-chain; a **registry** is one of the
protocol's three on-chain anchors (Clause/Members/Assembly — `ClauseRegistry`/`MembersRegistry`/`AssemblyRegistry`). Writing "registry" for an authority's
record — or anchoring an authority's record in a protocol registry — is drift.
**The clause's GROUP is `block.design.article`** (coordination, logistics, emissions…) — ONE word, ONE home. The
earlier `categories` array and on-chain `family` (`= keccak256(categories[0])`) were a closed-world
duplicate of the same concept that drifted across clauses; both were removed 2026-06-26, leaving
the article (today `block.design.article`) as the sole grouping word. **RPGF does not read it — and reads no incentive tag at all**:
the reward was ratified UNIFORM on 2026-07-29 (contract surface: `CONTRACTS.md` § RPGF),
scoring every clause and assembly on real usage alone with no category, tag, or weight — the article is purely a
reader-facing grouping that stays off-chain. The guard `lint-no-clause-grouping-synonyms` blocks any re-introduced
`category`/`family` grouper.

## Drift status (conformance check, 2026-06-22)

All rows above **CONFORMANT** in the live tree: `buyer`-as-"customer"/"user" = 0; `agreementHash`
canonical across kernel + SDK + frontend, rivals (`agreementId`/`Ref`/`Cid`) = 0;
`AssemblyDocument` = 0 (the rename to `AssemblyTemplate` is complete). No vocabulary drift found.
*(Re-run the conformance grep when adding a row or after a parallel-agent burst — that's when drift enters.)*

## Verifiers

- **`lint-no-product-party-terms.sh`** — party rows: blocks `merchant`/`operator`/etc. as a *party*
  on permanent surfaces (routes, types, hooks, test-ids); ALLOWS the `merchant-process` clause id.
- **`lint-no-clause-grouping-synonyms.sh`** — clause row: bans `category`/`family`/`clauseCategories`.
- **`lint-no-closed-world-vocab.sh`** — bans stored taxonomy fields (`roleKind`/`archetypeId`/etc.).
- **`lint-architecture-lexicon.sh`** — cross-cutting retired terms (`process tree`, `progressive
  collateralization`, `schema`, `order-received`, the retired clause tiers `category-1/2` /
  `manifest-only`, `manifest` as off-chain-content, and the retired package name `@figaro/core` —
  the SDK is `@figaro/sdk`) plus the token-concept coupling bans
  (florin↔`figaro-utility-token`, florin↔privileged-token, "florin structural demand"); grows
  tier by tier.
- **synonym-audit reasoning pass (future work)** — a reasoning backstop for a *newly-minted* synonym
  no static guard lists yet; its anchor is THIS grid.

## Failure modes (the two ways the grid gets broken)

1. **Folding** — flattening tiers ("operator IS just seller, delete it"). Translate up/down; never
   equate. Honest form: "an operator that holds the sell side of an order *acts as* a seller."
   **Second form — folding a tier's LAW onto another tier's artifact** (the reasoning face of the
   same error, and the more expensive one): citing a kernel property — `ADMITS`/"anyone who can
   sign and bond participates", no-escape-hatches, "role is never stored" — against a protocol- or
   runtime-tier artifact, and calling it a finding. The three tiers are independently usable, so
   **the kernel's neutrality is the kernel's job description, not the system's thesis; it does not
   propagate upward.** The tiers above exist in order to be defined. The grid above is the
   authority on which tier an artifact sits at: establish the tier from it BEFORE citing doctrine
   at the artifact — look it up, never infer it. Enforced at proposal time by
   `figaro-assumption-auditor` (pattern 11), not by a lint guard: this error lives in reasoning,
   before any code exists to scan.
2. **Over-collapsing** — merging concepts that exist for a reason. `figaro-merchant-process` and
   `figaro-courier-process` are TWO clauses (byte-identical validator logic except `MAX_EVENT_INDEX`;
   different event vocabularies = different work lifecycles) — clause-bound, NOT party names.
   **The costliest instance — `family` vs `article` (2026-06-26 `256ff522`, diagnosed 07-27).**
   The clause-classification consolidation was RIGHT: three fields (the block article, a duplicate
   `categories` array, and on-chain `family`) were smeared across one job. But `family` was not a
   fourth synonym for that job — it was a **different axis**: `article` groups clauses for READERS
   (the drawer's headings), `family` was the RPGF **incentive tag** — a tiny deploy-frozen set
   (`keccak256("geo")`, `keccak256("fulfilment")`) whose *membership* grew permissionlessly, so the
   protocol could pay ×3 for the contributions it wanted more of. Deleting it as a synonym left the
   incentive with no narrow tag to aim at; the 07-15 rebuild had only `article` to reach for and
   picked two ENTIRE articles, turning a mechanism aimed at one clause into a boost for 14 of 27.
   **Superseded 2026-07-29:** the whole weighting axis was retired when the reward was ratified
   UNIFORM (contract surface: `CONTRACTS.md` § RPGF) — `rpgfTag`/`rpgfTagOf` and
   `UsageCounter`'s `boostedTag`/`BOOSTED_WEIGHT`/`BASE_WEIGHT` are deleted; every clause and assembly scores on
   real usage alone and Sybil-resistance moved to the two-sided live ETH stake. The `family`-vs-`article`
   history is preserved here only for the lesson it teaches.
   **The lesson: a terminology consolidation must sort synonyms (merge) from homonyms (keep, and
   rename so the resemblance stops misleading).** Two fields that both "group clauses" are not the
   same field if one groups for documentation and the other for reward. Before deleting a field as
   redundant, name its CONSUMER — `family`'s only consumer was the reward formula, which is exactly
   what made it a separate axis rather than a duplicate.

**Homonym (not a synonym):** `provider` = the wallet provider · the arbitration/ODR provider (the
`figaro-arbitration-<provider>` sister-clause pattern) — distinct concepts, intentionally same word.

**Homonym (not a synonym):** `operator` = (1) the party operating a wallet — the
key-holder behind a signer, human or software (glossary sense; the agents page's
asset/wallet/operator triad); (2) the protocol-tier projection of a value-adding
party (the grid's seller row); (3) used with a negation, the platform sense ("no
operator in the middle"), which /faq disambiguates in place. The repo's human is
canonically the **maintainer** — "operator" no longer carries that sense
(maintainer-private tooling, maintainer rulings).
Distinct concepts, intentionally same word; qualify on first use when two senses
could collide on one surface.
(The `DutchAuction` `provider` sense retired with the contract, 2026-07-02; the `OffsetProvider` sense
with the offset apparatus, 2026-07-03.)

**New-term admission rule.** A product-flavored term — a named vertical ("eats"), a
platform role ("driver", "restaurant"), a closed category ("archetype", "role",
"businessType") — must not enter a hard-to-change surface (clauseId, ABI field,
contract name, route segment) until the maintainer has confirmed it. Use a
protocol-neutral term, or a working name in a soft surface (local variable, draft),
first. The V3–V5 history of expensive de-product-ification renames (`figaro-eats` →
`local-commerce`, `driver` → `courier`, `roleKind`/`archetypeId` deleted) is the
why; on a live chain a registered clauseId makes such a rename unrecoverable, not
just costly.

Related: `CLAUDE.md` "Three-Tier Naming"; `OPEN_WORLD.md` §1 (the projection
distinction).
