# The DAO — Design Document

The DAO exists to **bootstrap**: to pay for what the network needs before the
network can pay for it itself, by human judgment, at a tier where human
judgment is appropriate. It is the deliberate counterpart to the uniform meter
that pays designer rewards — that mechanism refuses to judge which
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

## DAO governance is NOT kernel governance

The kernel has no governance and never will — no admin, no owner, and no vote
decides a resolution. Nothing moves a bonded commitment but its buyer.

The DAO governs **its own treasury**: what the 300M is spent on, which public
goods to fund, which programs to stand up, who gets paid for what. That is the
human-judgment layer, and it reaches nothing else. A DAO vote can move the
DAO's tokens; no DAO vote can touch a commitment, a bond, a registry binding,
or a resolution.

Collapsing these two is the error this section exists to prevent. They are
different objects at different tiers, and the prohibition on governance over
kernel resolution says nothing about a body governing its own wallet.

---

## The three ways it can spend

Nothing gates which — these are treasury acts, DAO-decided at any time, with
nothing hardcoded:

1. **Stand up a public-goods program** — fund a grant, a bounty, or a commons
   initiative by ordinary token transfer at its own discretion. There is no
   crowd, donation, or match-round mechanism: the DAO decides and pays.
2. **Pay a third party directly** for services rendered — marketing, design,
   audits, anything — as an ordinary token transfer. No protocol involvement
   and no bond: this is trust-based payment, the same as any organisation
   paying an invoice.
3. **Procure through the protocol as buyer** when the payment should be bonded
   and atomically resolved rather than trusted.

---

## Who holds the treasury

The DAO wallet is a **multisig** — on mainnet a canonical Safe instance,
deployment configuration via `DAO_WALLET`, never code. The concrete
detail (signer set, threshold, and the wallet addresses) is deployment
configuration, disclosed in the deployment record for each network; a network's
is named when that network deploys, not before — never withheld, just not yet
real. *No vault contract exists or is needed* — the arrangement is composed,
not written.

**The DAO meets the ecosystem through ONE account: its operator EOA**, an
externally-owned account carrying an EIP-7702 delegation to
governance-controlled code — the same delegation shape `DESIGN_DECISIONS.md`
§ key-loss documents for any buyer. The delegated code is **MetaMask Delegation
Framework's `EIP7702StatelessDeleGator`** at its canonical CREATE2 address
`0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B` (v1.3.0) — audited,
off-the-shelf, and the same address on every network, so a rehearsal is
literal (`DelegationManager` `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`).
The multisig's authority is an ERC-7710 delegation the operator grants it,
bounded by caveat enforcers and redeemed through the framework's
`DelegationManager` to act from the operator's address.

The treasury contract itself can never sign kernel commitments — the kernel is
ECDSA-only — so the multisig authorises *upstream*: it pays the operator per
procurement, and through the delegated code it can act from the operator's
address for `msg.sender`-authorised calls (resolution, recovery) and bound what
the operator may do, while the operator's own key produces the EIP-712
signatures.

That operator EOA is the DAO's identity in every registry and every trade. It
holds the DAO's member profile — buyer side, and seller side when the DAO sells
(merchandise, tickets, its co-produced data) — and it is the buyer of record
when the DAO procures through the protocol. Its blast radius is bounded by the
delegation and by per-procurement funding. The operator EOA and its delegation
are created BEFORE the DAO's member profile is registered under it
(`RELEASE_READINESS.md` Task 13 owns the ordering); the vault address itself
holds no profile.

Devnet rehearses the shape: `Deploy.s.sol` stands up `MockTreasuryMultisig` (an
anvil-placeholder 2-of-3) as the 300M mint target, and
`test/florin/TreasuryProcurement.t.sol` drives fund → bonded commit → resolve →
sweep-back, asserting the treasury's net spend is exactly the payment.
Threshold-ECDSA — a multisig in cryptography, an EOA on chain — is the recorded
upgrade for the operator's key, rehearsed on a testnet before adoption.

---

## Its income — the levy

**The 300M is a grant; the DAO's LIVING is earned.** What follows states the
design. It carries no projected yield, no break-even model, and no income
forecast, and none should ever be added.

The DAO Safe is designer of record of the two *scoring* mandatory clauses —
`figaro-commerce` and `figaro-topology` — plus any clause donated to it.
Donation is registration: registering a clause key under the Safe,
permissionlessly and irreversibly, first-write-wins. Competing under one's own
wallet is equally welcome.

Every resolved process composes the mandatory clauses, so their usage accrues
to the DAO exactly the way any designer's clauses accrue: **the commons taxing
its own unavoidable usage into the commons pot.** The protocol takes nothing
from a trade, and the levy claims no privileged weight: it rides the same
uniform meter as every other clause. "Mandatory" is a
registration-layer convention; nothing on chain privileges it.

The one thing the levy may not reach is the meter itself: `figaro-assembly-provenance`
meters and never earns. `docs/DESIGNER_REWARDS.md` § "The boundary — the meter
earns nothing" owns that line.

**Countercyclical by construction.** Each period's budget divides pro rata over
every clause and assembly that scored. Where third-party design thrives, the
mandatory clauses' share is automatically diluted — and little DAO funding is
needed, because the ecosystem is flourishing. Where little else emerged, the
mandatory clauses dominate the period's score and the endowment income is large
— exactly the world where the commons still needs the DAO. The sizing is
automatic: no parameter, no vote, no one to lobby.

**Beyond the sunset.** The designer-reward budgets end after the nine periods.
What continues to fund the commons afterwards is the accumulated levy income
plus whatever remains of the 300M — an endowment, not an annuity.

**Alignment is the interest structure, not a spending rule.** DAO discretion is
unrestricted: public goods and private goods both, by the three paths above.
What aligns the DAO with the network is where its income originates — the levy
pays only when the network is used, so the DAO's interest IS network usage. No
spending covenant could add to that, and none exists.

Academic form: `/papers/substrate-broadening-rpgf` §4, "Why the clauses every
order carries earn".

---

## The mortality doctrine

**The DAO's life IS its treasury.** When it runs dry, governance exits to the
community: donations sustain it if the community wants it sustained; otherwise
it dies.

There is no self-perpetuation right — no switch to flip, no levy it can raise,
and no protocol lever reachable by a DAO vote. The kernel-governance boundary
above is absolute, and a body that cannot reach the protocol cannot vote itself
an income from it.
