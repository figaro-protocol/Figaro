# Figaro Protocol — CLAUDE.md

This file is the authoritative reference for AI-assisted work in this repo.
**Do not reference any contract or file not listed here or in the indexed `docs/v5/` files below.**

Indexed inventory files (read these for the full lists; this file holds the discipline):

- **`docs/v5/CONTRACTS.md`** — Smart-contract inventory: kernel, attestation, schema, mechanism modules, FIG token, batch verifier, mocks, "what does NOT exist".
- **`docs/v5/SCHEMAS.md`** — Schema validation architecture in detail (Layer A/B/C), the 18-schema table, third-party schema-deployment discipline.
- **`docs/v5/FRONTEND.md`** — Frontend route catalogue, lib map, designer surface, wallet-provider scope rules.
- **`docs/v5/TESTING.md`** — Foundry / Halmos / Certora / Echidna / TLA+ / Vitest / Playwright / Rust prover harness inventory.

---

## Agent Permissions

Agents — human-driven or autonomous — have bounded write scope. These are hard limits, not guidelines.

### Never edit, ever

- **`src/FigaroCore.sol`** — the kernel is frozen. The `kernel-warn.sh` hook surfaces this at edit time; do not bypass.
- **`src/CommitmentTypes.sol`** — kernel structs and EIP-712 hashing.
- **Any deployed contract on a chain anyone is using.** First-write-wins binding in `OperatorRegistry`, `SchemaRegistry`, and the validator-contract pattern means redeployment is incompatible with prior state. To change behavior, write a *new* contract with a *new* identifier; never mutate the existing one.
- **Existing registered schemas.** Once a `schemaId` is bound to its `ISchemaValidator`, the binding is permanent. To change behavior, register a new schemaId (e.g., `figaro-foo-v1` → `figaro-foo-v2`); never mutate the v1 contract or its Layer A spec in `frontend/lib/shared/schemas/`.
- **Reference assemblies** in the runtime that are shared infrastructure. New assemblies go in new files; treat existing reference assemblies as immutable for any agent.

### Edit only what belongs to the user the agent is acting for

The protocol is actor-neutral: any wallet can hold the same role any other wallet can hold. An agent acts for whoever holds its private key — and only for that wallet.

An agent acting for wallet `W` may write:

- W's own off-chain metadata (operator-registry entries, ENS/`did:web` documents, agent service descriptions).
- Assemblies where W is `rootBuyer` or seller-of-record.
- New artifacts W is authoring — new schemas, new validator contracts, new factotum forks, new frontend pages.

An agent may NOT:

- Edit assemblies, attestations, or operator-registry entries belonging to other wallets — even if reading them is fine.
- Modify shared infrastructure (kernel, registries, reference assemblies) under the framing of "fixing it for everyone." That is a maintainer decision, not an agent decision.
- Submit transactions that affect another wallet's bond, attestation, or settlement state without that wallet's signature.

### Where these rules are enforced

- **Path-level rules** (e.g., "never edit `src/FigaroCore.sol`") can be enforced at the Claude Code harness level via `.claude/settings.json` `permissions.deny` entries plus the existing `kernel-warn.sh` hook. The harness blocks (or prompts on) the tool call before it reaches the file.
- **Ownership-level rules** (e.g., "do not edit another user's assembly") cannot be enforced by the harness — the harness has no notion of which wallet owns which file. They live in agent prompts, in CLAUDE.md, and in human review at PR/commit time.

See `.claude/skills/figaro-kernel-discipline/SKILL.md` for the kernel-specific anti-patterns; that skill is the canonical source the kernel-reviewer subagent reads.

When in doubt, ask. Cheap question, expensive cleanup.

---

## Working With This Codebase

### Before Raising Any Finding

Read `docs/v5/DESIGN_DECISIONS.md` before flagging anything as a vulnerability.
It documents 14 patterns that look like vulnerabilities but are correct by design.
Common false positives: missing lifecycle guards, resolved-process re-entry,
cross-order attestation, buyer==seller, no admin/owner, no stuck-fund recovery.

### The Core Question for Any Proposed Change

> Does the bilateral EIP-712 signature requirement already enforce this?

If yes, adding on-chain state, role checks, or lifecycle flags is a web2 pattern
being imposed on a stateless kernel. Do not propose it.

### What Figaro Is Not

**Figaro is a coordination protocol. Not DeFi. Not TradFi.**

It does not have liquidity pools, yield, lending, trading, or financial instruments.
It does not replicate or digitize traditional financial infrastructure.
It is a primitive for enforcing bilateral agreements — closer to TCP/IP than to a bank or a DEX.

### Common Misframings — Do Not Propose

These each break a specific protocol property:

- **Finalized flag on resolved process** → breaks multi-round composition
- **Timeout or recovery path for locked bonds** → breaks buyer dominance (MAD)
- **Admin, owner, or pause function** → breaks no-escape-hatch invariant
- **Yield on locked bonds / bond-lending pools** → breaks asymmetric bonding
- **Governance DAO for disputes** → reintroduces discretionary power
- **"Kill Uber" / platform-tax framing** → defines Figaro by elimination
- **Green-bond fee discounts** → breaks Nash equilibrium ($2x$ ratio)
- **Soulbound reputation score** → reifies platform credential
- **Multi-currency bonding within one process** → breaks the same-unit comparability that makes the 2:1 bond ratio Nash-stable from chain state alone (would need an oracle, DEX, or pre-agreed FX rate — each reintroduces a trusted/discretionary actor). Multi-token vendor UX is achievable through composition: N independent monotoken processes, or a wallet-side swap before commit.

Verify 3× before suggesting any change to kernel invariants.
The MAD equilibrium is fragile — any single escape hatch degrades it.

### Documentation Discipline

When a code change makes a doc statement stale, fix the doc in the same session.

**Authoritative docs that must stay in sync** (when code changes, update these):

- `CLAUDE.md` — this file
- `docs/v5/CONTRACTS.md`, `docs/v5/SCHEMAS.md`, `docs/v5/FRONTEND.md`, `docs/v5/TESTING.md` — the inventories CLAUDE.md indexes
- `.github/copilot-instructions.md` — same inventory, Copilot framing
- `sdk/README.md` — SDK entry points
- `docs/v5/VERIFICATION_MAP.md` — invariant → test → formal layer map
- User-facing schema surfaces in `frontend/app/`. Use `grep -rl "<schemaId>" frontend/app/` to find every page that needs updating; canonical surfaces include `app/(marketing)/schemas/page.tsx`, `app/(marketing)/integrate/page.tsx`, `app/(marketing)/spec/page.tsx`, `app/(marketing)/local-commerce/page.tsx`. Update when a new schema lands.

**`docs/v5/` whitelist (exhaustive).** Files not on this list are deletion candidates at every audit. Do not treat absence-from-whitelist as "ambiguous" — treat it as "delete unless restored by explicit user approval."

- `README.md`, `CURRENT_STATE.md` — entry points
- `CONTRACTS.md`, `SCHEMAS.md`, `FRONTEND.md`, `TESTING.md` — split-out inventories
- `VISION.md`, `THEORY.md` — core narrative
- `DESIGN_DECISIONS.md`, `AUDIT_REPORT.md`, `VERIFICATION_MAP.md`, `RELEASE_READINESS.md`, `SCALING_STRATEGY.md` — security & verification
- `RUNTIME.md`, `PROTOCOL_EXTENSION_DOCTRINE.md`, `PUBLIC_GRAPH_MODEL.md`, `AI_AGENT_COORDINATION.md` — architecture
- `FIG_TOKEN.md`, `GHG_PROTOCOL_SPEC.md` — protocol-specific
- `BOL_RESEARCH.md` — bill-of-lading research, load-bearing reference for `DESIGN_DECISIONS.md` and `AUDIT_FINDINGS_*.md`
- `TESTNET_READINESS.md` — single-source-of-truth punch list compiled 2026-05-06
- `AUDIT_FINDINGS_<DATE>.md` — dated audit findings (glob; the only auto-allowed new-file pattern)

**Delete on completion.** When a strategy/plan/audit/punch-list doc's work is closed, **delete the file**. Do not move it to `docs/archive/` (that path is for legacy v4 docs only, not v5 cleanups). Do not mark items done in place. Use git history to retrieve. The same rule that governs the backlog (`feedback_delete_done_backlog_items.md`) applies to docs.

**No new top-level docs without destination.** Agents creating new files in `docs/v5/` must either edit a whitelisted doc or get explicit user approval to extend the whitelist. The only auto-allowed new-file pattern is `AUDIT_FINDINGS_<DATE>.md` for dated audit findings, per existing convention. New strategy/plan/notes files require approval before creation — write them as new sections in the relevant whitelisted doc instead.

### Paper Authorship Discipline

Every paper in `paper/` must stand on its own. The corpus was derived from a single archive paper (`paper/archive.figaro3.tex`) and the derivative-paper artifacts must not survive into preprint. When authoring or revising any paper, audit against all of the following — and surface any drift before declaring the paper done:

- **No companion-paper references.** No "in the companion implementation paper", no "developed in the institutional-economics paper", no `\Cref` to sections in other files. If a claim isn't in this paper, it isn't in this paper. Refer to results by their substance — "the escape-hatch theorem", "the bonding equilibrium", "the verification stack" — not by which paper carries them. The rule applies to every paper in the corpus, including synthesis papers; if synthesis is what a paper does, it must do so by re-stating or naming-by-result, not by punting to other papers.
- **Topic discipline.** A mechanism-design paper contains mechanism design — no Solidity, no DAG, no legal/normative framing, no overlays (interest-bearing bonds, time-varying multipliers, etc.). A kernel-implementation paper doesn't contain economics. An institutional-economics paper doesn't contain Solidity. Match the paper's stated subject and stop there.
- **Process chains are LINEAR at the kernel level.** The kernel sees a sequence of `commit` calls updating a monotonic cumulative-value accumulator. There is no parent-child structure on-chain (`src/FigaroCore.sol:82-89`: `ProcessState` carries `rootBuyer`, `currency`, `cumulativeValue`, `activeOrderCount` — no DAG fields). DAG topology lives at the assembly/topology layer (off-chain manifest, reconstructed by indexers), never in the kernel. Mechanism papers must use **"process chain"**, never "process tree" or "DAG". This corrects an earlier framing in this file and elsewhere where "process tree" was used loosely.
- **No "open questions" / "future work" / scope-padding sections.** Papers stand finished. Open questions belong in private notes or in subsequent papers, not as scope-padding in the current one. A "scope exclusion" paragraph is fine when it's a kernel-level exclusion (e.g., single-denomination per process); a "scope note on what we didn't address" is not.
- **No corresponding-author / contact-email footers.** Author name only. No `\thanks{Corresponding author. ...}`, no contact-email footnote, no ORCID block.
- **Attribution consistency.** Citation key ↔ `\bibitem` author label ↔ acknowledgement language must all agree. If the bibitem credits "Solidity Team", the cite key shouldn't be `buterin2016` and the acknowledgement shouldn't credit Vitalik. Pick one attribution and align all three sites.
- **No "actors are legally free" framing in mechanism-design papers.** Actors have agency — that's the mechanism-design assumption. Don't dilute it with legality framing or punt to companion labor-law/institutional-economics papers; either the assumption is in scope (and stated as agency) or it's out of scope (and unstated).

When asked to revise a paper, audit against all eight rules and surface drift. The `paper/figaro-mechanism.tex` revision on 2026-05-05 is the canonical example of this audit applied end-to-end.

### Test Commands

```bash
# Foundry — must use --via-ir (default profile fails on stack depth)
forge test --via-ir

# Halmos symbolic execution (z3 solver) — installer-checked wrapper
./test-halmos.sh
# Prereqs (one-time): brew install z3 && pipx install halmos

# Echidna property-based fuzzing
./test-echidna.sh
# Prereqs (one-time): brew install echidna

# TLA+ model checking (15 invariants across 2 models: FigaroCore + FigToken)
./test-tla.sh
# Prereqs (one-time): Java 11+ and curl tla2tools.jar into formal/ (see script header)

# Certora formal verification (paid cloud service)
./test-certora.sh
# Prereqs (one-time): pip install certora-cli ; export CERTORAKEY=...
# Prelude: runs ./lint-token-ops.sh to gate on certora/token-ops.inventory
# being in sync with every ERC20 transfer call site in src/ — new transfer
# calls without a matching inventory entry fail before any cloud dispatch.

# Frontend
cd frontend && npm run type-check
cd frontend && npx vitest run
cd frontend && npm run test:e2e:mock
```

Full harness inventory (file lists, property names, rule counts) → `docs/v5/TESTING.md`.

---

## What Figaro Is

**Figaro is not an app, a firm, or an economic system. It is the TCP/IP of Trade.**

It is a stateless, ownerless protocol that defines the smallest possible unit of a
secure handshake: **The Bonded Commitment**. Two parties who have never met can
transact with mathematical certainty that cooperation is the dominant strategy —
no arbitrator, no timeout, no admin backdoor.

The kernel runs **two mechanisms** doing distinct work — they compose, they
don't substitute. Match Paper A §2 line 300–311 directly.

**Mechanism 1 — Asymmetric bonding** (buyer locks 2× payment, seller locks
2× cumulative value): produces the bilateral Nash equilibrium (cooperation
weakly dominates defection for both parties; unique profile surviving iterated
elimination of weakly dominated strategies; Paper A Theorem 4.3) AND scales
the bilateral primitive from 2-party to N-party process chains via
**progressive collateralization** (each seller bonds against cumulative
upstream value, creating a mesh of independently secured edges, each edge
carrying its own equilibrium at every depth; Theorem 5.3). The kernel only
sees linear chains — `commit` calls extending a monotonic cumulative-value
accumulator — so the equilibrium analysis is per-edge and never traverses a
DAG. Whatever DAG topology an assembly composes lives in the upper
composability layers, not in the kernel. 2× is the minimum viable multiplier
(Theorem 4.6).

**Mechanism 2 — Buyer dominance** (only the buyer can trigger `resolveProcess`,
and resolution is **atomic** — all orders in the process settle together or
not at all): operates on the already-scaled mesh to enforce inter-seller
coordination, cooperation, and communication. The atomic-resolution rule is
buyer dominance's forcing function: it induces a weakest-link subgame among
sellers (Proposition 5.11, Endogenous Coordination Pressure) — endogenous
peer pressure of magnitude Pᵢ + 2Gᵢ on every co-seller, without explicit
communication or governance. This reproduces Grameen joint-liability
microfinance's peer-enforcement outcome under strictly weaker assumptions
(no repeated interaction, no local information, no exogenous punishment
technology; Proposition 6.1, Assumption Reduction on Cooperation Pressure).

Under the RWA-as-wallet frame this cohort dynamic is a **social mechanism**
in the precise sense: it produces social-coordination behavior (peer pressure,
cohort negotiation, burden-sharing, coverage of struggling counterparts)
endogenously through the bond architecture, with no social-substrate
prerequisites — no repeated interaction, no shared community, no exogenous
punishment technology. Each co-seller is an RWA-as-wallet whose continued
participation in its markets depends on receipts covering the asset's
off-chain operating expenses (the node analogy; full apparatus in
`paper/figaro-accounting.tex` §7 and `~/.claude/projects/-Users-adaliana-Figaro-Prototype2/memory/reference_rwa_as_wallet.md`).
A failed resolution is not an isolated capital loss but a sustainability hit
that propagates into the wallet's ability to keep operating. The weakest-link
result tells you the cohort outcome; the RWA-sustainability frame tells you
why each node in the cohort cares. See
`~/.claude/projects/-Users-adaliana-Figaro-Prototype2/memory/reference_social_mechanism.md`
for the full framing and the papers it applies to.

The mechanisms are inseparable in practice. Bonding alone gives a mesh of
independently bonded edges — multi-party coordination would still require N
mutual agreements at resolution. Buyer-dominance alone gives a single party
who can resolve whatever they want — without bonding it's worthless. Together:
the bonding ratio creates the mesh; buyer dominance + atomic resolution make
the mesh resolvable from a single signature AND propagate cooperation pressure
through it.

Plus one security constraint:
- **No escape hatches** — any unilateral exit path weakens the Nash
  equilibrium (Theorem 4.7). Either α≥½ breaks weak dominance directly
  (timeout case), or the exit requires a third party J ∉ {B, S} whose
  incentives aren't bond-constrained (arbitrator / governance vote — unbonded
  actor). External legal forums adjudicating under duress / frustration /
  impossibility are NOT this kind of escape hatch (Remark 4.8): they're
  constrained by their own institutional bond structures and operate on the
  bonded commitment as evidentiary input.

Immutable evidence is produced by the on-chain composition layer, not the kernel.

**Common mistakes to avoid:**
1. Do not collapse the two mechanisms to "one mechanism plus rules." Buyer
   dominance with atomic resolution does mechanism-style work — it enforces
   inter-seller coordination via the weakest-link subgame, not just
   convenience-of-resolution. (Earlier framings called buyer dominance "just
   a rule that operates on the already-scaled mesh"; that under-states what
   it does.)
2. Do not say buyer dominance + atomic resolution "scale the mechanism from
   two parties to N." Scaling is asymmetric bonding's work via progressive
   collateralization. Buyer dominance enforces coordination on the
   already-scaled mesh.
3. Do not treat the no-escape-hatches property as a third mechanism. It's a
   security constraint protecting the equilibrium induced by the two
   mechanisms.

Every participant is an independent value-adder. What traditional models call a
"restaurant" is a process composed of independent contributors — a cook, a kitchen
operator, an ingredient sourcer — each bonding and settling independently. The
assembly that composes them may form any topology its designer chooses (the upper
composability layer is where DAG shape lives); the kernel sees only the linear
chains of `commit` calls that result.
Each bonded process is a transaction-scoped institution that dissolves at settlement.

Read `docs/v5/VISION.md` for the full extrapolation.
Read `docs/v5/THEORY.md` for the game-theoretic derivation.

### Why the Name

**Figaro** is the factotum of the city. In Rossini's *Il Barbiere di
Siviglia* (1816, libretto by Sterbini, drawn from Beaumarchais's *Le
Barbier de Séville*, 1775), the character declares himself the city's
factotum in the famous "Largo al factotum" aria — running errands,
brokering favors, mediating between parties of incommensurable standing,
making commerce of the whole household work without owning any of it. The
kernel is named for what it does: the factotum of the network, the
coordinator of everything without being the owner of anything. FigaroCore
holds collateral, executes commitments, and discharges resolution —
exactly the coordination function the character performs, at protocol
scale. The naming dates to Figaro-Original (Genovese & Daliana, March
2022); the project's intellectual lineage is sketched briefly in
`docs/v5/VISION.md` "Appendix: Project Lineage". The metaphor
is the thesis, not decoration.

**FIG** is a speech-act identifier, the way ETH, BTC, USDC, and USD are. It
is not a consumer brand name that has to semantically signal infrastructure;
it is the name by which the token gets invoked in transactions and
conversations. "Send me 10 FIG" works in speech the way "send me 10 ETH"
does. Evaluate FIG by whether it fits the speech register, not by
Fortune-500 brand logic.

When an agent surfaces naming questions, proposes renames, or writes
user-facing copy about the protocol, apply these framings. Do not apply Web2
consumer-brand evaluation to Web3 protocol names or token tickers. Do not
introduce alternative metaphors for the protocol's name (no "the Uber-killer",
no "like Stripe but decentralized", no "Web3 e-commerce rails"). The
factotum-of-the-network framing is canonical.

### Framing Discipline

Reason from the core property downward: self-enforcing agreements between strangers.
The six properties (asymmetric bonding, progressive collateralization, buyer dominance,
atomic resolution, immutable evidence, no escape hatches) describe how the mechanism
works. Contracts implement properties; UI renders contracts.

Never frame Figaro as "removing the middleman." Figaro is sovereign P2P commerce
infrastructure. The platform companies are not being replaced; the architecture makes
them structurally unnecessary.

Do not reify role labels into entities. "Restaurant", "merchant", "supplier" are
roles within an assembly, not firms.

The kernel is ideologically agnostic; the graph is the politics. FigaroCore takes
no position on currency, jurisdiction, identity, arbitration, role structure,
price-discovery, or contribution metric. A market-liberal graph, a cooperative
graph, an Islamic-finance graph, and a mutual-aid graph all use the same kernel.
Never take positions on ideology at the kernel layer; never describe Figaro as
aligned with any political or economic tradition. Ideology lives at the assembly
tier where participants express it in the graph they compose.

### Three-Tier Naming

- **Kernel** = `FigaroCore`. The irreducible settlement primitive.
- **Protocol** = kernel + extension doctrine + public graphs.
- **Runtime** = protocol + semantic layer + builder surfaces + UI.

Use the correct tier. "Add yield to locked bonds" → kernel concern.
"Add a new attestation mode" → protocol extension.
"Change how roles display" → runtime concern.

### Dispute Resolution — Three Layers

1. **MAD via asymmetric bonding** — economic self-enforcement
2. **Buyer dominance → coordination pressure** — multi-party processes self-resolve
3. **Timestamped on-chain attestations** — tamper-proof evidence for off-chain forums

---

## Smart Contracts — Pointer

All contracts live in `src/`. Solidity 0.8.26, Foundry. V3 in `archive-v3/`. No contract belongs to a dapp; every one is a permissionless primitive.

High-level inventory (full per-contract surfaces, function lists, ABI changes, and "what does NOT exist" → `docs/v5/CONTRACTS.md`):

- **Kernel (frozen):** `FigaroCore.sol`, `CommitmentTypes.sol`.
- **Attestation & schema:** `AttestationCoordinator.sol`, `SchemaRegistry.sol`, `SchemaRegistrationHelper.sol`, `ISchemaValidator.sol`, `IRoleResolver.sol`, 17 per-schema validators in `src/schemaValidators/`.
- **Mechanism modules:** `DutchAuction.sol`, `OperatorRegistry.sol`.
- **FIG token (`src/fig/`):** `FigToken.sol`, `StagedMerkleAirdrop.sol`, `IFigMinter.sol`. 1B fixed supply: 100M founders + 300M DAO genesis-minted, 600M staged airdrop (yr 2/5/9). FIG is not a governance token; `FigaroBatchVerifier` is not a minter.
- **Batch verification:** `FigaroBatchVerifier.sol`, `interfaces/ISP1Verifier.sol`, `mocks/MockSP1Verifier.sol`.
- **Mocks:** `mocks/MockERC20.sol`, `MockERC20FeeOnTransfer.sol`, `MockPermitToken.sol`; `echidna/EchidnaFuzzer.sol`, `EchidnaToken.sol`.

If `docs/v5/CONTRACTS.md` does not list a contract, treat it as not existing in this repo.

---

## Schema Validation — Summary

Three layers must ship together for any new schema:

- **Layer A** (TypeScript, `@figaro/core/schemas`): `parseSchemaSpec`, `validateContent`, per-schema content encoders. Frontend consumes via `useSchemaValidator(schemaId)` + `schemaSpecSource.ts`.
- **Layer B** (Rust SP1 prover): pending; will mirror Layer A byte-for-byte.
- **Layer C** (Solidity): per-schema `ISchemaValidator` contracts in `src/schemaValidators/`, bound through `AttestationCoordinator.setValidator(schemaId, validator)`. **Permissionless, first-write-wins, immutable.** No validator → no attestation under that schemaId (`ValidatorNotSet`).

There are 18 protocol schemas total: 17 runtime-attestable (each with a validator contract) + `figaro-topology-v1`, which is a manifest-only clause (no validator, DAG reconstructed off-chain by indexers from the signed manifest). Full table → `docs/v5/SCHEMAS.md`.

### Adding a new schema — checklist

1. JSON spec in `sdk/src/schemas/examples/<schema>.json`.
2. Mirror in `frontend/lib/shared/schemas/<schema>.json` (preloaded by `schemaSpecSource`).
3. SDK content encoder in `sdk/src/schemas/encode.ts` + export from `index.ts`.
4. SDK examples test in `sdk/tests/schemas/examples.test.ts`.
5. Solidity `Foo<Schema>V1Validator.sol` in `src/schemaValidators/`. Validate function MUST be declared `external pure override` (no external state reads, no `block.*`/`tx.*`, no external calls). Use `bytes32 public constant override schemaId = keccak256("...")` so the schemaId is a compile-time literal — `immutable` constructor-set schemaIds force the override to `view` and forfeit the EVM-enforced determinism guarantee. See `ISchemaValidator` NatSpec for the rationale.

   **When to add a per-role process schema vs not** (kernel-participant vs off-chain-operator principle): a role needs its own process schema if and only if its state transitions are off-chain. Off-chain operators (merchants, couriers, locker operators, etc.) need a process schema because their state transitions happen in physical reality and need a sovereign event log to be tamper-proof evidence. Kernel-participant roles — most importantly the **buyer**, who acts via `commit` and `resolveProcess` — do NOT need a process schema; their evidence IS the kernel event log itself. `merchant-process` and `courier-process` are sovereign-log primitives in this sense. Don't add `figaro-buyer-process-v1` — it would duplicate kernel events. Do add a process schema for any new off-chain operator role whose internal events need to be on-chain attestable.
6. Foundry test in `test/schemaValidators/`.
7. Rust mirror in the SP1 prover (Layer B; deferred).
8. List the schema + one-line summary on `/builders` "Schema validators in force".
9. `setValidator(schemaId, validator)` call added to `script/Deploy.s.sol` and `script/DeployMainnet.s.sol`; regression covered by `test/DeployScriptTest.t.sol`. (Bootstrap-time atomicity: deploy scripts inline both writes within a single broadcast transaction. Post-deploy third-party schemas MUST use `SchemaRegistrationHelper.registerSchemaAndValidator(...)` — atomic register+bind is required, see `docs/v5/SCHEMAS.md` for the front-running rationale.)

If any step is skipped the validator gate either rejects all attestations under that schemaId
(missing on-chain validator) or silently accepts content the spec would have rejected (Layer A
gap). Maintain lockstep.

---

## Frontend — Pointer

**`frontend/` is the only active frontend.** The prior frontend was archived to `archive-frontend/` on 2026-04-26 — do not edit it.

Route catalogue, lib map, designer surface, block model, component tree, and wallet-provider scope rules → `docs/v5/FRONTEND.md`.

Always audit live state by `ls app/(marketing)/ app/(app)/`; the directory listing is the source of truth, not any prose.

---

## Agent SDK — Pointer

`@figaro/core` — TypeScript SDK for reading, analyzing, and proposing Figaro transactions. Single dependency: `viem ^2.0.0`. ESM, four subpath exports: `@figaro/core` (root: ABIs, events, state reconstruction, commitment/bond utilities, merkle airdrop builder), `@figaro/core/agent` (HITL action queue + autonomous tx), `@figaro/core/extensions` (Dutch auction price, GHG/geo/handoff utilities, DID:web), `@figaro/core/schemas` (the lockstep source-of-truth for schema spec + validation + content encoders).

Full entry-point map → `sdk/README.md`. SDK test/build commands:

```bash
cd sdk && npm test
cd sdk && npm run build   # tsc → dist/
cd sdk && npm run lint    # tsc --noEmit
```

---

## Local Development

### Environment Variables (`.env.local` in `frontend/`)

```
NEXT_PUBLIC_FIGARO_CORE=0x...
NEXT_PUBLIC_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_ATTESTATION_COORDINATOR=0x...
NEXT_PUBLIC_SCHEMA_REGISTRY=0x...
NEXT_PUBLIC_OPERATOR_REGISTRY=0x...
NEXT_PUBLIC_DUTCH_AUCTION=0x...
NEXT_PUBLIC_FIG_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_STAGED_AIRDROP=0x...
NEXT_PUBLIC_BATCH_VERIFIER=0x...
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
# Optional: Kleros, IPFS, sequencer
```

### Scripts

```bash
./deploy-local.sh                          # Deploy to local Anvil

cd frontend && npm run dev                # Dev server

forge test --via-ir                        # --via-ir required

FOUNDRY_PROFILE=halmos halmos \
  --contract HalmosFigaroCore \
  --solver-timeout-assertion 5m --solver z3

cd frontend && npx vitest run
cd frontend && npx playwright test --project=mock
cd frontend && npx playwright test --project=devnet

cd sdk && npm test
cd prover && cargo test -p figaro-kernel
cd prover && cargo test -p figaro-sequencer
```

### Deployment Scripts

- `script/Deploy.s.sol` — devnet (Anvil), uses mock verifier and mock tokens
- `script/DeployMainnet.s.sol` — mainnet, no mocks; reads all sensitive params from env
- `script/MintTokens.s.sol` — utility: mint test tokens to existing devnet accounts

---

## Design & Audit Docs (`docs/v5/`)

Full inventories indexed by this file:
- `CONTRACTS.md`, `SCHEMAS.md`, `FRONTEND.md`, `TESTING.md` (the four split out of CLAUDE.md).

Core theory:
- `VISION.md` — Post-firm economy, Coasean collapse, token denomination
- `THEORY.md` — Game-theoretic derivation of the six protocol properties
- `CURRENT_STATE.md` — Active reading path and archive boundaries

Security & verification:
- `DESIGN_DECISIONS.md` — 14 intentional patterns that look like vulnerabilities **(read before auditing)**
- `AUDIT_REPORT.md` — Combined audit history (4 AI audit passes) + web2/UI subsidiary audits + accepted risks
- `VERIFICATION_MAP.md` — Every invariant → code → test → formal layer
- `RELEASE_READINESS.md` — Gate criteria, hardening completion record, frozen Solidity surface declaration for external audit
- `SCALING_STRATEGY.md` — Proof-based scaling, batch sequencer architecture, sequencer trust model (consolidated)

Architecture:
- `RUNTIME.md` — runtime thesis, frontend composition model, semantic-derivation layer
- `PROTOCOL_EXTENSION_DOCTRINE.md`, `PUBLIC_GRAPH_MODEL.md`, `AI_AGENT_COORDINATION.md`
- `FIG_TOKEN.md`, `GHG_PROTOCOL_SPEC.md`
