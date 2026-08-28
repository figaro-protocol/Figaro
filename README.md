# Figaro Protocol

**Figaro is not an app, a firm, or an economic system. It is the protocol that makes one sentence mathematically true: my word is my bond.**

Every trade is a contract, and between strangers the element that fails is
consideration — promising value is easy; nothing makes delivering it credible.
**Figaro completes the contract**: it fixes consideration with mechanism
design. The unit is the **Bonded Commitment** — a mathematically enforced
agreement in which cheating always costs more than cooperating. The buyer
locks twice the payment; each seller locks twice the cumulative value at their
link in the chain; only the buyer can close, and every order in the deal
settles together or not at all. The deal enforces itself. No arbitrator. No
admin. No timeouts.

It is a stateless, ownerless protocol — a runtime for composing self-enforcing
agreements between strangers into transaction-scoped institutions. Like the
internet protocol, it is a fractal — you can use it to build a corporation, a
marketplace, or a global treaty. Figaro doesn't care what you build; it only
ensures the math of the handshake is unbreakable. The organizational
consequence: each process assembles a temporary institution of directly bonded
contributors — independent value-adders who bond and settle independently —
then dissolves at settlement.

**Status:** contracts complete; their *safety* properties — conservation,
solvency, non-negativity, accumulator integrity, atomic resolution — are
machine-checked by the authoring project (Foundry, Halmos, Certora, Echidna,
TLA+). The equilibrium result itself is an analytic proof
([docs/THEORY.md](docs/THEORY.md) § "Nash Equilibrium Analysis") that is ALSO
machine-checked, in the one tool that can express a rational agent choosing:
a Lean 4 proof ([formal/lean/](formal/lean/FigaroEquilibrium.lean) —
dependency-free, `sorry`-free, constructive: `propext` + `Quot.sound` only)
of the best-response inequalities and the N-party chain equilibrium, over the
same payoff table the TLA⁺ invariants pin to the shipped kernel. A model
checker explores reachable states and has no notion of choice; the models
check that the payoffs the proof reasons over are exactly the payoffs the
kernel produces, and Lean checks the choosing.
No external audit yet. The SDK is published: `npm install @figaro-protocol/sdk`
— with an npm provenance attestation binding every tarball to this repo and
the release commit (`npm audit signatures` verifies it). The public testnet
deployment is LIVE on Sepolia — every contract Etherscan-verified, addresses
committed at [deployments/11155111.json](deployments/11155111.json), and both
settlement universes exercised on the public chain: the direct-path e2e suite
and real Groth16 batch settles through `FigaroBatchVerifier`. Ethereum mainnet
awaits the external audit. The open release tasks live in
[docs/RELEASE_READINESS.md](docs/RELEASE_READINESS.md); the external-audit
handover in [docs/AUDITOR_HANDOVER.md](docs/AUDITOR_HANDOVER.md).

## What This Repo Contains

`Figaro` is the canonical runtime. It owns:

- **Kernel** — `FigaroCore.sol`: two state-changing entry points (`commit`, `resolveProcess`), 3 mappings, no owner
- **Mechanism modules** — attestation, clause registry, members registry, assembly registry, swap-and-commit coordinator, usage counter, batch verifier
- **The florin** — 1B fixed supply, 7/3/30/60 split (founders / supporters / DAO / RPGF); founder + supporters + DAO mint at genesis with no vesting; the 600M RPGF is wired and registered at genesis — `UsageCounter` counts verified clause and assembly usage on chain as it happens, and `RpgfMinter` pays clause authors + assembly designers of record pro rata across nine annual periods in three rising tranches (15/30/55 — see `docs/CONTRACTS.md` § RPGF)
- **SDK** — `@figaro-protocol/sdk`: TypeScript, event-sourced state, agent coordination
- **Runtime frontend** — Next.js 14, institution assembly, builder surfaces, reference assemblies
- **Formal verification** — TLA+ safety invariants, Echidna fuzzing, Halmos symbolic proofs, Certora CVL rules
- **Papers** — web-native academic papers at `frontend/app/(marketing)/papers/<slug>/page.tsx` (server-rendered KaTeX)
- **The data layer** — the platform allocation inverted: the aggregate map (registries, usage, the settlement record) is public and derivable by anyone; the private detail lives sealed in merkle-committed agreements, disclosed or sold only on its owner's terms. See `docs/PUBLIC_GRAPH_MODEL.md` and the site's Data page.
- **Two agent worlds, one clean seam.** *(1) Maintainer-private repo agents* — `.claude/agents/`, the Claude Code subagents used to build Figaro itself (reviews, audits, runtime UI, communications, operations). *(2) Public ecosystem agents* — `ecosystem-agents/`, four prompts that act for a user's own wallet, never the repo: `figaro-operator` (operate a wallet via `@figaro-protocol/sdk/agent`), `figaro-clause-author`, `figaro-assembly-designer`, and `figaro-analyst` (read and analyze the network's graphs — no key required). See [CONTRIBUTING.md](CONTRIBUTING.md) and `ecosystem-agents/README.md`.

Start with [docs/README.md](docs/README.md) for the doc map + reading path.
Building on it? `sdk/README.md` opens with **Your first commit** — a linear
walkthrough from a cold machine to a bonded order committed on chain. The repo
also ships its own site (`frontend/`, static-exported): marketing pages, the
paper corpus, builder references, and the generated SDK API reference.

---

## Repository Structure

```
src/                        Solidity contracts (0.8.26, Foundry)
  kernel/                   FigaroCore.sol (protocol kernel, frozen) + CommitmentTypes.sol (EIP-712 structs + hashing)
  protocol/coordinators/    AttestationCoordinator.sol (zero-storage role-gated attestation) + IRoleResolver.sol + WitnessSwapAndCommitCoordinator.sol (Permit2 witness-bound swap-funded bonds)
  protocol/registries/      ClauseRegistry.sol, MembersRegistry.sol, AssemblyRegistry.sol (permissionless, first-write-wins, ETH-staked)
  protocol/usage/           UsageCounter.sol (per-clause/assembly usage accrual, both settlement paths)
  protocol/verifier/        FigaroBatchVerifier.sol (SP1 proof-based batch settlement) + ISP1Verifier.sol
  rpgf/                     RpgfMinter.sol (600M florin usage-pro-rata reward)
  florin/                   the florin (ERC-20, minter registry)
  mocks/                    Test tokens, fee-on-transfer/permit variants, swap-venue mocks
  echidna/                  Echidna fuzzing harnesses

clauses/                    Canonical clause specs (Layer A / ClauseRegistry seed data)
assemblies/                 Reference assemblies (anchored at deploy, e2e-tested)
prover/                     Rust proof apparatus (guest kernel, clause engine, sequencer)
certora/                    Certora CVL specs (6) + token-ops inventory
script/ + scripts/          Foundry deploy scripts + the sanctioned .sh wrappers/guards

sdk/                        TypeScript SDK (@figaro-protocol/sdk)
  src/                      Event parsing, state reconstruction, agent coordination
  tests/                    Vitest tests

ecosystem-agents/           Public agent prompts (act for a user's wallet, never the repo)
  figaro-operator.md        Operate a wallet — sign every transaction on the owner's behalf
  figaro-clause-author.md   Author/version a clause → registry
  figaro-assembly-designer.md Compose/fork an assembly → registry
  figaro-analyst.md         Read and analyze the graphs — holds no key, signs nothing

frontend/                   Next.js 14 runtime
  app/                      App Router routes
  components/               assemblies, data, figures, icons, marketing, members, modules, papers, registries, runtime, shared, ui
  lib/                      agent, audit, checkout, composition, data, designer, handoff, kernel, member, protocol, registries, semantic, shared
  tests/                    Vitest unit tests
  tests/e2e/                Playwright specs (devnet, mobile)

.claude/                    Maintainer-private tooling (building Figaro itself)
  agents/                   Repo subagents (kernel-reviewer, clause-lockstep, runtime-ui, marketing-copy, …)
  skills/                   figaro-kernel-discipline (canonical kernel rules)
  hooks/                    kernel-warn.sh, clause-lockstep-warn.sh + session/memory-hygiene hooks (edit-time + session guards)
  settings.json             Project-level permissions + hook registration

test/                       Foundry tests
formal/                     TLA+ specs + TLC config
docs/                       Active design documents (architecture, theory, inventories, release gates)
```

---

## The Mechanism

1. Buyer and seller negotiate terms off-chain and dual-sign an EIP-712 commitment.
2. `commit` pulls both bonds atomically: buyer posts 2× payment, seller posts 2× cumulative value.
3. Work is performed. Lifecycle events are timestamped on-chain as attestations.
4. Buyer resolves the process. Bonds return, payment settles, the institution dissolves.

If either party defaults, their bond is forfeit. The Nash equilibrium is
cooperation. See [docs/THEORY.md](docs/THEORY.md) for the game-theoretic
derivation.

---

## Local Development

**Prerequisites:** Foundry, Node.js 18+, Anvil

```bash
# Deploy contracts to local Anvil
./scripts/deploy-local.sh

# Start the frontend (port 3000)
cd frontend && npm install && npm run dev
```

Anvil at `http://127.0.0.1:8545` (chain ID 31337).

### Developer setup & canonical scripts

- **Scripts layout:** Foundry deploy scripts (`*.s.sol`) live in `script/` (singular, Foundry-reserved). Shell scripts (`deploy-*.sh`, `lint-*.sh`, `test-*.sh`, `mythril-docker.sh`, `coverage.sh`, `setup-local.sh`) live in `scripts/` (plural).
- **Common commands:**

```bash
# Deploy contracts to local Anvil
./scripts/deploy-local.sh

# Run Mythril analysis (via Docker)
./scripts/mythril-docker.sh src/florin/FlorinToken.sol

# Start frontend dev server
cd frontend && npm install && npm run dev

# Run Foundry tests
forge test --via-ir

# Run SDK tests
cd sdk && npm test
```

`script/` holds the Foundry deploy scripts (`Deploy.s.sol`, `DeploySepolia.s.sol`, `DeployMainnet.s.sol`, `DeploySwapCoordinator.s.sol`, `MintTokens.s.sol`).

---

## Testing

See [docs/TESTING.md](docs/TESTING.md) for the full inventory. Quick commands:

```bash
forge test --via-ir                         # Foundry
cd sdk && npm test                          # SDK
cd frontend && npx vitest run               # Frontend unit
cd frontend && npm run test:e2e:mobile      # Responsive/viewport (jsdom can't)
cd frontend && npm run test:e2e:devnet      # E2E, real UI against Anvil + contracts
./scripts/test-echidna.sh                   # Echidna fuzzing
./scripts/test-halmos.sh                    # Halmos symbolic proofs
./scripts/test-tla.sh                       # TLA+ model checking
./scripts/test-certora.sh                   # Certora CVL (paid cloud)
```

## Formal Verification

TLA+ model of FigaroCore in `formal/`. Key invariants: `TokenConservation`,
`ContractSolvency`, `ResolutionAlwaysPossible`, `CumulativeIntegrity`.

See [formal/README.md](formal/README.md) and [docs/VERIFICATION_MAP.md](docs/VERIFICATION_MAP.md) for the full verification inventory.

---

## Design Documents

All active docs live in `docs/`. Start with [README.md](docs/README.md) for the doc map + reading path.

Inventories (see [docs/README.md](docs/README.md) for the full doc map):

- [CONTRACTS.md](docs/CONTRACTS.md) — Smart-contract inventory
- [CLAUSES.md](docs/CLAUSES.md) — Clause validation architecture + per-clause table
- [FRONTEND.md](docs/FRONTEND.md) — Route catalogue, lib map, designer surface
- [TESTING.md](docs/TESTING.md) — Foundry / Halmos / Certora / Echidna / TLA+ / Vitest / Playwright harness inventory

Core theory + design:

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — The whole-system stack, top to bottom, and the `clause.block` seam
- [VISION.md](docs/VISION.md) — Post-firm economy, Coasean collapse, token denomination
- [THEORY.md](docs/THEORY.md) — Game-theoretic derivation of six protocol properties
- [FLORIN_TOKEN.md](docs/FLORIN_TOKEN.md) — Token design: allocation, RPGF distribution
- [SCALING_STRATEGY.md](docs/SCALING_STRATEGY.md) — Proof-based batching, SP1 (deferred design baseline)
- [OPEN_WORLD.md](docs/OPEN_WORLD.md) — Why this is a runtime, not just contracts (paradigm + frontend composition model + semantic layer; consolidates the former RUNTIME.md)
- [DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md) — the catalogue of intentional patterns that look like vulnerabilities (read before auditing)
- [VERIFICATION_MAP.md](docs/VERIFICATION_MAP.md) — Every invariant → code → test → formal layer

## License

[MIT](LICENSE). The MIT license covers the code only — see [TRADEMARK.md](TRADEMARK.md) for the "Figaro" name and branding.
