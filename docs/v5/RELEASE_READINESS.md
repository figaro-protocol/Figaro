# V5 Release Readiness

Status: canonical release gate note for the live V5 kernel, protocol, and runtime.

Last updated: 2026-06-07 (IPFS content-persistence task added — Claude Opus 4.8).

This note is the current answer to a simple question: what is ready now, what is still open, and what must happen before a public release is treated as complete.

## Current Verdict

The live V5 Solidity surface is internally consistent and the runtime hardening pass has closed the highest-value browser, build, and event-reconstruction risks.

Public release should still be treated as blocked on one explicit governance-free process decision:

1. freeze the Solidity surface
2. run a final external audit pass against that frozen surface

This is not because the current pass surfaced a new contract defect. It is because the kernel is the irreducible payoff matrix, so the prudent pre-release move is independent review after churn stops, not more architectural motion during the audit window.

## What Is Ready

- the live kernel and mechanism module inventory is stable enough to validate as one V5 surface
- the full Foundry suite passes on the active contracts
- the frontend type-check and production build have been brought green in this hardening pass
- focused Vitest and Playwright coverage has been used to validate the live runtime flows that matter most for release posture
- event-sourced state reconstruction assumptions used by the SDK and frontend were rechecked against the live kernel events
- fee-on-transfer rejection remains explicit in both the kernel and the active test suite

## Remaining Tasks

The concrete tasks that remain before the public-release gate is closed:

### Task 1: Freeze The Audited Solidity Surface

Scope to freeze:

1. `src/`
2. `src/fig/`
3. deploy and setup scripts that define the live Solidity surface

Required output:

1. a declared freeze point for the contracts and deployment path
2. no feature churn in the audited Solidity surface after that point
3. any later Solidity edit treated as a new review event, not as an invisible follow-up

### Task 2: Run The Final External Audit Pass

Required output:

1. choose the auditor or audit process
2. hand over the frozen Solidity surface and active docs
3. resolve findings or explicitly accept non-critical findings in writing
4. record the final audit outcome in the release docs

### Task 3: Resolve Mainnet Registry Parameters

`script/DeployMainnet.s.sol:184` instantiates `SellerRegistry(0.001 ether, 365 days)` — the devnet defaults — with an explicit "PLACEHOLDER VALUES — DO NOT SHIP TO MAINNET WITHOUT REVIEW" comment at lines 168-183. The deposit + lock pair is the Sybil-resistance knob (see `src/SellerRegistry.sol:38-46` NatSpec).

Required output:

1. mainnet `registrationDeposit` chosen against an explicit deploy-time ETH/USD anchor — bonded-participation cost is the floor of attacker discouragement; too low enables cheap Sybil farms, too high locks out small sellers
2. mainnet `depositLockPeriod` chosen against an explicit Sybil-recycling-cost reasoning — long enough that "1 ETH = N identities over time" recycling is uneconomic relative to honest participation, short enough that legitimate exit stays practical
3. reasoning recorded inline in `DeployMainnet.s.sol` at the constructor call site
4. PLACEHOLDER comment removed from the script
5. same exercise repeated for `AssemblyRegistry` if Task 4 lands a mainnet deployment for it (the asymmetry — slug binding is permanent on `AssemblyRegistry`, dedup guard clears on `SellerRegistry` withdraw — should be reflected in the lock-period choice)

### Task 4: AssemblyRegistry Mainnet-Parity Decision

`src/AssemblyRegistry.sol` exists and is deployed by `script/Deploy.s.sol:167` (devnet), but `script/DeployMainnet.s.sol` does not import or deploy it. The CLAUDE.md doctrine and the separation-of-concerns rule treat `AssemblyRegistry` as a protocol-tier artifact-family anchor parallel to `ClauseRegistry` / `SellerRegistry`. The devnet/mainnet asymmetry is currently undocumented.

Required output (one of):

1. add `AssemblyRegistry` to `script/DeployMainnet.s.sol` with reasoned constructor values per Task 3; add `NEXT_PUBLIC_ASSEMBLY_REGISTRY` to the deployer log and to the Pre-Mainnet Deployment Verification checks below; OR
2. document an explicit deferral with the runtime consequence — assemblies cannot be published or referenced on the mainnet runtime until a later deploy — and the planned timeline for closing the gap

Either way: reflect the chosen disposition in `docs/v5/CONTRACTS.md` and `CLAUDE.md` so the mainnet contract inventory is unambiguous.

### Task 5: Launch Scenario — Assembly Seeding Decision

**Decided (2026-06-03): no pre-seeding on either surface.** The devnet seeder
`frontend/scripts/seed-devnet.mjs` was **deleted** — the devnet no longer
direct-call-registers assemblies or sellers. Both devnet and mainnet now rely on
permissionless on-chain publication: assemblies are authored through the designer
UI (the `scenario-*` specs) and sellers onboarded through the registration wizard
(`sellers-onboarding`, driven by `SELLER_ROSTER`), exactly as a real participant
would — no seed path diverges from the mainnet path. `script/DeployMainnet.s.sol`
seeds no assemblies. Assemblies are permissionless, so no-seed is the chosen
disposition for both surfaces. The per-scenario migration off the old seeded
fixtures is tracked in `frontend/tests/e2e/SCENARIOS.md`.

Remaining output:

1. mainnet seed list — `DeployMainnet.s.sol` seeds no assemblies at launch (recorded). If Task 4 disposition (2) is taken, the mainnet half collapses to n/a (no `AssemblyRegistry` deployed)

### Task 6: IPFS Content Persistence — Pinning Durability

The chain stores only the agreement fingerprint (`agreementHash` / assembly `contentHash`); the agreement itself lives on IPFS, and every downstream consumer — counterparty validation, indexer graph reconstruction, the SP1 prover, a dispute forum — retrieves it by CID. IPFS does **not** auto-replicate: pinned content lives only on the node(s) that pin it, so a single Kubo node is a single point of failure. The devnet runs one Docker Kubo node (API `:5001` and gateway `:8080` are two interfaces to the *same* node), which is correct for device-only dev (wiped each `devup`, no long-lived commitments). On a live network a commitment's agreement must stay fetchable by its CID for the life of any possible dispute, so content durability must outlive any single node.

Required output:

1. **Testnet — managed pinning service (Option 1).** Pin every published agreement, assembly template, and profile to a managed multi-node pinning service (Pinata / Filebase / Storacha) so content survives the loss of the dev node. The pin path (`frontend/lib/shared/ipfsService.ts`) targets the service API; add the service endpoint/key as env vars in `docs/v5/LOCAL_DEV.md` + `frontend/.env.local`.
2. **Mainnet — sovereign per-party pinning (Option 3).** Shift durability to the parties: each publishing wallet's client pins what it authors, so no single operator is the custodian of availability — matching the ownerless / permissionless doctrine. No central pinning dependency in the mainnet trust model.
3. **Retrieval-availability floor: 6 years, user-extensible.** An agreement must stay fetchable by its CID for the longest plausible dispute/audit window, anchored to the tax-audit horizon: most administrations can audit ~5 years back, plus 1 year because a year's transactions are declared the following year → a **6-year minimum**. The window varies by jurisdiction and shifts over time, so 6 years is a floor, not a fixed term — each agreement carries a per-party option to extend (longer retention for higher-stakes or longer-tail commitments).

## Validation Commands

Use these commands as the release gate. Expected output means successful completion with exit code `0` and the stated pass criteria. This gate asserts pass/fail; the harness inventory (suite, file, property, and rule counts) is `TESTING.md`.

### Contracts

```bash
forge test --via-ir
```

Expected output:

- 0 failed
- 0 skipped

### Halmos Symbolic Proofs

```bash
./scripts/test-halmos.sh
```

Prereqs (one-time): `brew install z3 && pipx install halmos`.

Expected output: `✅ All 7 Halmos properties proved.` (exit code 0)

### Frontend Type Check

```bash
cd frontend && npm run type-check
```

Expected output:

- TypeScript completes with no errors

### Frontend Production Build

```bash
cd frontend && npm run build
```

Expected output:

- Next.js production build completes successfully
- no hard build failures

### Frontend Unit And Integration Tests

```bash
cd frontend && npx vitest run
```

Expected output:

- Vitest exits cleanly with no failing suites

### Frontend Browser Validation

Devnet posture:

```bash
cd frontend && npm run test:e2e:devnet
```

Expected output:

- Anvil deployment verification passes first
- Playwright devnet project exits cleanly with no failing specs
- observed pass: 40 passed

High-value browser checks that must remain covered:

1. `/evidence-display` works under iframe-style embedding rules
2. handoff geolocation works under production-style headers
3. delivery-attestation geolocation works under production-style headers

## Accepted Risks

These are current design realities that are accepted by the protocol surface, not accidental defects introduced by this hardening pass:

1. buyer key loss is terminal for an active process because the kernel has no timeout or admin recovery path
2. very large processs are gas-bounded, so institution design should compose across processes instead of pushing single-process fanout toward the ceiling
3. fee-on-transfer tokens are unsupported by design and are rejected explicitly by the kernel

## Accepted Runtime Posture

These are current runtime posture decisions, not release blockers:

1. `/builders/prototype` remains an explicitly builder-scoped tooling surface rather than a consumer-facing institution route
2. `/builders/templates` is a routing surface into assembly-based template discovery, not a legacy on-chain registry UI
3. geolocation remains allowed for same-origin runtime surfaces instead of being narrowed to a brittle route allowlist, because handoff and delivery-attestation modules are runtime-composable across multiple live pages

## Pre-Mainnet Deployment Verification

Deploy-time configuration checks to run against the mainnet deployment before
it is treated as live. These are separate from the surface-freeze and
external-audit gates above:

- `FigToken.deployer` == the expected deployer EOA; `FigToken.deployerMintRenounced` == `true` after minter setup; `FigToken.totalSupply()` == the expected genesis allocation; every registered minter is an intended allocation contract.
- `AttestationCoordinator.core` == the deployed `FigaroCore` address.
- `FigaroBatchVerifier.verifier` == the real SP1 verifier gateway (never `MockSP1Verifier`); `FigaroBatchVerifier.stateRoot` == the expected genesis root; `FigaroBatchVerifier.programVKey` == the correct program verification key.
- `SellerRegistry.registrationDeposit` and `SellerRegistry.depositLockPeriod` == the mainnet values picked per Task 3 (NOT the devnet `0.001 ether` / `365 days` placeholders).
- `AssemblyRegistry.registrationDeposit` and `AssemblyRegistry.depositLockPeriod` == the mainnet values picked per Task 3 — if Task 4 disposition (1) is taken. If disposition (2) is taken, `AssemblyRegistry` is not deployed and this check does not apply.
- All settlement tokens are non-rebasing and non-fee-on-transfer.
- Agreement / assembly-template / profile content is pinned for durable retrieval per Task 6 — on mainnet via sovereign per-party pinning (Option 3), never only a single Kubo node — and is fetchable by CID across the 6-year (5 + 1) retrieval-availability floor.

## Freeze Notice — Solidity Surface Frozen for External Audit

**Initial freeze**: 2026-04-20. Subsequent amendments landed a pre-audit findings batch (FIG allocation restructured, `MerkleAirdrop`/`TrancheVesting` deleted, `DOMAIN_SEPARATOR()` getter, `totalRegisteredCap` enforcement); revised the `SellerRegistry` surface (dropped `role` from `register` + `SellerRegistered`, added `updateProfile`, removed `SellerRole` / `InvalidRole`, lockstep update to `FigaroBatchVerifier.SellerEventInput`); expanded the frozen-scope declaration to add `IClauseValidator.sol`, `AssemblyRegistry.sol`, `ProcessOffsetReceipt.sol`; and closed the post-resolve commit gate (`FigaroCore.commit`'s sub-order branch reverts `ProcessAlreadyResolved` when `ps.activeOrderCount == 0`; Rust prover mirrors; `DESIGN_DECISIONS.md` item #1 rewritten). Amendment history is in `git log`; current frozen scope is below.

The following Solidity surface is declared frozen for external audit.
No feature changes, refactors, or dependency upgrades will be made to
these directories during the audit window. Any edit requires either a
narrow follow-up review or a repeat audit decision.

### Frozen scope

| Directory / file | Contents |
|---|---|
| `src/` | `FigaroCore.sol`, `AttestationCoordinator.sol`, `CommitmentTypes.sol`, `IRoleResolver.sol`, `IClauseValidator.sol`, `ClauseRegistry.sol`, `ClauseRegistrationHelper.sol`, `DutchAuction.sol`, `SellerRegistry.sol`, `AssemblyRegistry.sol`, `ProcessOffsetReceipt.sol`, `FigaroBatchVerifier.sol` |
| `src/fig/` | `FigToken.sol`, `RpgfMinter.sol`, `IFigMinter.sol` |
| `script/Deploy.s.sol` | Devnet deploy (defines the devnet surface) |
| `script/DeployMainnet.s.sol` | Mainnet deploy (defines the audited mainnet surface) |

### Explicitly out of scope (not frozen)

- `src/mocks/` — test helpers, never deployed to mainnet
- `src/echidna/` — fuzzing harnesses, never deployed to mainnet
- `test/`, `frontend/`, `sdk/`, `prover/` — non-Solidity surfaces

### Verifying a freeze

To verify a file is unchanged from the freeze commit:

```bash
git diff <FREEZE_COMMIT> -- src/ src/fig/ script/Deploy.s.sol script/DeployMainnet.s.sol
```

Expected output: empty.

### Handover Checklist for the Auditor

| Document | Purpose |
|---|---|
| `docs/v5/DESIGN_DECISIONS.md` | 14 intentional patterns that look like vulnerabilities (read first) |
| `docs/v5/VERIFICATION_MAP.md` | Every invariant → code → test → formal layer |
| `docs/v5/RELEASE_READINESS.md` (this file) | Gate criteria, remaining tasks, frozen scope |
| `docs/v5/SCALING_STRATEGY.md` | Proof-based scaling, batch sequencer architecture, and what the sequencer is trusted for (consolidated from former `BATCH_SEQUENCER.md` + `SEQUENCER_TRUST_MODEL.md`) |

The AI-audit history is provided for context only. The external auditor
should form their own independent findings.

### Post-Audit Policy

Any Solidity edit after the freeze commit must be:

1. Explicitly scoped to a specific finding or accepted-risk item
2. Reviewed by the original auditor or a qualified substitute
3. Recorded in the backlog with finding reference and outcome

Changes to `test/`, `frontend/`, `sdk/`, or `prover/` do not require
re-audit unless they expose a new on-chain attack surface.