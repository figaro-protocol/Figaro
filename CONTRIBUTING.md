# Contributing to Figaro-Prototype2

Thanks for helping maintain Figaro-Prototype2. This file describes the recommended local setup, common commands, repository conventions, and brief rules to keep docs in sync with code changes.

## Quickstart (local dev)

Prerequisites: Foundry, Node.js 18+, Rust toolchain (for `prover`), Docker (optional for Mythril).

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
```

2. Common dev commands

```bash
# Deploy contracts to local Anvil
./deploy-local.sh

# Start frontend (port 3000)
cd frontend && npm run dev

# Run Foundry tests
forge test --via-ir

# Run SDK tests
cd sdk && npm test

# Run prover tests
cd prover && cargo test

# Mythril analysis (Docker)
./script/mythril-docker.sh src/fig/FigToken.sol
```

## Canonical scripts folder

The canonical folder for repo scripts is `script/` (singular). If you add helper scripts, place them in `script/` and update `README.md` accordingly.

## Tests and CI

- Always run the relevant test suite for changes you make:
  - Solidity changes → `forge test --via-ir`
  - Frontend changes → `cd frontend && npx vitest run`
  - SDK changes → `cd sdk && npm test`
  - Prover changes → `cd prover && cargo test`
- Add tests for any behavior you change.

## Documentation discipline

Per repository policy, when a code change makes an existing doc statement stale, update the affected docs in the same change. Key files to keep in sync include:

- `CLAUDE.md` and `AGENTS.md`
- `.github/copilot-instructions.md`
- `sdk/README.md`
- `docs/v5/` design docs referenced by the code you change

When in doubt, update or add a short note in `README.md` describing new scripts, env vars, or developer commands.

## Commit & PR checklist

- Run tests for the modified area.
- Update or add docs when public behavior/API changes.
- Keep commits focused and atomic; prefer a small set of descriptive commits.
- Include a short PR description explaining the rationale and testing performed.

## Code style & linting

- Follow existing project style. For TypeScript/JS use the frontend/sdk configs. For Solidity follow existing Foundry/formatter settings.

## Questions

If you're unsure where something should live, open a PR with a short note and request review from the core maintainers.

Thank you — your contributions keep Figaro reliable and well-documented.
