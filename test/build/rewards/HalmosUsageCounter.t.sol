// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {UsageCounter} from "src/build/rewards/UsageCounter.sol";
import {MockClauseOrAssemblyStake} from "test/helpers/MockClauseOrAssemblyStake.sol";

/// @notice Permissive seller-side stake gate — always reports registered.
/// @dev    The linkage between `UsageCounter` and a LIVE `MembersRegistry` stake
///         is already proved symbolically in `HalmosMembersRegistry`
///         (`check_theCounterAdmitsUsageExactlyWhileTheStakeIsLive`, the E-5
///         property: "the counter admits usage iff the stake is live"). This
///         harness's job is the ARITHMETIC on top of that gate, so it is
///         deliberately isolated from stake mechanics here rather than
///         re-derived — a permissive mock, exactly like `MockClauseOrAssemblyStake`
///         isolates the clause-or-assembly-side gate in the concrete `UsageCounterTest`.
contract MockAlwaysMember {
    function registered(address) external pure returns (bool) {
        return true;
    }
}

/// @notice Test-only subclass exposing `_accrue` directly.
/// @dev    `recordClauseUsage` / `recordAgreementUsage` / `recordAssemblyUsage` reach `_accrue` only
///         after a signed EIP-712 order (2 ECDSA recoveries) and a merkle
///         inclusion proof — both unreachable to Halmos symbolically (see
///         `reference_halmos_operations`: "a property needing signed EIP-712
///         input is out of reach symbolically"). `_accrue` is the exact
///         internal function EVERY public entry point calls once its own
///         checks pass, so exercising it directly proves the shared direct-path
///         arithmetic without re-proving the proof/signature gates (covered
///         concretely by `UsageCounterTest`) or the stake linkage (covered
///         above). This is a NEW contract in `test/`, not an edit to
///         `src/UsageCounter.sol` — the frozen surface is untouched.
contract UsageCounterHarness is UsageCounter {
    constructor(
        address _core,
        address _members,
        address _clauses,
        address _assemblies,
        address _agreements,
        address _batchVerifier,
        uint64 _minSellers,
        uint64[] memory _periodEnd
    ) UsageCounter(_core, _members, _clauses, _assemblies, _agreements, _batchVerifier, _minSellers, _periodEnd) {}

    function accrue(bytes32 clauseOrAssembly, uint8 period, bytes32 processId, address seller) external {
        _accrue(KIND_CLAUSE, clauseOrAssembly, period, processId, seller);
    }

    function accrueAs(uint8 kind, bytes32 clauseOrAssembly, uint8 period, bytes32 processId, address seller) external {
        _accrue(kind, clauseOrAssembly, period, processId, seller);
    }
}

/// @title HalmosUsageCounter — the ACCRUAL ARITHMETIC on top of the (already
///        proved) stake gate
///
/// @notice `HalmosMembersRegistry` proves the LINKAGE: the counter admits usage
///         iff a live stake backs it. That says nothing about whether the
///         numbers the counter then computes are RIGHT — whether two calls
///         only ever add, whether a batch overwrite can accidentally become an
///         accumulate, whether the two resolution universes (direct,
///         proof-gated batch) combine the way `scoreOf` claims, whether a
///         period boundary is respected exactly, and whether one clause or assembly's
///         bookkeeping can leak into another's, or one kind's into the
///         another's at the same key. Nine properties, symbolically,
///         for ALL inputs in their domain — not the paths a concrete Foundry
///         test happened to walk:
///
///           1  direct accrual is monotone   — `accrualOf` (c, d, score) and
///              (check_directAccrualMonotone)  `totalScoreIn` never go
///                                             backwards under any sequence of
///                                             `_accrue` calls, successful or
///                                             reverted.
///           2  batch accrual REPLACES,      — THE crease: `applyBatchAccrual`
///              never adds                     writes the guest's CUMULATIVE
///              (check_batchAccrualReplacesNeverAdds)
///                                             `(c, d)` as an overwrite. An
///                                             add-instead-of-replace regression
///                                             would double-count every batch
///                                             and is invisible to every other
///                                             harness (docs/CONTRACTS.md
///                                             "Merging the two paths").
///           3  score composition           — `scoreOf == accrualOf.score +
///              (check_scoreOfIsExactlyDirectPlusBatch)
///                                             batchAccrualOf.score`, in every
///                                             combination of which path(s)
///                                             have been used — the two
///                                             universes meet ONLY by addition.
///           4  period bucketing            — split into two checks: (4a) the
///              (check_currentPeriod_bucketsExactlyTheContainingWindow,
///               check_wrongPeriodIsRejected_andOtherPeriodUntouched)
///                                             boundary arithmetic itself
///                                             (`currentPeriod()`) buckets
///                                             every timestamp into exactly the
///                                             window that contains it, or
///                                             refuses (closed); (4b) a write
///                                             claiming the wrong period is
///                                             rejected and never disturbs the
///                                             other period's entry.
///           5  cross-clause-or-assembly isolation    — recording usage for clause or assembly A
///              (check_crossClauseOrAssemblyIsolation) leaves every field of clause or assembly
///                                             B's bookkeeping byte-for-byte
///                                             unchanged, and the shared
///                                             `totalScoreIn` moves by EXACTLY
///                                             A's own score delta.
///           6  kind isolation              — a use counted under any one of
///              (check_theKindsNeverShareAKey) the three kinds, direct or
///                                             batch, leaves every other kind's
///                                             accrual at the same key empty,
///                                             and the same process still
///                                             counts once under the other
///                                             kind.
///           7  kind isolation, reversed    — another kind's EXISTING accrual
///              (check_aKindNeverDisturbsAnotherKindsAccrual)
///                                             at the key, either path, is
///                                             left exactly as it was by a use
///                                             counted under one kind.
///           8  unknown kind skipped        — a batch accrual whose kind names
///              (check_anUnknownKindIsSkipped) no registry writes nothing under
///                                             any kind and leaves the period
///                                             total where it was.
///
///         Halmos convention: `check_` prefix, not `test_`.
///
/// @dev    SCOPING FOR TRACTABILITY. `_score` computes `icbrt(c * d^2 * 1e18)`,
///         a ~87-iteration binary search whose trip count depends on the
///         MAGNITUDE of the symbolic product, not its BOUND — so narrowing a
///         symbolic `uint64` to a small range does not shorten the loop the
///         way it does for, say, a payment amount. Properties 2, 3 and 5 use a
///         `bool` selector to pick between small CONCRETE `(c, d)` pairs
///         instead of leaving them symbolic, exactly the "bounded control flow
///         (a few `bool` branch selectors rather than an unbounded call
///         sequence)" scoping `reference_halmos_operations` prescribes — the
///         crease these properties hunt is in which VALUE gets stored, not in
///         `icbrt`'s own correctness (which is fuzzed exhaustively over the
///         full `uint256` domain elsewhere, per docs/CONTRACTS.md). Property 1
///         needs no such bound: `_accrue`'s own `c`/`d` are internal
///         counters incremented by 0 or 1 per call, never externally supplied,
///         so two calls bound them to {0, 1, 2} without any `vm.assume`.
///
/// @dev    WHAT THIS DOES NOT PROVE: the stake-gating linkage (E-5, proved in
///         `HalmosMembersRegistry`) and `icbrt`'s own numerical correctness
///         (proved by concrete fuzzing over the `uint256` domain, per
///         docs/CONTRACTS.md "The bound belongs to the type the arithmetic is
///         done in"). Both are deliberately isolated out via the permissive
///         mocks above so this file proves only the arithmetic layered on top.
contract HalmosUsageCounter is Test {
    /// @dev The arithmetic below is proved on the clause kind; the kinds share
    ///      every line of it, and `check_theKindsNeverShareAKey` proves no two
    ///      of the three ever touch each other's accruals.
    uint8 internal constant KIND_CLAUSE = 0;
    bytes32 internal constant PROVENANCE_LEAF = keccak256("figaro-agreement-provenance");
    bytes32 internal constant ASSEMBLY_TERMS_LEAF = keccak256("figaro-assembly-terms");
    uint64 internal constant P0_END = 1_000_000;
    uint64 internal constant P1_END = 2_000_000;

    /// @dev Bundles one `(c, d, score, total)` reading behind a single memory
    ///      pointer so a snapshot occupies one stack entry instead of four —
    ///      needed to keep `check_directAccrualMonotone` under the legacy
    ///      codegen stack limit with 6 symbolic parameters already live.
    struct Snapshot {
        uint64 c;
        uint64 d;
        uint256 score;
        uint256 total;
    }

    /// @dev One counter per check — no shared setUp, so each property starts
    ///      from a fresh, empty state exactly like the sibling harnesses.
    function _deploy() internal returns (UsageCounterHarness) {
        uint64[] memory periods = new uint64[](2);
        periods[0] = P0_END;
        periods[1] = P1_END;
        return new UsageCounterHarness(
            address(0xC0FFEE), // core — unused by `_accrue`/`applyBatchAccrual`
            address(new MockAlwaysMember()), // seller-side gate — isolated, see header
            address(new MockClauseOrAssemblyStake()), // clause-side clauseOrAssembly gate — live by default
            address(new MockClauseOrAssemblyStake()), // assembly-side clauseOrAssembly gate — live by default
            address(new MockClauseOrAssemblyStake()), // agreement-side clauseOrAssembly gate — live by default
            address(this), // batchVerifier — this contract IS the caller below
            1, // minSellers = 1 — floor disabled, isolate from that gate
            periods
        );
    }

    // ── 1. Direct accrual monotonicity ───────────────────────────────

    /// `accrualOf` (c, d, score) and `totalScoreIn` never decrease across any
    /// sequence of `_accrue` calls — successful or reverted (idempotence
    /// makes a repeat a no-op, which is monotone trivially since state is
    /// unchanged on revert).
    function check_directAccrualMonotone(
        bytes32 clauseOrAssembly,
        uint8 period,
        bytes32 processId1,
        bytes32 processId2,
        address seller1,
        address seller2
    ) public {
        UsageCounterHarness counter = _deploy();

        Snapshot memory s0 = _snapshot(counter, clauseOrAssembly, period);

        Snapshot memory s1 = _accrueAndSnapshot(counter, clauseOrAssembly, period, processId1, seller1);
        assertGe(s1.c, s0.c, "c never goes backwards");
        assertGe(s1.d, s0.d, "d never goes backwards");
        assertGe(s1.score, s0.score, "score never goes backwards");
        assertGe(s1.total, s0.total, "the period total never goes backwards");

        Snapshot memory s2 = _accrueAndSnapshot(counter, clauseOrAssembly, period, processId2, seller2);
        assertGe(s2.c, s1.c, "c never goes backwards (2nd call)");
        assertGe(s2.d, s1.d, "d never goes backwards (2nd call)");
        assertGe(s2.score, s1.score, "score never goes backwards (2nd call)");
        assertGe(s2.total, s1.total, "the period total never goes backwards (2nd call)");
    }

    /// @dev Reads the current `(c, d, score, total)` accrual for a clause or
    ///      assembly — factored out of `check_directAccrualMonotone` so each
    ///      snapshot occupies one `Snapshot memory` stack entry at the call
    ///      site instead of four scalars (this repo's existing pattern for
    ///      stack depth, matching `UsageCounterTest`'s `_recordOn`/`_accrual`
    ///      helpers).
    function _snapshot(UsageCounterHarness counter, bytes32 clauseOrAssembly, uint8 period)
        internal
        view
        returns (Snapshot memory s)
    {
        (s.c, s.d, s.score) = counter.accrualOf(KIND_CLAUSE, clauseOrAssembly, period);
        s.total = counter.totalScoreIn(period);
    }

    /// @dev Fires one `_accrue` call through the harness and returns the
    ///      post-call snapshot — see `_snapshot` above for why the return is
    ///      a struct rather than four scalars.
    function _accrueAndSnapshot(
        UsageCounterHarness counter,
        bytes32 clauseOrAssembly,
        uint8 period,
        bytes32 processId,
        address seller
    ) internal returns (Snapshot memory) {
        address(counter).call(abi.encodeCall(counter.accrue, (clauseOrAssembly, period, processId, seller)));
        return _snapshot(counter, clauseOrAssembly, period);
    }

    // ── 2. Batch accrual REPLACES, never adds ────────────────────────

    /// THE crease: two `applyBatchAccrual` writes for the same clause or assembly, the
    /// second carrying a NEW cumulative `(c, d)`. The stored accrual after the
    /// second write is EXACTLY that new value — never `first + second`. An
    /// add-instead-of-replace regression would double every batch's count and
    /// is invisible to `scoreOf`, to any indexer, and to `UsageCounterTest`'s
    /// own concrete fixtures unless they happen to probe this exact sequence.
    function check_batchAccrualReplacesNeverAdds(bytes32 clauseOrAssembly, address seller, bool grow) public {
        // The two reserved keys are skipped on the batch path by design
        // (UsageCounterTest covers it).
        vm.assume(clauseOrAssembly != PROVENANCE_LEAF && clauseOrAssembly != ASSEMBLY_TERMS_LEAF);
        UsageCounterHarness counter = _deploy();
        vm.warp(P0_END - 1000); // deterministic: period 0 is open

        address[] memory sellers = new address[](1);
        sellers[0] = seller;

        UsageCounter.BatchAccrual[] memory first = new UsageCounter.BatchAccrual[](1);
        first[0] = UsageCounter.BatchAccrual(clauseOrAssembly, KIND_CLAUSE, 2, 2);
        counter.applyBatchAccrual(0, PROVENANCE_LEAF, first, sellers);

        {
            (uint64 c1, uint64 d1,) = counter.batchAccrualOf(KIND_CLAUSE, clauseOrAssembly, 0);
            assertEq(c1, 2);
            assertEq(d1, 2);
        }

        // A non-decreasing cumulative update — required by `AccrualWentBackwards`
        // — that is either equal to (grow=false) or strictly ahead of
        // (grow=true) the first write, in each case.
        uint64 c2Target = grow ? 5 : 2;
        uint64 d2Target = grow ? 3 : 2;

        UsageCounter.BatchAccrual[] memory second = new UsageCounter.BatchAccrual[](1);
        second[0] = UsageCounter.BatchAccrual(clauseOrAssembly, KIND_CLAUSE, c2Target, d2Target);
        counter.applyBatchAccrual(0, PROVENANCE_LEAF, second, sellers);

        (uint64 c2, uint64 d2, uint256 score2) = counter.batchAccrualOf(KIND_CLAUSE, clauseOrAssembly, 0);

        assertEq(c2, c2Target, "c is the cumulative value just proved, not c1 + c2Target");
        assertEq(d2, d2Target, "d is the cumulative value just proved, not d1 + d2Target");
        assertEq(
            score2,
            counter.icbrt(uint256(c2Target) * uint256(d2Target) * uint256(d2Target) * 1e18),
            "score recomputed from the new (c, d) only"
        );
        // The O(1) running-total maintenance is delta-based (`total += updated
        // - previous`); if it silently degenerated into an accumulate this
        // would read `score1 + score2` instead.
        assertEq(counter.totalScoreIn(0), score2, "the period total is exactly the current score, never a running sum");
    }

    // ── 3. Score composition ──────────────────────────────────────────

    /// `scoreOf(clause-or-assembly, period) == accrualOf.score + batchAccrualOf.score`
    /// for every combination of "has the direct path recorded here" and "has
    /// the batch path recorded here" — the only place the two resolution
    /// universes ever meet is this addition.
    function check_scoreOfIsExactlyDirectPlusBatch(
        bytes32 clauseOrAssembly,
        address seller,
        bytes32 processId,
        bool doDirect,
        bool doBatch
    ) public {
        UsageCounterHarness counter = _deploy();
        vm.warp(P0_END - 1000);

        if (doDirect) {
            counter.accrue(clauseOrAssembly, 0, processId, seller);
        }
        if (doBatch) {
            address[] memory sellers = new address[](1);
            sellers[0] = seller;
            UsageCounter.BatchAccrual[] memory accr = new UsageCounter.BatchAccrual[](1);
            accr[0] = UsageCounter.BatchAccrual(clauseOrAssembly, KIND_CLAUSE, 3, 2);
            counter.applyBatchAccrual(0, PROVENANCE_LEAF, accr, sellers);
        }

        (,, uint256 directScore) = counter.accrualOf(KIND_CLAUSE, clauseOrAssembly, 0);
        (,, uint256 batchScore) = counter.batchAccrualOf(KIND_CLAUSE, clauseOrAssembly, 0);

        assertEq(
            counter.scoreOf(KIND_CLAUSE, clauseOrAssembly, 0),
            directScore + batchScore,
            "the two universes only ever meet by ADDITION"
        );

        if (!doDirect) assertEq(directScore, 0, "an untouched direct entry contributes exactly zero");
        if (!doBatch) assertEq(batchScore, 0, "an untouched batch entry contributes exactly zero");
    }

    // ── 4. Period bucketing ───────────────────────────────────────────

    /// 4a. `currentPeriod()`'s own boundary arithmetic: every timestamp lands
    /// in exactly the `[periodEnd[i-1], periodEnd[i])` window that contains
    /// it, and once at or past the LAST boundary accrual is closed — never a
    /// third period.
    function check_currentPeriod_bucketsExactlyTheContainingWindow(uint256 t) public {
        vm.assume(t <= uint256(P1_END) + 10_000); // bounded to the fixture's 2-period horizon
        UsageCounterHarness counter = _deploy();
        vm.warp(t);

        (bool ok, bytes memory ret) = address(counter).call(abi.encodeCall(counter.currentPeriod, ()));

        if (t < P0_END) {
            assertTrue(ok, "before the first boundary must succeed");
            assertEq(abi.decode(ret, (uint8)), 0, "and land in period 0");
        } else if (t < P1_END) {
            assertTrue(ok, "between the boundaries must succeed");
            assertEq(abi.decode(ret, (uint8)), 1, "and land in period 1, never period 0");
        } else {
            assertFalse(ok, "at or after the last boundary, accrual is closed");
        }
    }

    /// 4b. A batch write claiming a period other than the one the chain has
    /// open is rejected, and — crucially — the REJECTED write touches nothing,
    /// while a write accepted into the correct period leaves every OTHER
    /// period's entry for the same clause or assembly exactly as it was.
    function check_wrongPeriodIsRejected_andOtherPeriodUntouched(bytes32 clauseOrAssembly, address seller) public {
        UsageCounterHarness counter = _deploy();
        vm.warp(P0_END - 1000); // period 0 is open

        address[] memory sellers = new address[](1);
        sellers[0] = seller;
        UsageCounter.BatchAccrual[] memory accr = new UsageCounter.BatchAccrual[](1);
        accr[0] = UsageCounter.BatchAccrual(clauseOrAssembly, KIND_CLAUSE, 4, 2);

        // Claiming period 1 while period 0 is open must revert.
        (bool wrongOk,) =
            address(counter).call(abi.encodeCall(UsageCounter.applyBatchAccrual, (1, PROVENANCE_LEAF, accr, sellers)));
        assertFalse(wrongOk, "a batch cannot land in a period the chain has not opened");

        (,, uint256 otherBefore) = counter.batchAccrualOf(KIND_CLAUSE, clauseOrAssembly, 1);
        assertEq(otherBefore, 0, "the rejected write touched nothing");

        // The correct period succeeds...
        counter.applyBatchAccrual(0, PROVENANCE_LEAF, accr, sellers);

        // ...and period 1's entry for the SAME clause or assembly is untouched.
        (,, uint256 otherAfter) = counter.batchAccrualOf(KIND_CLAUSE, clauseOrAssembly, 1);
        assertEq(otherAfter, otherBefore, "recording in period 0 never touches period 1's slot");
    }

    // ── 5. Cross-clause-or-assembly isolation ───────────────────────────────────

    /// Recording usage for clause or assembly A — via either resolution path — leaves
    /// every field of a DIFFERENT clause or assembly B's bookkeeping byte-for-byte
    /// unchanged, and the shared `totalScoreIn` moves by EXACTLY A's own score
    /// delta (never more, which would mean it leaked from B's entry; never
    /// less, which would mean A's own delta was mis-added).
    function check_crossClauseOrAssemblyIsolation(
        bytes32 clauseOrAssemblyA,
        bytes32 clauseOrAssemblyB,
        address seller,
        bytes32 processId,
        bool viaBatch
    ) public {
        vm.assume(clauseOrAssemblyA != clauseOrAssemblyB);
        UsageCounterHarness counter = _deploy();
        vm.warp(P0_END - 1000);

        Isolation memory before = _isolationSnapshot(counter, clauseOrAssemblyB);

        uint256 aScoreDelta = _recordA(counter, clauseOrAssemblyA, processId, seller, viaBatch);

        Isolation memory afterRecord = _isolationSnapshot(counter, clauseOrAssemblyB);

        assertEq(afterRecord.bc, before.bc, "B's direct c is untouched by A's record");
        assertEq(afterRecord.bd, before.bd, "B's direct d is untouched by A's record");
        assertEq(afterRecord.bs, before.bs, "B's direct score is untouched by A's record");
        assertEq(afterRecord.bbc, before.bbc, "B's batch c is untouched by A's record");
        assertEq(afterRecord.bbd, before.bbd, "B's batch d is untouched by A's record");
        assertEq(afterRecord.bbs, before.bbs, "B's batch score is untouched by A's record");
        assertEq(afterRecord.total - before.total, aScoreDelta, "the shared total moves by exactly A's own delta");
    }

    /// @dev B's direct + batch accrual plus the shared period-0 total,
    ///      bundled behind one stack entry — see `Snapshot` above for why.
    struct Isolation {
        uint64 bc;
        uint64 bd;
        uint256 bs;
        uint64 bbc;
        uint64 bbd;
        uint256 bbs;
        uint256 total;
    }

    function _isolationSnapshot(UsageCounterHarness counter, bytes32 clauseOrAssemblyB)
        internal
        view
        returns (Isolation memory s)
    {
        (s.bc, s.bd, s.bs) = counter.accrualOf(KIND_CLAUSE, clauseOrAssemblyB, 0);
        (s.bbc, s.bbd, s.bbs) = counter.batchAccrualOf(KIND_CLAUSE, clauseOrAssemblyB, 0);
        s.total = counter.totalScoreIn(0);
    }

    /// @dev Records A's usage via whichever path `viaBatch` selects and
    ///      returns A's own score delta (from zero, so delta == score) —
    ///      factored out of `check_crossClauseOrAssemblyIsolation` for the
    ///      same stack-depth reason as `_accrueAndSnapshot` above.
    function _recordA(
        UsageCounterHarness counter,
        bytes32 clauseOrAssemblyA,
        bytes32 processId,
        address seller,
        bool viaBatch
    ) internal returns (uint256 scoreDelta) {
        if (viaBatch) {
            address[] memory sellers = new address[](1);
            sellers[0] = seller;
            UsageCounter.BatchAccrual[] memory accr = new UsageCounter.BatchAccrual[](1);
            accr[0] = UsageCounter.BatchAccrual(clauseOrAssemblyA, KIND_CLAUSE, 3, 2);
            counter.applyBatchAccrual(0, PROVENANCE_LEAF, accr, sellers);
            (,, scoreDelta) = counter.batchAccrualOf(KIND_CLAUSE, clauseOrAssemblyA, 0); // from zero, so delta == score
        } else {
            counter.accrue(clauseOrAssemblyA, 0, processId, seller);
            (,, scoreDelta) = counter.accrualOf(KIND_CLAUSE, clauseOrAssemblyA, 0);
        }
    }

    // ── 6. The kinds never share a entry ──────────────────────────────

    /// A use counted under one kind — direct or batch — leaves every other
    /// kind's accrual at the same key untouched: no count, no score, no
    /// counted process. The same process then still counts once under the
    /// other kind. Both kinds are symbolic over the three, so every ordered
    /// pair is proved. This is what keeps a stake in one family at another
    /// family's bytes from earning that family's accrual.
    function check_theKindsNeverShareAKey(
        uint8 countedKind,
        uint8 otherKind,
        bytes32 key,
        bytes32 processId,
        address seller,
        bool viaBatch
    ) public {
        vm.assume(countedKind < 3 && otherKind < 3 && countedKind != otherKind);
        vm.assume(key != PROVENANCE_LEAF && key != ASSEMBLY_TERMS_LEAF);
        vm.warp(P0_END - 1000);
        UsageCounterHarness counter = _deploy();

        _countAs(counter, countedKind, key, processId, seller, viaBatch, 3, 2);

        (uint64 c, uint64 d, uint256 score) = counter.accrualOf(otherKind, key, 0);
        (uint64 bc, uint64 bd, uint256 bscore) = counter.batchAccrualOf(otherKind, key, 0);
        assertEq(c, 0, "no count under the other kind");
        assertEq(d, 0, "no breadth under the other kind");
        assertEq(score, 0, "no score under the other kind");
        assertEq(bc, 0, "no batch count under the other kind");
        assertEq(bd, 0, "no batch breadth under the other kind");
        assertEq(bscore, 0, "no batch score under the other kind");
        assertEq(counter.scoreOf(otherKind, key, 0), 0, "the other kind scores nothing of it");
        assertFalse(counter.processCounted(otherKind, key, processId), "the process is not counted for the other kind");

        counter.accrueAs(otherKind, key, 0, processId, seller);
        (c,,) = counter.accrualOf(otherKind, key, 0);
        assertEq(c, 1, "and the other kind counts it on its own");
    }

    /// The reverse direction of `check_theKindsNeverShareAKey`: another kind
    /// already holds an accrual at the key, and a use counted under one kind —
    /// direct or batch, over either path for the earlier one — leaves that
    /// accrual exactly as it was, its counted process included. A stake in one
    /// family neither earns another family's accrual nor disturbs it.
    /// The second use is a different process with different cumulative
    /// counts, so a write that ignored the kind would show in the other kind's
    /// numbers. `pair` selects one of the six ordered pairs of distinct kinds; each
    /// branch fixes both kinds to constants, so the score arithmetic of every
    /// path runs on concrete counts and every path is explored whole.
    function check_aKindNeverDisturbsAnotherKindsAccrual(
        uint8 pair,
        bytes32 key,
        bytes32 processId,
        address seller,
        bool otherViaBatch,
        bool countedViaBatch
    ) public {
        vm.assume(pair < 6);
        vm.assume(key != PROVENANCE_LEAF && key != ASSEMBLY_TERMS_LEAF);
        (uint8 countedKind, uint8 otherKind) = _orderedKindPair(pair);
        vm.warp(P0_END - 1000);
        UsageCounterHarness counter = _deploy();

        _countAs(counter, otherKind, key, processId, seller, otherViaBatch, 3, 2);
        Snapshot memory direct = _kindSnapshot(counter, otherKind, key, false);
        Snapshot memory batch = _kindSnapshot(counter, otherKind, key, true);

        // A second process and other cumulative counts: a counter blind to the
        // kind would land this write on the other kind's accrual and move it.
        _countAs(counter, countedKind, key, keccak256(abi.encode(processId)), seller, countedViaBatch, 5, 4);

        Snapshot memory directAfter = _kindSnapshot(counter, otherKind, key, false);
        Snapshot memory batchAfter = _kindSnapshot(counter, otherKind, key, true);
        assertEq(directAfter.c, direct.c, "the other kind's count is untouched");
        assertEq(directAfter.d, direct.d, "the other kind's breadth is untouched");
        assertEq(directAfter.score, direct.score, "the other kind's score is untouched");
        assertEq(batchAfter.c, batch.c, "the other kind's batch count is untouched");
        assertEq(batchAfter.d, batch.d, "the other kind's batch breadth is untouched");
        assertEq(batchAfter.score, batch.score, "the other kind's batch score is untouched");
        assertEq(
            counter.processCounted(otherKind, key, processId),
            !otherViaBatch,
            "the other kind's counted process is untouched"
        );
        assertEq(
            counter.scoreOf(otherKind, key, 0),
            direct.score + batch.score,
            "the other kind scores what it held, no more"
        );
    }

    /// The batch path skips an accrual whose kind names no registry: no kind's
    /// accrual at the key moves, the counted kind's included, and the period
    /// total stays where it was. The call itself does not revert, so the
    /// batch's token resolution still lands.
    function check_anUnknownKindIsSkipped(uint8 unknownKind, uint8 probeKind, bytes32 key, address seller) public {
        vm.assume(unknownKind >= 3);
        vm.assume(key != PROVENANCE_LEAF && key != ASSEMBLY_TERMS_LEAF);
        vm.warp(P0_END - 1000);
        UsageCounterHarness counter = _deploy();

        address[] memory sellers = new address[](1);
        sellers[0] = seller;
        UsageCounter.BatchAccrual[] memory accr = new UsageCounter.BatchAccrual[](1);
        accr[0] = UsageCounter.BatchAccrual(key, unknownKind, 3, 2);
        counter.applyBatchAccrual(0, PROVENANCE_LEAF, accr, sellers);

        (uint64 bc, uint64 bd, uint256 bscore) = counter.batchAccrualOf(probeKind, key, 0);
        assertEq(bc, 0, "no batch count under any kind");
        assertEq(bd, 0, "no batch breadth under any kind");
        assertEq(bscore, 0, "no batch score under any kind");
        assertEq(counter.scoreOf(probeKind, key, 0), 0, "no kind scores the skipped accrual");
        assertEq(counter.totalScoreIn(0), 0, "the period total does not move");
    }

    /// @dev The ordered pair of distinct kinds `pair` (0-5) names, each a
    ///      constant on its branch.
    function _orderedKindPair(uint8 pair) internal pure returns (uint8 countedKind, uint8 otherKind) {
        if (pair == 0) return (0, 1);
        if (pair == 1) return (0, 2);
        if (pair == 2) return (1, 0);
        if (pair == 3) return (1, 2);
        if (pair == 4) return (2, 0);
        return (2, 1);
    }

    /// @dev Counts one use of `key` under `kind`, by the direct path's
    ///      `_accrue` or by a one-accrual batch write carrying the cumulative
    ///      `(c, d)`, and requires the write to land: a reverted write would
    ///      drop the path from the proof instead of failing it.
    function _countAs(
        UsageCounterHarness counter,
        uint8 kind,
        bytes32 key,
        bytes32 processId,
        address seller,
        bool viaBatch,
        uint64 c,
        uint64 d
    ) internal {
        bool ok;
        if (viaBatch) {
            address[] memory sellers = new address[](1);
            sellers[0] = seller;
            UsageCounter.BatchAccrual[] memory accr = new UsageCounter.BatchAccrual[](1);
            accr[0] = UsageCounter.BatchAccrual(key, kind, c, d);
            (ok,) = address(counter)
                .call(abi.encodeCall(UsageCounter.applyBatchAccrual, (0, PROVENANCE_LEAF, accr, sellers)));
        } else {
            (ok,) = address(counter).call(abi.encodeCall(counter.accrueAs, (kind, key, 0, processId, seller)));
        }
        assertTrue(ok, "the write lands");
    }

    /// @dev One kind's direct (`batch == false`) or batch accrual at `key` in
    ///      period 0, with the period total.
    function _kindSnapshot(UsageCounterHarness counter, uint8 kind, bytes32 key, bool batch)
        internal
        view
        returns (Snapshot memory s)
    {
        if (batch) {
            (s.c, s.d, s.score) = counter.batchAccrualOf(kind, key, 0);
        } else {
            (s.c, s.d, s.score) = counter.accrualOf(kind, key, 0);
        }
        s.total = counter.totalScoreIn(0);
    }
}
