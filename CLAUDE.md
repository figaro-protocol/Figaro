# Figaro Protocol — CLAUDE.md

## The whole system — there is nothing else (read before everything below)

Repeated to agents dozens of times; each rebuilds silt on it. **This is the entire
system. Measure every proposal, file, and name against it.**

**The kernel (`FigaroCore`) is two mechanisms:** asymmetric bonding at commit, and
buyer dominance with atomic resolution. They make cooperation the Nash equilibrium,
which lets **one buyer bind many sellers into a value-added chain**. *All commerce is
value-added chains* — so the kernel can express ANY chain anyone wants, bounded only by
the network's gas. Nothing more is needed to make trade safe between strangers.

**On top of the kernel there are exactly FIVE things — nothing more, ever:**

1. **Buyer** — the one party who pays and resolves. Any wallet.
2. **Seller** — a value-adder in the chain. Any wallet.
3. **Clause** — defines a relationship: buyer↔seller and seller↔seller. *Topology* (how
   the sellers are ordered in the chain — who comes before whom) is itself expressed as
   a clause.
4. **Assembly** — clauses composed into something anyone can USE and REUSE, anywhere,
   anytime.
5. **Composition with other on-network contracts** (Kleros, Uniswap, …) — what makes the
   network compositional instead of a silo.

It is **open-world**: anyone contributes permissionlessly, and **RPGF** rewards them by
how much their contribution helps the network evolve.

**The frontend exists only to let people DO these five and READ network state.** Every
surface expresses buyer, seller, clause, assembly, or composition — or it is **silt to
delete**. Ask: *which of the five is this?* If "none," stop — but hold the full model
first (below); agents keep mislabeling designed surfaces as silt.

**A bonded commitment is a digital contract:** its **consideration** = the **Nash
equilibrium** from the bonds; its **general T&Cs** = the **clauses**; its **specific
T&Cs** = the **consents** a designer attaches.
Consent is a first-class agreement layer, NOT boilerplate.

**Agents keep mislabeling these as silt — they are DESIGNED IN:** agents are first-class
participants (level field with humans; `/agents` ≠ `/users`); use-case pages
(`/local-commerce`) are *marketing*, their runtime an assembly in `/assemblies`;
`/dispute` is third-party composition (Kleros) over a *process*, not consent. This section IS
the canonical statement of the model — everything below serves it.

## Read this first — the premise that has cost the most

The base-model default you carry in unexamined and that is **wrong here**:

> **"Figaro is a product app."** It is not — it is **protocol infrastructure**, the TCP/IP
> of trade; the frontend is a *protocol surface that composes catalogues*, never a product
> application.

So deep in base training it ships as a role taxonomy or onboarding funnel *before anyone asks
"is this a product?"* — its body count is in git (a V4 product-app frontend excised, ~80K lines).
**The test before any surface is the `clause.block` seam:** a clause's content `fields`
(merkle-committed under `agreementHash`) are the verified protocol; everything in `block` and
the frontend are *replaceable* presentation.
*"Am I building a product feature?"* → *"which side of the seam?"* — a `block`-driven surface is
designed presentation, **not silt**; a hardcoded list or stored taxonomy is drift. Compose from
`lib/`; whole stack → `docs/v5/ARCHITECTURE.md`.

### What open-world looks like — the positive target

Every "do not" here has a positive form; **lead with it** (prohibition-only routes the
base model back to closed-world). The positive rubric — role + surface named, live
chain→IPFS registry not a bundled list, derived-not-stored, any-relationship,
spec-routed-not-name, reads-at-edge (resolved-empty = absence). Full statement:
`docs/v5/OPEN_WORLD.md` §1.

---

This file is the authoritative reference for AI-assisted work in this repo. It
holds the **discipline**; the indexed `docs/v5/` files hold the **lists** (the
inventories, tables, and command catalogues). Keep it that way: when a section
starts accumulating an inventory or a command block, that content belongs in the
owning doc, not here.

**Do not reference any contract or file not listed here or in the indexed
`docs/v5/` files** (full Document Index at the bottom). Primary inventories:

- **`docs/v5/CONTRACTS.md`** — smart-contract inventory: kernel, attestation, clause, mechanism modules, FIG token, mocks, "what does NOT exist".
- **`docs/v5/CLAUSES.md`** — clause validation architecture, the clause table, the adding-a-clause checklist.
- **`docs/v5/FRONTEND.md`** — frontend route catalogue, lib map, designer surface, wallet-provider scope rules.
- **`docs/v5/TESTING.md`** — Foundry / Halmos / Certora / Echidna / TLA+ / Vitest / Playwright harness inventory.
- **`docs/v5/LOCAL_DEV.md`** — commands, env vars, Docker-hosted services, deployment scripts.

---

## Agent Permissions

Agents — human-driven or autonomous — have bounded write scope. These are hard limits, not guidelines.

### Never edit, ever

- **`src/FigaroCore.sol`** — the kernel is frozen. The `.claude/hooks/kernel-warn.sh` hook surfaces this at edit time; do not bypass.
- **`src/CommitmentTypes.sol`** — kernel structs and EIP-712 hashing.
- **Any deployed contract on a chain anyone is using.** First-write-wins binding in `SellerRegistry`, `ClauseRegistry`, and the validator-contract pattern means redeployment is incompatible with prior state. To change behavior, write a *new* contract with a *new* identifier; never mutate the existing one.
- **Reference assemblies** in the runtime that are shared infrastructure. New assemblies go in new files; treat existing reference assemblies as immutable for any agent.

**Nothing is frozen but the kernel** (`FigaroCore.sol`, `CommitmentTypes.sol`). The "deployed contract" bullet is a **live-chain** rule — this repo is **device-only**, redeployed fresh every `devup` with no persistent on-chain state. So contracts, registries, clauses, and clause IDs (`figaro-*`) are **freely edited in place**: to change a clause, **edit its spec in `clauses/` directly** — do NOT bump `version` / mint a `-v2` / "register a new version". (`version` stays a hashed field in the id — structural, not an edit lever.) Do **not** invoke "frozen / registered / for safety" to stop short of finishing an edit or rename. Only the kernel is sacrosanct.

### Edit only what belongs to the user the agent is acting for

The protocol is actor-neutral: any wallet can hold the same role any other wallet can hold. An agent acts for whoever holds its private key — and only for that wallet.

An agent acting for wallet `W` may write:

- W's own off-chain metadata (seller-registry entries, ENS/`did:web` documents, agent service descriptions).
- Assemblies where W is `rootBuyer` or seller-of-record.
- New artifacts W is authoring — new clauses, new assemblies, W's own UI.

An agent may NOT:

- Edit assemblies, attestations, or seller-registry entries belonging to other wallets — even if reading them is fine.
- Modify shared infrastructure (kernel, registries, reference assemblies) under the framing of "fixing it for everyone." That is a maintainer decision, not an agent decision.
- Submit transactions that affect another wallet's bond, attestation, or settlement state without that wallet's signature.

### Where these rules are enforced

- **Path-level rules** (e.g., "never edit `src/FigaroCore.sol`") can be enforced at the Claude Code harness level via `.claude/settings.json` `permissions.deny` entries plus the existing `.claude/hooks/kernel-warn.sh` hook. The harness blocks (or prompts on) the tool call before it reaches the file.
- **Ownership-level rules** (e.g., "do not edit another user's assembly") cannot be enforced by the harness — the harness has no notion of which wallet owns which file. They live in agent prompts, in CLAUDE.md, and in human review at PR/commit time.

See `.claude/skills/figaro-kernel-discipline/SKILL.md` for the kernel-specific anti-patterns; that skill is the canonical source the kernel-reviewer subagent reads.

When in doubt, ask. Cheap question, expensive cleanup.

---

## What Figaro Is

**Figaro is not an app, a firm, or an economic system. It is the TCP/IP of Trade.** A stateless, ownerless protocol defining the smallest unit of a secure handshake: **the Bonded Commitment**. Two parties who have never met transact with mathematical certainty that cooperation is the dominant strategy — no arbitrator, no timeout, no admin backdoor.

**The spine — read it before any architectural reasoning; do not re-derive or duplicate it.** Figaro is one object, the boundary, read four ways: it **HOLDS** (the chain keeps only a fingerprint; agreements, clauses, and proofs live off-chain and are *pinned*, not reconstructed), **COUPLES** (data, identity, compute/agents, and law stay in their native medium and attach through the same boundary), **EMERGES** (a minimal law is silent alone — meaning lives one level up in clauses/assemblies/processes, which the FIG/RPGF token funds), and **ADMITS** (no keeper governs; anyone or anything that can sign and bond participates). The frontend is a **reader of network state, never the custodian in the middle**. Canonical source: `/physics` + `/why` (`frontend/app/(marketing)/{physics,why}/page.tsx`) + the `project_physics_spine` memory.

The kernel runs **two mechanisms that compose, not substitute**, plus one security constraint:

- **Mechanism 1 — Asymmetric bonding.** Buyer locks 2× payment, seller locks 2× cumulative value. Produces the bilateral Nash equilibrium (cooperation weakly dominates defection for both parties; the unique profile surviving iterated elimination of weakly dominated strategies) AND scales the primitive from 2-party to N-party — each seller bonds against cumulative upstream value, forming a mesh of independently secured edges, each carrying its own equilibrium at every depth. 2× is the minimum viable multiplier.
- **Mechanism 2 — Buyer dominance.** Only the buyer can trigger `resolveProcess`; resolution is **atomic** — all orders in the process settle together or not at all. Operates on the already-scaled mesh to enforce inter-seller coordination: a weakest-link subgame reproducing Grameen joint-liability peer enforcement under strictly weaker assumptions (no repeated interaction, no shared community, no exogenous punishment technology).
- **Security constraint — No escape hatches.** Any unilateral exit path weakens the equilibrium (α≥½ breaks weak dominance directly; an unbonded third party J ∉ {B,S} reintroduces discretion). Not a third mechanism — a constraint protecting the two. External legal forums adjudicating under duress / frustration / impossibility are NOT escape hatches: they're constrained by their own institutional bond structures and operate on the commitment as evidentiary input.

The mechanisms are inseparable in practice: bonding alone gives a mesh that still needs N mutual agreements to resolve; buyer-dominance alone gives a resolver with nothing at stake. Together, the bonding ratio creates the mesh and buyer dominance + atomic resolution make it resolvable from a single signature while propagating cooperation pressure through it.

The kernel sees only **linear process chains** — `commit` calls extending a monotonic cumulative-value accumulator (`ProcessState`: `rootBuyer`, `currency`, `cumulativeValue`, `activeOrderCount` — no DAG fields). DAG topology lives in the upper composability layer, reconstructed off-chain by indexers, never in the kernel. Each bonded process is a transaction-scoped institution that dissolves at settlement; every participant is an independent value-adder. What a traditional model calls a "restaurant" is a process of independent contributors — cook, kitchen seller, ingredient sourcer — each bonding and settling independently.

**Three mistakes to avoid:**
1. Do not collapse the two mechanisms to "one mechanism plus rules." Atomic resolution does mechanism-style work — it enforces inter-seller coordination via the weakest-link subgame, not just convenience-of-resolution.
2. Do not credit buyer dominance with scaling. Scaling is asymmetric bonding's work — each seller bonding against cumulative upstream value; buyer dominance enforces coordination on the *already-scaled* mesh.
3. Do not treat no-escape-hatches as a third mechanism. It's a security constraint protecting the equilibrium the two mechanisms induce.

Full game-theoretic derivation → `THEORY.md`. Post-firm economy, Coasean collapse, token denomination → `VISION.md`. The RWA-as-wallet / social-mechanism apparatus → `/papers/self-closing-ledger-periods` §7 (and memory `reference_rwa_as_wallet.md`, `reference_social_mechanism.md`). Immutable evidence is produced by the on-chain composition layer, not the kernel.

### What Figaro Is Not

**Figaro is a coordination protocol. Not DeFi. Not TradFi.** It has no liquidity pools, yield, lending, trading, or financial instruments. It does not replicate or digitize traditional financial infrastructure. It is a primitive for enforcing bilateral agreements — closer to TCP/IP than to a bank or a DEX.

### Common Misframings — Do Not Propose

These each break a specific protocol property:

- **Timeout or recovery path for locked bonds** → breaks buyer dominance (MAD)
- **Admin, owner, or pause function** → breaks no-escape-hatch invariant
- **Yield on locked bonds / bond-lending pools** → breaks asymmetric bonding
- **Governance DAO for disputes** → reintroduces discretionary power
- **"Kill Uber" / platform-tax framing** → defines Figaro by elimination
- **Green-bond fee discounts** → breaks Nash equilibrium ($2x$ ratio)
- **Soulbound reputation score** → reifies platform credential
- **Multi-currency bonding within one process** → breaks the same-unit comparability that makes the 2:1 bond ratio Nash-stable from chain state alone (would need an oracle, DEX, or pre-agreed FX rate — each reintroduces a trusted/discretionary actor). Multi-token vendor UX is achievable through composition: N independent monotoken processes, or a wallet-side swap before commit.

Verify 3× before suggesting any change to kernel invariants. The MAD equilibrium is fragile — any single escape hatch degrades it.

### Why the Name

**Figaro** is the factotum of the city — Rossini's *Il Barbiere di Siviglia* (1816), the "Largo al factotum" aria: running errands, brokering favors, mediating between parties of incommensurable standing, making commerce of the whole household work without owning any of it. The kernel is named for what it does — the coordinator of everything without being the owner of anything. Lineage → `VISION.md` "Appendix: Project Lineage". The metaphor is the thesis, not decoration.

**FIG** is a speech-act identifier, the way ETH, BTC, USDC, and USD are. "Send me 10 FIG" works in speech the way "send me 10 ETH" does — evaluate FIG by speech-register fit, not Fortune-500 brand logic.

When an agent surfaces naming questions or writes user-facing copy: apply these framings. Do not apply Web2 consumer-brand evaluation to a Web3 protocol; do not introduce alternative metaphors (no "the Uber-killer", no "like Stripe but decentralized", no "Web3 e-commerce rails"). The factotum-of-the-network framing is canonical.

### Framing Discipline

Reason from the core property downward: self-enforcing agreements between strangers. The six properties (asymmetric bonding, cumulative upstream bonding, buyer dominance, atomic resolution, immutable evidence, no escape hatches) describe how the mechanism works. Contracts implement properties; UI renders contracts.

Never frame Figaro as "removing the middleman." Figaro is sovereign P2P commerce infrastructure. The platform companies are not being replaced; the architecture makes them structurally unnecessary.

Do not reify topology labels into entities. "Restaurant", "merchant", "supplier" are descriptive labels for participants within an assembly, not firms.

The kernel is ideologically agnostic; the graph is the politics. FigaroCore takes no position on currency, jurisdiction, identity, arbitration, role structure, price-discovery, or contribution metric. A market-liberal graph, a cooperative graph, an Islamic-finance graph, and a mutual-aid graph all use the same kernel. Never take positions on ideology at the kernel layer; never describe Figaro as aligned with any political or economic tradition. Ideology lives at the assembly tier — expressed in the graph composed there. Composition is the **designer's** act; sellers bind that graph and buyers select it — neither composes (open-world lens #1).

### Three-Tier Naming

- **Kernel** = `FigaroCore`. The irreducible settlement primitive.
- **Protocol** = kernel + extension doctrine + public graphs.
- **Runtime** = protocol + semantic layer + builder surfaces + UI.

Use the correct tier. "Add yield to locked bonds" → kernel concern. "Add a new attestation mode" → protocol extension. "Change how roles display" → runtime concern.

### Separation of Concerns — Artifact Families

Each protocol artifact family (clauses → `ClauseRegistry`; sellers → `SellerRegistry`; assemblies → `AssemblyRegistry`) has its own anchor — **parallel, not nested.** (Verified in Solidity: the registries have zero on-chain edges among themselves; assembly→clause and seller→assembly are off-chain.)

**The rule.** Each family gets its own registry/anchor, identity scheme, evolution path, indexer event stream. Do not nest one inside another, even when an existing primitive could host it.

**The test.** Does the proposed reuse make Layer A reference Layer B's existence? Arrows point one way: assemblies use clauses; clauses don't know assemblies exist. If a proposal inverts an arrow, it is wrong, regardless of how much Solidity it saves.

**The temptation to refuse.** "We already have `ClauseRegistry` — can we register this new artifact under it?" Refuse: "avoiding a new contract" / "minimum new surface" is NOT a valid criterion when it costs a layer boundary. Conceptual cleanliness is the protocol-scale optimization, not code reuse.

When in doubt, dispatch `figaro-separation-of-concerns-auditor` BEFORE recommending an anchoring or registry-reuse choice.

### Meaning lives in clauses + topology — never in a flat catch-all field

The recurring, weeks-costly failure is modeling a concern as a stored value when it is **derived** from the graph. The canonical case: **there is no "fulfilment" field and no "delivery" checkbox.**

- **The requested modality is a CLAUSE; fulfilment reality is DERIVED.** `figaro-modalities` commits the buyer's request (consume-onsite/pickup/delivery/virtual) at signing; reality reads from topology + clauses — a second co-equal **buyer↔courier order** carrying `figaro-courier-process` IS delivery; one node = on-site/pickup. No stored fulfilment-status field; no node-spawning checkbox — delivery is a second drawn order.
- **Coordination lives in the process clauses** — `merchant-process` on the merchant order, `courier-process` on the courier order — not in a fulfilment field.
- **Coordination variants are separate assemblies.** seller-assigned / buyer-assigned are distinct assemblies (composed at the assembly level, like proximity), not a stored field. (Dutch-auction pricing abandoned 2026-07-02; pricing is a catalogue concern.)
- **Nodes are co-equal** (kernel star-shape: buyer == rootBuyer on every order). The courier order is not a sub-order *owned* by the merchant; the DAG parent edge is value-topology, not dominance.
- **Clauses are a nestable hierarchy: article → clause → sub-clause → …** Articles = `block.article` in the clause JSON (surfaced by the existing grouping component — do not rebuild it). Sub-clauses are logically placed (e.g. the proximity bands `zone-wifi`/`nearby-ble`/`contact-nfc` nest under `figaro-proximity-policy`; the process clauses have none). **Add sub-clauses to the clause JSON spec, emit the event, and reconstruct the nesting OFF-CHAIN in the drawer (rendered recursively from the spec) — NEVER hardcode the sub-clause tree into the UI.**

Full treatment → memory `feedback_fulfilment_retired_modality_derived`; clause-spec detail → `docs/v5/CLAUSES.md`.

Mechanically enforced: `scripts/lint-no-closed-world-vocab.sh` (pre-commit, lint-staged) fails any commit reintroducing a stored role/archetype/category identifier in code (`roleKind`, `archetypeId`, `clauseCategories`, `documentKind`) and warns on retired `fulfilment` vocabulary until the de-hardcoding migration lands — then the warn list promotes to fail.

**The `w_category` substrate-broadening weight** (the RPGF geo·coordination group boost) is a *category-of-work* incentive for the physical/virtual-flow graph the must-haves can't produce, not author-favoritism — retiring such a weight as "a privileged category breaks neutrality" is the **neutrality ≠ flat-weighting error**. Its implementation was removed with the RPGF prover in the proof-apparatus teardown; the rationale survives in `docs/v5/PUBLIC_GRAPH_MODEL.md`. When rebuilt, the weight keys on the clause group derived as `keccak256(block.article)` (derive, don't store — there is no on-chain group field) — re-home it (and any guard) alongside the rebuilt RPGF distribution.

### Dispute Resolution — Three Layers

1. **MAD via asymmetric bonding** — economic self-enforcement
2. **Buyer dominance → coordination pressure** — multi-party processes self-resolve
3. **Timestamped on-chain attestations** — tamper-proof evidence for off-chain forums

The dispute layer is provider-agnostic; Kleros is one arbitration forum, not the system. Don't couple naming or abstractions to "kleros".

---

## Working With This Codebase

### General Coding Discipline

Adapted from `andrej-karpathy-skills` CLAUDE.md, minus its YAGNI bullets (which contradict the runtime-infrastructure doctrine in `OPEN_WORLD.md`).

**Open every task by reformulating, then asking.** Before the first substantive action on any non-trivial task — code or not — restate the request in your own words to confirm comprehension, and ask any clarifying questions. Wait for confirmation before starting. Reformulation in your own words is the comprehension check; a verbatim echo is not.

**Clarify before coding.** State assumptions explicitly; if uncertain, ask. When a request has multiple interpretations, present them — never pick one silently. If a simpler approach exists, say so; push back when warranted. If something is unclear, stop, name what's confusing, and ask.

**Surgical changes.** Touch only what the request requires. Don't "improve" adjacent code, comments, or formatting; don't refactor what isn't broken; match existing style even where you'd do it differently. If you spot unrelated dead code, mention it — don't delete it. Remove only the imports/variables/functions that your own change orphaned. Every changed line should trace to the request. The one deliberate exception is the documentation-discipline rule below: a code change that makes a whitelisted doc stale must fix that doc in the same session.

**Goal-driven execution.** Convert vague tasks into verifiable success criteria before starting — "fix the bug" becomes "write a failing test that reproduces it, then make it pass". For multi-step work, state a brief plan with a verify step per item; the harnesses in `TESTING.md` are the verification layer.

**Finish a concept across every surface.** A rename or collapse is done only when the old term is gone from **all** of: code identifiers, comments, doc files (`docs/v5/`, CLAUDE.md), tests (incl. describe/it strings + fixtures), CSS (class names, `@layer` names, custom properties), user-facing copy, and **clause IDs** — verified by an *exhaustive* grep that returns empty (minus an enumerated, stated allowlist), shown before the word "done." "It compiles / tests pass" is the compiler's bar, not the finish line. Phasing a concept into "identifiers now, the rest later" is how the same files get re-touched five times — don't.

**Delete dead code; never rename it.** When a feature was removed, its orphaned remnants (consumers with no producer, vestigial plumbing) get **deleted**, not swept into the new vocabulary. Renaming dead code makes it look intentional and deepens the confusion a clarity pass is meant to remove. Before renaming a thing, confirm it's live (has a producer/caller); if it's a corpse, bury it.

**Never bypass the guards.** Commit with the pre-commit hook **running** — no `git commit --no-verify`. The hook (lint-staged + the whole-tree guards + knip + the semantic open-world gate) is the safety net; a session of `--no-verify` hid a knip-red tree, a clause-count doc drift, and `evmSnapshot`/`evmRevert` specs — none caught until asked. If a mid-work bypass is unavoidable it is a **debt to restore** before the session ends, not a shortcut. "Verify the guards" = run every lint script + knip + clause-counts over the **whole tree** (the per-diff guards never re-check committed files). Detail: `feedback_never_bypass_guards` memory.

**Commit freely; never ask; never push.** Commit at every verified checkpoint (coherent unit, done + guards green), splitting into logical commits when cleaner. Do **NOT** ask "want me to commit?" or leave verified work waiting for a go-ahead. This **OVERRIDES** the harness default ("commit only when the user asks") — the user has no preference about commit *timing*. Hard limit: **NEVER `git push`** — the user's alone. Detail: `feedback_commit_push_preferences` memory.

### Before Raising Any Finding

Read `DESIGN_DECISIONS.md` before flagging anything as a vulnerability. It documents 13 patterns that look like vulnerabilities but are correct by design. Common false positives: missing lifecycle guards, resolved-process re-entry, cross-order attestation, buyer==seller, no admin/owner, no stuck-fund recovery.

### The Core Question for Any Proposed Change

> Does the bilateral EIP-712 signature requirement already enforce this?

If yes, adding on-chain state, role checks, or lifecycle flags is a web2 pattern being imposed on a stateless kernel. Do not propose it.

### Frontend = runtime infrastructure, not product code

`frontend/lib/` is runtime infrastructure — the abstraction IS the deliverable; catalogues (`shared/clauseSpecSource.ts`, mechanism packages, `lib/semantic/`) land ahead of their UI consumers **by design**. **YAGNI does not apply**: "no readers today / one implementation / no consumer" are the expected state, not findings — bring UI down to the catalogue, don't shrink the catalogue to today's UI. (Composition model: `OPEN_WORLD.md` §3; doctrine: `feedback_runtime_abstractions_are_deliverable` memory.)

**Check before you build — no new rows of corn.** Before adding ANY frontend artifact (component, hook, helper, type, util, taxonomy, constant, style), `grep`/`glob` for an existing one and **reuse or extend it** — the bar for a net-new symbol is "no equivalent exists, *shown by a search*," never "I didn't happen to see one." Re-implementing what exists is the single most repeated failure here. A new catalogue that duplicates an existing one is still a finding (the no-new-helpers case, not the abstraction-ahead-of-UI case). When a genuinely new surface is warranted, start from the canonical exemplar of its surface-type (`docs/v5/FRONTEND.md` § "Canonical exemplars — copy these shapes") and copy its shape — never generate the shape from scratch.

The `(marketing)`/`(app)` split is wallet-scope, not data-freshness; hardcoded/bundled lists are web2 drift.

### Documentation Discipline

When a code change makes a doc statement stale, fix the doc in the same session. `scripts/lint-claude-md.sh` runs in pre-commit and fails on mechanically-detectable drift: broken backticked paths in `CLAUDE.md`; the env-var set in `docs/v5/LOCAL_DEV.md` vs `frontend/.env.local`; the mock inventory in `docs/v5/CONTRACTS.md`; the deploy-script inventory in `docs/v5/LOCAL_DEV.md`.

**Authoritative docs that must stay in sync** (when code changes, update these):

- `CLAUDE.md` — this file
- `docs/v5/CONTRACTS.md`, `CLAUSES.md`, `FRONTEND.md`, `TESTING.md`, `LOCAL_DEV.md` — the inventories CLAUDE.md indexes
- `sdk/README.md` — SDK entry points
- `docs/v5/VERIFICATION_MAP.md` — invariant → test → formal layer map
- User-facing clause surfaces in `frontend/app/`. The `/clauses` inventory renders from the live `ClauseRegistry` grouped by `block.article`, so a newly registered clause appears automatically. Pages that name clauses in prose still need a manual pass when a new clause lands — `grep -rl "<clauseId>" frontend/app/` finds them.

**`docs/v5/` whitelist (exhaustive).** Files not on this list are deletion candidates at every audit. Do not treat absence-from-whitelist as "ambiguous" — treat it as "delete unless restored by explicit user approval." See the Document Index at the bottom for the categorized list.

**Delete on completion.** When a strategy/plan/audit/punch-list doc's work is closed, **delete the file**. Do not move it to `docs/archive/` (that path is for legacy v4 docs only, not v5 cleanups). Do not mark items done in place. Use git history to retrieve. The same rule that governs the punch-list applies to docs.

**One punch-list; no audit-findings docs.** Open work — engineering tasks, audit findings, punch-list items, papers, research — is tracked in exactly one place: the punch-list at `~/.claude/projects/-Users-adaliana-Figaro/memory/project_punchlist.md` (a TODO list, not a journal — items + their why/how, never a session log). An audit produces punch-list items, not a doc. There are no `AUDIT_FINDINGS_*.md` files and no punch-list docs in `docs/v5/`; closed work is recovered from `git log`. Verification *coverage* (live test counts, harness inventory) lives in `VERIFICATION_MAP.md` / `TESTING.md`; accepted risks and release-gate criteria in `DESIGN_DECISIONS.md` / `RELEASE_READINESS.md`.

**No new top-level docs without destination.** Agents creating new files in `docs/v5/` must either edit a whitelisted doc or get explicit user approval to extend the whitelist — there is no auto-allowed new-file pattern. New strategy/plan/notes files require approval before creation — write them as sections in the relevant whitelisted doc, or as backlog items.

### Paper Authorship Discipline

Every paper (now a `/papers/<slug>` page) must stand on its own. The corpus was derived from a single archive paper, retained in git history, and the derivative-paper artifacts must not survive into the published page. When authoring or revising any paper, audit against all of the following — and surface any drift before declaring the paper done:

- **No companion-paper references.** No "in the companion implementation paper", no "developed in the institutional-economics paper", no `\Cref` to sections in other files. If a claim isn't in this paper, it isn't in this paper. Refer to results by their substance — "the escape-hatch theorem", "the bonding equilibrium", "the verification stack" — not by which paper carries them. The rule applies to every paper in the corpus, including synthesis papers; if synthesis is what a paper does, it must do so by re-stating or naming-by-result, not by punting to other papers.
- **Topic discipline.** A mechanism-design paper contains mechanism design — no Solidity, no DAG, no legal/normative framing, no overlays (interest-bearing bonds, time-varying multipliers, etc.). A kernel-implementation paper doesn't contain economics. An institutional-economics paper doesn't contain Solidity. Match the paper's stated subject and stop there.
- **Process chains are LINEAR at the kernel level.** The kernel sees a sequence of `commit` calls updating a monotonic cumulative-value accumulator. There is no parent-child structure on-chain (`src/FigaroCore.sol:82-89`: `ProcessState` carries `rootBuyer`, `currency`, `cumulativeValue`, `activeOrderCount` — no DAG fields). DAG topology lives at the assembly/topology layer (off-chain agreement, reconstructed by indexers), never in the kernel. Mechanism papers must use **"process chain"**, never "process tree" or "DAG".
- **No "open questions" / "future work" / scope-padding sections.** Papers stand finished. Open questions belong in private notes or in subsequent papers, not as scope-padding in the current one. A "scope exclusion" paragraph is fine when it's a kernel-level exclusion (e.g., single-denomination per process); a "scope note on what we didn't address" is not.
- **No corresponding-author / contact-email footers.** Author name only. No `\thanks{Corresponding author. ...}`, no contact-email footnote, no ORCID block.
- **Attribution consistency.** Citation key ↔ `\bibitem` author label ↔ acknowledgement language must all agree. If the bibitem credits "Solidity Team", the cite key shouldn't be `buterin2016` and the acknowledgement shouldn't credit Vitalik. Pick one attribution and align all three sites.
- **No "actors are legally free" framing in mechanism-design papers.** Actors have agency — that's the mechanism-design assumption. Don't dilute it with legality framing or punt to companion labor-law/institutional-economics papers; either the assumption is in scope (and stated as agency) or it's out of scope (and unstated).

The corpus is web-native (each paper a `/papers/<slug>` page rendered with server-side KaTeX; no LaTeX remains in the repo — the archive origin lives in git history). AI-drafted papers fabricate acknowledgements and citations; every migration needs a **truth pass** (strip acks, verify cites against web/repo), not just a conformance pass. `/papers/asymmetric-bonding` is the canonical example of this audit applied end-to-end.

### Test Layers — Separation of Concerns

One test layer per concern. These boundaries are hard; respect them when writing or auditing any test. Commands → `LOCAL_DEV.md`; full harness inventory → `TESTING.md`.

- Layers: **Foundry** (contract behavior — the only home) · **Vitest** (UI logic / validation / pure-client, no chain or browser) · **Playwright `devnet`** (the e2e suite, and the only one) · **Playwright `mobile`** (responsive / CSS chrome jsdom can't test). Per-layer detail → `TESTING.md`.

**e2e means end-to-end: action → reaction, both in the UI.** A genuine e2e test performs an action *through the UI*; the action travels the full real stack (UI → contract → chain → indexer); the reaction returns and is asserted *in the UI*. Driving a participant via a viem helper breaks the action end; asserting only on-chain events breaks the reaction end — either break and it is not e2e. A Playwright spec that drives contracts via viem and never touches the UI is a contract test misfiled; it belongs in Foundry. A mock-backed test cannot be e2e — the reaction is fabricated. The `mock` Playwright project was retired 2026-05-20; do not recreate it.

---

## Pointers

### Smart Contracts

All contracts live in `src/` (Solidity 0.8.26, Foundry); V3 in `archive-v3/`. No contract belongs to a dapp; every one is a permissionless primitive. The kernel — `FigaroCore.sol` + `CommitmentTypes.sol` — is frozen (see Agent Permissions). Full per-contract surfaces, ABI, the mock inventory, and "what does NOT exist" → `CONTRACTS.md`. **If `CONTRACTS.md` does not list a contract, treat it as not existing in this repo.**

### Clause Validation

A clause's spec ships in two lockstep surfaces: **Layer A** (TypeScript, `@figaro/core/clauses`) — the off-chain spec + content encoders + the well-formedness validator — and **on-chain registration** (`ClauseRegistry.registerClause` — permissionless, first-write-wins, immutable). **There is no on-chain clause-content validation today** — the teardown removed validators/prover/verifier; **DEFERRED, rebuilt pre-launch** (papers/marketing describing them = launch state): the `AttestationCoordinator` merkle-binds each attestation to its signed agreement and content-hashes the evidence — well-formedness is an off-chain SDK + read-time concern. So a never-seen clause is attestable with **zero per-clause on-chain code** — open-world by construction.

16 protocol clauses total: 15 runtime-attestable + 1 agreement-only (`figaro-topology`). The full clause table, the **adding-a-new-clause checklist**, and registration discipline → `CLAUSES.md`. Count source of truth: `ls clauses/*.json | wc -l` (the canonical Layer-A specs / `ClauseRegistry` seed data, at repo-root `clauses/`; nothing bundles a copy — every consumer loads them from ClauseRegistry → IPFS at runtime). Runtime-attestable = files minus the agreement-only clause.

### Frontend

**`frontend/` is the only active frontend.** The V4 frontend was untracked in `a6110c6` (2026-05-24); not present in fresh clones. Always audit live state with `ls "app/(marketing)/" "app/(app)/"` — the directory listing is the source of truth, not prose. Route catalogue, lib map, designer surface, block model, component tree, and wallet-provider scope rules → `FRONTEND.md`.

### Agent SDK

`@figaro/core` — TypeScript SDK for reading, analyzing, and proposing Figaro transactions. Single dependency: `viem ^2.0.0`. ESM; four subpath exports (root, `/agent`, `/extensions`, `/clauses` — the lockstep clause source-of-truth). Full entry-point map + build/test commands → `sdk/README.md`.

**"Agent" = two worlds; pin the referent.** Default = OPERATOR-PRIVATE (`.claude/agents/`, the operator's repo tools; no SDK). The exception: PUBLIC ECOSYSTEM agents (`ecosystem-agents/`) act for a USER's wallet, NEVER the repo — `figaro-operator` (operate a wallet) + `figaro-clause-author`/`figaro-assembly-author`. Full split → `docs/v5/AI_AGENT_COORDINATION.md` + the agent-seam memory.

### Local Development

Commands (Foundry / Halmos / Echidna / TLA+ / Certora / frontend / SDK), environment variables, Docker-hosted services, and deployment scripts → `LOCAL_DEV.md`.

---

## Document Index (`docs/v5/`)

This is the exhaustive whitelist. Files not listed are deletion candidates at every audit.

**Entry points:** `README.md` (V5 doc map, reading path, and archive boundaries).

**Inventories (CLAUDE.md indexes these):** `CONTRACTS.md`, `CLAUSES.md`, `FRONTEND.md`, `TESTING.md`, `LOCAL_DEV.md`.

**Core theory:** `VISION.md` (post-firm economy, Coasean collapse, token denomination), `THEORY.md` (game-theoretic derivation of the six protocol properties).

**Security & verification:** `DESIGN_DECISIONS.md` (13 intentional patterns that look like vulnerabilities — **read before auditing**), `VERIFICATION_MAP.md` (invariant → code → test → formal layer), `RELEASE_READINESS.md` (gate criteria, frozen Solidity surface for external audit), `SCALING_STRATEGY.md` (proof-based scaling — a deferred FUTURE development path; the prototype was removed in the teardown, the design is retained as the baseline).

**Architecture:** `ARCHITECTURE.md` (whole-system stack + the `clause.block` seam), `OPEN_WORLD.md` (open-world paradigm + composition model + semantic layer), `PUBLIC_GRAPH_MODEL.md`, `AI_AGENT_COORDINATION.md`, `LEXICON.md` (canonical-name-per-tier grid; documented half of the lexicon, enforced by `scripts/lint-architecture-lexicon.sh`).

**Protocol-specific:** `FIG_TOKEN.md`, `GHG_PROTOCOL_SPEC.md`.

**Reference:** `BOL_RESEARCH.md` (bill-of-lading research, load-bearing for `DESIGN_DECISIONS.md`), `DESIGN_TOKENS.md` (MUJI theme spec; canonical token reference for Tailwind config and component primitives).
