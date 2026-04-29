them into transaction-scoped institutions.

# Figaro Protocol

**Figaro is not an app, a firm, or an economic system. It is the TCP/IP of Trade.**

It is a stateless, ownerless protocol that defines the smallest possible unit of a secure handshake: **The Bonded Commitment**. Like the internet protocol, it is a fractal—you can use it to build a corporation, a marketplace, or a global treaty. Figaro doesn't care what you build; it only ensures the math of the handshake is unbreakable.

**A Bonded Commitment is a mathematically enforced agreement—cheating always costs more than cooperating.**

Figaro enables self-enforcing agreements between strangers — plus a runtime for composing them into transaction-scoped institutions.

Both parties deposit 2× value. Cheating always costs more than cooperating. The deal enforces itself. No arbitrator. No admin. No timeouts.

The organizational consequence: each process assembles a temporary institution of directly bonded contributors — independent value-adders who bond and settle independently — then dissolves at settlement.

## What This Repo Contains

`Figaro-Prototype2` is the canonical runtime. It owns:

- **Kernel** — `FigaroCore.sol`: 2 external functions, 3 mappings, no owner
- **Mechanism modules** — attestation, schema registry, Dutch auction, operator registry
- **FIG token** — settlement-anchored emission, time-locks, batch verifier
- **SDK** — `@figaro/core`: TypeScript, event-sourced state, agent coordination
- **Runtime frontend** — Next.js 14, institution assembly, builder surfaces, reference assemblies
- **SP1 prover** — Rust workspace: kernel library, guest program, batch sequencer
- **Formal verification** — TLA+ safety invariants, Echidna fuzzing, Halmos symbolic proofs, Certora CVL rules
- **Paper** — Academic paper in `paper/`
- **Contributor agents** — `.claude/agents/` ships three Claude Code subagents (kernel-reviewer, schema-lockstep, schema-author), `agents/factotum/` is a runnable participation-agent reference, `agents/sdk/` packages the subagents as `@figaro/agent-sdk` for non-Claude-Code runtimes, and `agents/examples/` walks through two end-to-end scenarios (TradeLens replacement, Spirit Air replacement). See [CONTRIBUTING.md](CONTRIBUTING.md#contributor-agents).

Start with [docs/v5/CURRENT_STATE.md](docs/v5/CURRENT_STATE.md) for the reading path.

---

## Repository Structure

```




src/                        Solidity contracts (0.8.26, Foundry)
  FigaroCore.sol            Protocol kernel
  CommitmentTypes.sol       EIP-712 commitment structs + hashing
  AttestationCoordinator.sol  Zero-storage role-gated attestation
  SchemaRegistry.sol        Permissionless schema anchoring
  DutchAuction.sol          Descending-price allocation
  OperatorRegistry.sol      On-chain operator registration
  FigaroBatchVerifier.sol   SP1 batch proof verifier
  fig/                      FIG token (ERC-20, emission, time-locks)
  interfaces/               ISP1Verifier, IRoleResolverV4
  mocks/                    Test tokens, mock verifier

sdk/                        TypeScript SDK (@figaro/core)
  src/                      Event parsing, state reconstruction, agent coordination
  test/                     Vitest tests

frontend/                   Next.js 14 runtime
  app/                      App Router routes
  components/               core, modules, shared, ui
  lib/                      hooks, mechanisms, semantic
  tests/                    Vitest unit tests
  tests/e2e/                Playwright specs (mock, mock-mobile, devnet)

prover/                     Rust SP1 workspace
  figaro-kernel/            Kernel library
  figaro-sequencer/         Batch sequencer
  figaro-guest/             SP1 guest program
  figaro-prove-test/        Mock prover test

agents/                     Reference agent implementations
  factotum/                 Runnable participation-agent (uses @figaro/core/agent)
  sdk/                      @figaro/agent-sdk — subagent definitions for non-Claude-Code runtimes
.claude/                    Claude Code contributor tooling
  agents/                   Subagents (kernel-reviewer, schema-lockstep, schema-author)
  skills/                   figaro-kernel-discipline (canonical kernel rules)
  hooks/                    kernel-warn.sh + schema-lockstep-warn.sh (edit-time guards)
  settings.json             Project-level permissions + hook registration

test/                       Foundry tests
formal/                     TLA+ specs + TLC config
paper/                      Academic paper (LaTeX)
docs/v5/                    Active design documents
```

---

## The Mechanism

1. Buyer and seller negotiate terms off-chain and dual-sign an EIP-712 commitment.
2. `commit` pulls both bonds atomically: buyer posts 2× payment, seller posts 2× cumulative value.
3. Work is performed. Lifecycle events are timestamped on-chain as attestations.
4. Buyer resolves the process. Bonds return, payment settles, the institution dissolves.

If either party defaults, their bond is forfeit. The Nash equilibrium is
cooperation. See [docs/v5/THEORY.md](docs/v5/THEORY.md) for the game-theoretic
derivation.

---

## Local Development

**Prerequisites:** Foundry, Node.js 18+, Anvil

```bash
# Deploy contracts to local Anvil
./deploy-local.sh

# Start the frontend (port 3000)
cd frontend && npm install && npm run dev
```

Anvil at `http://127.0.0.1:8545` (chain ID 31337).

### Developer setup & canonical scripts

- **Canonical scripts folder:** `script/` (singular). The repo previously had a `scripts/` folder; any tools there were consolidated into `script/`.
- **Common commands:**

```bash
# Deploy contracts to local Anvil
./deploy-local.sh

# Run Mythril analysis (via Docker)
./script/mythril-docker.sh src/fig/FigToken.sol

# Start frontend dev server
cd frontend && npm install && npm run dev

# Run Foundry tests
forge test --via-ir

# Run SDK tests
cd sdk && npm test
```

The `script/` directory now contains helper deployment and analysis scripts (Deploy.s.sol, DeployMainnet.s.sol, MintTokens.s.sol, mythril-docker.sh).

---

## Testing

See [CLAUDE.md](CLAUDE.md#testing) for the full inventory. Quick commands:

```bash
forge test --via-ir                         # Foundry
cd sdk && npm test                          # SDK
cd frontend && npx vitest run               # Frontend unit
cd frontend && npx playwright test --project=mock    # E2E, no chain
cd frontend && npx playwright test --project=devnet  # E2E, Anvil required
cd prover && cargo test                     # Rust (kernel + sequencer)
./test-echidna.sh                           # Echidna fuzzing
./test-halmos.sh                            # Halmos symbolic proofs
./test-tla.sh                               # TLA+ model checking
./test-certora.sh                           # Certora CVL (paid cloud)
```

## Formal Verification

TLA+ model of FigaroCore in `formal/`. Key invariants: `TokenConservation`,
`ContractSolvency`, `ResolutionAlwaysPossible`, `CumulativeIntegrity`.

See [formal/README.md](formal/README.md) and [CLAUDE.md](CLAUDE.md#testing) for the full verification inventory.

---

## Design Documents

All active docs live in `docs/v5/`:

- [VISION.md](docs/v5/VISION.md) — Post-firm economy, Coasean collapse, token denomination
- [THEORY.md](docs/v5/THEORY.md) — Game-theoretic derivation of six protocol properties
- [FIG_TOKEN.md](docs/v5/FIG_TOKEN.md) — Token design: allocation, emission, time-locks
- [SCALING_STRATEGY.md](docs/v5/SCALING_STRATEGY.md) — Proof-based batching, SP1
- [RUNTIME.md](docs/v5/RUNTIME.md) — Why this is a runtime, not just contracts (thesis + frontend model + semantic layer)
- [CURRENT_STATE.md](docs/v5/CURRENT_STATE.md) — Reading path and archive map

## License

[MIT](LICENSE)
