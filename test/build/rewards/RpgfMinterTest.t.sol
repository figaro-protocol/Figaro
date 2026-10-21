// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {RpgfMinter} from "src/build/rewards/RpgfMinter.sol";
import {FlorinToken} from "src/build/florin/FlorinToken.sol";
import {ClauseRegistry} from "src/build/registries/ClauseRegistry.sol";
import {AssemblyRegistry} from "src/build/registries/AssemblyRegistry.sol";
import {AgreementRegistry} from "src/build/registries/AgreementRegistry.sol";

/// @notice Stand-in for UsageCounter so payout maths can be exercised directly,
///         including shapes a real accrual would take many resolved processes to
///         reach (a dominant wallet, an empty period). The counter's own
///         verification is proven in UsageCounterTest.
contract StubCounter {
    mapping(uint8 => bool) public closed;
    mapping(uint8 => uint256) public totalScoreIn;
    mapping(uint8 => mapping(bytes32 => mapping(uint8 => uint256))) internal _score;

    /// @dev The minter validates its budget array against this at deploy.
    function periodCount() external pure returns (uint256) {
        return 3;
    }

    function setClosed(uint8 period, bool v) external {
        closed[period] = v;
    }

    function setScore(uint8 kind, bytes32 clauseOrAssembly, uint8 period, uint256 s) external {
        totalScoreIn[period] = totalScoreIn[period] + s - _score[kind][clauseOrAssembly][period];
        _score[kind][clauseOrAssembly][period] = s;
    }

    function periodClosed(uint8 period) external view returns (bool) {
        return closed[period];
    }

    /// @dev `scoreOf`, not `accrualOf`: the minter reads the sum of the direct
    ///      and batch paths, so a stub exposing only the direct accrual would
    ///      let a regression to the old read slip through silently.
    function scoreOf(uint8 kind, bytes32 clauseOrAssembly, uint8 period) external view returns (uint256) {
        return _score[kind][clauseOrAssembly][period];
    }

    /// @dev HOSTILE override: force `totalScoreIn` out of sync with the
    ///      per-clause-or-assembly scores — the shape a buggy or malicious accrual would
    ///      present. With consistent data the minter's budget backstop is
    ///      structurally unreachable, so only an inconsistent stub can make it
    ///      observable; the backstop test is its sole caller.
    function forceTotal(uint8 period, uint256 v) external {
        totalScoreIn[period] = v;
    }
}

contract RpgfMinterTest is Test {
    RpgfMinter minter;
    StubCounter counter;
    FlorinToken florin;
    ClauseRegistry clauses;
    AssemblyRegistry assemblies;
    AgreementRegistry agreements;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA401);
    address dave = address(0xDA7E);

    // Each clause key is keccak256 of a spec's pinned bytes.
    bytes32 constant A_KEY = keccak256('{"clauseId":"clause-a","version":1}');
    bytes32 constant B_KEY = keccak256('{"clauseId":"clause-b","version":1}');
    bytes32 constant ASM = keccak256("an-assembly");
    bytes32 constant AGR = keccak256("an-agreement");

    // The reference per-year slices: a first-tranche year,
    // a second-tranche year, a third-tranche year. The grouping itself is
    // deploy-script data; the minter sees only per-period budgets.
    uint256 constant T0 = 45_000_000 ether;
    uint256 constant T1 = 60_000_000 ether;
    uint256 constant T2 = 82_500_000 ether;

    function _amounts() internal pure returns (uint256[] memory a) {
        a = new uint256[](3);
        a[0] = T0;
        a[1] = T1;
        a[2] = T2;
    }

    function setUp() public {
        florin = new FlorinToken();
        counter = new StubCounter();
        clauses = new ClauseRegistry(0);
        assemblies = new AssemblyRegistry(0);
        agreements = new AgreementRegistry(0);

        vm.prank(alice);
        clauses.registerClause(A_KEY, "ipfs://a");
        vm.prank(bob);
        clauses.registerClause(B_KEY, "ipfs://b");
        vm.prank(carol);
        assemblies.registerAssembly(ASM, "ipfs://asm");
        vm.prank(dave);
        agreements.registerAgreement(AGR, "ipfs://agr");

        minter = new RpgfMinter(
            address(florin), address(counter), address(clauses), address(assemblies), address(agreements), _amounts()
        );
        florin.registerMinter(address(minter), 600_000_000 ether);
    }

    uint8 constant KIND_CLAUSE = 0;
    uint8 constant KIND_ASSEMBLY = 1;
    uint8 constant KIND_AGREEMENT = 2;

    function _entry(uint8 kind, bytes32 k) internal pure returns (RpgfMinter.ClauseOrAssemblyKey memory) {
        return RpgfMinter.ClauseOrAssemblyKey(kind, k);
    }

    function _clause(bytes32 k) internal pure returns (RpgfMinter.ClauseOrAssemblyKey[] memory a) {
        a = new RpgfMinter.ClauseOrAssemblyKey[](1);
        a[0] = _entry(KIND_CLAUSE, k);
    }

    function _assembly(bytes32 k) internal pure returns (RpgfMinter.ClauseOrAssemblyKey[] memory a) {
        a = new RpgfMinter.ClauseOrAssemblyKey[](1);
        a[0] = _entry(KIND_ASSEMBLY, k);
    }

    function _agreement(bytes32 k) internal pure returns (RpgfMinter.ClauseOrAssemblyKey[] memory a) {
        a = new RpgfMinter.ClauseOrAssemblyKey[](1);
        a[0] = _entry(KIND_AGREEMENT, k);
    }

    // ── Pro-rata payout ─────────────────────────────────────────────

    function test_paysProRataOfTheClosedPeriod() public {
        // Straight pro-rata of the closed period's total — no cap.
        counter.setScore(KIND_CLAUSE, A_KEY, 0, 100);
        counter.setScore(KIND_CLAUSE, B_KEY, 0, 50);
        counter.setScore(KIND_ASSEMBLY, ASM, 0, 850);
        counter.setClosed(0, true);

        vm.prank(alice);
        minter.claim(0, _clause(A_KEY));
        assertEq(florin.balanceOf(alice), (T0 * 100) / 1000);

        vm.prank(bob);
        minter.claim(0, _clause(B_KEY));
        assertEq(florin.balanceOf(bob), (T0 * 50) / 1000);
    }

    function test_assemblyDesignerIsPaidToo() public {
        counter.setScore(KIND_ASSEMBLY, ASM, 0, 500);
        counter.setClosed(0, true);
        vm.prank(carol);
        minter.claim(0, _assembly(ASM));
        assertEq(florin.balanceOf(carol), T0); // sole recipient → the whole period budget (no cap)
    }

    function test_multipleClausesAndAssembliesSumInOneClaim() public {
        // A wallet claims once per period and passes everything it authored.
        vm.prank(alice);
        bytes32 cKey = keccak256('{"clauseId":"clause-c","version":1}');
        clauses.registerClause(cKey, "ipfs://c");

        counter.setScore(KIND_CLAUSE, A_KEY, 0, 50);
        counter.setScore(KIND_CLAUSE, cKey, 0, 50);
        counter.setScore(KIND_CLAUSE, B_KEY, 0, 900);
        counter.setClosed(0, true);

        RpgfMinter.ClauseOrAssemblyKey[] memory mine = new RpgfMinter.ClauseOrAssemblyKey[](2);
        mine[0] = _entry(KIND_CLAUSE, A_KEY);
        mine[1] = _entry(KIND_CLAUSE, cKey);
        vm.prank(alice);
        minter.claim(0, mine);
        assertEq(florin.balanceOf(alice), (T0 * 100) / 1000);
    }

    // ── The period must be closed ───────────────────────────────────

    function test_revertsWhileThePeriodIsStillAccruing() public {
        // This is what removes the need for a snapshot: a period only pays
        // from numbers that can no longer move.
        counter.setScore(KIND_CLAUSE, A_KEY, 0, 100);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.PeriodStillAccruing.selector, uint8(0)));
        minter.claim(0, _clause(A_KEY));
    }

    // ── Authorship ──────────────────────────────────────────────────

    function test_revertsWhenNotAuthorOfRecord() public {
        counter.setScore(KIND_CLAUSE, A_KEY, 0, 100);
        counter.setClosed(0, true);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, KIND_CLAUSE, A_KEY, bob));
        minter.claim(0, _clause(A_KEY));
    }

    /// A registry takes any bytes32, so bob can stake carol's composition hash
    /// as a CLAUSE. The kind names the one registry that decides authorship:
    /// bob's clause-kind entry reads the clause entry (empty), his assembly-kind
    /// entry reads `AssemblyRegistry` (carol's), and carol is paid.
    function test_eachKindReadsOnlyItsOwnRegistry() public {
        vm.prank(bob);
        clauses.registerClause(ASM, "ipfs://bob-stakes-carols-assembly-key-as-a-clause");
        counter.setScore(KIND_ASSEMBLY, ASM, 0, 500);
        counter.setClosed(0, true);

        vm.prank(bob);
        vm.expectRevert(RpgfMinter.NothingToClaim.selector);
        minter.claim(0, _clause(ASM));

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, KIND_ASSEMBLY, ASM, bob));
        minter.claim(0, _assembly(ASM));

        vm.prank(carol);
        minter.claim(0, _assembly(ASM));
        assertEq(florin.balanceOf(carol), T0);
        assertEq(florin.balanceOf(bob), 0);
    }

    /// The kinds end at the agreement kind: the first kind past it names no
    /// registry.
    function test_revertsOnUnknownKind() public {
        counter.setScore(KIND_CLAUSE, A_KEY, 0, 100);
        counter.setClosed(0, true);
        RpgfMinter.ClauseOrAssemblyKey[] memory list = new RpgfMinter.ClauseOrAssemblyKey[](1);
        list[0] = _entry(3, A_KEY);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.UnknownKind.selector, uint8(3)));
        minter.claim(0, list);
    }

    // ── The agreement kind ──────────────────────────────────────────

    /// A claim by kind 2 pays the agreement's designer of record from the
    /// agreement's own score, while its stake is live.
    function test_agreementDesignerIsPaid() public {
        counter.setScore(KIND_AGREEMENT, AGR, 0, 250);
        counter.setScore(KIND_CLAUSE, A_KEY, 0, 750);
        counter.setClosed(0, true);
        vm.prank(dave);
        minter.claim(0, _agreement(AGR));
        assertEq(florin.balanceOf(dave), (T0 * 250) / 1000);
    }

    /// The same gate on the agreement arm: withdraw the stake and the claim
    /// fails — the agreement is no longer the wallet's of record.
    function test_withdrawnAgreementDesignerForfeitsTheReward() public {
        counter.setScore(KIND_AGREEMENT, AGR, 0, 100);
        counter.setClosed(0, true);
        vm.prank(dave);
        agreements.withdrawDeposit(AGR);

        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, KIND_AGREEMENT, AGR, dave));
        minter.claim(0, _agreement(AGR));
    }

    /// The same bytes staked in all three registries by three wallets: each
    /// kind names its own registry and its own score, and nobody is paid from
    /// another family's accrual.
    function test_theThreeKindsPayOnlyTheirOwnDesignerOfRecord() public {
        vm.prank(bob);
        clauses.registerClause(AGR, "ipfs://bob-stakes-daves-agreement-hash-as-a-clause");
        vm.prank(carol);
        assemblies.registerAssembly(AGR, "ipfs://carol-stakes-daves-agreement-hash-as-an-assembly");
        counter.setScore(KIND_AGREEMENT, AGR, 0, 500);
        counter.setClosed(0, true);

        vm.prank(bob);
        vm.expectRevert(RpgfMinter.NothingToClaim.selector);
        minter.claim(0, _clause(AGR));

        vm.prank(carol);
        vm.expectRevert(RpgfMinter.NothingToClaim.selector);
        minter.claim(0, _assembly(AGR));

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, KIND_AGREEMENT, AGR, bob));
        minter.claim(0, _agreement(AGR));

        vm.prank(dave);
        minter.claim(0, _agreement(AGR));
        assertEq(florin.balanceOf(dave), T0, "the agreement's designer of record takes its accrual");
        assertEq(florin.balanceOf(bob), 0);
        assertEq(florin.balanceOf(carol), 0);
    }

    function test_revertsOnUnknownClauseOrAssembly() public {
        counter.setClosed(0, true);
        vm.prank(alice);
        vm.expectRevert();
        minter.claim(0, _clause(keccak256("never-registered")));
    }

    function test_withdrawnAuthorForfeitsTheReward() public {
        // Author-side live-stake gate: you earn RPGF only while your stake is
        // live. Withdraw and the claim fails — the clause or assembly is no longer yours
        // of record.
        counter.setScore(KIND_CLAUSE, A_KEY, 0, 100);
        counter.setClosed(0, true);
        vm.prank(alice);
        clauses.withdrawDeposit(A_KEY);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, KIND_CLAUSE, A_KEY, alice));
        minter.claim(0, _clause(A_KEY));
    }

    function test_withdrawnAssemblyDesignerForfeitsTheReward() public {
        // THE SAME GATE ON THE ASSEMBLY BRANCH. Kept beside the clause case on
        // purpose: `_isAuthor` has two arms and the 600M pays through BOTH — a
        // clause author and an assembly designer of record earn on identical
        // terms. Testing only the clause arm is the same asymmetry that let the
        // assembly-credit leg sit dead end-to-end; the arms
        // get covered together or the next reader learns the wrong lesson.
        counter.setScore(KIND_ASSEMBLY, ASM, 0, 100);
        counter.setClosed(0, true);
        vm.prank(carol);
        assemblies.withdrawDeposit(ASM);

        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, KIND_ASSEMBLY, ASM, carol));
        minter.claim(0, _assembly(ASM));
    }

    // ── Once per wallet per period ──────────────────────────────────

    function test_claimsOncePerPeriod() public {
        counter.setScore(KIND_CLAUSE, A_KEY, 0, 100);
        counter.setClosed(0, true);
        vm.startPrank(alice);
        minter.claim(0, _clause(A_KEY));
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.AlreadyClaimed.selector, uint8(0), alice));
        minter.claim(0, _clause(A_KEY));
        vm.stopPrank();
    }

    function test_periodsAreIndependent() public {
        counter.setScore(KIND_CLAUSE, A_KEY, 0, 100);
        counter.setScore(KIND_CLAUSE, B_KEY, 0, 900);
        counter.setScore(KIND_CLAUSE, A_KEY, 1, 100);
        counter.setScore(KIND_CLAUSE, B_KEY, 1, 900);
        counter.setClosed(0, true);
        counter.setClosed(1, true);
        vm.startPrank(alice);
        minter.claim(0, _clause(A_KEY));
        minter.claim(1, _clause(A_KEY));
        vm.stopPrank();
        assertEq(florin.balanceOf(alice), (T0 / 10) + (T1 / 10));
    }

    // ── Uniform pro rata (no cap) ────────────────────────────────────

    function test_noCap_dominantWalletTakesItsFullProRataShare() public {
        // A dominant wallet takes its FULL pro-rata share — there is no cap. The
        // reward tracks real usage directly; Sybil resistance is the live ETH
        // stake, not a ceiling.
        counter.setScore(KIND_CLAUSE, A_KEY, 0, 900);
        counter.setScore(KIND_CLAUSE, B_KEY, 0, 100);
        counter.setClosed(0, true);

        vm.prank(alice);
        minter.claim(0, _clause(A_KEY));
        assertEq(florin.balanceOf(alice), (T0 * 900) / 1000);
    }

    function test_duplicateClauseOrAssemblyCannotInflateTheShare() public {
        // The case that DISTINGUISHES inflation from correctness: alice owns a
        // 100/1000 minority of the period, so her honest share is a tenth. A
        // sole-clause or assembly setup cannot detect this — there, 100% is the correct
        // answer either way, which is why the earlier version of this test
        // passed against a contract that let her take everything.
        counter.setScore(KIND_CLAUSE, A_KEY, 0, 100);
        counter.setScore(KIND_CLAUSE, B_KEY, 0, 900);
        counter.setClosed(0, true);

        RpgfMinter.ClauseOrAssemblyKey[] memory dupes = new RpgfMinter.ClauseOrAssemblyKey[](10);
        for (uint256 i = 0; i < 10; ++i) {
            dupes[i] = _entry(KIND_CLAUSE, A_KEY);
        }

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.DuplicateClauseOrAssembly.selector, KIND_CLAUSE, A_KEY));
        minter.claim(0, dupes);

        // And the honest claim still pays exactly the minority share.
        vm.prank(alice);
        minter.claim(0, _clause(A_KEY));
        assertEq(florin.balanceOf(alice), (T0 * 100) / 1000);
    }

    /// `claimable` must refuse the same malformed list the state-changing path
    /// refuses — a view that answered "the whole budget" would be a quoting bug
    /// even with `claim` safe.
    function test_claimableRejectsDuplicatesToo() public {
        counter.setScore(KIND_CLAUSE, A_KEY, 0, 100);
        counter.setScore(KIND_CLAUSE, B_KEY, 0, 900);
        counter.setClosed(0, true);
        RpgfMinter.ClauseOrAssemblyKey[] memory dupes = new RpgfMinter.ClauseOrAssemblyKey[](2);
        dupes[0] = _entry(KIND_CLAUSE, A_KEY);
        dupes[1] = _entry(KIND_CLAUSE, A_KEY);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.DuplicateClauseOrAssembly.selector, KIND_CLAUSE, A_KEY));
        minter.claimable(0, alice, dupes);
    }

    /// Bob's entitlement must survive alice claiming first — the budget is not
    /// a race that a malformed claim can win.
    function test_oneAuthorCannotStarveAnother() public {
        counter.setScore(KIND_CLAUSE, A_KEY, 0, 100);
        counter.setScore(KIND_CLAUSE, B_KEY, 0, 900);
        counter.setClosed(0, true);

        vm.prank(alice);
        minter.claim(0, _clause(A_KEY));
        vm.prank(bob);
        minter.claim(0, _clause(B_KEY));

        assertEq(florin.balanceOf(alice), (T0 * 100) / 1000);
        assertEq(florin.balanceOf(bob), (T0 * 900) / 1000);
    }

    // ── Nothing to claim ────────────────────────────────────────────

    function test_revertsWhenPeriodHasNoUsage() public {
        counter.setClosed(0, true);
        vm.prank(alice);
        vm.expectRevert(RpgfMinter.NothingToClaim.selector);
        minter.claim(0, _clause(A_KEY));
    }

    function test_revertsOnEmptyClauseOrAssemblyList() public {
        counter.setClosed(0, true);
        vm.prank(alice);
        vm.expectRevert(RpgfMinter.NoClausesOrAssemblies.selector);
        minter.claim(0, new RpgfMinter.ClauseOrAssemblyKey[](0));
    }

    function test_revertsOnUnknownPeriod() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.UnknownPeriod.selector, uint8(3)));
        minter.claim(3, _clause(A_KEY));
    }

    // ── View ────────────────────────────────────────────────────────

    function test_claimableMatchesTheClaim() public {
        counter.setScore(KIND_CLAUSE, A_KEY, 0, 100);
        counter.setScore(KIND_CLAUSE, B_KEY, 0, 900);
        counter.setClosed(0, true);

        uint256 quoted = minter.claimable(0, alice, _clause(A_KEY));
        vm.prank(alice);
        minter.claim(0, _clause(A_KEY));
        assertEq(florin.balanceOf(alice), quoted);
        assertEq(minter.claimable(0, alice, _clause(A_KEY)), 0);
    }

    /// The schedule's length is a view the site and the SDK read; it mirrors
    /// the amounts the constructor took, not a constant of its own.
    function test_periodCountMirrorsTheSchedule() public view {
        assertEq(minter.periodCount(), _amounts().length);
    }

    /// An empty period quotes zero to anyone, before any author check: the
    /// early return on a zero total is what keeps a quote of nothing from
    /// reverting on the caller's standing — a mutant that removes it reverts
    /// `NotAuthorOfRecord` here instead of answering zero.
    function test_claimableOnAnEmptyPeriodQuotesZeroForAnyone() public {
        counter.setClosed(0, true);
        assertEq(minter.claimable(0, bob, _clause(A_KEY)), 0);
    }

    /// `claimable` refuses a period the schedule does not hold, as `claim`
    /// does — a view that answered zero for a period that does not exist
    /// would read as "already claimed".
    function test_claimableRevertsOnUnknownPeriod() public {
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.UnknownPeriod.selector, uint8(3)));
        minter.claimable(3, alice, _clause(A_KEY));
    }

    // ── Budget backstop ─────────────────────────────────────────────

    function test_mintedTracksThePeriodSpend() public {
        counter.setScore(KIND_CLAUSE, A_KEY, 0, 100);
        counter.setScore(KIND_CLAUSE, B_KEY, 0, 900);
        counter.setClosed(0, true);
        vm.prank(alice);
        minter.claim(0, _clause(A_KEY));
        assertEq(minter.minted(0), (T0 * 100) / 1000);
        assertLe(minter.minted(0), T0);
    }

    /// The `PeriodBudgetExceeded` backstop is STRUCTURALLY UNREACHABLE while
    /// the counter's data is consistent (duplicate-free lists + one author of
    /// record per clause or assembly + closed-period totals keep every pro-rata sum
    /// within the budget — an audit finding), so no honest-data
    /// test can reach it and deleting the line would change no other test's
    /// outcome. It is still the LAST line of defense for the fixed pool if the
    /// accrual ever misreports: feed the minter a counter whose per-clause-or-assembly
    /// score exceeds its own period total (share > 1 ⇒ amount > budget) and
    /// the backstop must refuse to over-mint rather than pay it.
    function test_budgetBackstopRefusesOverMintOnInconsistentCounterData() public {
        counter.setScore(KIND_CLAUSE, A_KEY, 0, 100);
        counter.forceTotal(0, 10); // hostile: total below the clauseOrAssembly's own score
        counter.setClosed(0, true);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.PeriodBudgetExceeded.selector, 0));
        minter.claim(0, _clause(A_KEY));
        assertEq(minter.minted(0), 0);
        assertEq(florin.balanceOf(alice), 0);
    }

    // ── Constructor ─────────────────────────────────────────────────

    function test_constructor_rejectsZeroAddresses() public {
        uint256[] memory amts = _amounts();
        vm.expectRevert(RpgfMinter.ZeroAddress.selector);
        new RpgfMinter(address(0), address(counter), address(clauses), address(assemblies), address(agreements), amts);
        vm.expectRevert(RpgfMinter.ZeroAddress.selector);
        new RpgfMinter(address(florin), address(0), address(clauses), address(assemblies), address(agreements), amts);
        vm.expectRevert(RpgfMinter.ZeroAddress.selector);
        new RpgfMinter(address(florin), address(counter), address(0), address(assemblies), address(agreements), amts);
        vm.expectRevert(RpgfMinter.ZeroAddress.selector);
        new RpgfMinter(address(florin), address(counter), address(clauses), address(0), address(agreements), amts);
        vm.expectRevert(RpgfMinter.ZeroAddress.selector);
        new RpgfMinter(address(florin), address(counter), address(clauses), address(assemblies), address(0), amts);
    }

    /// The budget array and the counter's period schedule are ONE schedule —
    /// a mismatch is a deploy fault and must fail at deploy, not at claim.
    function test_constructor_rejectsAmountsPeriodsMismatch() public {
        uint256[] memory tooFew = new uint256[](2);
        tooFew[0] = T0;
        tooFew[1] = T1;
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.AmountsPeriodsMismatch.selector, 2, 3));
        new RpgfMinter(
            address(florin), address(counter), address(clauses), address(assemblies), address(agreements), tooFew
        );
    }
}
