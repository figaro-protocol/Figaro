// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FlorinToken} from "src/florin/FlorinToken.sol";
import {RpgfMinter} from "src/florin/RpgfMinter.sol";
import {KlerosRpgfAdapter} from "src/florin/KlerosRpgfAdapter.sol";
import {MockKlerosCourt} from "src/mocks/MockKlerosCourt.sol";

/// @title KlerosRpgfAdapterTest
/// @notice The composed-forum seam end to end through a docs-shaped ERC-792
///         court: minter escalation forwards the fee and opens a 2-choice
///         dispute; the court's final ruling routes the bonds 1:1 through the
///         shared 0/1/2 code meaning; guards on every trust edge (minter-only
///         escalation, court-only ruling, one dispute per case, one ruling
///         per dispute, fee floor, opaque extraData passthrough).
contract KlerosRpgfAdapterTest is Test {
    FlorinToken internal florin;
    MockKlerosCourt internal court;
    KlerosRpgfAdapter internal adapter;
    RpgfMinter internal minter;

    address internal poster = address(0xA11CE);
    address internal challenger = address(0xB0B);

    uint256 internal constant BOND = 1 ether;
    uint256 internal constant FEE = 0.1 ether;
    uint64 internal constant CHALLENGE_WINDOW = 1 days;
    uint64 internal constant DISPUTE_WINDOW = 2 days;
    bytes internal constant EXTRA_DATA = abi.encode(uint256(23), uint256(3)); // opaque court routing

    function setUp() public {
        florin = new FlorinToken();
        court = new MockKlerosCourt(FEE);
        adapter = new KlerosRpgfAdapter(address(court), EXTRA_DATA);

        uint64 nowTs = uint64(block.timestamp);
        minter = new RpgfMinter(
            address(florin),
            address(adapter),
            keccak256("formula-spec-v1"),
            BOND,
            CHALLENGE_WINDOW,
            DISPUTE_WINDOW,
            [nowTs, nowTs + 30 days, nowTs + 60 days],
            [uint256(300_000_000 ether), 200_000_000 ether, 100_000_000 ether]
        );
        adapter.bindMinter(address(minter));

        florin.registerMinter(address(minter), 600_000_000 ether);
        florin.renounceDeployerMint();

        vm.deal(poster, 100 ether);
        vm.deal(challenger, 100 ether);
    }

    /// @dev Post tranche 0, challenge it, escalate through the seam. Returns
    ///      (caseId, disputeID).
    function _escalatedCase() internal returns (uint256 caseId, uint256 disputeID) {
        vm.prank(poster);
        minter.postRoot{value: BOND}(0, keccak256("root"), 0, 1000);
        vm.prank(challenger);
        caseId = minter.challenge{value: BOND}(0);
        vm.prank(poster);
        minter.disputeChallenge{value: FEE}(caseId);
        disputeID = adapter.disputeOf(caseId);
    }

    // ── The happy paths: ruling codes route bonds 1:1 ───────────────

    function test_EscalationOpensTwoChoiceDisputeWithConfiguredExtraData() public {
        (uint256 caseId, uint256 disputeID) = _escalatedCase();
        assertTrue(adapter.disputeCreated(caseId));
        assertEq(adapter.caseOf(disputeID), caseId);
        assertEq(court.choicesOf(disputeID), 2);
        assertEq(court.lastExtraData(), EXTRA_DATA);
        assertEq(address(court).balance, FEE, "the arbitration fee reached the court");
    }

    function test_RulingForPosterRoutesBothBonds() public {
        (, uint256 disputeID) = _escalatedCase();
        court.executeRuling(disputeID, 1);
        assertEq(minter.withdrawable(poster), 2 * BOND);
        assertEq(minter.withdrawable(challenger), 0);
    }

    function test_RulingForChallengerRoutesBothBonds() public {
        (, uint256 disputeID) = _escalatedCase();
        court.executeRuling(disputeID, 2);
        assertEq(minter.withdrawable(challenger), 2 * BOND);
        assertEq(minter.withdrawable(poster), 0);
    }

    function test_RefusedRulingReturnsEachBond() public {
        (, uint256 disputeID) = _escalatedCase();
        court.executeRuling(disputeID, 0);
        assertEq(minter.withdrawable(poster), BOND);
        assertEq(minter.withdrawable(challenger), BOND);
    }

    // ── Trust edges ─────────────────────────────────────────────────

    function test_RevertWhen_NonMinterEscalates() public {
        vm.expectRevert(KlerosRpgfAdapter.NotMinter.selector);
        vm.prank(poster);
        adapter.createDispute{value: FEE}(0);
    }

    function test_RevertWhen_NonCourtRules() public {
        (, uint256 disputeID) = _escalatedCase();
        vm.expectRevert(KlerosRpgfAdapter.NotCourt.selector);
        vm.prank(challenger);
        adapter.rule(disputeID, 2);
    }

    function test_RevertWhen_RulingUnknownDispute() public {
        vm.expectRevert(abi.encodeWithSelector(KlerosRpgfAdapter.UnknownDispute.selector, 999));
        vm.prank(address(court));
        adapter.rule(999, 1);
    }

    function test_RevertWhen_RulingOutOfRange() public {
        (, uint256 disputeID) = _escalatedCase();
        vm.expectRevert(abi.encodeWithSelector(KlerosRpgfAdapter.InvalidRuling.selector, 3));
        vm.prank(address(court));
        adapter.rule(disputeID, 3);
    }

    function test_RevertWhen_SecondRulingOnSameDispute() public {
        (, uint256 disputeID) = _escalatedCase();
        court.executeRuling(disputeID, 1);
        vm.expectRevert(abi.encodeWithSelector(KlerosRpgfAdapter.UnknownDispute.selector, disputeID));
        vm.prank(address(court));
        adapter.rule(disputeID, 2);
    }

    function test_RevertWhen_UnderpaidEscalation() public {
        vm.prank(poster);
        minter.postRoot{value: BOND}(0, keccak256("root"), 0, 1000);
        vm.prank(challenger);
        uint256 caseId = minter.challenge{value: BOND}(0);
        vm.expectRevert("insufficient arbitration fee");
        vm.prank(poster);
        minter.disputeChallenge{value: FEE - 1}(caseId);
    }

    // ── The one-shot minter binding ─────────────────────────────────

    function test_RevertWhen_NonDeployerBindsMinter() public {
        KlerosRpgfAdapter fresh = new KlerosRpgfAdapter(address(court), EXTRA_DATA);
        vm.expectRevert(KlerosRpgfAdapter.NotDeployer.selector);
        vm.prank(poster);
        fresh.bindMinter(address(minter));
    }

    function test_RevertWhen_MinterReBound() public {
        vm.expectRevert(KlerosRpgfAdapter.MinterAlreadyBound.selector);
        adapter.bindMinter(address(minter));
    }

    function test_ArbitrationCostSurfacesTheCourtFee() public view {
        assertEq(adapter.arbitrationCost(), FEE);
    }
}
