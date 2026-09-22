// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "src/core/kernel/FigaroCore.sol";
import "src/core/kernel/CommitmentTypes.sol";
import {MockERC20NoReturn} from "src/mocks/MockERC20NoReturn.sol";
import {MockERC20Blocklist} from "src/mocks/MockERC20Blocklist.sol";
import {MockERC20Rebasing} from "src/mocks/MockERC20Rebasing.sol";
import {MockERC20SixDecimals} from "src/mocks/MockERC20SixDecimals.sol";

/// @title WeirdTokenTest — the kernel against the ERC-20 shapes beyond the
///        fee-on-transfer rejection
/// @notice The currency is the parties' choice and its terms ride into the
///         process (`DESIGN_DECISIONS.md` #10). Four shapes: no return value
///         (settles, through SafeERC20), six decimals (settles exactly, the
///         kernel never reads `decimals()`), an issuer blocklist (a blocked
///         party's leg holds the whole atomic resolution until the issuer
///         relents), and a rebase (upward: the surplus is stranded in the
///         kernel; downward: resolution waits until the balance recovers).
contract WeirdTokenTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore internal core;

    uint256 internal constant BUYER_KEY = 0xB0B;
    uint256 internal constant SELLER1_KEY = 0x5E11;
    uint256 internal constant SELLER2_KEY = 0x5E12;
    address internal buyer;
    address internal seller1;
    address internal seller2;

    function setUp() public {
        buyer = vm.addr(BUYER_KEY);
        seller1 = vm.addr(SELLER1_KEY);
        seller2 = vm.addr(SELLER2_KEY);
        core = new FigaroCore();
    }

    // ── No return value ──────────────────────────────────────────

    function test_noReturnToken_commitsAndResolves() public {
        MockERC20NoReturn nrt = new MockERC20NoReturn();
        nrt.mint(buyer, 1_000 ether);
        nrt.mint(seller1, 1_000 ether);
        vm.prank(buyer);
        nrt.approve(address(core), type(uint256).max);
        vm.prank(seller1);
        nrt.approve(address(core), type(uint256).max);

        (bytes32 processId, CommitmentTypes.Commitment memory c) =
            _commitRoot(address(nrt), seller1, SELLER1_KEY, 100 ether, 1);
        assertEq(nrt.balanceOf(address(core)), 400 ether, "both bonds pulled");

        _resolve(processId, c);
        assertEq(nrt.balanceOf(address(core)), 0, "kernel empty");
        assertEq(nrt.balanceOf(seller1), 1_100 ether, "seller: bond back plus the price");
        assertEq(nrt.balanceOf(buyer), 900 ether, "buyer: bond back minus the price");
    }

    // ── Six decimals ─────────────────────────────────────────────

    function test_sixDecimalToken_commitsAndResolvesExactly() public {
        MockERC20SixDecimals usd = new MockERC20SixDecimals("Six", "SIX");
        usd.mint(buyer, 1_000e6);
        usd.mint(seller1, 1_000e6);
        vm.prank(buyer);
        usd.approve(address(core), type(uint256).max);
        vm.prank(seller1);
        usd.approve(address(core), type(uint256).max);

        (bytes32 processId, CommitmentTypes.Commitment memory c) =
            _commitRoot(address(usd), seller1, SELLER1_KEY, 100e6, 1);
        assertEq(usd.balanceOf(address(core)), 400e6, "bonds in the token's own unit");

        _resolve(processId, c);
        assertEq(usd.balanceOf(seller1), 1_100e6, "seller paid in the token's unit");
        assertEq(usd.balanceOf(buyer), 900e6, "buyer refunded in the token's unit");
        assertEq(usd.balanceOf(address(core)), 0, "kernel empty");
    }

    // ── Issuer blocklist ─────────────────────────────────────────

    /// A blocked seller's payout leg reverts, and resolution is atomic, so
    /// the process — every bond, the other seller's payout — waits on the
    /// issuer. Unblocked, the same call resolves it.
    function test_blocklistedSeller_holdsTheWholeProcessUntilUnblocked() public {
        MockERC20Blocklist blk = _blocklistToken();

        (bytes32 processId, CommitmentTypes.Commitment memory root) =
            _commitRoot(address(blk), seller1, SELLER1_KEY, 100 ether, 1);
        CommitmentTypes.Commitment memory sub =
            _commitSub(address(blk), processId, seller2, SELLER2_KEY, 50 ether, 150 ether, 2);
        uint256 held = blk.balanceOf(address(core));
        assertEq(held, 200 ether + 200 ether + 100 ether + 300 ether, "four bonds held");

        blk.setBlocked(seller2, true);
        CommitmentTypes.Commitment[] memory list = new CommitmentTypes.Commitment[](2);
        list[0] = root;
        list[1] = sub;
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(MockERC20Blocklist.Blocked.selector, seller2));
        core.resolveProcess(processId, list);
        assertEq(blk.balanceOf(address(core)), held, "nothing moved: seller1 unpaid, every bond held");

        blk.setBlocked(seller2, false);
        vm.prank(buyer);
        core.resolveProcess(processId, list);
        assertEq(blk.balanceOf(address(core)), 0, "resolved once the issuer relents");
    }

    function test_blocklistedBuyer_holdsTheProcessUntilUnblocked() public {
        MockERC20Blocklist blk = _blocklistToken();
        (bytes32 processId, CommitmentTypes.Commitment memory c) =
            _commitRoot(address(blk), seller1, SELLER1_KEY, 100 ether, 1);

        blk.setBlocked(buyer, true);
        CommitmentTypes.Commitment[] memory list = new CommitmentTypes.Commitment[](1);
        list[0] = c;
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(MockERC20Blocklist.Blocked.selector, buyer));
        core.resolveProcess(processId, list);
        assertEq(blk.balanceOf(address(core)), 400 ether, "the buyer's own refund leg holds the process");

        blk.setBlocked(buyer, false);
        _resolve(processId, c);
        assertEq(blk.balanceOf(address(core)), 0);
    }

    // ── Rebase ───────────────────────────────────────────────────

    /// An upward rebase between commit and resolve leaves the kernel holding
    /// more than it owes; resolution pays the committed figures and the
    /// surplus stays in the kernel, which has no function that moves it.
    function test_rebasingToken_upwardRebaseStrandsTheSurplus() public {
        MockERC20Rebasing rbs = _rebasingToken();
        (bytes32 processId, CommitmentTypes.Commitment memory c) =
            _commitRoot(address(rbs), seller1, SELLER1_KEY, 100 ether, 1);
        assertEq(rbs.balanceOf(address(core)), 400 ether, "exact at multiplier 1");

        rbs.rebase(2e18);
        assertEq(rbs.balanceOf(address(core)), 800 ether, "the kernel's balance doubled");

        _resolve(processId, c);
        assertEq(rbs.balanceOf(address(core)), 400 ether, "the surplus is stranded");
    }

    /// A downward rebase leaves the kernel short; resolution reverts on the
    /// transfer out and the process waits until the balance recovers.
    function test_rebasingToken_downwardRebaseHoldsTheProcess() public {
        MockERC20Rebasing rbs = _rebasingToken();
        (bytes32 processId, CommitmentTypes.Commitment memory c) =
            _commitRoot(address(rbs), seller1, SELLER1_KEY, 100 ether, 1);

        rbs.rebase(0.5e18);
        assertEq(rbs.balanceOf(address(core)), 200 ether, "the kernel is short");
        CommitmentTypes.Commitment[] memory list = new CommitmentTypes.Commitment[](1);
        list[0] = c;
        vm.prank(buyer);
        vm.expectRevert(bytes("RBS: balance"));
        core.resolveProcess(processId, list);

        rbs.rebase(1e18);
        _resolve(processId, c);
        assertEq(rbs.balanceOf(address(core)), 0, "resolves once the balance is back");
    }

    // ── Helpers ──────────────────────────────────────────────────

    function _blocklistToken() internal returns (MockERC20Blocklist blk) {
        blk = new MockERC20Blocklist("Blocklist", "BLK");
        address[3] memory parties = [buyer, seller1, seller2];
        for (uint256 i = 0; i < parties.length; i++) {
            blk.mint(parties[i], 1_000 ether);
            vm.prank(parties[i]);
            blk.approve(address(core), type(uint256).max);
        }
    }

    function _rebasingToken() internal returns (MockERC20Rebasing rbs) {
        rbs = new MockERC20Rebasing();
        rbs.mint(buyer, 1_000 ether);
        rbs.mint(seller1, 1_000 ether);
        vm.prank(buyer);
        rbs.approve(address(core), type(uint256).max);
        vm.prank(seller1);
        rbs.approve(address(core), type(uint256).max);
    }

    function _commitRoot(address currency, address seller, uint256 sellerKey, uint256 payment, uint256 salt)
        internal
        returns (bytes32 processId, CommitmentTypes.Commitment memory c)
    {
        c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            currency: currency,
            payment: payment,
            expectedCumulativeValue: payment,
            agreementHash: keccak256("root-agreement"),
            salt: salt,
            deadline: block.timestamp + 1 hours
        });
        (processId,) = core.commit(c, _sign(c, BUYER_KEY), _sign(c, sellerKey));
    }

    function _commitSub(
        address currency,
        bytes32 processId,
        address seller,
        uint256 sellerKey,
        uint256 payment,
        uint256 expectedCum,
        uint256 salt
    ) internal returns (CommitmentTypes.Commitment memory c) {
        c = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller,
            currency: currency,
            payment: payment,
            expectedCumulativeValue: expectedCum,
            agreementHash: keccak256("sub-agreement"),
            salt: salt,
            deadline: block.timestamp + 1 hours
        });
        core.commit(c, _sign(c, BUYER_KEY), _sign(c, sellerKey));
    }

    function _resolve(bytes32 processId, CommitmentTypes.Commitment memory c) internal {
        CommitmentTypes.Commitment[] memory list = new CommitmentTypes.Commitment[](1);
        list[0] = c;
        vm.prank(buyer);
        core.resolveProcess(processId, list);
    }

    function _sign(CommitmentTypes.Commitment memory c, uint256 privateKey) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", core.DOMAIN_SEPARATOR(), c.hashStruct()));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
