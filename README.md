# Figaro Protocol

**My word is my bond.**

Every trade is a contract, and between strangers the element that fails is
consideration — promising value is easy; nothing makes delivering it credible.
Figaro completes the contract. When a buyer and a seller commit to an order,
each deposits a bond into one frozen contract: the buyer twice the payment, the
seller twice the cumulative value through its order. A bond is its owner's own
deterrent — whatever a party could gain by walking away, it leaves more behind.
Only the buyer resolves the process, and resolution pays every seller and
refunds every bond at once. Keeping one's word is each party's best move, and
the process holds as one. The kernel has two operations, commit and resolve,
and nothing else.

Everything people touch is built above it: terms are clauses, written once and
registered for anyone to compose; offer and acceptance are assemblies —
agreements composed into a reusable design of a process — and checkout;
capacity is any wallet, a person's or an agent's, registered under a stake;
legality composes in, or an outside forum rules afterward on the same data;
the data a process leaves is public in aggregate and the parties' own in
detail; designers are paid from the commons in proportion to real use of what
they published. `docs/VISION.md` says why; `docs/THEORY.md` derives it;
`docs/LEXICON.md` is the vocabulary every document here uses.

## What this repository contains

- **Kernel** — `src/kernel/`: `FigaroCore.sol` (two entry points, three
  mappings, no owner) and `CommitmentTypes.sol` (the commitment and its
  EIP-712 hashing). Frozen.
- **Protocol contracts** — `src/protocol/`: the three registries (clauses,
  members, assemblies — permissionless, first-write-wins, under a stake), the
  attestation and swap-and-commit coordinators, the usage counter, and the
  proof-based batch verifier. Inventory: `docs/CONTRACTS.md`.
- **The florin and designer rewards** — `src/florin/`, `src/rpgf/`: a
  one-billion-cap ERC-20 and the minter that pays designers of record in
  proportion to the use their clauses and assemblies carried. `docs/FLORIN_TOKEN.md`.
- **Clauses and assemblies** — `clauses/` (the canonical specs, the registry's
  seed data) and `assemblies/` (reference assemblies, anchored at deploy).
  `docs/CLAUSES.md`, `assemblies/README.md`.
- **SDK** — `sdk/`, published as `@figaro-protocol/sdk`: reading and
  reconstructing state, building and signing commitments, validating and
  encoding clause content, the agent runtime. `sdk/README.md` opens with
  **Your first commit**, a walkthrough from a cold machine to a bonded order.
- **Prover** — `prover/`: the Rust kernel mirror, the generic clause engine,
  the SP1 guest, and the sequencer behind the batch path. `docs/SCALING_STRATEGY.md`.
- **Site** — `frontend/`, statically exported: the public pages, the paper
  corpus, the builder references, the wallet-connected surfaces, and the
  generated SDK reference. `docs/FRONTEND.md`.
- **Public agent prompts** — `ecosystem-agents/`: four prompts that act for a
  user's own wallet, never this repository — `figaro-operator`,
  `figaro-clause-author`, `figaro-assembly-designer`, `figaro-analyst`.
  `ecosystem-agents/README.md`.
- **Verification** — `test/` (Foundry), `formal/` (TLA+ and Lean 4),
  `certora/`, `echidna/`. `docs/VERIFICATION_MAP.md` maps each invariant to
  its code, its tests, and its formal layer.

Start with `docs/README.md` for the document map.

## Repository structure

```
src/                        Solidity contracts (0.8.26, Foundry)
  kernel/                   FigaroCore.sol + CommitmentTypes.sol — frozen
  protocol/registries/      ClauseRegistry, MembersRegistry, AssemblyRegistry
  protocol/coordinators/    AttestationCoordinator, WitnessSwapAndCommitCoordinator, IRoleResolver
  protocol/usage/           UsageCounter
  protocol/verifier/        FigaroBatchVerifier, ISP1Verifier
  florin/                   FlorinToken, IFlorinMinter
  rpgf/                     RpgfMinter
  mocks/  echidna/          test contracts, never deployed to a public network

clauses/                    canonical clause specs
assemblies/                 reference assemblies
sdk/                        @figaro-protocol/sdk (TypeScript)
prover/                     Rust proof apparatus
frontend/                   the site (Next.js, static export)
ecosystem-agents/           public agent prompts
test/  formal/  certora/    Foundry tests, TLA+ + Lean 4, Certora CVL specs
script/  scripts/           Foundry deploy scripts; shell wrappers
deployments/                the public deployment record, per chain
docs/                       the documents
```

## Running it

Prerequisites: Foundry, Node.js 18+.

```bash
./scripts/deploy-local.sh                  # deploy to a local Anvil (chain id 31337)
cd frontend && npm install && npm run dev  # the site on port 3000
```

`docs/LOCAL_DEV.md` has every command, environment variable, service, and
deploy script.

## Testing

```bash
forge test --via-ir                         # Foundry
cd sdk && npm test                          # SDK
cd frontend && npx vitest run               # site, unit
cd frontend && npm run test:e2e:devnet      # site, end to end against Anvil
./scripts/test-echidna.sh                   # Echidna
./scripts/test-halmos.sh                    # Halmos
./scripts/test-tla.sh                       # TLA+
./scripts/test-certora.sh                   # Certora (cloud)
```

`docs/TESTING.md` is the harness inventory and the layer boundaries.

## Verification

The kernel's safety properties — conservation, solvency, non-negativity,
accumulator integrity, atomic resolution — are machine-checked across Foundry,
Halmos, Certora, Echidna, and TLA+. The equilibrium itself is an analytic
derivation (`docs/THEORY.md` § "Nash Equilibrium Analysis") that is also
machine-checked in Lean 4 (`formal/lean/FigaroEquilibrium.lean` —
dependency-free, `sorry`-free, constructive) over the same payoff table the
TLA+ invariants pin to the kernel: the model checkers establish that the
payoffs the proof reasons over are exactly the payoffs the kernel produces, and
Lean checks the choosing. `docs/VERIFICATION_MAP.md` maps it; the external
audit's handover is `docs/AUDITOR_HANDOVER.md`.

## Documents

All in `docs/`; `docs/README.md` is the map and states one owner per concept.
Inventories: `CONTRACTS.md`, `CLAUSES.md`, `FRONTEND.md`, `TESTING.md`,
`LOCAL_DEV.md`. Design: `VISION.md`, `THEORY.md`, `LEXICON.md`,
`FLORIN_TOKEN.md`, `SCALING_STRATEGY.md`, `OPEN_WORLD.md`,
`PUBLIC_GRAPH_MODEL.md`. Security: `DESIGN_DECISIONS.md` (patterns that look
like vulnerabilities and are correct by design — read before raising a
finding), `VERIFICATION_MAP.md`, `AUDITOR_HANDOVER.md`, `RELEASE_READINESS.md`.

## License

[MIT](LICENSE) covers the code. See [TRADEMARK.md](TRADEMARK.md) for the
"Figaro" name and branding; [SECURITY.md](SECURITY.md) for reporting a
vulnerability; [CONTRIBUTING.md](CONTRIBUTING.md) for contributing.
