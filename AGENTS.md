# Figaro Protocol Agent Guide

dissolves at settlement.

## What Figaro Is

**Figaro is not an app, a firm, or an economic system. It is the TCP/IP of Trade.**

It is a stateless, ownerless protocol that defines the smallest possible unit of a secure handshake: **The Bonded Commitment**. Like the internet protocol, it is a fractal—you can use it to build a corporation, a marketplace, or a global treaty. Figaro doesn't care what you build; it only ensures the math of the handshake is unbreakable.

**A Bonded Commitment is a mathematically enforced agreement—cheating always costs more than cooperating.**

Figaro enables self-enforcing agreements between strangers. Two parties who have never met can transact with mathematical certainty that cooperation is the dominant strategy — no arbitrator, no timeout, no admin backdoor.

The mechanism that produces this property is asymmetric bonding: both parties lock collateral on-chain (2× payment each). Only the buyer can trigger resolution. This makes cheating strictly more expensive than cooperating, creating a Nash equilibrium where cooperation is dominant.

Each bonded process is therefore a transaction-scoped institution: a temporary assembly of directly bonded contributors that forms around one process and dissolves at settlement.

Start with [docs/v5/CURRENT_STATE.md](docs/v5/CURRENT_STATE.md) when orienting to the
current codebase and documentation map. Read [docs/v5/VISION.md](docs/v5/VISION.md) for the
full extrapolation and [docs/v5/THEORY.md](docs/v5/THEORY.md) for the game-theoretic
derivation.

## What This Project Is

Figaro-Prototype2 is the canonical runtime for self-enforcing institution
workflows. It owns the protocol kernel, proof-based kernel scaling
(SP1 prover + batch sequencer + on-chain verifier), semantic layer,
builder surfaces, institution assembly work, and shared mechanism-aware
modules that let one runtime render many institution archetypes.

The kernel (`FigaroCore`) is formally verified via TLA+ model checking —
7 safety invariants (token conservation, contract solvency, resolution
always possible, etc.) exhaustively verified across 6M+ states — and
Halmos symbolic testing — 7 bytecode-level proofs (z3 solver) covering
token conservation, bond math, buyer dominance, and cumulative
monotonicity for ALL possible inputs. See `formal/README.md` and
`test/HalmosFigaroCore.t.sol`.

## What This Project Is Not

- not only a smart contract repository
- not displaced by downstream archetypes
- not a platform, marketplace, or service provider
- not defined by what it eliminates

## Documentation Discipline

When any code change makes a documentation statement stale, fix the doc in
the same session. Do not wait to be asked. The authoritative docs:

- `docs/v5/CURRENT_STATE.md` — current reading path, active docs, archive boundaries
- `.github/copilot-instructions.md` — contract inventory, SDK surface, frontend structure, test counts, scripts
- `AGENTS.md` — SDK section, vocabulary, framing rules
- `sdk/README.md` — entry points, examples, test count
- Design docs referenced by the above

If you add a contract, SDK export, subpath, test file, or mechanism module,
update every doc that lists or counts those items.

## Framing Discipline

**Reason from the core property downward**, not from contracts or UI upward.
The property is: self-enforcing agreements between strangers. The six
properties in THEORY.md (asymmetric bonding, progressive collateralization,
buyer dominance, atomic resolution, immutable evidence, no escape hatches)
describe how the mechanism implements this property. Contracts implement
properties; UI renders contracts.

The concrete organizational consequence is not a standing firm with internal
departments. It is a transaction-scoped institution assembled around a bonded
process tree.

**Never** frame Figaro as "removing the middleman" or "replacing platforms."
Figaro is not defined by what it eliminates. It is sovereign P2P commerce
infrastructure — d-commerce from the inside-out. The platform companies are
not being replaced; the architecture makes them structurally unnecessary.

**Do not reify labels into entities.** "Restaurant", "merchant", "supplier"
are role labels within a specific institution assembly, not firms or legal
entities. Every label decomposes into a process tree of independent
value-adders. There are no firms, no employees, no "platforms that take a
cut." What traditional models call a "restaurant" is actually a process tree
of independent contributors — a cook, a kitchen operator, an ingredient
sourcer — each bonding and settling independently.

**Use correct vocabulary.** Say "process tree", not "supply chain." Say
"sovereign coordination", not "disintermediation." Say "value-added
relationships", not "business partnerships." Say "independent value-adder",
not "worker" or "employee."

## Contract Identity Rule

No contract belongs to a dapp. Every Figaro contract is a permissionless
primitive available to any application. The two-repo split (Prototype2 /
Figaro-eats) is organizational (independent CI, cleaner demos), not an
ownership boundary.

Do not classify a contract as "local-commerce-specific" just because it was first
developed alongside the delivery archetype. A Dutch auction module is a
Dutch auction module. A lifecycle coordinator is a lifecycle coordinator.
A proximity verifier is a proximity verifier. Any institution can deploy
any of them.

## Figaro Local Commerce — First Archetype

Figaro Local Commerce was the first institution archetype. It was originally developed
in a separate repo but has been consolidated into this repo as composable
components and templates. The local-commerce assembly is one of five reference
assemblies (local-commerce, equipment-rental, procurement, disclosure-review,
freelance) that demonstrate how the runtime renders different institution
types from the same shared components and mechanism modules. The separate
Figaro-eats repo has been retired and archived.

The `src/eats/` V3 contracts have been archived to `archive-v3/`. The current
mechanism modules (`DutchAuction`, `AttestationCoordinator`, `OperatorRegistry`)
are permissionless primitives in `src/` usable by any institution.

## Five-Graph Model

Figaro institutions produce five distinct semantic graphs. These are
intentionally public coordination infrastructure — the "economic pheromones"
model from THEORY.md.

1. **Process** (protocol-enforced) — orders, bonds, settlement
2. **Manifest / Geo** (institution-declared) — geohashes, routing signals
3. **GHG / Disclosure** (protocol-derived) — schemas, requirements, submissions
4. **Capital** (protocol-enforced) — bond flows, settlement payouts, auction clearing
5. **Cross-Process** (protocol-derived) — template provenance, settlement links

Each graph has its own truth boundary. Do not conflate protocol-enforced
guarantees with institution-declared or off-chain overlays.

## FIG Token

FIG is the protocol's native ERC-20 token. It is a **coordination Schelling
point** — a unit participants converge on by name. It is not governance, not
staking, not required for participation. The bonding equilibrium holds with
any ERC-20; FIG is the one people ask for.

Key properties:
- **Emission is settlement-anchored.** FIG is minted only when orders resolve
  in FigaroCore. Two emission paths: direct-path (100 FIG/order, halving
  every 10M settlements) and batch-path (Euler oscillation: 100 FIG base
  rate with decaying cos modulation, peaks at 150 FIG, troughs at 50 FIG).
  The batch path incentivizes batched settlement via SP1-proved batches.
- **Seller-only.** Only the seller receives emission — they bear the
  asymmetric capital commitment. Excludes buyer to close wash-trading vectors.
- **Immutable.** The emission contract has no owner, no upgrade path. If wrong,
  deploy a new one.
- **Not a security mechanism.** The 98% cooperation rate comes from the
  bonding equilibrium, not from token staking or slashing.

See `FIG_TOKEN.md` for the full design.

## Agent SDK (`sdk/`)

`@figaro/core` is the standalone TypeScript SDK for building on Figaro.
Single dependency: `viem`. Three subpath exports:

| Subpath | Purpose | What's in it |
|---|---|---|
| `@figaro/core` | Protocol primitives | Event parsing, state reconstruction (`ProcessGraph`), EIP-712 commitment building, bond math |
| `@figaro/core/agent` | Agent coordination | `FigaroContext` (sync + watch), `proposeActions` (typed action proposer), `ActionQueue` (HITL + optional approval-context metadata), autonomous tx submission |
| `@figaro/core/extensions` | Mechanism utilities | Dutch auction price curves, attestation/GHG encoding, geohash matching, Kleros evidence envelopes, did:web resolution & verification |

The SDK is signing-agnostic — it builds EIP-712 typed data and the caller
signs however they want (EOA, Safe, MPC, hardware wallet, autonomous agent key).
State is event-sourced from on-chain logs with no subgraph dependency.

166 Vitest tests. Located in `sdk/`. See `sdk/README.md`.

## Vocabulary

- `runtime`: the shared environment for rendering and operating institution workflows
- `institution assembly`: a packaged configuration of roles, mechanisms, policies, and UI surfaces
- `archetype`: a concrete expression of the runtime for a specific operational pattern
- `permissionless primitive`: a deployed contract usable by any application, not scoped to a dapp
- `mechanism module`: a reusable coordination capability layered on top of the core bonding model
- `process tree`: the directed graph of bonded orders composing a multi-party economic process (never "supply chain")
- `independent value-adder`: any participant in a process tree (never "worker", "employee", or "vendor")
- `sovereign coordination`: parties coordinating directly via economic pressure, retaining full control (never "disintermediation")
- `d-commerce`: direct commerce — the structural result of sovereign P2P coordination on the internet
- `agent-native`: designed from the ground up for autonomous agent participation — EIP-712 typed commitments, event-sourced state reconstruction, typed action proposers, HITL/autonomous dual-mode execution, public semantic graphs readable without API keys
- `kernel`: the irreducible settlement core (`FigaroCore`) — 2 external functions, 3 mappings, no owner, no fee, no escape hatches
- `batch sequencer`: off-chain service that collects signed operations, assembles batches, runs the SP1 prover, and submits proofs to the on-chain batch verifier — a coordination convenience, not a trust assumption
- `validity proof`: a cryptographic proof (SP1 STARK/SNARK) that a batch of kernel transitions was executed correctly under V5 rules
- `state root`: deterministic hash of the kernel’s 6-mapping state; on-chain root chain prevents fabricated transitions
- `protocol`: the kernel plus its extension doctrine, attestation layer, schema registry, mechanism modules, and five public graphs
- `runtime`: the protocol plus the semantic derivation layer, institution assembly schema, builder surfaces, and UI

## Three-Tier Naming

Use precise tier names when reasoning about the system:

| Tier | What it is | Example |
|---|---|---|
| **Kernel** | The irreducible settlement primitive (`FigaroCore`). Secures the process graph via asymmetric bonding. No owner, no fee, no escape hatches. | `commit`, `resolveProcess`, monotonic accumulator, single-currency invariant |
| **Protocol** | Kernel + extension doctrine + public graphs. The full coordination system. | Attestation, schema registry, Dutch auction, operator registry, batch verifier, five semantic graphs |
| **Runtime** | Protocol + semantic layer + institution assembly + builder surfaces + UI. The complete operational environment. | Assembly authoring, prototype shell, mechanism modules, role-specific presentation |

Institutions and brands grow on top of the runtime. They can wither or be
replaced without shaking the kernel. The kernel is bedrock; the protocol is
law; the runtime is the shared workshop; institutions are the structures
built on top.

## Common Misframings — What Figaro Is Not

Every new audience — human and AI — defaults to DeFi or web2 mental models.
The following patterns are **structurally incompatible** with the protocol.
Do not propose, implement, or frame Figaro in these terms.

| Misframing | What it breaks | Why it fails |
|---|---|---|
| Yield on locked bonds (Aave/Morpho) | Asymmetric bonding | Reduces effective cost of defection; introduces smart contract risk from the yield protocol into the settlement mechanism. The bond's deterrent power comes from capital being *locked and at risk*, not productive. |
| Bond-lending pools | Skin in the Game | If the bond isn't yours, your loss calculus changes. Reintroduces the employer/worker dynamic the protocol dissolves. External lending wrappers may exist, but they are not protocol concerns. |
| Governance DAO for disputes | No escape hatches | Reintroduces discretionary human power — the exact thing asymmetric bonding was designed to eliminate. Kleros integration exists as an *opt-in external* mechanism (Layer 3 evidence), not a protocol-level governance body. |
| Soulbound reputation score | Token denomination as identity | Reifies a platform-issued credential. Settlement history is already public on the process graph — any agent can compute reliability from on-chain data. Packaging it into a score reintroduces the platform as arbiter of trust. |
| "Platform tax" / "kill Uber" framing | Sovereignty framing | Defines the protocol by what it eliminates, inviting comparison-shopping instead of adoption. The correct frame: sovereign P2P coordination infrastructure that makes platforms structurally unnecessary. |
| Green-bond fee discounts | Nash equilibrium | Any variable in the $2x$ bond ratio not controlled by counterparties weakens the deterrent. GHG integration works by adding carbon offset *orders* to the process tree before resolution — the offset is a bonded commitment, not a discount. |
| JIT token swaps at commitment | Token denomination as signal | Token choice is a coordination signal. Auto-swapping at the router collapses the seller's declared acceptance list — accepting FIG *means something*. External swap routers may exist but weaken the signal. |
| IoT hardware locks | Oracle dependency | Physical actuation from on-chain state requires an oracle to bridge the gap — reintroducing the trusted third party the mechanism eliminates. |
| Star ratings / reputation scores | Token coordination | Star ratings are a firm-era signal. Token denomination replaces them: token velocity (settlement volume) IS reputation; accepted-token list IS identity. |