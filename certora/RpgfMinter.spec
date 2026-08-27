// SPDX-License-Identifier: MIT
// Certora CVL specification for RpgfMinter — the 600M retroactive florin
// distribution. This is the maintainer-approved formal-coverage gap: RpgfMinter
// mints florins, and its two worst historical bugs (a tranche-overdraw class,
// fixed pre-squash, and the pre-2026-07-30 clamp that let a repeated clause-or-assembly entry
// mint an entire tranche — see the `_entitlement` doc comment in the .sol)
// were both caught by audit, never by the Foundry suite. This spec proves the
// six properties that class of bug would have violated.
//
// Scope: only `src/rpgf/RpgfMinter.sol` is in the verified scene. Every
// dependency it calls through an interface — `IUsageCounter` (counter),
// `IFlorinMinter` (florin), `IClauseAuthor`/`IAssemblyAuthor` (clauses,
// assemblies) — is NOT itself verified here (each has, or will have, its own
// spec / Foundry suite); RpgfMinter's calls into them are summarized so the
// prover explores RpgfMinter's OWN logic against every possible answer those
// dependencies could give.
//
// Summarization choices, and why:
//
//   • `_isAuthor` (INTERNAL to RpgfMinter) is summarized directly to a ghost
//     boolean per (clauseOrAssembly, account), the same idiom BatchVerifierTokenOps.spec
//     uses for FigaroBatchVerifier's own internal helpers (_hashPositions et
//     al.): an internal-function summary on the contract UNDER VERIFICATION,
//     not a mock of an external dependency. This is deliberately NOT a
//     dispatcher over ClauseRegistry.depositOf / AssemblyRegistry.bindings —
//     the latter's auto-generated getter returns a dynamic `string contentURI`
//     CVL has no reason to model here, and whether THOSE registries correctly
//     compute (registrar, withdrawn) / (author, depositWithdrawn) is their own
//     test suite's job. What THIS spec must prove is narrower and sharper:
//     given an arbitrary answer from the eligibility gate, does RpgfMinter's
//     own claim path do the right thing with it? That is exactly what rule 5
//     (`ineligibleClauseOrAssemblyCannotBePaid`) checks, and the summary is fully
//     behavior-preserving for it: `_isAuthor` has no other observable effect
//     anywhere in RpgfMinter.sol.
//
//   • `counter.periodClosed` / `counter.totalScoreIn` / `counter.scoreOf` are
//     real external calls to a contract not in the scene (UsageCounter is a
//     large, independently-verified surface), so they go through the
//     wildcard `_.` dispatch pattern to ghost reads — same shape as
//     BatchVerifierTokenOps.spec's `_.balanceOf` / `_.contentHashOf`.
//     `counter.periodCount()` is called ONLY from RpgfMinter's constructor,
//     which no rule below executes (parametric `method f` rules range over
//     the ABI's external/public functions, never the constructor), so it is
//     deliberately left unsummarized.
//
//   • `florin.mint` is summarized to NONDET. In `claim`, BOTH state writes
//     this spec protects (`claimed[periodId][msg.sender] = true` and
//     `minted[periodId] = spent`) happen BEFORE `florin.mint` is called — the
//     call is the last statement in the function, checks-effects-interactions
//     — so no outcome of `florin.mint` (including a hypothetical reentrant
//     call back into RpgfMinter) can change what those rules watch. Florin's
//     own supply-cap/registry invariants are FlorinToken.spec's job.
//
// Rule numbering below follows the maintainer's brief exactly (rules 1-6);
// two supplementary rules (S1, S2) extend the same eligibility/no-double-claim
// properties to the `claimable` VIEW path, because a divergent quote there is
// exactly the shape of bug an audit catches and a test suite calling only
// `claim` would miss (`RpgfMinterTest.t.sol`'s own
// `test_claimableRejectsDuplicatesToo` exists for the same reason — this
// generalizes it to every input, not one example).

ghost mapping(bytes32 => mapping(address => bool)) g_isAuthor;
ghost mapping(uint8 => bool) g_periodClosed;
ghost mapping(uint8 => uint256) g_totalScoreIn;
ghost mapping(bytes32 => mapping(uint8 => uint256)) g_scoreOf;

methods {
    // RpgfMinter's own storage getters — none read msg.sender/block.*, all envfree.
    // `periodAmount` is a `uint256[]`, so its auto-generated Solidity getter is
    // indexed by `uint256`, unlike every other period-keyed mapping here
    // (which are keyed by `uint8` directly).
    function periodAmount(uint256) external returns (uint256) envfree;
    function minted(uint8) external returns (uint256) envfree;
    function claimed(uint8, address) external returns (bool) envfree;
    function claimable(uint8, address, bytes32[]) external returns (uint256) envfree;

    // Eligibility gate — internal-function summary on the verified contract
    // itself. See the file header for why this boundary, not the registries.
    function _isAuthor(bytes32 clauseOrAssembly, address account) internal returns (bool) => summarizeIsAuthor(clauseOrAssembly, account);

    // UsageCounter surface — real contract out of scene; every call wildcard-
    // dispatched to a ghost read.
    function _.periodClosed(uint8 period) external => summarizePeriodClosed(period) expect (bool);
    function _.totalScoreIn(uint8 period) external => summarizeTotalScoreIn(period) expect (uint256);
    function _.scoreOf(bytes32 clauseOrAssembly, uint8 period) external => summarizeScoreOf(clauseOrAssembly, period) expect (uint256);

    // FlorinToken.mint — no-op summary; see file header for the CEI argument.
    function _.mint(address, uint256) external => NONDET;
}

function summarizeIsAuthor(bytes32 clauseOrAssembly, address account) returns bool {
    return g_isAuthor[clauseOrAssembly][account];
}

function summarizePeriodClosed(uint8 period) returns bool {
    return g_periodClosed[period];
}

function summarizeTotalScoreIn(uint8 period) returns uint256 {
    return g_totalScoreIn[period];
}

function summarizeScoreOf(bytes32 clauseOrAssembly, uint8 period) returns uint256 {
    return g_scoreOf[clauseOrAssembly][period];
}

// ═══════════════════════════════════════════════════════════════════
// RULE 1: Per-period mint conservation
//
// minted[periodId] never exceeds periodAmount[periodId], under ANY sequence
// of claims by ANY wallets. Written as an inductive preservation rule (the
// FlorinToken.spec idiom) rather than `invariant`: the init state is trivial
// (minted starts at 0 for every period, since the constructor never touches
// it), and every method either leaves `minted` alone or advances it exactly
// to `spent`, which `claim` itself gates with
// `if (spent > periodAmount[periodId]) revert PeriodBudgetExceeded(periodId);`
// immediately before committing it — so the rule is a direct restatement of
// that guard, proved to hold no matter which method (or which wallet, via
// the free `method f` and unconstrained calldata) is exercised next.
//
// This is the rule the tranche-overdraw bug class (fixed pre-squash) would have
// failed: any regression that lets `spent` exceed the budget slip through
// (e.g. dropping the comparison, or computing `spent` after the write)
// violates this assertion on the very call that overdraws.
// ═══════════════════════════════════════════════════════════════════

rule mintedNeverExceedsPeriodBudget(uint8 periodId, method f) {
    require minted(periodId) <= periodAmount(periodId);

    env e;
    calldataarg args;
    f(e, args);

    assert minted(periodId) <= periodAmount(periodId),
        "minted[periodId] must never exceed periodAmount[periodId], under any sequence of claims";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 2: One claim per wallet per period (no double-claim)
// ═══════════════════════════════════════════════════════════════════

rule noDoubleClaimPerWalletPerPeriod(uint8 periodId, bytes32[] clausesOrAssemblies) {
    env e;
    require claimed(periodId, e.msg.sender);

    claim@withrevert(e, periodId, clausesOrAssemblies);

    assert lastReverted,
        "claim must revert if msg.sender already claimed this period";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 3: No claim while the period is open (periodEnd / periodClosed gating)
// ═══════════════════════════════════════════════════════════════════

rule cannotClaimWhilePeriodOpen(uint8 periodId, bytes32[] clausesOrAssemblies) {
    require !g_periodClosed[periodId];

    env e;
    claim@withrevert(e, periodId, clausesOrAssemblies);

    assert lastReverted,
        "claim must revert while counter.periodClosed(periodId) is false";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 4: A duplicate clause-or-assembly in one claim call cannot increase the payout
//
// Matches the contract's ACTUAL mechanism: `_entitlement`'s inner loop
// reverts with `DuplicateClauseOrAssembly` the moment any two entries repeat, rather
// than silently deduplicating or (the pre-2026-07-30 bug) clamping the sum
// up to the period total. Proved for an arbitrary repeated pair (i, j) at any
// positions in an arbitrary-length list — not one example list.
// ═══════════════════════════════════════════════════════════════════

rule duplicateClauseOrAssemblyReverts(uint8 periodId, bytes32[] clausesOrAssemblies, uint256 i, uint256 j) {
    require i < clausesOrAssemblies.length && j < i && clausesOrAssemblies[i] == clausesOrAssemblies[j];

    env e;
    claim@withrevert(e, periodId, clausesOrAssemblies);

    assert lastReverted,
        "claim must revert if the clause-or-assembly list contains any duplicate";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 5: Eligibility — a withdrawn/non-author clause-or-assembly receives nothing
//
// `_isAuthor(clauseOrAssembly, account)` is the live-stake gate: false whenever the
// clause registrar or assembly designer has withdrawn its registration
// deposit (or the caller was never the author of record at all). Proved
// against the ghost directly — for ANY (clauseOrAssembly, account) pair the gate
// would refuse, including one buried anywhere in an arbitrary-length list —
// `claim` must revert rather than pay. This matches RpgfMinter's actual
// mechanism (all-or-nothing per call, not a per-entry skip): a claim
// naming one ineligible clause-or-assembly among otherwise-eligible ones still reverts
// whole, exactly as `NotAuthorOfRecord` is coded.
// ═══════════════════════════════════════════════════════════════════

rule ineligibleClauseOrAssemblyCannotBePaid(uint8 periodId, bytes32[] clausesOrAssemblies, uint256 i) {
    env e;
    require i < clausesOrAssemblies.length;
    require !g_isAuthor[clausesOrAssemblies[i]][e.msg.sender];

    claim@withrevert(e, periodId, clausesOrAssemblies);

    assert lastReverted,
        "claim must revert if any clause-or-assembly in the list is not msg.sender's live-staked clause-or-assembly of record";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 6: Budget backstop — minted[periodId] is monotonic
//
// Same shape as FlorinToken.spec's totalRegisteredCapMonotonic: `minted` is
// only ever assigned `spent = minted[periodId] + amount` with `amount`
// implicitly > 0 (claim reverts on `amount == 0` via NothingToClaim before
// reaching the write), so every write can only increase it, and no code path
// decreases it (no admin, no sweep, no claim expiry — by design; see
// DESIGN_DECISIONS.md § "No owner, no admin, no escape hatch").
// ═══════════════════════════════════════════════════════════════════

rule mintedMonotonic(uint8 periodId, method f) {
    uint256 before = minted(periodId);

    env e;
    calldataarg args;
    f(e, args);

    uint256 afterCall = minted(periodId);

    assert afterCall >= before,
        "minted[periodId] must never decrease";
}

// ═══════════════════════════════════════════════════════════════════
// SUPPLEMENTARY S1: `claimable` (the view quote) rejects the same duplicate
// list `claim` would reject — a divergent quote is a silent quoting bug even
// with `claim` itself safe (exactly the failure mode
// `test_claimableRejectsDuplicatesToo` guards one example of in Foundry).
// ═══════════════════════════════════════════════════════════════════

rule claimableRejectsDuplicatesToo(uint8 periodId, address account, bytes32[] clausesOrAssemblies, uint256 i, uint256 j) {
    // Two early-return paths reach the dedupe loop in `_entitlement` only
    // conditionally, and both are legitimate non-revert shapes independent of
    // the clause-or-assembly list's contents:
    //   (a) `claimable` itself short-circuits to `return 0` for an
    //       already-claimed wallet BEFORE calling `_entitlement` at all (see
    //       claimableReturnsZeroForAlreadyClaimedWallet);
    //   (b) `_entitlement` short-circuits to `(0, 0)` when
    //       `counter.totalScoreIn(periodId) == 0` — BEFORE its own dedupe
    //       loop runs. On `claim` this still reverts one step later
    //       (`amount == 0` => `NothingToClaim`), which is why rule 4 holds
    //       unconditionally; `claimable` has no such second gate, so a
    //       genuinely empty period returns 0 for ANY list, dupes included.
    // Excluding both isolates what this rule actually checks: for a wallet
    // that hasn't claimed, in a period with real score to divide, the view
    // path enforces the same dedupe guard `claim` does.
    require !claimed(periodId, account);
    require g_totalScoreIn[periodId] != 0;
    require i < clausesOrAssemblies.length && j < i && clausesOrAssemblies[i] == clausesOrAssemblies[j];

    claimable@withrevert(periodId, account, clausesOrAssemblies);

    assert lastReverted,
        "claimable must reject the same duplicate-entry list claim() would reject, for a wallet that has not yet claimed in a non-empty period";
}

// ═══════════════════════════════════════════════════════════════════
// SUPPLEMENTARY S2: `claimable` quotes zero once the wallet has already
// claimed the period — the view-side twin of rule 2.
// ═══════════════════════════════════════════════════════════════════

rule claimableReturnsZeroForAlreadyClaimedWallet(uint8 periodId, address account, bytes32[] clausesOrAssemblies) {
    require claimed(periodId, account);

    uint256 quoted = claimable@withrevert(periodId, account, clausesOrAssemblies);
    bool reverted = lastReverted;

    assert !reverted => quoted == 0,
        "claimable must quote zero once a wallet has already claimed the period";
}
