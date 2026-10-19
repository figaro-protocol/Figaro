# Designer Rewards — Design Document

The 600M florins reserved for the designers whose clauses, registered
agreements and assemblies the network actually uses. This document owns the mechanism's reasoning: who earns,
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
clause, a registered agreement or an assembly; it is the designer of record
for as long as it holds a live stake against that entry in the entry's own
registry. An entry is a (kind, key) pair — a clause key under the clause kind
(0), an assembly's `compositionHash` under the assembly kind (1), a registered
agreement's `agreementKey` under the agreement kind (2) — and the meter, the
claim and the check of the designer of record are all keyed by it, so a stake
in one family never earns another family's usage at the same bytes
(`DESIGN_DECISIONS.md` § 24). Clauses, registered agreements and assemblies
earn on the same terms, from the same pool, through the same call — there is no seniority
between them, and no distinction between a designer who registered one clause
and one who registered fifty.

Two things follow that people expect to be otherwise.

**The mandatory clauses earn.** `figaro-commerce` and `figaro-topology` ride on
every order whose designer picked an agreement carrying them in the mandatory
article, the DAO's registration among them, and they are scored for their
designer of record like any other clause. "Mandatory" is a registration-layer
convention about what a designer picks; nothing on chain privileges them, and nothing on chain exempts them.
They are the DAO's because the DAO develops them: a clause every agreement
carries is substrate the commons itself must build, and assigning it to the
treasury aligns the treasury's interest with every trade (`docs/DAO.md`
§ "Its income").

**Registering is the whole of the claim.** First-write-wins: whoever
registers a clause key under their wallet is its designer of record, and the
binding is irreversible. The key is the hash of the spec's pinned bytes, so
what is registered is one exact document, never a name. Competing with a better clause under one's own wallet is
equally permissionless and equally welcome.

---

## The meter is uniform

A clause's, a registered agreement's or an assembly's score in a period is its
**real usage alone**:

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

`UsageCounter` counts a clause's, a registered agreement's or an assembly's
usage at resolution, permissionlessly, from facts the chain already holds: the
order is resolved, and the clause — or the provenance leaf naming the
registered agreement and the assembly, with the agreement's membership proof
under the assembly's root — was merkle-committed in the signed
`agreementHash`.
Anyone may call it; the proof is what is trusted, never the caller. Trade
resolved in a proved batch is counted by the batch's own proof and written by
the verifier alone, with the counter checking the open period, each seller's
live stake, and each entry's live registration in its own registry
(`CONTRACTS.md` § "Usage accounting" owns the two routes). Nothing is posted, bonded, challenged, or adjudicated,
and there is no recurring cost to anyone.

The timing is forced, not chosen. **The chain cannot look backwards** — the
Core never calls the registries, and no contract can read an
event. Reconstructing usage after the fact is what would require the posting,
bonding, challenge, and forum apparatus this mechanism does without. So the
fact is recorded at the moment it occurs, or it is permanently deniable: a
seller can unstake, a period can close, and a late claim is refusable.

Only the clause's data hash reaches calldata, so a private clause's plaintext
never becomes public in the counting.

---

## The two-sided live stake

Both sides of a counted usage must have something at stake, in the base chain's
own currency, at the moment it counts:

- **Seller side** — usage counts only for a seller of record whose members
  registry stake is live. `UsageCounter` gates every count on it, on both
  paths; on the batched path one unstaked seller drops that batch's whole
  accrual until the next batch overwrites it (`DESIGN_DECISIONS.md` owns the
  drop). A seller on both paths enters each path's breadth: the two paths'
  scores are summed, and the same sellers on both count up to 2^(2/3) times
  their pooled score — a bounded bias, at the same live stake per seller.
- **Designer side** — a claim rewards only entries whose registry stake is
  live and registered by the claimant. A claim names `(kind, key)` pairs, and
  `RpgfMinter` verifies each against the one registry its kind names —
  `ClauseRegistry` for the clause kind, `AssemblyRegistry` for the assembly
  kind, `AgreementRegistry` for the agreement kind; a withdrawn stake earns
  nothing further.

This is a **value loop, not a cost.** The stake is reclaimable, and holding it
is exposure to the growth of the network one's own work produces. A designer
who withdraws de-surfaces the entry for new compositions and stops earning on
it, while every order already committed against it still resolves.

What the stake does and does not do against Sybil attacks is stated at its
honest strength in `docs/DATA_LAYER.md`; it is not restated here.

---

## The schedule

**Nine annual periods.** Accrual buckets into fixed annual periods. A period's
counts are final once it ends, each period's budget pays for that period alone,
and claims never expire — a closed period's arithmetic is stable forever, so a
consumer reads a number that cannot move.

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

The meter is the agreement format's reserved provenance leaf, the link from an
order to the registered agreement and the assembly it instantiated
(`CLAUSES.md` § "Every clause is a merkle leaf"). It is no registration: its
key, `keccak256("figaro-agreement-provenance")`, is a constant of the format,
distinct from every clause key under keccak256's second-preimage resistance.
The format holds one more constant, the assembly terms leaf's key,
`keccak256("figaro-assembly-terms")`, a leaf of the assembly's root and never
an agreement. Both are refused at accrual on every kind by comparison with the
constants whatever a registry holds at them: the direct path reverts
(`UsageCounter._accrue`), the guest refuses a batch claim keyed on either
(`apply_usage_claims`), the counter's batch path skips both
(`applyBatchAccrual`), and `AgreementRegistry` refuses either as a
registration. No other key is refused by list. The line they draw is **terms
versus meter**.

Commerce and topology are contract *terms* the parties agree to. A runtime that
composes them is making an offer, and the set of terms a designer picks for
every agreement is disciplined by ordinary competition: an agreement the
mandatory article lists that carries terms designers do not want is not
picked. That also answers how many such
clauses the commons may hold — as many as survive that competition.

The provenance leaf is not a term anyone agreed to. It is the reward system's
own attribution plumbing, structurally singular, with no competing runtime to
exit to. It meters; it never earns. The registered agreement's designer
accrues through the agreement leg, which proves that leaf; the assembly's
designer accrues through the assembly leg, which proves that leaf and the
agreement's membership under the assembly's root; and every registered clause
— commerce and topology among them — earns under the uniform rule. Nothing is
excluded: a registered agreement that carries the mandatory clauses earns for
its own designer of record on the same meter, and the mandatory clauses inside
it earn for theirs.

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
