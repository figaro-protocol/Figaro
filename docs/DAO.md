# The DAO — Design Document

The DAO exists to **bootstrap**: to pay for what the network needs before the
network can pay for it itself, by human judgment, at a tier where human
judgment is appropriate. It is the deliberate counterpart to the uniform meter
that mints designer rewards — that mechanism refuses to judge which
contributions matter more than their use, and this body does nothing else.

This document owns what the DAO is for, how it acts, how it earns, and how it
ends. Its 300M florins are one row of the allocation table in
`docs/FLORIN_TOKEN.md`; the meter its income rides on is `docs/DESIGNER_REWARDS.md`.

---

## The 300M is a grant, not an income

The DAO's allocation is a one-time treasury grant, minted to the DAO wallet at
genesis with no vesting and no unlock. It is not a stream, not a share of
anything, and not replenished by the protocol. What the DAO earns after
genesis, it earns the same way any designer does — see "Its income" below.

Do not conflate the grant with the 600M reserved for designer rewards. They are
different objects at different tiers with different mechanisms: the grant is
held and spent by human decision; the reserve is minted lazily by per-period
usage claims and no one decides who receives it.

---

## DAO governance is NOT Core governance

The Core has no governance and never will — no admin and no vote
decides a resolution. Nothing moves a bonded commitment but its buyer.

The DAO governs **its own treasury**: what the 300M is spent on, which public
goods to fund, which programs to stand up, who gets paid for what. That is the
human-judgment layer, and it reaches nothing else. A DAO vote can move the
DAO's tokens; no DAO vote can touch a commitment, a bond, a registry binding,
or a resolution.

Collapsing these two is the error this section exists to prevent. They are
different objects at different tiers, and the prohibition on governance over
resolution in the Core says nothing about a body governing its own wallet.

---

## The three ways it can spend

Nothing gates which — these are treasury acts, DAO-decided at any time, with
nothing hardcoded:

1. **Stand up a public-goods program** — fund a grant, a bounty, or a commons
   initiative by ordinary token transfer at its own discretion. There is no
   crowd, donation, or match-round mechanism: the DAO decides and pays.
2. **Pay a third party directly** for services rendered — marketing, design,
   audits, anything — as an ordinary token transfer. No protocol involvement
   and no bond: this is trust-based payment, the same as any organization
   paying an invoice.
3. **Procure through the protocol as buyer** when the payment should be bonded
   and atomically resolved rather than trusted.

---

## Who holds the treasury

The treasury is held by a multisig wallet: a treasury decision is its signers'
act under the wallet's threshold, the signer set changes only by the signers'
own act, and no florin carries a vote (`FLORIN_TOKEN.md` § "What the token is
not"). No vault contract exists or is needed; the arrangement is composed, not
written, and it reaches no bond, no commitment, no registry binding and no
resolution (§ "DAO governance is NOT Core governance").

The DAO meets the ecosystem through one operator account, which holds the DAO's
member profile and is its buyer of record when it procures through the protocol
and its seller of record when it sells. The treasury funds that account per
procurement, so what the operator can spend is bounded by what the treasury
hands it for one trade. The operator account is created, and the treasury's
authority over it granted, before the DAO's member profile is registered under
it; the treasury wallet itself holds no profile.

The concrete form of all this (the multisig's signer set and threshold, the
code the operator account carries, the addresses) is deployment configuration,
recorded for each network when that network deploys and changed as the DAO
sees fit; it is never design, and this document states none of it. The release
gate owns the procedure that stands it up (`RELEASE_READINESS.md` Task 9).

---

## Its income — designer rewards on the clauses it holds

**The 300M is a grant; the DAO's LIVING is earned.** What follows states the
design. It carries no projected yield, no break-even model, and no income
forecast, and none should ever be added.

The DAO's treasury wallet is designer of record of the two *scoring* mandatory clauses,
`figaro-commerce` and `figaro-topology`, and of every mandatory clause it develops
and registers after them. It holds each as a registration by clause key —
`keccak256` of that spec's pinned bytes — so what it holds is the exact
documents, never their names. That assignment is the DAO's incentive: an
agreement is not an agreement without commerce and topology, so the designer's
canvas writes the DAO's live mandatory clauses into every agreement it
registers, before the designer composes anything, and the treasury that
developed them is rewarded, on the uniform meter, each time a trade under that
design resolves. The canvas reads them from `ClauseRegistry` by registrant and
stake: the DAO wallet's live registrations whose spec declares the mandatory
article, all of them, one per shape (`mandatoryClauses`, `sdk/src/projection.ts`).
The treasury spends on development, marketing and clauses by judgment, and
developing mandatory clauses for the community is one of those uses. Nothing is
donated to the DAO but tokens, in any denomination: a clause registered by
another wallet is that wallet's, and a mandatory-article registration by any
other wallet is an ordinary clause, never mandatory.

The convention is the registration layer's and this frontend's: nothing on
chain requires the clauses or privileges the DAO's registrations
(`DESIGNER_REWARDS.md` § "The mandatory clauses earn"), and another frontend
may read the registry otherwise. Their usage accrues to the DAO exactly the way
any designer's clauses accrue: **the commons is rewarded, from the reserve, for
the use of what those trades carry.** The protocol takes nothing from a trade,
and the DAO's registrations ride the same uniform meter as every other clause.
A registered agreement that carries them earns under the agreement kind for its
own designer of record, beside them; nothing is excluded.

The one thing the DAO's reward may not reach is the meter itself: the
agreement format's reserved provenance leaf is no clause, and the counter
refuses its key, and the assembly terms leaf's, by comparison with the
format's constants, so it meters without earning. `docs/DESIGNER_REWARDS.md` § "The boundary — the meter
earns nothing" owns that line.

**Countercyclical by construction.** Each period's budget divides pro rata over
every clause, registered agreement and assembly that scored. Where third-party design thrives, the
mandatory clauses' share is automatically diluted — and little DAO funding is
needed, because the ecosystem is flourishing. Where little else emerged, the
mandatory clauses dominate the period's score and the endowment income is large
— exactly the world where the commons still needs the DAO. The sizing is
automatic: no parameter, no vote, no one to lobby.

**Beyond the sunset.** The designer-reward budgets end after the nine periods.
What continues to fund the commons afterwards is the designer rewards it
accumulated plus whatever remains of the 300M — an endowment, not an annuity.

**Alignment is the interest structure, not a spending rule.** DAO discretion is
unrestricted: public goods and private goods both, by the three paths above.
What aligns the DAO with the network is where its income originates — the
reward accrues only when the network is used, so the DAO's interest IS network usage. No
spending covenant could add to that, and none exists. Each act is judgment, case
by case — the meter that pays by measured activity belongs to the
designer-rewards tier, never to the treasury.

Academic form: `/papers/substrate-broadening-rpgf` §4, "Why the clauses every
order carries earn".

---

## The mortality doctrine

**The DAO's life IS its treasury.** When it runs dry, governance exits to the
community: donations sustain it if the community wants it sustained; otherwise
it dies.

There is no self-perpetuation right — no switch to flip, no charge it can raise,
and no protocol lever reachable by a DAO vote. The Core-governance boundary
above is absolute, and a body that cannot reach the protocol cannot vote itself
an income from it.
