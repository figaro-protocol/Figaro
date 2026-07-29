// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {RpgfMinter} from "src/rpgf/RpgfMinter.sol";
import {FlorinToken} from "src/florin/FlorinToken.sol";
import {ClauseRegistry} from "src/protocol/registries/ClauseRegistry.sol";
import {AssemblyRegistry} from "src/protocol/registries/AssemblyRegistry.sol";

/// @notice Stand-in for UsageCounter so payout maths can be exercised directly,
///         including shapes a real accrual would take many settled processes to
///         reach (a wallet over the cap, an empty period). The counter's own
///         verification is proven in UsageCounterTest.
contract StubCounter {
    mapping(uint8 => bool) public closed;
    mapping(uint8 => uint256) public totalScoreIn;
    mapping(bytes32 => mapping(uint8 => uint256)) internal _score;

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

    function accrualOf(bytes32 artifact, uint8 period) external view returns (uint64, uint64, uint256) {
        return (0, 0, _score[artifact][period]);
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

    uint256 constant T0 = 300_000_000 ether;

    function setUp() public {
        florin = new FlorinToken();
        counter = new StubCounter();
        clauses = new ClauseRegistry(0);
        assemblies = new AssemblyRegistry(0);

        vm.prank(alice);
        clauses.registerClause(A_ID, 1, keccak256("a"), "ipfs://a", bytes32(0));
        vm.prank(bob);
        clauses.registerClause(B_ID, 1, keccak256("b"), "ipfs://b", bytes32(0));
        vm.prank(carol);
        assemblies.registerAssembly(ASM, "ipfs://asm");

        minter = new RpgfMinter(
            address(florin),
            address(counter),
            address(clauses),
            address(assemblies),
            [T0, uint256(200_000_000 ether), 100_000_000 ether]
        );
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
        assertEq(florin.balanceOf(carol), T0); // sole recipient → whole tranche (no cap)
    }

    function test_multipleArtifactsSumInOneClaim() public {
        // A wallet claims once per tranche and passes everything it authored.
        vm.prank(alice);
        clauses.registerClause("clause-c", 1, keccak256("c"), "ipfs://c", bytes32(0));
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
        // This is what removes the need for a snapshot: a tranche only pays
        // from numbers that can no longer move.
        counter.setScore(A_KEY, 0, 100);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.TrancheStillAccruing.selector, uint8(0)));
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

    // ── Once per wallet per tranche ─────────────────────────────────

    function test_claimsOncePerTranche() public {
        counter.setScore(A_KEY, 0, 100);
        counter.setClosed(0, true);
        vm.startPrank(alice);
        minter.claim(0, _one(A_KEY));
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.AlreadyClaimed.selector, uint8(0), alice));
        minter.claim(0, _one(A_KEY));
        vm.stopPrank();
    }

    function test_tranchesAreIndependent() public {
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
        assertEq(florin.balanceOf(alice), (T0 / 10) + (200_000_000 ether / 10));
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
        // Passing an artifact repeatedly cannot inflate the score past the
        // period total (`score > total` clamps to `total`), so a sole recipient
        // still takes exactly the tranche, never more.
        counter.setScore(A_KEY, 0, 100);
        counter.setClosed(0, true);
        bytes32[] memory dupes = new bytes32[](3);
        dupes[0] = A_KEY;
        dupes[1] = A_KEY;
        dupes[2] = A_KEY;
        vm.prank(alice);
        minter.claim(0, dupes);
        assertEq(florin.balanceOf(alice), T0);
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

    function test_revertsOnUnknownTranche() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.UnknownTranche.selector, uint8(3)));
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

    function test_mintedTracksTheTrancheSpend() public {
        counter.setScore(A_KEY, 0, 100);
        counter.setScore(B_KEY, 0, 900);
        counter.setClosed(0, true);
        vm.prank(alice);
        minter.claim(0, _one(A_KEY));
        assertEq(minter.minted(0), (T0 * 100) / 1000);
        assertLe(minter.minted(0), T0);
    }

    // ── Constructor ─────────────────────────────────────────────────

    function test_constructor_rejectsZeroAddresses() public {
        uint256[3] memory amts = [T0, uint256(1), 1];
        vm.expectRevert(RpgfMinter.ZeroAddress.selector);
        new RpgfMinter(address(0), address(counter), address(clauses), address(assemblies), amts);
        vm.expectRevert(RpgfMinter.ZeroAddress.selector);
        new RpgfMinter(address(florin), address(0), address(clauses), address(assemblies), amts);
        vm.expectRevert(RpgfMinter.ZeroAddress.selector);
        new RpgfMinter(address(florin), address(counter), address(0), address(assemblies), amts);
        vm.expectRevert(RpgfMinter.ZeroAddress.selector);
        new RpgfMinter(address(florin), address(counter), address(clauses), address(0), amts);
    }
}
