# Ethics and Responsibility — The Decision to Release

This document records the ethical analysis performed before deploying
FigaroCore to a public network. It is not marketing. It is the permanent
record of what we considered, what we decided, and why.

---

## The Dilemma

FigaroCore is an immutable, ownerless coordination primitive. Once deployed
it cannot be patched, paused, governed, or recalled. If the mechanism works
as designed, its long-term effect is to make the firm — the dominant
organizational form of the past two centuries — structurally unnecessary
for most coordination.

The question is not "does the code have bugs." The question is: **is it
responsible to release infrastructure that, if successful, reorganizes
economic life at civilizational scale?**

---

## What the Protocol Does

Two strangers lock collateral (2× payment each). Cooperation is the dominant
strategy for any rational actor. The buyer resolves; bonds return; payment
flows. No owner, no fee, no admin, no escape hatch.

See [THEORY.md](THEORY.md) for the game-theoretic derivation. See
[VISION.md](VISION.md) for the extrapolation.

---

## Assumptions the Mechanism Makes

These are hardcoded. They cannot be changed post-deployment.

### 1. Rationality

The mechanism assumes participants respond to economic incentives. Defection
costs more than cooperation, so rational actors cooperate. This holds for
the vast majority of transactions.

It does not hold for:

- **Coerced actors** — someone transacting under duress, where another party
  controls the wallet or the decision.
- **Ideologically motivated actors** — someone willing to accept economic
  loss to cause harm. The mechanism makes this expensive but not impossible.
- **Actors who do not understand the mechanism** — someone who commits
  without understanding the 2× lockup.

The mechanism does not claim to protect against irrationality. It claims to
make cooperation the cheapest option for rational participants. That
boundary should be understood by anyone who builds on it.

### 2. Solvency

Participation requires capital to bond. The 2× requirement converts a
behavioral problem ("will they cooperate?") into a solvency problem
("can they deposit?").

This is not an exclusion mechanism. Global financial markets are orders of
magnitude larger than the real economy, and on-chain lending contracts make
bond capital available to any creditworthy participant. The capital exists;
the lending infrastructure routes it. Borrowing to bond still leaves the
capital *at risk* — skin in the game is preserved because the borrower loses
the collateral if they defect, regardless of whether the capital was
borrowed.

### 3. Buyer Dominance

Only the buyer can trigger resolution. This is a resolution *assignment*,
not a power asymmetry. The buyer who refuses to resolve loses their own
bond (2P) — the same magnitude of loss the seller faces (2C, where C = P
for root orders). The Nash equilibrium is symmetric in cost. Buyer
dominance ensures that no seller or subset of sellers can unilaterally
force a resolution, which is what makes multi-party process trees
coordinable.

### 4. All-or-Nothing Resolution

Atomic resolution means the entire process tree settles or none of it does.
This creates the micro-lending circle effect: every seller is accountable
for every other seller. It replaces management hierarchies with economic
pressure. It also means that one bad actor in a tree can cause losses for
all participants — which is the *point*. The coordination pressure to
prevent that outcome is what makes the mechanism work.

---

## Risks That Survive Analysis

### A. Immutability Means Permanence of Assumptions

The 2× ratio, buyer dominance, atomic resolution, and single-currency-per-
process constraints are hardcoded. If any assumption turns out to be subtly
wrong at a scale or in a context that decades or centuries of operation
reveal, the deployed contract cannot be fixed.

**Mitigations:**
- The assumptions are mathematically derived from the payoff matrix, not
  heuristic. The 2× ratio is the minimum sufficient deterrent, proven by
  game-theoretic analysis.
- Migration is always possible: a new kernel can be deployed alongside the
  old one, and protocol-layer tooling can bridge between them. TCP/IP
  evolved through versioning, not through patching existing deployments.
- The runtime and protocol layers (above the kernel) are mutable and can
  adapt to new requirements.

### B. The Protocol Enforces Cooperation, Not Justice

FigaroCore guarantees that the seller receives what was agreed. It does not
guarantee that what was agreed is *fair*. A process tree where a value-adder
accepts a low price is valid if both parties signed the commitment. The
Dutch auction finds the market-clearing price, which in a market with
surplus supply can be low.

**Why this is a design choice, not an oversight:**

Fairness is a social construction, not a mechanism property. The protocol
provides the tools to implement fairness — minimum-price schemas, community-
mandated floor wages as template constraints, exclusion from token
communities that enforce standards — but it does not *impose* fairness.

The firm bundled worker protections with subordination. That bundling was
contingent, not necessary. Insurance is a bonded process. Taxation is a
treasury node in the process tree. Welfare is community redistribution.
Collective bargaining is coordinated template selection. The protections
are not dissolved — they are unbundled and reconstructed as independent,
voluntary, transparent, bonded processes. See the archived discussion in
`docs/archive/plans/PLAN.md` (network-nation analysis) for how public goods
provision, taxation, and redistribution compose from process tree
primitives.

The protocol chooses sovereignty over paternalism. That choice has real
consequences for participants who are vulnerable in markets. Building the
composable protections alongside the primitive is a responsibility of the
ecosystem, not a feature of the kernel.

---

## The 200-Year Extrapolation

The firm is not a standalone structure. It is the load-bearing element of
an entire civilizational architecture. When the firm dissolves into process
trees, everything built on top of, around, and in response to firms loses
its substrate. This extrapolation follows that cascade — not just what
happens to the firm, but what happens to everything that exists because
firms exist.

### What Exists Because Firms Exist

These institutions, professions, and structures exist because the firm is
the default unit of economic organization:

**State infrastructure:** Corporate tax codes (the primary revenue mechanism
of modern states). Corporate law (formation, governance, liability,
dissolution). Employment law (subordination, benefits, termination,
collective bargaining). Antitrust law (preventing monopoly — a firm-era
failure mode). Securities law (regulating equity — ownership shares of a
firm's future earnings). Trade agreements (negotiated between states, on
behalf of their firms). Lobbying and regulatory capture (firms influencing
state policy).

**Financial infrastructure:** Commercial banking (corporate lending, lines
of credit, A/R financing). Trade finance (letters of credit, documentary
collections — banks intermediating between firms). Venture capital and
private equity (funding firms in exchange for equity). Stock markets
(pricing equity = pricing a firm's future earnings). Credit rating agencies
(assessing firm creditworthiness). Audit profession (verifying firm-reported
financials). Accounting standards (A/R, A/P, accrual, GAAP — all assume
the firm as the reporting entity).

**Professional infrastructure:** Management as a profession (coordinating
people within firms — the MBA pipeline). HR (hiring, review, benefits,
termination). Corporate consulting (advising firms on firm problems).
Recruiting (matching people to firms). Commercial real estate (offices,
headquarters, retail — physical space for firms).

**Social infrastructure:** Employer-provided benefits (health insurance in
the US, pensions, retirement matching). Professional credentials
(university-to-employer pipeline; degrees signal employability to firms).
Labor unions (exist as counterweight to firm power). Career identity
("I work at X" as social positioning).

Every one of these loses its primary subject when the firm dissolves into
process trees. Not immediately. Not all at once. But structurally.

### Phase 1: Coexistence (2026–2046)

The protocol coexists with firms. Early adopters are crypto-native
communities, diaspora networks, and archetypes where the value proposition
is immediate (cross-border trade, gig economy, procurement). Firms still
dominate. Regulatory scrutiny finds no entity to regulate — no owner, no
fee, no admin. Regulators regulate participants, not the primitive.

### Phase 2: The Coasean Tipping Point and the Institutional Cascade (2046–2076)

Coase's logic activates: firms exist to reduce transaction costs; when
process-tree coordination falls below the cost of internal management, the
firm loses its economic reason to exist. Coordination-heavy industries
reorganize first. The firm doesn't die dramatically — it hollows out.

The cascade begins:

**The nation-state revenue crisis.** Modern states fund themselves through
taxation of firms (corporate tax) and of employment relationships (income
tax, payroll tax). Both assume the firm as the intermediary that reports,
withholds, and remits. When economic activity is process trees of sovereign
wallets settling directly, the state loses its collection point. This is
not tax evasion — it is the structural disappearance of the entity through
which taxes were collected. On-chain visibility makes *assessment* trivial
(every settlement is public), but *collection* requires new mechanisms —
process-tree template patterns that route a percentage to a jurisdictional
treasury node. The state becomes a service provider competing for template
inclusion, not a sovereign extracting from captive entities.

**Securities transform into token markets.** A stock is a claim on a firm's
future earnings. When the firm dissolves into its process tree, equity
becomes token denomination. The stock market transforms into a token market.
This eliminates: investor relations, quarterly reporting, proxy voting,
activist shareholders, hostile takeovers, corporate boards, and the entire
apparatus of corporate governance. All of that exists to solve the
principal-agent problem between shareholders and management. When there is no
management — because the mechanism coordinates — the principal-agent problem
disappears. Venture capital transforms similarly: funding a startup becomes
funding a token launch, and returns derive from token appreciation as
settlement volume grows.

**Banking disintermediates.** On-chain lending contracts replace corporate
credit. Settlement history replaces credit scores. The protocol itself
replaces trade finance — FigaroCore *is* a bilateral performance bond,
which is what letters of credit were. What remains is relationship banking
for complex, bespoke transactions — and even that faces pressure from AI
agents capable of structuring process trees automatically.

**Law restructures around mechanism design.** Contract law presumes parties
who might disagree about terms after the fact. The mechanism resolves this
by making disagreement irrational before work begins. Corporate law has no
subject. Employment law has no relationship to regulate. What grows:
mechanism design law (are the protocol's assumptions valid?), template
regulation (are community standards enforceable?), and jurisdictional
competition (which legal frameworks attract the most wallet activity?).

**Management as a profession disappears.** Management exists to coordinate
people within firms — to solve the information and incentive problems that
arise when individuals work toward collective goals under bounded trust.
The mechanism solves both: information is public (semantic graphs),
incentives are aligned (bonding). There is no manager in a process tree.
There is a buyer, sellers, and economic pressure. The entire management
consulting industry, the MBA pipeline, HR technology, performance
management — all of it is solving a problem that the mechanism structurally
eliminates.

**Education decouples from employment.** The university degree is primarily
an employment signal — it tells a firm the candidate has been credentialed.
When there are no firms to signal to, the degree loses its signaling
function. What replaces it: settlement history (completed 500 processes in
this domain), template specialization (designed the template that 10,000
process trees use), and token community membership. Education becomes
continuous, on-demand, and directly tied to capability demonstration.

**Commercial real estate restructures.** No offices, no headquarters. The
physical infrastructure of commerce becomes the productive asset itself —
the kitchen, the vehicle, the workshop, the server — individually owned and
directly compensated through process trees.

### Phase 3: Geopolitical Restructuring and AI Coexistence (2076–2126)

**National power loses its substrate.** The US is powerful partly because
the world's largest firms are headquartered there, pay taxes there, employ
people there, and lobby there. China's Belt and Road routes trade through
Chinese-built infrastructure to create dependency relationships with
Chinese firms. The EU's regulatory power (GDPR, DMA) derives from having a
market that firms want to access. When firms dissolve, this power substrate
dissolves with them. A nation cannot capture a process tree. A token
community is not headquartered anywhere. A wallet can participate from any
jurisdiction. National power shifts from *capturing economic entities* to
*attracting economic activity* — Tiebout competition at civilizational
scale.

**War becomes structurally more expensive.** Conquering territory currently
captures the economic entities operating on that territory. When economic
activity is process trees on a public chain, conquering territory
captures physical land. The wallets move. The process trees continue from
different nodes. The economic value escapes the conquest. This does not
prevent war, but it removes one of the historically dominant incentives for
territorial expansion.

**International trade agreements become obsolete.** Trade agreements regulate
commerce between firms in different jurisdictions. When commerce is between
wallets on a public chain, the intermediation that trade agreements
provide — tariff schedules, rules of origin, dispute resolution forums — is
either unnecessary (the mechanism handles settlement) or restructures
around token communities rather than nations.

**AI and humans coexist on the same process trees.** The protocol says "the
mechanism doesn't care who holds the wallet." A human cook and an AI cook
compete on the same infrastructure — both bond, both deliver, both settle.
When the firm exists, AI displaces *employees* — the firm decides whether
to hire a human or deploy an AI. When the firm dissolves, AI and humans
compete on the same open market. Neither is "hired." The displacement is
not a managerial decision — it is a market-clearing outcome.

Over decades this produces a natural stratification: AI handles fungible,
scalable, commodity value-addition (logistics, computation, analysis,
assembly). Humans concentrate on irreducible, meaning-laden value-addition
(creativity, judgment, care, culture, trust in contexts where trust *is*
the product). The token communities that form around human-unique
value-addition — denominated in tokens that carry specific cultural
meaning — are not refuge from AI. They are the economy that AI cannot
replicate.

The same permissionless infrastructure that enables AI participation enables
human reinvention at zero switching cost — register a capability, bond
capital, start settling. No employer to find, no interview, no onboarding.

### Phase 4: Deep Infrastructure (2126–2226)

If the protocol still runs at this scale, FigaroCore has become invisible
infrastructure — like TCP/IP. The firm is historical. Employment is a
choice. Token denomination defines political boundaries. Public goods are
funded through process-tree composition. The semantic graphs are
civilizational memory — 200 years of every economic process, permanently
auditable.

Symmetrical transparency — where everyone can see everything — is a
fundamentally different power dynamic than surveillance, where only the
state can see. The protocol creates the former, not the latter.

The semantic graphs — which can be extended beyond the initial five to any
number of coordination dimensions — become the civilizational coordination
layer. New graphs emerge as communities need them: reputation, provenance,
environmental impact, cultural heritage, knowledge contribution.

### The Transition Risk

The period during which firms are declining but composable protections are
not yet mature is the most dangerous window — perhaps 20–40 years. The old
safety nets (employer-provided health insurance, corporate pensions,
employment-based social security) are eroding; the new ones (insurance as
bonded process, taxation as treasury node, welfare as community
redistribution) are not yet built. This window is where human suffering is
most likely.

This is not an argument against deployment. It is an argument for urgency
in building the composable protections alongside the kernel. The kernel
enables the new world. The templates, schemas, and community patterns
determine whether that world is livable.

### What the Protocol Cannot Control

Even with the fullest possible ecosystem development, the protocol is a
primitive. It enables coordination. What coordinates — and whether that
coordination is wise, kind, sustainable, or just — is determined by the
communities that build on it. The protocol cannot prevent:

- **Race-to-bottom pricing** in fungible markets with surplus supply.
  Template floor-price constraints and community norms mitigate this; the
  kernel does not.
- **Concentrations of token power.** If one wallet accumulates a dominant
  position in a token, it can influence process-tree economics. Token
  velocity (not holdings) as the reputation signal helps — but does not
  eliminate the dynamic.
- **Community fracture.** Token communities that diverge on values can fork.
  This is the Tiebout exit mechanism working correctly, but it can produce
  fragmentation, insularity, and echo chambers. The semantic graphs are
  interoperable across communities — but whether communities *choose* to
  interoperate is a social question, not a technical one.

---

## Why the Answer Is Yes

### 1. The Mechanism Is Deterministic, Not Intelligent

FigaroCore does not make decisions. It does not reason. It does not pursue
goals. It enforces a bonding equilibrium that two parties explicitly agreed
to. The power is in enabling coordination, not in directing it.

### 2. Withholding Does Not Prevent

The game theory is published. The N-party scaling is a natural extension
any mechanism designer can derive. If this primitive is going to exist —
and the math guarantees it will — the question is whether the first
implementation has the right properties. This one does: no owner, no fee,
no escape hatches, no governance capture, formally verified invariants,
transparent operation.

A worse version — one with an admin key, a governance DAO, yield on bonds —
would be genuinely dangerous because those features create capture vectors
that break the equilibrium. The safest version is the most constrained
version. This is it.

### 3. Composability Resolves the Protection Gap

Every protection that firms bundled with subordination can be reconstructed
through composable contracts: insurance as a bonded process, taxation as a
treasury node, welfare as community redistribution, collective bargaining
as coordinated template selection. The reconstruction is better because it
is permissionless, transparent, voluntary, and individually chosen.

### 4. Transparency Is the Safeguard

Every process, bond, attestation, and settlement is permanently public.
Law enforcement does not need warrants. Regulators can monitor in real time.
Communities can analyze patterns. This is the opposite of opacity. And when
the system works well enough that people get the value they create, the
incentive for illicit use decreases structurally.

### 5. The Alternative Is Not the Status Quo

The alternative to releasing a constrained, formally verified, ownerless
primitive is not "no permissionless coordination." It is someone else
building a version with an admin key, a governance token, and escape
hatches. Every one of those features weakens the equilibrium and creates
capture vectors. Withholding this implementation does not prevent the
category — it cedes the design space to worse implementations.

---

## The Responsibility That Remains

Releasing the kernel is the beginning, not the end. The kernel enforces
cooperation. Whether that cooperation is *just* depends on what is built
on top.

Responsibilities of the ecosystem:

1. **Build the composable protections.** Insurance, taxation, welfare,
   minimum-price schemas, community standards — these are process-tree
   patterns, not kernel features. They must be built, documented, and made
   as accessible as the kernel itself.

2. **Acknowledge what the mechanism does not do.** The mechanism does not
   make people honest — it makes honesty the cheapest option. It does not
   ensure fairness — it ensures settlement. It does not protect against
   irrationality — it assumes rationality. These boundaries must be stated
   clearly wherever the protocol is presented.

3. **Revisit this analysis.** This document is dated April 2026. The
   assumptions it records should be tested against reality as the protocol
   operates. If evidence contradicts the analysis, the community should
   revise the analysis — and if necessary, deploy a successor kernel with
   corrected assumptions.

---

*Reviewed and approved for release. April 2026.*
