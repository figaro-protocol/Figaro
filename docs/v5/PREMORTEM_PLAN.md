# Pre-Mortem Implementation Plan

Date: 2026-03-30
Status: Active — Phase 1 complete. Phase 2 next.

Constraints: custody model and game theory are fixed. No changes to the
bonding equilibrium, irrevocable commitment, pull-based withdrawals,
no-timeout property, or on-chain evidence layer.

---

## 1. FigaroCore Split for Tooling (Coverage Unblock)

### Problem
FigaroCore is too large for Foundry's coverage instrumentation. Functions with
10+ locals overflow the EVM's 16-slot stack when counter variables are added.
This is a tooling limitation, not a correctness problem.

### Proposal
Split FigaroCore into three internal contracts behind a single facade:
- `ProcessRegistry` — order creation, state transitions, process tree structure
- `BondLedger` — token custody, lock/unlock, withdrawal, credit accounting
- `SettlementEngine` — resolution logic, fee calculation, payout distribution

The deployed contract is still one address (or a diamond/facade). The split is
file-level for instrumentability and audit readability. Trust boundary unchanged.

### Risk
High — this touches the kernel. Every TLA+ spec, every Foundry test, every
frontend hook references FigaroCore. The refactor must be behavior-preserving.

### Validation
- All 546 Foundry tests pass after refactor
- TLA+ model checking still passes (specs reference abstract operations, not
  Solidity function names, so specs should be unaffected)
- Foundry coverage instrumentation succeeds on the split files
- Slither re-run: 0 production findings

### Dependencies
None — this is internal refactoring.

---

## 2. Per-Process Fee Parameter ✅ DONE

**Completed 2026-03-30.**

`firstOrder` now takes `uint16 feeOverride` (9th param). If zero, uses the
global `feeRate`. If nonzero, must be within `[MIN_FEE, MAX_FEE]` range.
Stored in `processFeeOverride[processId]` and inherited by all sub-orders
via `_initOrder`. Fee priority: `init.feeOverride > processFeeOverride > feeRate`.

- 6 new tests in `FeeOverrideTest`: applied, zero-uses-global, sub-order
  inheritance, out-of-range rejection, fee-used-in-resolution
- All 544 existing Foundry tests pass
- Frontend ABI + hooks updated (both repos)
- TypeScript type-check clean

---

## 3. Stateless Coordinators (Event-Only) ✅ DONE

**Completed 2026-03-30.**

Replaced domain-specific coordinators with a single generic
`LifecycleCoordinator` — zero mutable state, schema-typed attestations via
`bytes32 schemaId`, three role-gated attestation modes plus proximity variants.

**New contracts:**
- `IRoleResolver` interface — generic role-authorization for mechanism contracts
- `LifecycleCoordinator` — stateless coordinator with 6 external functions:
  `attestAsSeller`, `attestAsSellerWithProximity`, `attestAsBuyer`,
  `attestAsBuyerWithProximity`, `attestViaResolver`, `attestViaResolverWithProximity`
- `DutchAuctionDriverMarketV3` now implements `IRoleResolver.isAuthorized`

**Design decisions:**
- Schema versioning pattern (same as ManifestSchemaRegistry / GHG):
  `bytes32 schemaId` identifies lifecycle vocabulary, numeric `stage` interpreted by schema
- Three attestation modes: seller (cross-order within same process), buyer
  (same pattern), resolver (FigaroCore seller field as trust anchor — no whitelist)
- Proximity proofs preserved on-chain (ECDSA recovery in pure functions)
- Old coordinators kept for backward compatibility; new contract is the
  replacement path

**Validation:**
- 21 new Foundry tests (575 total Prototype2, 202 Figaro-eats)
- Frontend ABI + `useLifecycleCoordinator` hook wired in both repos
- TypeScript clean, 242 Vitest tests pass

---

## 4. Auction Settlement Consolidation

### Problem
Post-resolution auction settlement requires 3 separate calls in order:
`payDriver` → `repayVault` → `refundSurplus`. Ordering is implicit — calling
out of sequence fails silently or reverts.

### Proposal — Option A: Consolidate (simpler)
Add `settleAuction(orderId)` that atomically executes all three steps.
Keep existing individual functions for backward compatibility but mark
deprecated. The vault lending model (borrow at claim, repay at resolution)
is unchanged.

### Proposal — Option B: Flash settlement (deeper)
Restructure vault interaction so the bond is borrowed and repaid within a
single transaction at resolution time, not held as a loan for the order's
lifetime. The vault's exposure window shrinks from "entire order lifetime"
to "within one atomic settlement transaction." This eliminates:
- The `loans` mapping and `totalBorrowed` tracking
- The socialized loss model (no outstanding loans to default on)
- The multi-step post-resolution sequence entirely

Option B requires rethinking how `claimAndAccept` works — the driver would
claim the auction (setting assignedDriver + clearingPrice) without posting
the seller bond at claim time. The bond would be flash-borrowed and posted
at resolution. This changes the trust model: between claim and resolution,
the driver has no capital at risk. The MAD equilibrium during the active
order would rely on the driver's reputation/registration rather than locked
capital.

**Decision needed:** Option B changes the economic exposure model during the
active phase. This may or may not be acceptable depending on whether MAD
during the delivery window is required or whether the auction claim itself
is sufficient commitment.

### Risk
Option A: Low — additive function, existing flow unchanged.
Option B: High — changes vault lending model and driver commitment timing.

### Validation
- Option A: existing tests + new `settleAuction` integration test
- Option B: full vault test rewrite, new economic invariant tests

### Dependencies
Option A: None.
Option B: Requires decision on whether driver MAD during active order is
required.

---

## 5. ConditionalAcceptModule as Predicate (preAcceptHook) ✅ DONE

**Completed 2026-03-30.**

FigaroCore now supports `preAcceptHook`: orders optionally register a hook
contract at creation. `acceptOffer` calls `hook.canAccept(orderId)` via
bounded `staticcall{gas: 100_000}`. If hook returns false, revert.
Seller is the actual seller in FigaroCore — no proxy pattern.

`IPreAcceptHook` interface: single function `canAccept(uint256) → bool`.

`ConditionalAcceptModule` rewritten as pure predicate:
- Implements `IPreAcceptHook.canAccept`
- Stores conditions (timestamp gate, attestation gate, price feed gate)
- No token handling, no proxy selling, no `confirmSeller`
- `registerCondition` verifies `core.preAcceptHook(orderId) == address(this)`

`firstOrder` now takes `address preAcceptHook` (9th param, after feeOverride).
`subOrder` now takes `address preAcceptHook` (8th param).

- 30+ new/rewritten tests across TimestampGate, AttestationGate, PriceFeedGate,
  Lifecycle, AccessControl, Event, GetCondition, PreAcceptHook test contracts
- All 544 Foundry tests pass, 202 Eats tests pass
- Frontend ABI + hooks updated (both repos), TypeScript clean
- Vendored FigaroCore + IPreAcceptHook synced to Figaro-eats

---

## 6. Kleros Extraction

### Problem
Kleros-specific integration (iframe evidence display, arbitrable proxy,
IPFS pinning) is wired into the core frontend. This implies Kleros is
the protocol's dispute mechanism rather than one option.

### Proposal
Extract to `@figaro/kleros-integration` package:
- Move `lib/dispute/` to the package
- Move `app/evidence-display/` to the package
- Move arbitrable proxy contract + deployment to the package
- Core frontend retains the evidence timeline (protocol-native)
- Package provides "submit to arbitration" flow as an opt-in module

### Risk
Low — extraction only. No behavior change for existing users.

### Validation
- Core frontend builds without dispute/ imports
- Kleros package builds and tests independently
- Evidence display iframe still works when hosted from the package

### Dependencies
None.

---

## 7. Frontend: Credit Recycling UX ✅ DONE

**Completed 2026-03-31.**

`useBondPreview` now reads `available(address, currency)` from FigaroCore and
computes `walletNeeded = max(0, proposerBond - availableCredit)`. Exported
`computeCreditBreakdown` pure function for testability.

`BondApprovalPanel` shows a green credit breakdown when `availableCredit > 0`:
"From protocol balance: X" / "New from wallet: Y". When credit covers the
full bond, displays "Covered by protocol balance ✓" and hides the approve
button entirely.

`OrderControls` and `SubOrderModal` pass credit-adjusted amounts to approval
logic — `needsApproval(walletNeeded)` instead of `needsApproval(totalNeeded)`.

- 7 new Vitest tests for `computeCreditBreakdown` (249 total, all pass)
- All changes mirrored to Figaro-eats
- TypeScript clean (both repos)

### Dependencies
None.

---

## 8. Frontend: Module Registry Simplification ✅ DONE

**Completed 2026-03-30.**

Replaced mutable `Map`-based module registry with a static `Record<string, ModuleComponent>`
in `moduleRegistry.ts`. All 22 module imports moved from `registerAllModules.ts`
(deleted) into the static map. `getModule()` is now a plain object lookup.
`InstitutionWorkspace` no longer calls `ensureModulesRegistered()`.

Module interface contracts preserved (`ModuleProps`, `ModuleRenderContext`,
`ModuleBinding`) — re-introducing dynamic registration is a one-file change
if external builders need it.

- `registerAllModules.ts` deleted
- `moduleRegistry.ts` simplified (removed `registerModule`, `hasModule`, `listRegisteredModuleIds`)
- `InstitutionWorkspace.tsx` updated (removed import + call)
- 249 Vitest tests pass, 114/116 Playwright mock tests pass (2 pre-existing failures unrelated)
- TypeScript clean

### Dependencies
None.

---

## 9. Frontend: Unified Test Provider ✅ COMPLETE

### Problem
Mock and devnet Playwright tests duplicate test logic. Two implementations
of the same user flows can drift.

### Proposal
Shared test suites with injected provider:
- Extract user flow logic into shared test functions
- Mock project: inject in-memory EIP-1193 provider
- Devnet project: inject live Anvil provider
- Same test code, different providers

### Implementation
Extracted overlapping mock/devnet tests into `*.shared.spec.ts` files that run
in both projects via the `figaro-test.ts` unified fixture:
- `admin.shared.spec.ts` (2 tests) — heading + fee section rendering
- `create-order-home.shared.spec.ts` (2 tests) — bond preview + origin/dest validation
- `builders-prototype.shared.spec.ts` (2 tests) — institution list + eats shell rendering
- (Pre-existing: `order-validation.shared.spec.ts` — 2 tests)

Lifecycle and sub-order pairs kept separate (fundamentally different wallet models).

### Validation
- Mock: 114 passed (was 113 — +1 from new bond preview shared test)
- Devnet: 41 passed, 1 transient timeout (was 33-34 — +5-6 from shared specs)
- Total test count increased. No regressions.

---

## Sequencing Recommendation

The dominant sequencing constraint is **deployment immutability**. FigaroCore
cannot be changed after deployment. Every FigaroCore modification is free today
and impossible tomorrow. Non-FigaroCore changes can happen at any time.

Front-load everything that requires FigaroCore modification.

### Phase 1 — FigaroCore changes (pre-deployment window, closing) ✅ COMPLETE

~~These items have a closing window. Once FigaroCore deploys, they are
permanently foreclosed.~~

1. ✅ **Item 5: preAcceptHook** — Done. Hook point on `acceptOffer`,
   bounded staticcall, ConditionalAcceptModule rewritten as pure predicate.

2. ✅ **Item 2: Per-process fee parameter** — Done. `feeOverride` on
   `firstOrder`, range-checked, inherited by sub-orders.

3. ⏭️ **Item 1: FigaroCore split** — **Deferred.** The 544 tests + TLA+ provide
   strong assurance without line coverage. The split is a large-effort
   refactor whose only benefit is coverage instrumentation. Defensible
   to skip: the pre-deployment changes (items 5, 2) are complete and
   validated. Revisit only if coverage gaps cause a missed bug.

### Phase 2 — Mechanism module changes (next)

No deployment constraint. These can ship independently.

4. ✅ **Item 4A: settleAuction consolidation** — Done. Added
   `settleAuction(orderId)` that atomically executes payDriver →
   reclaimAndRepay → refundSurplus in a single transaction. Emits all
   individual events plus `AuctionSettled`. Individual functions remain
   for backward compatibility. 10 new Foundry tests (554 total).
   Frontend ABI + `settleJob` hook wired in both repos.

5. ✅ **Item 3: Stateless coordinators** — Done. Single generic
   `LifecycleCoordinator` with zero state, schema-typed attestations,
   three role-gated modes + proximity variants. IRoleResolver on market.
   21 new Foundry tests (575 total). Frontend ABI + hook in both repos.

### Phase 3 — Frontend (any time) ← YOU ARE HERE

6. ✅ **Item 7: Credit recycling UX** — Done. `useBondPreview` reads
   `available()` from FigaroCore, `BondApprovalPanel` shows credit breakdown,
   approval flow uses credit-adjusted amounts. 7 new Vitest tests (249 total).
   Both repos updated, TypeScript clean.

7. **Item 9: Unified test provider** — Do before the test suite grows
   further. Mock/devnet drift compounds over time.

### Defer

8. **Item 6: Kleros extraction** — Do when the first external builder
   asks "how do I plug in my own dispute mechanism?" Not before.

9. ✅ **Item 8: Module registry simplification** — Done. Static module map
   replaces mutable Map + `registerAllModules.ts`. Interface contracts preserved.

### Drop

10. **Item 4B: Flash settlement** — The economic question (driver MAD
    during active window) has no obvious answer, and the consolidation
    in 4A solves the UX problem. Revisit only if the vault's socialized
    loss model becomes a real problem with actual defaults.
