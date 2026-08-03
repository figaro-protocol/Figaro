// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {RpgfMinter} from "src/rpgf/RpgfMinter.sol";
import {FlorinToken} from "src/florin/FlorinToken.sol";
import {ClauseRegistry} from "src/protocol/registries/ClauseRegistry.sol";
import {AssemblyRegistry} from "src/protocol/registries/AssemblyRegistry.sol";

/// @notice Stand-in for UsageCounter so payout maths can be exercised directly,
///         including shapes a real accrual would take many settled processes to
///         reach (a dominant wallet, an empty period). The counter's own
///         verification is proven in UsageCounterTest.
contract StubCounter {
    mapping(uint8 => bool) public closed;
    mapping(uint8 => uint256) public totalScoreIn;
    mapping(bytes32 => mapping(uint8 => uint256)) internal _score;

    /// @dev The minter validates its budget array against this at deploy.
    function periodCount() external pure returns (uint256) {
        return 3;
    }

    function setClosed(uint8 period, bool v) external {
        closed[period] = v;
    }

    function setScore(bytes32 artifact, uint8 period, uint256 s) external {
        totalScoreIn[period] = totalScoreIn[period] + s - _score[artifact][period];
        _score[artifact][period] = s;
    }

    function periodClosed(uint8 period) external view returns (bool) {
        return closed[period];
    }

    /// @dev `scoreOf`, not `accrualOf`: the minter reads the sum of the direct
    ///      and batch paths, so a stub exposing only the direct accrual would
    ///      let a regression to the old read slip through silently.
    function scoreOf(bytes32 artifact, uint8 period) external view returns (uint256) {
        return _score[artifact][period];
    }

    /// @dev HOSTILE override: force `totalScoreIn` out of sync with the
    ///      per-artifact scores — the shape a buggy or malicious accrual would
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

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA401);

    string constant A_ID = "clause-a";
    bytes32 constant A_KEY = keccak256(abi.encode("clause-a", uint64(1)));
    string constant B_ID = "clause-b";
    bytes32 constant B_KEY = keccak256(abi.encode("clause-b", uint64(1)));
    bytes32 constant ASM = keccak256("an-assembly");

    // The reference per-year slices (ruled 2026-07-31): a first-tranche year,
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

        vm.prank(alice);
        clauses.registerClause(A_ID, 1, keccak256("a"), "ipfs://a");
        vm.prank(bob);
        clauses.registerClause(B_ID, 1, keccak256("b"), "ipfs://b");
        vm.prank(carol);
        assemblies.registerAssembly(ASM, "ipfs://asm");

        minter = new RpgfMinter(address(florin), address(counter), address(clauses), address(assemblies), _amounts());
        florin.registerMinter(address(minter), 600_000_000 ether);
    }

    function _one(bytes32 k) internal pure returns (bytes32[] memory a) {
        a = new bytes32[](1);
        a[0] = k;
    }

    // ── Pro-rata payout ─────────────────────────────────────────────

    function test_paysProRataOfTheClosedPeriod() public {
        // Straight pro-rata of the closed period's total — no cap.
        counter.setScore(A_KEY, 0, 100);
        counter.setScore(B_KEY, 0, 50);
        counter.setScore(ASM, 0, 850);
        counter.setClosed(0, true);

        vm.prank(alice);
        minter.claim(0, _one(A_KEY));
        assertEq(florin.balanceOf(alice), (T0 * 100) / 1000);

        vm.prank(bob);
        minter.claim(0, _one(B_KEY));
        assertEq(florin.balanceOf(bob), (T0 * 50) / 1000);
    }

    function test_assemblyDesignerIsPaidToo() public {
        counter.setScore(ASM, 0, 500);
        counter.setClosed(0, true);
        vm.prank(carol);
        minter.claim(0, _one(ASM));
        assertEq(florin.balanceOf(carol), T0); // sole recipient → the whole period budget (no cap)
    }

    function test_multipleArtifactsSumInOneClaim() public {
        // A wallet claims once per period and passes everything it authored.
        vm.prank(alice);
        clauses.registerClause("clause-c", 1, keccak256("c"), "ipfs://c");
        bytes32 cKey = keccak256(abi.encode("clause-c", uint64(1)));

        counter.setScore(A_KEY, 0, 50);
        counter.setScore(cKey, 0, 50);
        counter.setScore(B_KEY, 0, 900);
        counter.setClosed(0, true);

        bytes32[] memory mine = new bytes32[](2);
        mine[0] = A_KEY;
        mine[1] = cKey;
        vm.prank(alice);
        minter.claim(0, mine);
        assertEq(florin.balanceOf(alice), (T0 * 100) / 1000);
    }

    // ── The period must be closed ───────────────────────────────────

    function test_revertsWhileThePeriodIsStillAccruing() public {
        // This is what removes the need for a snapshot: a period only pays
        // from numbers that can no longer move.
        counter.setScore(A_KEY, 0, 100);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.PeriodStillAccruing.selector, uint8(0)));
        minter.claim(0, _one(A_KEY));
    }

    // ── Authorship ──────────────────────────────────────────────────

    function test_revertsWhenNotAuthorOfRecord() public {
        counter.setScore(A_KEY, 0, 100);
        counter.setClosed(0, true);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, A_KEY, bob));
        minter.claim(0, _one(A_KEY));
    }

    function test_revertsOnUnknownArtifact() public {
        counter.setClosed(0, true);
        vm.prank(alice);
        vm.expectRevert();
        minter.claim(0, _one(keccak256("never-registered")));
    }

    function test_withdrawnAuthorForfeitsTheReward() public {
        // Author-side live-stake gate: you earn RPGF only while your stake is
        // live. Withdraw and the claim fails — the artifact is no longer yours
        // of record.
        counter.setScore(A_KEY, 0, 100);
        counter.setClosed(0, true);
        vm.prank(alice);
        clauses.withdrawDeposit(A_KEY);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, A_KEY, alice));
        minter.claim(0, _one(A_KEY));
    }

    function test_withdrawnAssemblyDesignerForfeitsTheReward() public {
        // THE SAME GATE ON THE ASSEMBLY BRANCH. Kept beside the clause case on
        // purpose: `_isAuthor` has two arms and the 600M pays through BOTH — a
        // clause author and an assembly designer of record earn on identical
        // terms. Testing only the clause arm is the same asymmetry that let the
        // assembly-credit leg sit dead end-to-end (fixed 2026-07-30); the arms
        // get covered together or the next reader learns the wrong lesson.
        counter.setScore(ASM, 0, 100);
        counter.setClosed(0, true);
        vm.prank(carol);
        assemblies.withdrawDeposit(ASM);

        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, ASM, carol));
        minter.claim(0, _one(ASM));
    }

    // ── Once per wallet per period ──────────────────────────────────

    function test_claimsOncePerPeriod() public {
        counter.setScore(A_KEY, 0, 100);
        counter.setClosed(0, true);
        vm.startPrank(alice);
        minter.claim(0, _one(A_KEY));
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.AlreadyClaimed.selector, uint8(0), alice));
        minter.claim(0, _one(A_KEY));
        vm.stopPrank();
    }

    function test_periodsAreIndependent() public {
        counter.setScore(A_KEY, 0, 100);
        counter.setScore(B_KEY, 0, 900);
        counter.setScore(A_KEY, 1, 100);
        counter.setScore(B_KEY, 1, 900);
        counter.setClosed(0, true);
        counter.setClosed(1, true);
        vm.startPrank(alice);
        minter.claim(0, _one(A_KEY));
        minter.claim(1, _one(A_KEY));
        vm.stopPrank();
        assertEq(florin.balanceOf(alice), (T0 / 10) + (T1 / 10));
    }

    // ── Uniform pro rata (no cap) ────────────────────────────────────

    function test_noCap_dominantWalletTakesItsFullProRataShare() public {
        // A dominant wallet takes its FULL pro-rata share — there is no cap. The
        // reward tracks real usage directly; Sybil resistance is the live ETH
        // stake, not a ceiling.
        counter.setScore(A_KEY, 0, 900);
        counter.setScore(B_KEY, 0, 100);
        counter.setClosed(0, true);

        vm.prank(alice);
        minter.claim(0, _one(A_KEY));
        assertEq(florin.balanceOf(alice), (T0 * 900) / 1000);
    }

    function test_duplicateArtifactCannotInflateTheShare() public {
        // The case that DISTINGUISHES inflation from correctness: alice owns a
        // 100/1000 minority of the period, so her honest share is a tenth. A
        // sole-artifact setup cannot detect this — there, 100% is the correct
        // answer either way, which is why the earlier version of this test
        // passed against a contract that let her take everything.
        counter.setScore(A_KEY, 0, 100);
        counter.setScore(B_KEY, 0, 900);
        counter.setClosed(0, true);

        bytes32[] memory dupes = new bytes32[](10);
        for (uint256 i = 0; i < 10; ++i) {
            dupes[i] = A_KEY;
        }

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.DuplicateArtifact.selector, A_KEY));
        minter.claim(0, dupes);

        // And the honest claim still pays exactly the minority share.
        vm.prank(alice);
        minter.claim(0, _one(A_KEY));
        assertEq(florin.balanceOf(alice), (T0 * 100) / 1000);
    }

    /// `claimable` must refuse the same malformed list the state-changing path
    /// refuses — a view that answered "the whole budget" would be a quoting bug
    /// even with `claim` safe.
    function test_claimableRejectsDuplicatesToo() public {
        counter.setScore(A_KEY, 0, 100);
        counter.setScore(B_KEY, 0, 900);
        counter.setClosed(0, true);
        bytes32[] memory dupes = new bytes32[](2);
        dupes[0] = A_KEY;
        dupes[1] = A_KEY;
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.DuplicateArtifact.selector, A_KEY));
        minter.claimable(0, alice, dupes);
    }

    /// Bob's entitlement must survive alice claiming first — the budget is not
    /// a race that a malformed claim can win.
    function test_oneAuthorCannotStarveAnother() public {
        counter.setScore(A_KEY, 0, 100);
        counter.setScore(B_KEY, 0, 900);
        counter.setClosed(0, true);

        vm.prank(alice);
        minter.claim(0, _one(A_KEY));
        vm.prank(bob);
        minter.claim(0, _one(B_KEY));

        assertEq(florin.balanceOf(alice), (T0 * 100) / 1000);
        assertEq(florin.balanceOf(bob), (T0 * 900) / 1000);
    }

    // ── Nothing to claim ────────────────────────────────────────────

    function test_revertsWhenPeriodHasNoUsage() public {
        counter.setClosed(0, true);
        vm.prank(alice);
        vm.expectRevert(RpgfMinter.NothingToClaim.selector);
        minter.claim(0, _one(A_KEY));
    }

    function test_revertsOnEmptyArtifactList() public {
        counter.setClosed(0, true);
        vm.prank(alice);
        vm.expectRevert(RpgfMinter.NoArtifacts.selector);
        minter.claim(0, new bytes32[](0));
    }

    function test_revertsOnUnknownPeriod() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.UnknownPeriod.selector, uint8(3)));
        minter.claim(3, _one(A_KEY));
    }

    // ── View ────────────────────────────────────────────────────────

    function test_claimableMatchesTheClaim() public {
        counter.setScore(A_KEY, 0, 100);
        counter.setScore(B_KEY, 0, 900);
        counter.setClosed(0, true);

        uint256 quoted = minter.claimable(0, alice, _one(A_KEY));
        vm.prank(alice);
        minter.claim(0, _one(A_KEY));
        assertEq(florin.balanceOf(alice), quoted);
        assertEq(minter.claimable(0, alice, _one(A_KEY)), 0);
    }

    // ── Budget backstop ─────────────────────────────────────────────

    function test_mintedTracksThePeriodSpend() public {
        counter.setScore(A_KEY, 0, 100);
        counter.setScore(B_KEY, 0, 900);
        counter.setClosed(0, true);
        vm.prank(alice);
        minter.claim(0, _one(A_KEY));
        assertEq(minter.minted(0), (T0 * 100) / 1000);
        assertLe(minter.minted(0), T0);
    }

    /// The `PeriodBudgetExceeded` backstop is STRUCTURALLY UNREACHABLE while
    /// the counter's data is consistent (duplicate-free lists + one author of
    /// record per artifact + closed-period totals keep every pro-rata sum
    /// within the budget — the 2026-08-01 audit's finding), so no honest-data
    /// test can reach it and deleting the line would change no other test's
    /// outcome. It is still the LAST line of defense for the fixed pool if the
    /// accrual ever misreports: feed the minter a counter whose per-artifact
    /// score exceeds its own period total (share > 1 ⇒ amount > budget) and
    /// the backstop must refuse to over-mint rather than pay it.
    function test_budgetBackstopRefusesOverMintOnInconsistentCounterData() public {
        counter.setScore(A_KEY, 0, 100);
        counter.forceTotal(0, 10); // hostile: total below the artifact's own score
        counter.setClosed(0, true);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.PeriodBudgetExceeded.selector, 0));
        minter.claim(0, _one(A_KEY));
        assertEq(minter.minted(0), 0);
        assertEq(florin.balanceOf(alice), 0);
    }

    // ── Constructor ─────────────────────────────────────────────────

    function test_constructor_rejectsZeroAddresses() public {
        uint256[] memory amts = _amounts();
        vm.expectRevert(RpgfMinter.ZeroAddress.selector);
        new RpgfMinter(address(0), address(counter), address(clauses), address(assemblies), amts);
        vm.expectRevert(RpgfMinter.ZeroAddress.selector);
        new RpgfMinter(address(florin), address(0), address(clauses), address(assemblies), amts);
        vm.expectRevert(RpgfMinter.ZeroAddress.selector);
        new RpgfMinter(address(florin), address(counter), address(0), address(assemblies), amts);
        vm.expectRevert(RpgfMinter.ZeroAddress.selector);
        new RpgfMinter(address(florin), address(counter), address(clauses), address(0), amts);
    }

    /// The budget array and the counter's period schedule are ONE schedule —
    /// a mismatch is a deploy fault and must fail at deploy, not at claim.
    function test_constructor_rejectsAmountsPeriodsMismatch() public {
        uint256[] memory tooFew = new uint256[](2);
        tooFew[0] = T0;
        tooFew[1] = T1;
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.AmountsPeriodsMismatch.selector, 2, 3));
        new RpgfMinter(address(florin), address(counter), address(clauses), address(assemblies), tooFew);
    }
}
