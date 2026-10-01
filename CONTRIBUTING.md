# Contributing to Figaro

Thanks for helping maintain Figaro. This file describes the recommended local setup, common commands, repository conventions, and brief rules to keep docs in sync with code changes.

## Quickstart (local dev)

Prerequisites: Foundry, Node.js 22 (pinned in `.nvmrc`), a Rust toolchain
(for `prover`, pinned in `prover/rust-toolchain.toml`), the SP1 toolchain
(`cargo prove`, for `prover`'s guest program — see `prover/README.md`), and IPFS
(Kubo, run natively — see below). Docker is needed only for the Mythril
analysis.

1. Install dependencies

```bash
# Foundry (install via foundryup)
foundryup

# Node deps for top-level tools (if needed)
npm install

# Frontend deps
cd frontend && npm install

# Rust deps for prover
cd prover && cargo fetch

# SP1 toolchain for prover (cargo prove + the succinct guest toolchain). The
# release is the one prover/Cargo.lock resolves for sp1-sdk — read it, never
# type it (the CI workflows and the prover box make the same read):
curl -L https://sp1up.succinct.xyz | bash
sp1up --version "v$(awk '/^name = "sp1-sdk"$/{getline; gsub(/version = |"/, ""); print; exit}' prover/Cargo.lock)"
```

### IPFS (Kubo) — native, not Docker

Docker Desktop does not install on the macOS versions some contributors run
(e.g. Ventura 13.x), so Kubo runs natively rather than in the `figaro-ipfs`
container: `brew install ipfs` and the CORS/offline-daemon setup are in
`docs/LOCAL_DEV.md` § "Docker-hosted services" → "Native Kubo (no Docker)".
`scripts/devup.sh` accepts either — anything listening on `:5001` — so a native
daemon and the Docker container are interchangeable from the scripts'
perspective.

2. Common dev commands

```bash
# Deploy contracts to local Anvil
./scripts/deploy-local.sh

# Start frontend (port 3000)
cd frontend && npm run dev

# Run Foundry tests
forge test --via-ir

# Run SDK tests
cd sdk && npm test

# Run prover tests
cd prover && cargo test

# Mythril analysis (Docker)
./scripts/mythril-docker.sh src/build/florin/FlorinToken.sol
```

## Scripts layout

Two distinct folders:
- `script/` (singular, Foundry-reserved) — `.s.sol` deploy scripts (`Deploy.s.sol`, `DeployMainnet.s.sol`, `MintTokens.s.sol`).
- `scripts/` (plural) — shell automation (`deploy-*.sh`, `test-*.sh`, `devup.sh`, `mythril-docker.sh`, `coverage.sh`, `setup-local.sh`).

When adding new tooling, pick the folder that matches the file type. Update `README.md` if you add a new entry-point command.

## Tests and CI

- Always run the relevant test suite for changes you make:
  - Solidity changes → `forge test --via-ir`
  - Frontend changes → `cd frontend && npx vitest run`
  - SDK changes → `cd sdk && npm test`
  - Prover changes → `cd prover && cargo test`
- Add tests for any behavior you change.

## Ecosystem agents — `ecosystem-agents/`

Four prompt definitions that act for a **user's** wallet on the permissionless network, never on this repository — one per capacity:

- **`figaro-operator`** — operate a wallet: sign every transaction on the owner's behalf (accept, resolve, originate, attest) via `@figaro-protocol/sdk/agent`, under the owner's policy (HITL default; refuse-all floor).
- **`figaro-clause-author`** — design or version a clause → `ClauseRegistry`.
- **`figaro-assembly-designer`** — compose or fork an assembly → `AssemblyRegistry`.
- **`figaro-analyst`** — read and analyze a market's public graphs via `@figaro-protocol/sdk/derive`; it holds no key and signs nothing.

See `ecosystem-agents/README.md`.

Contributing a clause or an assembly to the *network* is a permissionless, on-chain act, not a change to this repository: `figaro-clause-author` and `figaro-assembly-designer` help a user design or fork one and register it under their own wallet.

A new ecosystem agent goes in `ecosystem-agents/<name>.md`: a prompt with frontmatter (`name`, `description`, `tools`, `model`). Agent prompts cite canonical sources (the papers, `docs/`) and do not paraphrase them; drift between an agent's rules and the publications is a bug.

## Maintainership

Figaro has a single maintainer (`@adaliana` — see `.github/CODEOWNERS`). Decisions
on scope, architecture, and what merges are maintainer rulings, recorded in-repo
(commit messages, `docs/`) rather than voted on. There is no core-team
process, no governance body, and no maintainer roadmap beyond what's committed.
External contributions are welcome via PR per this document — open one, and expect
a review from the maintainer, not a committee.

## Documentation discipline

Per repository policy, when a code change makes an existing doc statement stale, update the affected docs in the same change. Key files to keep in sync include:

- `docs/CONTRACTS.md`, `docs/CLAUSES.md`, `docs/FRONTEND.md`, `docs/TESTING.md`, `docs/LOCAL_DEV.md` — the inventories
- `sdk/README.md`
- `docs/` design docs referenced by the code you change

A new script, environment variable, or developer command is recorded in `docs/LOCAL_DEV.md`.

## Commit & PR checklist

- Run tests for the modified area.
- Update or add docs when public behavior/API changes.
- Keep commits focused and atomic; prefer a small set of descriptive commits.
- Include a short PR description explaining the rationale and testing performed.

## Code style & linting

- Follow existing project style. For TypeScript/JS use the frontend/sdk configs. For Solidity follow existing Foundry/formatter settings.

## Questions

If you're unsure where something should live, open a PR with a short note and request review from the maintainer.

Thank you — your contributions keep Figaro reliable and well-documented.
