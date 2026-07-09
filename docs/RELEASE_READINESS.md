# V5 Release Readiness

Status: canonical release gate note for the live V5 kernel, protocol, and runtime.

Last updated: 2026-07-09 (no-beta ruling: the `cloudflare/` closed-beta apparatus was deleted — Task 7 is a plain testnet rehearsal now. 2026-06-25 proof-apparatus teardown: the SP1 prover, `FigaroBatchVerifier`, and `RpgfMinter` were deleted — Task 8 is VOID).

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

`script/DeployMainnet.s.sol` instantiates `SellerRegistry(0.001 ether)` and `ClauseRegistry(0.001 ether)` — the devnet defaults — with explicit "PLACEHOLDER VALUE — DO NOT SHIP TO MAINNET WITHOUT REVIEW" comments at the call sites. The deposit is the Sybil-resistance stake (K4: no time lock — withdraw de-surfaces the artifact, so pollution costs deposit × time-surfaced).

Required output:

1. mainnet `registrationDeposit` chosen against an explicit deploy-time ETH/USD anchor — bonded-participation cost is the floor of attacker discouragement; too low enables cheap Sybil farms, too high locks out small sellers
2. reasoning recorded inline in `DeployMainnet.s.sol` at the constructor call sites
3. PLACEHOLDER comments removed from the script
4. same exercise repeated for `AssemblyRegistry` and `ClauseRegistry` deposits if Task 4 lands mainnet deployments for them (the binding-permanence asymmetry — clause/assembly bindings are permanent, the SellerRegistry dedup guard clears on withdraw — should be reflected in the deposit choice)

### Task 4: AssemblyRegistry Mainnet-Parity Decision

`src/AssemblyRegistry.sol` exists and is deployed by `script/Deploy.s.sol:167` (devnet), but `script/DeployMainnet.s.sol` does not import or deploy it. The CLAUDE.md doctrine and the separation-of-concerns rule treat `AssemblyRegistry` as a protocol-tier artifact-family anchor parallel to `ClauseRegistry` / `SellerRegistry`. The devnet/mainnet asymmetry is currently undocumented.

Required output (one of):

1. add `AssemblyRegistry` to `script/DeployMainnet.s.sol` with reasoned constructor values per Task 3; add `NEXT_PUBLIC_ASSEMBLY_REGISTRY` to the deployer log and to the Pre-Mainnet Deployment Verification checks below; OR
2. document an explicit deferral with the runtime consequence — assemblies cannot be published or referenced on the mainnet runtime until a later deploy — and the planned timeline for closing the gap

Either way: reflect the chosen disposition in `docs/CONTRACTS.md` and `CLAUDE.md` so the mainnet contract inventory is unambiguous.

### Task 5: Launch Scenario — Assembly Seeding Decision

**Decided (2026-06-03): no pre-seeding on either surface.** The devnet seeder
`frontend/scripts/seed-devnet.mjs` was **deleted** — the devnet no longer
direct-call-registers assemblies or sellers. Both devnet and mainnet now rely on
permissionless on-chain publication: assemblies are authored through the designer
UI (the `local-commerce` e2e is the live exemplar) and sellers onboarded through
the registration wizard (`sellers-onboarding`), exactly as a real participant
would — no seed path diverges from the mainnet path. `script/DeployMainnet.s.sol`
seeds no assemblies. Assemblies are permissionless, so no-seed is the chosen
disposition for both surfaces. The migration off the old seeded fixtures is
complete; the deleted `scenario-*` specs' open-world rebuilds are punch-listed.

Remaining output:

1. mainnet seed list — `DeployMainnet.s.sol` seeds no assemblies at launch (recorded). If Task 4 disposition (2) is taken, the mainnet half collapses to n/a (no `AssemblyRegistry` deployed)

### Task 6: IPFS Content Persistence — Pinning Durability

The chain stores only the agreement fingerprint (`agreementHash` / assembly `contentHash`); the agreement itself lives on IPFS, and every downstream consumer — counterparty validation, indexer graph reconstruction, a dispute forum — retrieves it by CID. IPFS does **not** auto-replicate: pinned content lives only on the node(s) that pin it, so a single Kubo node is a single point of failure. The devnet runs one Docker Kubo node (API `:5001` and gateway `:8080` are two interfaces to the *same* node), which is correct for device-only dev (wiped each `devup`, no long-lived commitments). On a live network a commitment's agreement must stay fetchable by its CID for the life of any possible dispute, so content durability must outlive any single node.

Required output:

1. **Testnet — managed pinning service (Option 1).** Pin every published agreement, assembly template, and profile to a managed multi-node pinning service (Pinata / Filebase / Storacha) so content survives the loss of the dev node. The pin path (`frontend/lib/shared/ipfsService.ts`) targets the service API; add the service endpoint/key as env vars in `docs/LOCAL_DEV.md` + `frontend/.env.local`.
2. **Mainnet — sovereign per-party pinning (Option 3).** Shift durability to the parties: each publishing wallet's client pins what it authors, so no single operator is the custodian of availability — matching the ownerless / permissionless doctrine. No central pinning dependency in the mainnet trust model.
3. **Retrieval-availability floor: 6 years, user-extensible.** An agreement must stay fetchable by its CID for the longest plausible dispute/audit window, anchored to the tax-audit horizon: most administrations can audit ~5 years back, plus 1 year because a year's transactions are declared the following year → a **6-year minimum**. The window varies by jurisdiction and shifts over time, so 6 years is a floor, not a fixed term — each agreement carries a per-party option to extend (longer retention for higher-stakes or longer-tail commitments).

### Task 7: Testnet Deployment Rehearsal (PAUSED)

**Paused — the repo is device-only.** Resume when the deploy decision flips.
(The Cloudflare closed-beta apparatus — gate Worker + access codes, rpc-proxy
allowlist, beta Anvil container, `cloudflare/` runbook — was deleted 2026-07-09
with the no-beta ruling; there is no beta phase, so the rehearsal targets an
ordinary public deployment. Hosting is chosen at deploy time; the frontend is a
static-exportable protocol surface with user-owned RPC/IPFS endpoints, so no
edge middleware is presumed.) Order: deploy-script audits → Sepolia smoke-test
→ flip the device-only deployment-context line in the punch-list and `CLAUDE.md`.

Required output:

1. Audit `script/Deploy.s.sol` + `script/DeployMainnet.s.sol` — confirm the env-var contract, no mocks, and that the atomic clause-validator binding composes on Sepolia.
2. Sepolia smoke-test of the deployed stack through the UI (the devnet e2e pattern against a public testnet).

(Kleros subcourt-ID verification and IPFS content durability for this path are already covered by the Pre-Mainnet Deployment Verification checks and Task 6 above.)

### Task 8: SP1 Prover End-to-End — VOID

The SP1 prover, `FigaroBatchVerifier`, and `RpgfMinter` were deleted in the
proof-apparatus teardown. There is no proof/batch path to deploy or rehearse;
this task is removed.

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
- `SellerRegistry.registrationDeposit` and `ClauseRegistry.registrationDeposit` == the mainnet values picked per Task 3 (NOT the devnet `0.001 ether` placeholder).
- `AssemblyRegistry.registrationDeposit` == the mainnet value picked per Task 3 — if Task 4 disposition (1) is taken. If disposition (2) is taken, `AssemblyRegistry` is not deployed and this check does not apply.
- All settlement tokens are non-rebasing and non-fee-on-transfer.
- Kleros subcourt IDs in the deployed dispute config match the target chain on klerosboard.com (Gnosis subcourt IDs differ from Ethereum mainnet) — verify before the deployment is treated as live.
- Agreement / assembly-template / profile content is pinned for durable retrieval per Task 6 — on mainnet via sovereign per-party pinning (Option 3), never only a single Kubo node — and is fetchable by CID across the 6-year (5 + 1) retrieval-availability floor.
- Wallet-security screening: drive one real commit signature through MetaMask against the live deployment and confirm no Blockaid "deceptive request" flag on the EIP-712 request (legitimate contracts get false-flagged — Kleros's escrow did); if flagged, file the MetaMask/Blockaid false-positive report and re-verify before launch. (Surfaced 2026-06-12: the universal Anvil default-deployer addresses tripped the list on devnet; devnet now deploys from a randomized throwaway key.)

## Freeze Notice — Solidity Surface Frozen for External Audit

**Initial freeze**: 2026-04-20. Subsequent amendments landed a pre-audit findings batch (FIG allocation restructured, `MerkleAirdrop`/`TrancheVesting` deleted, `DOMAIN_SEPARATOR()` getter, `totalRegisteredCap` enforcement); revised the `SellerRegistry` surface (dropped `role` from `register` + `SellerRegistered`, added `updateProfile`, removed `SellerRole` / `InvalidRole`, lockstep update to `FigaroBatchVerifier.SellerEventInput`); expanded the frozen-scope declaration to add `IClauseValidator.sol`, `AssemblyRegistry.sol`, `ProcessOffsetReceipt.sol`; and closed the post-resolve commit gate (`FigaroCore.commit`'s sub-order branch reverts `ProcessAlreadyResolved` when `ps.activeOrderCount == 0`; Rust prover mirrors; `DESIGN_DECISIONS.md` item #1 rewritten). A further amendment (2026-07-03) removed `ProcessOffsetReceipt.sol` from scope — the carbon-offset apparatus was deleted (no on-network retirement router exists on the deployment chain; see `CONTRACTS.md`). Amendment history is in `git log`; current frozen scope is below.

The following Solidity surface is declared frozen for external audit.
No feature changes, refactors, or dependency upgrades will be made to
these directories during the audit window. Any edit requires either a
narrow follow-up review or a repeat audit decision.

### Frozen scope

| Directory / file | Contents |
|---|---|
| `src/` | `FigaroCore.sol`, `AttestationCoordinator.sol`, `CommitmentTypes.sol`, `IRoleResolver.sol`, `ClauseRegistry.sol`, `SellerRegistry.sol`, `AssemblyRegistry.sol` |
| `src/fig/` | `FigToken.sol`, `IFigMinter.sol` |
| `script/Deploy.s.sol` | Devnet deploy (defines the devnet surface) |
| `script/DeployMainnet.s.sol` | Mainnet deploy (defines the audited mainnet surface) |

### Explicitly out of scope (not frozen)

- `src/mocks/` — test helpers, never deployed to mainnet
- `src/echidna/` — fuzzing harnesses, never deployed to mainnet
- `test/`, `frontend/`, `sdk/` — non-Solidity surfaces

### Verifying a freeze

To verify a file is unchanged from the freeze commit:

```bash
git diff <FREEZE_COMMIT> -- src/ src/fig/ script/Deploy.s.sol script/DeployMainnet.s.sol
```

Expected output: empty.

### Handover Checklist for the Auditor

| Document | Purpose |
|---|---|
| `docs/DESIGN_DECISIONS.md` | 14 intentional patterns that look like vulnerabilities (read first) |
| `docs/VERIFICATION_MAP.md` | Every invariant → code → test → formal layer |
| `docs/RELEASE_READINESS.md` (this file) | Gate criteria, remaining tasks, frozen scope |
| `docs/SCALING_STRATEGY.md` | Proof-based scaling, batch sequencer architecture, and what the sequencer is trusted for (consolidated from former `BATCH_SEQUENCER.md` + `SEQUENCER_TRUST_MODEL.md`) |

The AI-audit history is provided for context only. The external auditor
should form their own independent findings.

### Post-Audit Policy

Any Solidity edit after the freeze commit must be:

1. Explicitly scoped to a specific finding or accepted-risk item
2. Reviewed by the original auditor or a qualified substitute
3. Recorded in the backlog with finding reference and outcome

Changes to `test/`, `frontend/`, or `sdk/` do not require
re-audit unless they expose a new on-chain attack surface.