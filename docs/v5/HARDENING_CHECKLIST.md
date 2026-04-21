# V5 Hardening Checklist

Status: working checklist for launch hardening of the live runtime and kernel.

Assumption for this checklist: the current live system is `v5`.
`archive-v4/` is historical, so present-tense docs and release notes should stop
describing the live system as `v4` unless they are explicitly discussing archive
material, historical comparisons, or external API names that are literally named
that way, such as `_hashTypedDataV4(...)`.

## 1. Versioning Cleanup

- [x] Declare `v5` as the current live version in current-state docs.
- [x] Update `CURRENT_STATE.md` to say the live kernel/runtime is `v5`, not `v4`.
- [x] Update `SCALING_STRATEGY.md` so parity and gating language refers to `v5` as the live source of truth.
- [x] Update `.github/copilot-instructions.md` to reflect `v5` naming wherever it currently describes the live kernel/runtime as `v4`.
- [x] Update `AGENTS.md` to reflect `v5` naming wherever it currently describes the live kernel/runtime as `v4`.
- [x] Update `README.md` and any active root docs that still describe the live protocol/runtime as `v4`.
- [x] Update active code comments in `src/`, `sdk/`, and `frontend/` that refer to the live system as `v4` when they mean the current version.
- [x] Leave historical references intact when they are actually historical: `archive-v4/`, `archive-v3/`, prior gas comparisons, migration notes, or old equivalence tests.
- [x] Leave literal external/API names intact when renaming would be wrong: `_hashTypedDataV4(...)`, EIP-712 references, explicit archive names, and old test titles comparing `v3` to `v4`.
- [x] Run a final grep pass for `V4|v4` across active docs and source, then classify each remaining reference as either intentional history or stale present-tense naming.

## 2. Solidity Hardening

- [x] Re-run the full Foundry suite after every hardening change and keep the suite green.
- [x] Re-run gas ceiling coverage and confirm the current `resolveProcess()` documentation still matches empirical results.
- [x] Review NatSpec and inline comments in `src/FigaroCore.sol`, `src/DutchAuction.sol`, `src/AttestationCoordinator.sol`, `src/SchemaRegistry.sol`, `src/OperatorRegistry.sol`, and `src/fig/` for stale version references or stale mechanism descriptions.
- [x] Refresh `AUDIT_REPORT.md` so it references the live contracts and current test counts instead of old `FigaroCoreV3` and stale suite numbers.
- [x] Review whether the accepted operational-risk notes are still correct for the current codebase, especially around vault or operational prerequisites if any archived language survived.
- [x] Confirm all deploy scripts point at the live contracts and do not preserve stale `v4` assumptions in comments or output text.
- [x] Verify the local deploy flow from scratch using the current scripts and document the exact happy-path commands.
- [x] Reconfirm event semantics and state reconstruction assumptions used by the SDK and frontend against the live contract events.
- [x] Reconfirm fee-on-transfer rejection and token-behavior assumptions in tests and docs.
- [x] Decide whether a final external audit pass is required before public release, and if yes, freeze the Solidity surface before that pass.

## 3. React Runtime Hardening

### Security And Policy

- [x] Verify the production header policy does not break intended runtime features.
- [x] Fix route-level framing policy for `/evidence-display` so Kleros iframe behavior is explicitly correct in production.
- [x] Verify that `X-Frame-Options` and `Content-Security-Policy` do not conflict between `next.config.mjs` and `middleware.ts`.
- [x] Verify the `Permissions-Policy` geolocation rule does not disable live handoff and delivery-attestation flows.
- [x] If geolocation should stay enabled for specific routes only, move to route-scoped policy instead of app-wide allowance or denial.

### Build And Code Quality

- [x] Eliminate the missing-hook-dependency warnings in stateful live flows.
- [x] Prioritize hook cleanup in `frontend/components/console/CreateOrderPanel.tsx`.
- [x] Prioritize hook cleanup in `frontend/components/core/OrderControls.tsx`.
- [x] Prioritize hook cleanup in `frontend/components/modules/MerchantBrandingModule.tsx`.
- [x] Reduce `any` usage in runtime-critical client code before treating the frontend as hardened.
- [x] Prioritize `any` cleanup in event/indexing plumbing: `frontend/lib/core/eventCache.ts` and `frontend/lib/core/indexer.ts`.
- [x] Prioritize `any` cleanup in console/runtime execution plumbing: `frontend/lib/console/provider.tsx` and `frontend/lib/console/commitmentStore.ts`.
- [x] Prioritize `any` cleanup in dispute, handoff, and token-execution paths used in live runtime surfaces.

### Surface Cleanup

- [x] Remove or explicitly quarantine disabled account-abstraction code.
- [x] Confirm `SmartAccountToggle` is not mounted anywhere user-facing; if it is not used, delete it.
- [x] Delete or isolate `frontend/lib/core/aa.ts` if the secure replacement is not part of the current release.
- [x] Review builder/template placeholder pages and decide which are acceptable stubs for release versus which should be removed or relabeled.
- [x] Clean up any production-facing copy that still implies unfinished or disabled capabilities without clear posture.

### Runtime Validation

- [x] Re-run `npm run type-check` and `npm run build` in `frontend/` after hardening changes.
- [x] Run focused Vitest slices covering order creation, commitment flow, runtime shells, dispute surfaces, handoff, and delivery attestation.
- [x] Run focused Playwright mock suites covering route posture, builder surfaces, dispute surfaces, handoff modules, and order-entry paths.
- [x] Run focused Playwright devnet suites covering commitment share, create-order, sub-order, and console flows.
- [x] Confirm the evidence-display route works in an iframe-like posture, not just as a standalone page.
- [x] Confirm geolocation-backed handoff flows work in the browser under production-style headers.
- [x] Confirm geolocation-backed delivery-attestation flows work in the browser under production-style headers.

## 4. Documentation And Release Posture

- [x] Refresh `AUDIT_REPORT.md` so scope, version language, and findings match the live codebase.
- [x] Refresh any frontend docs that still say `not production-ready` if the remaining work is now a bounded hardening pass rather than a broad audit unknown.
- [x] Create one canonical release-readiness note after hardening is complete.
- [x] Record exact validation commands and expected outputs for contracts, frontend build, Vitest, and Playwright.
- [x] Record known accepted risks explicitly and ensure they are actually accepted, current, and justified.
- [x] Remove or archive stale status notes that would confuse a fresh reviewer about which version is live.

## 5. Cairo Rewrite Prerequisites

- [x] Do not continue from the pre-`v5` Cairo lifecycle.
- [x] Classify the current `cairo/` code as historical and schedule deletion or archival cleanup before rewrite work begins.
- [x] Freeze the live `v5` kernel invariants as the only source of truth for the Cairo rewrite.
- [x] Define the Cairo rewrite around the live kernel shape: unified `commit`, buyer-only `resolveProcess`, no fee, no cancel path, no escape hatches.
- [x] Translate the live EVM invariants into a chain-agnostic parity checklist.
- [x] Build an equivalence-test plan before writing new Cairo implementation code.
- [x] Port test intent from the live Solidity suite into Cairo parity coverage rather than porting the old Cairo lifecycle forward.
- [x] Decide whether any old Cairo utilities, test helpers, or docs are worth preserving before deleting the old branch.

## 6. Exit Criteria For Hardening Phase

- [x] Version naming is consistent: live system is `v5`, archives stay historical.
- [x] Solidity tests pass cleanly.
- [x] Frontend type-check passes cleanly.
- [x] Frontend production build completes cleanly.
- [x] High-value runtime warnings are resolved or deliberately accepted in writing.
- [x] Header policy is verified against real dispute iframe and geolocation flows.
- [x] Audit and readiness docs describe the actual live system.
- [x] Cairo rewrite prerequisites are written down before old Cairo code is removed.

## 7. Suggested Working Order

- [x] Finish versioning cleanup first.
- [x] Then fix production header policy and route-level security behavior.
- [x] Then clean React warning debt in live stateful flows.
- [x] Then refresh audit and readiness docs.
- [x] Then run the full validation pass.
- [x] Then archive or delete the old Cairo branch and start the `v5` rewrite from parity specs.