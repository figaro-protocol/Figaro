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
- **Runtime frontend** — Next.js 14, institution assembly, builder surfaces, 5 reference assemblies
- **SP1 prover** — Rust workspace: kernel library, guest program, batch sequencer
- **Formal verification** — TLA+ (7 invariants, 6M+ states), Echidna fuzzing
- **Paper** — Academic paper in `paper/`

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
  test/                     166 Vitest tests

frontend/                   Next.js 14 runtime
  app/                      24 routes (App Router)
  components/               126 components (core, modules, shared, ui)
  lib/                      142 library files (hooks, mechanisms, semantic)
  tests/                    84 Vitest test files
  tests/e2e/                38 Playwright specs (mock + devnet)

prover/                     Rust SP1 workspace
  figaro-kernel/            Kernel library (33 tests)
  figaro-sequencer/         Batch sequencer (22 tests)
  figaro-guest/             SP1 guest program
  figaro-prove-test/        Mock prover test

test/                       Foundry tests (16 files, 252 tests)
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

```bash

# Foundry (252 tests, 16 files)
forge test --via-ir

# SDK (166 Vitest tests)
cd sdk && npm test

# Frontend unit tests (84 files)
cd frontend && npx vitest run

# Playwright — mock (no chain)
cd frontend && npx playwright test --project=mock

# Playwright — devnet (Anvil required)
cd frontend && npx playwright test --project=devnet

# Rust kernel (33 tests)
cd prover && cargo test -p figaro-kernel

# Rust sequencer (22 tests)
cd prover && cargo test -p figaro-sequencer

# All Rust tests (55 total)
cd prover && cargo test

# Echidna fuzzing
echidna src/echidna/EchidnaFuzzerV4.sol --config echidna-v4.yaml
```

## Formal Verification

TLA+ model of FigaroCore in `formal/`. Exhaustively verified with TLC:
7 safety invariants across 6M+ states, exit code 0.

Key invariants: `TokenConservation`, `ContractSolvency`,
`ResolutionAlwaysPossible`, `CumulativeIntegrity`.

See [formal/README.md](formal/README.md).

---

## Design Documents

All active docs live in `docs/v5/`:

- [VISION.md](docs/v5/VISION.md) — Post-firm economy, Coasean collapse, token denomination
- [THEORY.md](docs/v5/THEORY.md) — Game-theoretic derivation of six protocol properties
- [FIG_TOKEN.md](docs/v5/FIG_TOKEN.md) — Token design: allocation, emission, time-locks
- [SCALING_STRATEGY.md](docs/v5/SCALING_STRATEGY.md) — Proof-based batching, SP1
- [RUNTIME_THESIS.md](docs/v5/RUNTIME_THESIS.md) — Why this is a runtime, not just contracts
- [CURRENT_STATE.md](docs/v5/CURRENT_STATE.md) — Reading path and archive map

## License

[MIT](LICENSE)
