# Contributing to Figaro

Thanks for helping maintain Figaro. This file describes the recommended local setup, common commands, repository conventions, and brief rules to keep docs in sync with code changes.

## Quickstart (local dev)

Prerequisites: Foundry, Node.js 18+ (pinned major in `.nvmrc`), a Rust toolchain
(for `prover`, pinned in `prover/rust-toolchain.toml`), the SP1 toolchain
(`cargo prove`, for `prover`'s guest program — see `prover/README.md`), IPFS
(Kubo, run natively — see below, not Docker), Docker (the agent runs Mythril /
LaTeX through it — keep Docker Desktop running).

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

# SP1 toolchain for prover (cargo prove + the succinct guest toolchain);
# version must match prover/Cargo.lock's resolved sp1-sdk version — see
# prover/README.md
curl -L https://sp1up.succinct.xyz | bash
sp1up --version v6.3.1
```

### IPFS (Kubo) — native, not Docker

Docker Desktop no longer installs on the macOS versions some contributors run
(e.g. Ventura 13.x), so Kubo runs natively rather than in the `figaro-ipfs`
container: `brew install ipfs` and the CORS/offline-daemon setup are in
`docs/LOCAL_DEV.md` § "Docker-hosted services" → "Native Kubo (no Docker)".
`devup.sh` accepts either — anything listening on `:5001` — so a native
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
./scripts/mythril-docker.sh src/florin/FlorinToken.sol
```

## Scripts layout

Two distinct folders:
- `script/` (singular, Foundry-reserved) — `.s.sol` deploy scripts (`Deploy.s.sol`, `DeployMainnet.s.sol`, `MintTokens.s.sol`).
- `scripts/` (plural) — shell automation (`deploy-*.sh`, `lint-*.sh`, `test-*.sh`, `mythril-docker.sh`, `coverage.sh`, `setup-local.sh`).

When adding new tooling, pick the folder that matches the file type. Update `README.md` if you add a new entry-point command.

## Tests and CI

- Always run the relevant test suite for changes you make:
  - Solidity changes → `forge test --via-ir`
  - Frontend changes → `cd frontend && npx vitest run`
  - SDK changes → `cd sdk && npm test`
  - Prover changes → `cd prover && cargo test`
- Add tests for any behavior you change.

## Contributor agents

The project ships agent-shaped tooling — usable by humans, AI assistants, or autonomous protocol participants — to make the security-first posture transferable. Every agent traces back to canonical sources (the six invariants, `docs/DESIGN_DECISIONS.md`, `docs/CLAUSES.md`); they are the executable form of what the publications already prove.

### Claude Code subagents — `.claude/agents/`

- **`figaro-kernel-reviewer`** — read-only review of any diff that touches `src/kernel/FigaroCore.sol`, `src/kernel/CommitmentTypes.sol`, or kernel storage. Returns findings cited to the six invariants and the canonical anti-pattern list. Invoke before merging anything kernel-adjacent.
- **`figaro-clause-lockstep`** — verifies a new or changed clause is in sync across all required surfaces (Layer A spec, TS encoder, on-chain validator contract, `ClauseRegistry` registration, listing pages). Invoke after authoring a clause.
- **`figaro-runtime-ui`** — authors runtime-tier UI for new clauses and assemblies (lens panels, attestation forms, per-role routes). Stays strictly within `frontend/`. Halts for marketing-expert review on user-facing pages. Invoke when a new clause or assembly needs a UI surface.
- **`figaro-paper-reviewer`** — read-only verifier for academic-paper claims against the canonical code. Catches drift between `paper/*.tex` and `src/` / `formal/`. Cites both paper passages and source line numbers. Invoke when reviewing paper edits, when the kernel changes, or before publication.
- **`figaro-memory-hygiene`** — periodic audit of memory files (`~/.claude/projects/<project>/memory/`). Flags oversized files, drift, orphans. Output is a table — explicitly resists narrative. Invoke monthly or when memory bloat is suspected.
- **`figaro-feedback-triage`** — classifies and routes incoming participant feedback (bug / composable-protection gap / framing observation / general). Invoke once feedback is flowing.
- **`figaro-marketing-copy`** — authors and reviews participant-facing words across all surfaces (marketing pages, onboarding modals, emails, page descriptions). Knows the project's framing language (TCP/IP of trade, coordination protocol, asymmetric bonding) and refuses DeFi/TradFi vocabulary, startup framing, decorative claims. Every claim traces to a theorem, proposition, or spec. Invoke when writing/revising marketing copy or auditing existing copy.
- **`figaro-site-ia`** — read-only auditor for site information architecture. Reviews route structure, navigation, page-purpose overlap, reading paths, cross-linking. Recommends; does not restructure pages directly. Pairs with `marketing-author` (copy) and `visual-design` (primitives). Invoke when adding/removing pages, when navigation changes are proposed, or after audits flag IA issues.
- **`figaro-visual-design`** — owns the design system: Tailwind config, semantic color tokens, typography, shared UI primitives in `frontend/components/ui/`, accessibility (WCAG / ARIA). Does NOT write feature UI; that's `runtime-ui-author`'s domain. Invoke when establishing/maintaining design tokens, after a11y audits, or when primitives are reimplemented multiple times.
- **`figaro-assumption-auditor`** — read-only gate that audits proposed plans, briefs, and copy for the recurring failure modes (web2 drift, marketing/app tangling, unverified codebase claims, tier inflation, decorative claims, CTA stacking). Invoke BEFORE dispatching other agents or writing files on any marketing-surface change.
- **`figaro-audit-commitment-checker`** — read-only gate that grades a proposed audit finding + refactor against the seller's commitment list. Invoke per finding during a comprehensive frontend audit, BEFORE the seller sees the finding.
- **`figaro-literalness-auditor`** — read-only gate that audits proposed audits, migration plans, and architectural framings for literal-state-as-design errors (treating one shipped artifact as design intent, ignoring trajectory, inflating an outlier into a rule). Invoke BEFORE presenting any audit that names a "limit", "constraint", or "missing capability".
- **`figaro-separation-of-concerns-auditor`** — read-only gate that audits architectural proposals for layer-boundary collapse — specifically, proposals that reuse an existing registry/primitive to host an artifact family that should have its own parallel primitive. Invoke BEFORE recommending an anchoring or registry-reuse choice.

These are the **operator's** repo-building subagents — private tools for developing Figaro itself. They rely on the canonical `figaro-kernel-discipline` skill at `.claude/skills/` and the `kernel-warn.sh` hook at `.claude/hooks/`. The skill is the single source of truth for kernel rules; the subagents are tool-constrained executors.

> **Contributing a clause or assembly to the *network* (not this repo)?** That is a permissionless, on-chain act — see the public **ecosystem agents** at `ecosystem-agents/`, which help a user author or fork a clause/assembly and register it under their own wallet. They never touch this repo.

**How to invoke a subagent.** In Claude Code, three paths work:

1. *Auto-invocation* — the main agent dispatches a subagent automatically when your prompt matches its `description`. Saying "review this diff for kernel discipline" should pick up `figaro-kernel-reviewer` without ceremony.
2. *Naming* — explicitly delegate by name: "use the `figaro-clause-lockstep` agent to verify the figaro-foo-v1 surfaces."
3. *`/agents`* — slash command to list, view, or manage available subagents in the current session.

Subagents do not chain directly. The runtime-ui-author returns to the main session, which then dispatches the kernel-reviewer and clause-lockstep in turn — review the verification report each subagent produces before merging.

### Public ecosystem agents — `ecosystem-agents/`

Three prompt definitions that act for a **user's** wallet on the permissionless network, never on this repo — one per capacity:

- **`figaro-operator`** — operate a wallet: sign every transaction on the owner's behalf (accept, resolve, originate, attest) via `@figaro/sdk/agent`, under the owner's policy (HITL default; refuse-all floor).
- **`figaro-clause-author`** — author or version a clause → `ClauseRegistry`.
- **`figaro-assembly-designer`** — compose or fork an assembly → `AssemblyRegistry`.

They are the public counterpart to the operator-private subagents above. See `ecosystem-agents/README.md`.

### Conventions for new agents

- New operator-private subagents go in `.claude/agents/<name>.md`; new public ecosystem agents go in `ecosystem-agents/<name>.md`. Both are prompts with frontmatter (`name`, `description`, `tools`, `model`); read-only agents declare `tools: Read, Grep, Glob, Bash` to make the constraint explicit.
- Agent prompts must cite canonical sources (papers, `docs/`, `CLAUDE.md`) — not paraphrase. Drift between an agent's rules and the publications is a bug.

## Documentation discipline

Per repository policy, when a code change makes an existing doc statement stale, update the affected docs in the same change. Key files to keep in sync include:

- `CLAUDE.md`
- `docs/CONTRACTS.md`, `docs/CLAUSES.md`, `docs/FRONTEND.md`, `docs/TESTING.md` — the inventories CLAUDE.md indexes
- `sdk/README.md`
- `docs/` design docs referenced by the code you change

`scripts/lint-claude-md.sh` runs in pre-commit and fails on mechanically-detectable drift (broken backticked paths, env-var diff vs `frontend/.env.local`, missing entries in the mocks / deploy-scripts inventories).

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
