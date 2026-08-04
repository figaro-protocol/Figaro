# Figaro Protocol

**Figaro is not an app, a firm, or an economic system. It is the TCP/IP of Trade.**

It is a stateless, ownerless protocol that defines the smallest possible unit of a secure handshake: **The Bonded Commitment**. Like the internet protocol, it is a fractal—you can use it to build a corporation, a marketplace, or a global treaty. Figaro doesn't care what you build; it only ensures the math of the handshake is unbreakable.

**A Bonded Commitment is a mathematically enforced agreement—cheating always costs more than cooperating.**

Figaro enables self-enforcing agreements between strangers — plus a runtime for composing them into transaction-scoped institutions.

Both parties deposit 2× value. Cheating always costs more than cooperating. The deal enforces itself. No arbitrator. No admin. No timeouts.

The organizational consequence: each process assembles a temporary institution of directly bonded contributors — independent value-adders who bond and settle independently — then dissolves at settlement.

## What This Repo Contains

`Figaro` is the canonical runtime. It owns:

- **Kernel** — `FigaroCore.sol`: 2 external functions, 3 mappings, no owner
- **Mechanism modules** — attestation, clause registry, members registry, assembly registry, swap-and-commit coordinator, usage counter, batch verifier
- **The florin** — 1B fixed supply, 10/30/60 split (founders / DAO / RPGF); founder + DAO mint at genesis with no vesting; the 600M RPGF is wired and registered at genesis — `UsageCounter` counts verified artifact usage on chain as it happens, and `RpgfMinter` pays clause authors + assembly designers of record pro rata across three declining tranches (see `docs/CONTRACTS.md` § RPGF)
- **SDK** — `@figaro/sdk`: TypeScript, event-sourced state, agent coordination
- **Runtime frontend** — Next.js 14, institution assembly, builder surfaces, reference assemblies
- **Formal verification** — TLA+ safety invariants, Echidna fuzzing, Halmos symbolic proofs, Certora CVL rules
- **Papers** — web-native academic papers at `frontend/app/(marketing)/papers/<slug>/page.tsx` (server-rendered KaTeX)
- **Two agent worlds, one clean seam.** *(1) Operator-private repo agents* — `.claude/agents/` ships fifteen Claude Code subagents for building Figaro itself: reviews (kernel-reviewer, clause-lockstep), runtime UI (runtime-ui), audits (assumption-auditor, audit-commitment-checker, literalness-auditor, separation-of-concerns-auditor, open-world auditors), operations (memory-hygiene, feedback-triage), communications (marketing-copy, site-ia, visual-design), paper-reviewer — the operator's own tools. *(2) Public ecosystem agents* — `ecosystem-agents/`, three prompts that act for a user's own wallet, never the repo: `figaro-operator` (operate a wallet — sign every transaction on the owner's behalf via `@figaro/sdk/agent`), `figaro-clause-author`, and `figaro-assembly-designer` (author or fork a clause/assembly and register it on the permissionless registries). See [CONTRIBUTING.md](CONTRIBUTING.md) and `ecosystem-agents/README.md`.

Start with [docs/README.md](docs/README.md) for the doc map + reading path.

---

## Repository Structure

```




src/                        Solidity contracts (0.8.26, Foundry)
  kernel/                   FigaroCore.sol (protocol kernel, frozen) + CommitmentTypes.sol (EIP-712 structs + hashing)
  protocol/coordinators/    AttestationCoordinator.sol (zero-storage role-gated attestation) + IRoleResolver.sol + WitnessSwapAndCommitCoordinator.sol (Permit2 witness-bound swap-funded bonds)
  protocol/registries/      ClauseRegistry.sol, MembersRegistry.sol, AssemblyRegistry.sol (permissionless, first-write-wins, ETH-staked)
  protocol/usage/           UsageCounter.sol (per-artifact usage accrual, both settlement paths)
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

sdk/                        TypeScript SDK (@figaro/sdk)
  src/                      Event parsing, state reconstruction, agent coordination
  tests/                    Vitest tests

ecosystem-agents/           Public agent prompts (act for a user's wallet, never the repo)
  figaro-operator.md        Operate a wallet — sign every transaction on the owner's behalf
  figaro-clause-author.md   Author/version a clause → registry
  figaro-assembly-designer.md Compose/fork an assembly → registry

frontend/                   Next.js 14 runtime
  app/                      App Router routes
  components/               assemblies, marketing, modules, papers, runtime, sellers, shared, ui, icons
  lib/                      agent, audit, checkout, composition, designer, handoff, kernel, protocol, seller, semantic, shared
  tests/                    Vitest unit tests
  tests/e2e/                Playwright specs (devnet, mobile)

.claude/                    Operator-private tooling (building Figaro itself)
  agents/                   Repo subagents (kernel-reviewer, clause-lockstep, runtime-ui, marketing-copy, …)
  skills/                   figaro-kernel-discipline (canonical kernel rules)
  hooks/                    kernel-warn.sh, clause-lockstep-warn.sh + session/memory-hygiene hooks (edit-time + session guards)
  settings.json             Project-level permissions + hook registration

test/                       Foundry tests
formal/                     TLA+ specs + TLC config
docs/                    Active design documents
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

`script/` holds the Foundry deploy scripts (`Deploy.s.sol`, `DeployMainnet.s.sol`, `MintTokens.s.sol`).

---

## Testing

See [docs/TESTING.md](docs/TESTING.md) for the full inventory. Quick commands:

```bash
forge test --via-ir                         # Foundry
cd sdk && npm test                          # SDK
cd frontend && npx vitest run               # Frontend unit
cd frontend && npm run test:e2e:mobile      # Responsive/viewport (jsdom can't)
cd frontend && npm run test:e2e:devnet      # E2E, real UI against Anvil + contracts
./scripts/test-echidna.sh                           # Echidna fuzzing
./scripts/test-halmos.sh                            # Halmos symbolic proofs
./scripts/test-tla.sh                               # TLA+ model checking
./scripts/test-certora.sh                           # Certora CVL (paid cloud)
```

## Formal Verification

TLA+ model of FigaroCore in `formal/`. Key invariants: `TokenConservation`,
`ContractSolvency`, `ResolutionAlwaysPossible`, `CumulativeIntegrity`.

See [formal/README.md](formal/README.md) and [docs/VERIFICATION_MAP.md](docs/VERIFICATION_MAP.md) for the full verification inventory.

---

## Design Documents

All active docs live in `docs/`. Start with [README.md](docs/README.md) for the doc map + reading path.

Inventories indexed by CLAUDE.md:

- [CONTRACTS.md](docs/CONTRACTS.md) — Smart-contract inventory
- [CLAUSES.md](docs/CLAUSES.md) — Clause validation architecture + per-clause table
- [FRONTEND.md](docs/FRONTEND.md) — Route catalogue, lib map, designer surface
- [TESTING.md](docs/TESTING.md) — Foundry / Halmos / Certora / Echidna / TLA+ / Vitest / Playwright harness inventory

Core theory + design:

- [VISION.md](docs/VISION.md) — Post-firm economy, Coasean collapse, token denomination
- [THEORY.md](docs/THEORY.md) — Game-theoretic derivation of six protocol properties
- [FLORIN_TOKEN.md](docs/FLORIN_TOKEN.md) — Token design: allocation, RPGF distribution
- [SCALING_STRATEGY.md](docs/SCALING_STRATEGY.md) — Proof-based batching, SP1 (deferred design baseline)
- [OPEN_WORLD.md](docs/OPEN_WORLD.md) — Why this is a runtime, not just contracts (paradigm + frontend composition model + semantic layer; consolidates the former RUNTIME.md)
- [DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md) — the catalogue of intentional patterns that look like vulnerabilities (read before auditing)
- [VERIFICATION_MAP.md](docs/VERIFICATION_MAP.md) — Every invariant → code → test → formal layer

## License

[MIT](LICENSE)
