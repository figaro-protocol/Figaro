# Designer Rewards — Design Document

The 600M florins reserved for the designers whose clauses and assemblies the
network actually uses. This document owns the mechanism's reasoning: who earns,
on what meter, on what schedule, and what deliberately does not exist.

The contract surfaces — `UsageCounter`, `RpgfMinter`, their proof shapes and
revert reasons — are `docs/CONTRACTS.md` § "Designer rewards". The stake's
rationale and the honest Sybil bound are `docs/DATA_LAYER.md` § "What
the stake does and does not do". The academic form is
`/papers/substrate-broadening-rpgf`. The 600M's place in the supply is one row
of the allocation table in `docs/FLORIN_TOKEN.md`.

---

## Who earns

**Designers of record.** A designer is the wallet that wrote and registered a
clause or an assembly; it is the designer of record for as long as it holds a
live stake against that entry in the entry's own registry. Clauses and assemblies earn on the same
terms, from the same pool, through the same call — there is no seniority
between them, and no distinction between a designer who registered one clause
and one who registered fifty.

Two things follow that people expect to be otherwise.

**The mandatory clauses earn.** `figaro-commerce` and `figaro-topology` ride on
every order, and they are scored for their designer of record like any other
clause. "Mandatory" is a registration-layer convention about what a runtime
composes; nothing on chain privileges them, and nothing on chain exempts them.

**Registering is the whole of the claim.** First-write-wins: whoever
registers a clause key under their wallet is its designer of record, and the
binding is irreversible. Donating a clause to another wallet means registering
it under that wallet. Competing with a better clause under one's own wallet is
equally permissionless and equally welcome.

---

## The meter is uniform

A clause's or an assembly's score in a period is its **real usage alone**:

    score = icbrt(c · d² · 1e18)

where `c` is the count of processes that used it and `d` the number of distinct
live-staked sellers who carried it. Distinct sellers are weighted above raw
volume, and below a minimum-support floor of distinct staked sellers the score
is zero — counting continues, and the full score springs when the floor is met.

**There is no tag, category, weight, per-wallet cap, match round, or quadratic
component, and none may be added.** A per-clause multiplier is a way of saying
some kinds of contribution are worth more than their use, which is a judgment
the mechanism exists to avoid making. The human-judgment layer is the DAO's
treasury (`docs/DAO.md`), funded and governed separately for exactly that
purpose.

**Neutrality comes from the stake, not from weighting.** What keeps the meter
honest against a wallet that manufactures usage is not a cap on what it can
earn but the two live stakes any manufactured trade must carry.

---

## Counting happens when the trade resolves

`UsageCounter` counts a clause's or an assembly's usage at resolution,
permissionlessly, from facts the chain already holds: the order is resolved,
and the clause or assembly was merkle-committed in the signed `agreementHash`.
Anyone may call it; the proof is what is trusted, never the caller. Nothing is
posted, bonded, challenged, or adjudicated, and there is no recurring cost to
anyone.

The timing is forced, not chosen. **The chain cannot look backwards** — the
kernel is frozen, never calls the registries, and no contract can read an
event. Reconstructing usage after the fact is what would require the posting,
bonding, challenge, and forum apparatus this mechanism does without. So the
fact is recorded at the moment it occurs, or it is permanently deniable: a
seller can unstake, a period can close, and a late claim is refusable.

Only the section fingerprint reaches calldata, so a private section's plaintext
never becomes public in the counting.

---

## The two-sided live stake

Both sides of a counted usage must have something at stake, in the base chain's
own currency, at the moment it counts:

- **Seller side** — usage counts only for a seller of record whose members
  registry stake is live. `UsageCounter` gates every count on it, on both
  paths.
- **Designer side** — a claim pays only for entries whose registry stake is
  live and registered by the claimant. `RpgfMinter` verifies each entry against
  its own registry; a withdrawn stake earns nothing further.

This is a **value loop, not a cost.** The stake is reclaimable, and holding it
is exposure to the growth of the network one's own work produces. A designer
who withdraws de-surfaces the entry for new compositions and stops earning on
it, while every agreement already committed against it keeps resolving forever.

What the stake does and does not do against Sybil attacks is stated at its
honest strength in `docs/DATA_LAYER.md`; it is not restated here.

---

## The schedule

**Nine annual periods.** Accrual buckets into fixed annual periods. A period's
counts are final once it ends, each period's budget pays for that period alone,
and claims never expire — a closed period's arithmetic is stable forever, so a
consumer reads a number that can no longer move.

**Budgets rise across three groups** — 15% of the reserve over years 1–2, 30%
over years 3–5, 55% over years 6–9, split equally within each group. The
largest share pays on the most-measured evidence: the early network is the
thinnest and most manipulable denominator, and funding an evidence-poor early
network is the DAO treasury's job, not the meter's.

**The pool is fixed.** A wallet that manufactures usage only ever dilutes the
period's pool; it can never inflate it. `RpgfMinter.claim` pays uniform pro
rata from the period's fixed budget, once per wallet per closed period, with no
per-wallet cap.

**Every public deployment runs the real annual schedule** — a testnet is the
full-dress rehearsal for mainnet and rehearses mainnet's real timing. Only
devnet compresses the same nine-period structure to thirty-minute periods, so
that an end-to-end run can cross a period boundary in a single session.

---

## The boundary — the meter earns nothing

`figaro-assembly-provenance` is the one entry on the exclusion list, and the
line it draws is **terms versus meter**.

Commerce and topology are contract *terms* the parties agree to. A runtime that
composes them is making an offer, and mandatory term levies are disciplined by
ordinary competition: a runtime that piles on levy clauses loses its users.
That also answers how many such lines the commons may hold — as many as survive
that competition.

The provenance leaf is not a term anyone agreed to. It is the reward system's
own attribution plumbing, structurally singular, with no competing runtime to
exit to. A levy on it would be the meter charging for reading itself. It
meters; it never earns. Its designers accrue through the assembly leg instead,
so scoring it would double-pay every assembly trade.

The exclusion set is a constructor argument, never a fixed list — read
`excludedClauseOrAssembly(key)` off the deployment being called before
concluding a leg was refused.

---

## What does not exist

Each absence is deliberate, and each is load-bearing.

- **No posting, bonding, challenge, or forum.** Nothing about the reward is
  asserted and then contested; it is counted from chain facts as it happens.
- **No match pool, crowd round, or quadratic funding.** Discretionary,
  human-judged funding is the DAO treasury's, at a different tier.
- **No per-clause multiplier, tag, category, or weight.**
- **No per-wallet cap, and no claim expiry.**
- **No admin, pause, sweep, or upgrade.** A closed period cannot be reopened
  and its arithmetic cannot be revised.
- **No emission tied to resolution.** Florins are not minted per resolved
  process; the reserve is minted only through per-period claims.
