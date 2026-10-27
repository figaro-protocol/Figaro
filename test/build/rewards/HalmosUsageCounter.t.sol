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
///         only ever add, whether a use counts the same whichever route
///         (direct, proof-gated batch) brought it, whether `scoreOf` reads the
///         one tally, whether a period boundary is respected exactly, and
///         whether one clause or assembly's bookkeeping can leak into
///         another's, or one kind's into another's at the same key. Nine
///         properties, symbolically,
///         for ALL inputs in their domain — not the paths a concrete Foundry
///         test happened to walk:
///
///           1  direct accrual is monotone   — `accrualOf` (c, d, score) and
///              (check_directAccrualMonotone)  `totalScoreIn` never go
///                                             backwards under any sequence of
///                                             `_accrue` calls, successful or
///                                             reverted.
///           2  route-blind counting        — two uses, each brought by
///              (check_aUseCountsTheSameOnEitherRoute)
///                                             either route, leave the tally,
///                                             the counted processes, the
///                                             seller set and the period total
///                                             exactly as two direct calls
///                                             leave them — the same process
///                                             or the same seller included.
///           3  one tally                   — `scoreOf == accrualOf.score` in
///              (check_scoreOfIsTheOneTally)   every combination of which
///                                             route(s) have been used.
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
///              (check_theKindsNeverShareAKey) the three kinds, on either
///                                             route, leaves every other kind's
///                                             accrual at the same key empty,
///                                             and the same process still
///                                             counts once under the other
///                                             kind.
///           7  kind isolation, reversed    — another kind's EXISTING accrual
///              (check_aKindNeverDisturbsAnotherKindsAccrual)
///                                             at the key, either route, is
///                                             left exactly as it was by a use
///                                             counted under one kind.
///           8  unknown kind skipped        — a batch use whose kind names
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
///         way it does for, say, a payment amount. No property here needs a
///         bound on it: on both routes `c` and `d` are the counter's own,
///         incremented by 0 or 1 per use, never externally supplied, so a
///         property's two or three uses bound them to small values without any
///         `vm.assume` — the "bounded control flow (a few `bool` branch
///         selectors rather than an unbounded call sequence)" scoping
///         `reference_halmos_operations` prescribes. `icbrt`'s own correctness
///         is fuzzed exhaustively over the full `uint256` domain elsewhere,
///         per docs/CONTRACTS.md.
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

    // ── 2. A use counts the same on either route ─────────────────────

    /// Two uses of one key — each brought by the direct path or a batch, as
    /// `firstViaBatch` and `secondViaBatch` choose — leave EXACTLY the state
    /// two direct calls leave: the tally, both processes' counted flags, both
    /// sellers' places in the period's set and the period total. The
    /// processes and sellers are symbolic, so a repeated process (counted
    /// once, the second presentation refused on the direct path and skipped
    /// in a batch) and a repeated seller (one unit of breadth) are covered.
    function check_aUseCountsTheSameOnEitherRoute(
        bytes32 key,
        bytes32 processId1,
        bytes32 processId2,
        address seller1,
        address seller2,
        bool firstViaBatch,
        bool secondViaBatch
    ) public {
        vm.warp(P0_END - 1000);
        UsageCounterHarness direct = _deploy();
        UsageCounterHarness mixed = _deploy();

        _tryCount(direct, KIND_CLAUSE, key, processId1, seller1, false);
        _tryCount(direct, KIND_CLAUSE, key, processId2, seller2, false);
        _tryCount(mixed, KIND_CLAUSE, key, processId1, seller1, firstViaBatch);
        _tryCount(mixed, KIND_CLAUSE, key, processId2, seller2, secondViaBatch);

        Snapshot memory d = _kindSnapshot(direct, KIND_CLAUSE, key);
        Snapshot memory m = _kindSnapshot(mixed, KIND_CLAUSE, key);
        assertEq(m.c, d.c, "c is route-blind");
        assertEq(m.d, d.d, "d is route-blind");
        assertEq(m.score, d.score, "the score is route-blind");
        assertEq(m.total, d.total, "the period total is route-blind");
        assertEq(
            mixed.processCounted(KIND_CLAUSE, key, processId1), direct.processCounted(KIND_CLAUSE, key, processId1)
        );
        assertEq(
            mixed.processCounted(KIND_CLAUSE, key, processId2), direct.processCounted(KIND_CLAUSE, key, processId2)
        );
        assertEq(mixed.sellerSeen(KIND_CLAUSE, key, 0, seller1), direct.sellerSeen(KIND_CLAUSE, key, 0, seller1));
        assertEq(mixed.sellerSeen(KIND_CLAUSE, key, 0, seller2), direct.sellerSeen(KIND_CLAUSE, key, 0, seller2));
    }

    // ── 3. One tally ─────────────────────────────────────────────────

    /// `scoreOf(kind, key, period) == accrualOf.score` for every combination
    /// of "has the direct path counted here" and "has a batch counted here".
    function check_scoreOfIsTheOneTally(
        bytes32 clauseOrAssembly,
        address seller,
        bytes32 processId,
        bool doDirect,
        bool doBatch
    ) public {
        UsageCounterHarness counter = _deploy();
        vm.warp(P0_END - 1000);

        if (doDirect) _tryCount(counter, KIND_CLAUSE, clauseOrAssembly, processId, seller, false);
        if (doBatch) {
            _tryCount(counter, KIND_CLAUSE, clauseOrAssembly, keccak256(abi.encode(processId)), seller, true);
        }

        (,, uint256 score) = counter.accrualOf(KIND_CLAUSE, clauseOrAssembly, 0);
        assertEq(counter.scoreOf(KIND_CLAUSE, clauseOrAssembly, 0), score, "scoreOf reads the one tally");
        assertEq(counter.totalScoreIn(0), score, "the period total is that score");
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

        UsageCounter.BatchUse[] memory uses = _oneUse(KIND_CLAUSE, clauseOrAssembly, keccak256("a-process"), seller);

        // Claiming period 1 while period 0 is open must revert.
        (bool wrongOk,) =
            address(counter).call(abi.encodeCall(UsageCounter.applyBatchAccrual, (1, PROVENANCE_LEAF, uses)));
        assertFalse(wrongOk, "a batch cannot land in a period the chain has not opened");

        (,, uint256 otherBefore) = counter.accrualOf(KIND_CLAUSE, clauseOrAssembly, 1);
        assertEq(otherBefore, 0, "the rejected write touched nothing");

        // The correct period succeeds...
        counter.applyBatchAccrual(0, PROVENANCE_LEAF, uses);

        // ...and period 1's entry for the SAME clause or assembly is untouched.
        (,, uint256 otherAfter) = counter.accrualOf(KIND_CLAUSE, clauseOrAssembly, 1);
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

        assertEq(afterRecord.bc, before.bc, "B's c is untouched by A's use");
        assertEq(afterRecord.bd, before.bd, "B's d is untouched by A's use");
        assertEq(afterRecord.bs, before.bs, "B's score is untouched by A's use");
        assertEq(afterRecord.total - before.total, aScoreDelta, "the shared total moves by exactly A's own delta");
    }

    /// @dev B's tally plus the shared period-0 total,
    ///      bundled behind one stack entry — see `Snapshot` above for why.
    struct Isolation {
        uint64 bc;
        uint64 bd;
        uint256 bs;
        uint256 total;
    }

    function _isolationSnapshot(UsageCounterHarness counter, bytes32 clauseOrAssemblyB)
        internal
        view
        returns (Isolation memory s)
    {
        (s.bc, s.bd, s.bs) = counter.accrualOf(KIND_CLAUSE, clauseOrAssemblyB, 0);
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
        _tryCount(counter, KIND_CLAUSE, clauseOrAssemblyA, processId, seller, viaBatch);
        (,, scoreDelta) = counter.accrualOf(KIND_CLAUSE, clauseOrAssemblyA, 0); // from zero, so delta == score
    }

    // ── 6. The kinds never share a entry ──────────────────────────────

    /// A use counted under one kind — on either route — leaves every other
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

        _countAs(counter, countedKind, key, processId, seller, viaBatch);

        (uint64 c, uint64 d, uint256 score) = counter.accrualOf(otherKind, key, 0);
        assertEq(c, 0, "no count under the other kind");
        assertEq(d, 0, "no breadth under the other kind");
        assertEq(score, 0, "no score under the other kind");
        assertEq(counter.scoreOf(otherKind, key, 0), 0, "the other kind scores nothing of it");
        assertFalse(counter.processCounted(otherKind, key, processId), "the process is not counted for the other kind");

        counter.accrueAs(otherKind, key, 0, processId, seller);
        (c,,) = counter.accrualOf(otherKind, key, 0);
        assertEq(c, 1, "and the other kind counts it on its own");
    }

    /// The reverse direction of `check_theKindsNeverShareAKey`: another kind
    /// already holds an accrual at the key, and a use counted under one kind —
    /// on either route, over either route for the earlier one — leaves that
    /// accrual exactly as it was, its counted process included. A stake in one
    /// family neither earns another family's accrual nor disturbs it.
    /// The second use is a different process, so a write that ignored the
    /// kind would show in the other kind's
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

        _countAs(counter, otherKind, key, processId, seller, otherViaBatch);
        Snapshot memory held = _kindSnapshot(counter, otherKind, key);

        // A second process: a counter blind to the kind would land this use
        // on the other kind's tally and move it.
        _countAs(counter, countedKind, key, keccak256(abi.encode(processId)), seller, countedViaBatch);

        Snapshot memory heldAfter = _kindSnapshot(counter, otherKind, key);
        assertEq(heldAfter.c, held.c, "the other kind's count is untouched");
        assertEq(heldAfter.d, held.d, "the other kind's breadth is untouched");
        assertEq(heldAfter.score, held.score, "the other kind's score is untouched");
        assertTrue(counter.processCounted(otherKind, key, processId), "the other kind's counted process is untouched");
        assertEq(counter.scoreOf(otherKind, key, 0), held.score, "the other kind scores what it held, no more");
    }

    /// The batch path skips a use whose kind names no registry: no kind's
    /// accrual at the key moves, the counted kind's included, and the period
    /// total stays where it was. The call itself does not revert, so the
    /// batch's token resolution still lands.
    function check_anUnknownKindIsSkipped(uint8 unknownKind, uint8 probeKind, bytes32 key, address seller) public {
        vm.assume(unknownKind >= 3);
        vm.assume(key != PROVENANCE_LEAF && key != ASSEMBLY_TERMS_LEAF);
        vm.warp(P0_END - 1000);
        UsageCounterHarness counter = _deploy();

        counter.applyBatchAccrual(0, PROVENANCE_LEAF, _oneUse(unknownKind, key, keccak256("a-process"), seller));

        (uint64 c, uint64 d, uint256 score) = counter.accrualOf(probeKind, key, 0);
        assertEq(c, 0, "no count under any kind");
        assertEq(d, 0, "no breadth under any kind");
        assertEq(score, 0, "no score under any kind");
        assertEq(counter.scoreOf(probeKind, key, 0), 0, "no kind scores the skipped use");
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

    /// @dev One batch use.
    function _oneUse(uint8 kind, bytes32 key, bytes32 processId, address seller)
        internal
        pure
        returns (UsageCounter.BatchUse[] memory uses)
    {
        uses = new UsageCounter.BatchUse[](1);
        uses[0] = UsageCounter.BatchUse(key, kind, processId, seller);
    }

    /// @dev Presents one use of `key` under `kind`, by the direct path's
    ///      `_accrue` or by a one-use batch, and lets a refusal stand: the
    ///      direct path reverts where a batch skips, and both leave the state
    ///      as it was.
    function _tryCount(
        UsageCounterHarness counter,
        uint8 kind,
        bytes32 key,
        bytes32 processId,
        address seller,
        bool viaBatch
    ) internal returns (bool ok) {
        if (viaBatch) {
            (ok,) = address(counter)
                .call(
                    abi.encodeCall(
                        UsageCounter.applyBatchAccrual, (0, PROVENANCE_LEAF, _oneUse(kind, key, processId, seller))
                    )
                );
        } else {
            (ok,) = address(counter).call(abi.encodeCall(counter.accrueAs, (kind, key, 0, processId, seller)));
        }
    }

    /// @dev Counts one use of `key` under `kind`, by either route, and
    ///      requires the use to be counted: a refused or skipped use would
    ///      drop the path from the proof instead of failing it.
    function _countAs(
        UsageCounterHarness counter,
        uint8 kind,
        bytes32 key,
        bytes32 processId,
        address seller,
        bool viaBatch
    ) internal {
        assertTrue(_tryCount(counter, kind, key, processId, seller, viaBatch), "the call lands");
        assertTrue(counter.processCounted(kind, key, processId), "the use is counted");
    }

    /// @dev One kind's tally at `key` in period 0, with the period total.
    function _kindSnapshot(UsageCounterHarness counter, uint8 kind, bytes32 key)
        internal
        view
        returns (Snapshot memory s)
    {
        (s.c, s.d, s.score) = counter.accrualOf(kind, key, 0);
        s.total = counter.totalScoreIn(0);
    }
}
