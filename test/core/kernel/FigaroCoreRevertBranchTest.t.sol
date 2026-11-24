// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "src/core/kernel/FigaroCore.sol";
import "src/core/kernel/CommitmentTypes.sol";
import "src/mocks/MockPermitToken.sol";
import "src/mocks/MockERC20FeeOnTransfer.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

/// @title FigaroCore_RevertBranch — Negative-path coverage for the
///        enforcement-only FigaroCore. No SelfDeal tests (removed from FigaroCore).
contract FigaroCore_RevertBranch is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore internal core;
    MockPermitToken internal token;

    uint256 internal constant BUYER_KEY = 0xB0B;
    uint256 internal constant SELLER1_KEY = 0x5E11;
    uint256 internal constant SELLER2_KEY = 0x5E12;
    uint256 internal constant OUTSIDER_KEY = 0xBAD;

    address internal buyer;
    address internal seller1;
    address internal seller2;
    address internal outsider;

    uint256 internal constant INITIAL_BALANCE = 100_000 ether;

    function setUp() public {
        buyer = vm.addr(BUYER_KEY);
        seller1 = vm.addr(SELLER1_KEY);
        seller2 = vm.addr(SELLER2_KEY);
        outsider = vm.addr(OUTSIDER_KEY);

        token = new MockPermitToken();
        core = new FigaroCore();

        address[4] memory participants = [buyer, seller1, seller2, outsider];
        for (uint256 i = 0; i < participants.length; i++) {
            token.mint(participants[i], INITIAL_BALANCE);
            vm.prank(participants[i]);
            token.approve(address(core), type(uint256).max);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────

    function _signCommitment(CommitmentTypes.Commitment memory c, uint256 privateKey)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = c.hashStruct();
        bytes32 digest = _typedDataHash(structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _typedDataHash(bytes32 structHash) internal view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("FigaroCore"),
                keccak256("3"),
                block.chainid,
                address(core)
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _rootCommitment(uint256 payment, uint256 salt) internal view returns (CommitmentTypes.Commitment memory) {
        return CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller1,
            token: address(token),
            payment: payment,
            runningTotal: payment,
            checkoutHash: keccak256("test"),
            salt: salt,
            commitDeadline: block.timestamp + 1 hours
        });
    }

    function _commitRoot(uint256 payment, uint256 salt)
        internal
        returns (bytes32 processId, bytes32 orderHash, CommitmentTypes.Commitment memory c)
    {
        c = _rootCommitment(payment, salt);
        (processId, orderHash) = core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER1_KEY));
    }

    // ═══════════════════════════════════════════════════════════════
    // commit() revert branches
    // ═══════════════════════════════════════════════════════════════

    function test_commit_deadlineExpired_reverts() public {
        CommitmentTypes.Commitment memory c = _rootCommitment(50 ether, 1);
        c.commitDeadline = block.timestamp - 1;

        vm.expectRevert(FigaroCore.DeadlineExpired.selector);
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER1_KEY));
    }

    function test_commit_zeroPayment_reverts() public {
        CommitmentTypes.Commitment memory c = _rootCommitment(0, 1);
        c.runningTotal = 0;

        vm.expectRevert(FigaroCore.ZeroPayment.selector);
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER1_KEY));
    }

    function test_commit_invalidBuyerSig_reverts() public {
        CommitmentTypes.Commitment memory c = _rootCommitment(50 ether, 1);

        vm.expectRevert(FigaroCore.InvalidBuyerSignature.selector);
        core.commit(c, _signCommitment(c, OUTSIDER_KEY), _signCommitment(c, SELLER1_KEY));
    }

    function test_commit_invalidSellerSig_reverts() public {
        CommitmentTypes.Commitment memory c = _rootCommitment(50 ether, 1);

        vm.expectRevert(FigaroCore.InvalidSellerSignature.selector);
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, OUTSIDER_KEY));
    }

    function test_commit_processAlreadyExists_reverts() public {
        _commitRoot(50 ether, 1);

        CommitmentTypes.Commitment memory c = _rootCommitment(50 ether, 1);
        vm.expectRevert(FigaroCore.ProcessAlreadyExists.selector);
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER1_KEY));
    }

    function test_commit_invalidRootRunningTotal_reverts() public {
        CommitmentTypes.Commitment memory c = _rootCommitment(50 ether, 1);
        c.runningTotal = 99 ether;

        vm.expectRevert(FigaroCore.InvalidRootRunningTotal.selector);
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER1_KEY));
    }

    function test_commit_sub_unknownProcess_reverts() public {
        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: keccak256("nonexistent"),
            buyer: buyer,
            seller: seller1,
            token: address(token),
            payment: 10 ether,
            runningTotal: 10 ether,
            checkoutHash: keccak256("test"),
            salt: 1,
            commitDeadline: block.timestamp + 1 hours
        });

        vm.expectRevert(FigaroCore.UnknownProcess.selector);
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER1_KEY));
    }

    function test_commit_sub_notProcessBuyer_reverts() public {
        (bytes32 processId,,) = _commitRoot(50 ether, 1);

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: processId,
            buyer: outsider,
            seller: seller2,
            token: address(token),
            payment: 10 ether,
            runningTotal: 60 ether,
            checkoutHash: keccak256("test"),
            salt: 2,
            commitDeadline: block.timestamp + 1 hours
        });

        vm.expectRevert(FigaroCore.NotProcessBuyer.selector);
        core.commit(c, _signCommitment(c, OUTSIDER_KEY), _signCommitment(c, SELLER2_KEY));
    }

    function test_commit_sub_tokenMismatch_reverts() public {
        (bytes32 processId,,) = _commitRoot(50 ether, 1);
        MockPermitToken otherToken = new MockPermitToken();

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller2,
            token: address(otherToken),
            payment: 10 ether,
            runningTotal: 60 ether,
            checkoutHash: keccak256("test"),
            salt: 2,
            commitDeadline: block.timestamp + 1 hours
        });

        vm.expectRevert(FigaroCore.TokenMismatch.selector);
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER2_KEY));
    }

    function test_commit_sub_runningTotalMismatch_reverts() public {
        (bytes32 processId,,) = _commitRoot(50 ether, 1);

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller2,
            token: address(token),
            payment: 10 ether,
            runningTotal: 999 ether,
            checkoutHash: keccak256("test"),
            salt: 2,
            commitDeadline: block.timestamp + 1 hours
        });

        vm.expectRevert(abi.encodeWithSelector(FigaroCore.RunningTotalMismatch.selector, 999 ether, 60 ether));
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER2_KEY));
    }

    function test_commit_sub_deadlineExpired_reverts() public {
        (bytes32 processId,,) = _commitRoot(50 ether, 1);

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller2,
            token: address(token),
            payment: 10 ether,
            runningTotal: 60 ether,
            checkoutHash: keccak256("test"),
            salt: 2,
            commitDeadline: block.timestamp - 1
        });

        vm.expectRevert(FigaroCore.DeadlineExpired.selector);
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER2_KEY));
    }

    // ── Fee-on-transfer rejection ─────────────────────────────────

    function test_commit_feeOnTransferToken_reverts() public {
        MockERC20FeeOnTransfer feeToken = new MockERC20FeeOnTransfer("FeeToken", "FT");

        feeToken.mint(buyer, INITIAL_BALANCE);
        feeToken.mint(seller1, INITIAL_BALANCE);
        vm.prank(buyer);
        feeToken.approve(address(core), type(uint256).max);
        vm.prank(seller1);
        feeToken.approve(address(core), type(uint256).max);

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller1,
            token: address(feeToken),
            payment: 50 ether,
            runningTotal: 50 ether,
            checkoutHash: keccak256("test"),
            salt: 1,
            commitDeadline: block.timestamp + 1 hours
        });

        vm.expectRevert(FigaroCore.FeeOnTransferDetected.selector);
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER1_KEY));
    }

    // ═══════════════════════════════════════════════════════════════
    // A-3: no participant goes below zero (docs/VERIFICATION_MAP.md § 3)
    //
    // A party that cannot cover its bond, by balance or by allowance, is
    // refused by the token inside commit(); the revert takes every write of
    // the commit with it. A resolve pays out the bonds of its own process
    // and nothing the Core holds for another.
    // ═══════════════════════════════════════════════════════════════

    /// The balances of the two parties and the Core, read before a refused
    /// commit and compared after it.
    function _balances(address a, address b) internal view returns (uint256[3] memory bal) {
        bal = [token.balanceOf(a), token.balanceOf(b), token.balanceOf(address(core))];
    }

    /// A refused root commit moved no token and left no process and no order behind.
    function _assertRootCommitLeftNothing(CommitmentTypes.Commitment memory c, uint256[3] memory before) internal view {
        uint256[3] memory afterBal = _balances(c.buyer, c.seller);
        assertEq(afterBal[0], before[0], "the buyer's balance did not move");
        assertEq(afterBal[1], before[1], "the seller's balance did not move");
        assertEq(afterBal[2], before[2], "the Core's balance did not move");
        bytes32 processId = _typedDataHash(c.hashStruct());
        (address rootBuyer,, uint256 runningTotal, uint256 active) = core.processes(processId);
        assertEq(rootBuyer, address(0), "no process was written");
        assertEq(runningTotal, 0, "no running total was written");
        assertEq(active, 0, "no order was counted");
        assertEq(core.orderStatus(keccak256(abi.encodePacked(processId, c.hashStruct()))), 0, "no order was written");
    }

    /// A buyer whose balance is one unit short of twice the payment is refused,
    /// and the refusal moves nothing: the Core never lends a bond.
    function test_commit_buyerBalanceShortOfItsBond_revertsAndWritesNothing() public {
        uint256 payment = 10 ether;
        vm.prank(buyer);
        token.transfer(outsider, INITIAL_BALANCE - (2 * payment - 1));
        CommitmentTypes.Commitment memory c = _rootCommitment(payment, 1);
        uint256[3] memory before = _balances(buyer, seller1);

        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, buyer, 2 * payment - 1, 2 * payment)
        );
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER1_KEY));
        _assertRootCommitLeftNothing(c, before);
    }

    /// A buyer that approved one unit less than twice the payment is refused the same way.
    function test_commit_buyerAllowanceShortOfItsBond_revertsAndWritesNothing() public {
        uint256 payment = 10 ether;
        vm.prank(buyer);
        token.approve(address(core), 2 * payment - 1);
        CommitmentTypes.Commitment memory c = _rootCommitment(payment, 1);
        uint256[3] memory before = _balances(buyer, seller1);

        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(core), 2 * payment - 1, 2 * payment
            )
        );
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER1_KEY));
        _assertRootCommitLeftNothing(c, before);
    }

    /// The seller is pulled after the buyer: a seller short of its bond reverts
    /// the commit, and the buyer's bond, already pulled, goes back with it.
    function test_commit_sellerBalanceShortOfItsBond_revertsAndWritesNothing() public {
        uint256 payment = 10 ether;
        vm.prank(seller1);
        token.transfer(outsider, INITIAL_BALANCE - (2 * payment - 1));
        CommitmentTypes.Commitment memory c = _rootCommitment(payment, 1);
        uint256[3] memory before = _balances(buyer, seller1);

        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientBalance.selector, seller1, 2 * payment - 1, 2 * payment
            )
        );
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER1_KEY));
        _assertRootCommitLeftNothing(c, before);
    }

    /// A later seller's bond is twice the running total, not twice its own
    /// payment: a seller that approved only the latter is refused, and the
    /// process it meant to extend keeps its accumulator and its order count.
    function test_commit_subSellerAllowanceShortOfItsBond_revertsAndLeavesTheProcess() public {
        (bytes32 processId,,) = _commitRoot(10 ether, 1);
        vm.prank(seller2);
        token.approve(address(core), 2 * 30 ether - 1);
        CommitmentTypes.Commitment memory subC = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller2,
            token: address(token),
            payment: 20 ether,
            runningTotal: 30 ether,
            checkoutHash: keccak256("sub"),
            salt: 2,
            commitDeadline: block.timestamp + 1 hours
        });
        uint256[3] memory before = _balances(buyer, seller2);

        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(core), 2 * 30 ether - 1, 2 * 30 ether
            )
        );
        core.commit(subC, _signCommitment(subC, BUYER_KEY), _signCommitment(subC, SELLER2_KEY));

        uint256[3] memory afterBal = _balances(buyer, seller2);
        assertEq(afterBal[0], before[0], "the buyer's balance did not move");
        assertEq(afterBal[1], before[1], "the seller's balance did not move");
        assertEq(afterBal[2], before[2], "the Core's balance did not move");
        (,, uint256 runningTotal, uint256 active) = core.processes(processId);
        assertEq(runningTotal, 10 ether, "the accumulator did not move");
        assertEq(active, 1, "the order count did not move");
        assertEq(core.orderStatus(keccak256(abi.encodePacked(processId, subC.hashStruct()))), 0, "no order was written");
    }

    /// Two processes share the Core's balance in one token. Resolving one pays
    /// out exactly the bonds its own commits pulled, so the Core still holds
    /// every unit of the other's bonds, and each party of the resolved process
    /// ends at its starting balance moved by the price alone.
    function testFuzz_resolve_paysOutOnlyTheBondsOfItsOwnProcess(uint96 p1, uint96 p2, uint96 q) public {
        uint256 pay1 = 1 + uint256(p1) % 1000 ether;
        uint256 pay2 = 1 + uint256(p2) % 1000 ether;
        uint256 other = 1 + uint256(q) % 1000 ether;

        (bytes32 processId,, CommitmentTypes.Commitment memory rootC) = _commitRoot(pay1, 1);
        CommitmentTypes.Commitment memory subC = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller2,
            token: address(token),
            payment: pay2,
            runningTotal: pay1 + pay2,
            checkoutHash: keccak256("sub"),
            salt: 2,
            commitDeadline: block.timestamp + 1 hours
        });
        core.commit(subC, _signCommitment(subC, BUYER_KEY), _signCommitment(subC, SELLER2_KEY));

        // The other process: outsider buys from seller2.
        CommitmentTypes.Commitment memory otherC = _rootCommitment(other, 3);
        otherC.buyer = outsider;
        otherC.seller = seller2;
        core.commit(otherC, _signCommitment(otherC, OUTSIDER_KEY), _signCommitment(otherC, SELLER2_KEY));
        uint256 otherBonds = 2 * other + 2 * other;

        assertEq(
            token.balanceOf(address(core)),
            2 * (pay1 + pay2) + 2 * pay1 + 2 * (pay1 + pay2) + otherBonds,
            "the Core holds both processes' bonds"
        );

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](2);
        commitments[0] = rootC;
        commitments[1] = subC;
        vm.prank(buyer);
        core.resolveProcess(processId, commitments);

        assertEq(token.balanceOf(address(core)), otherBonds, "the other process's bonds stay whole");
        assertEq(token.balanceOf(buyer), INITIAL_BALANCE - pay1 - pay2, "the buyer paid the prices, nothing more");
        assertEq(token.balanceOf(seller1), INITIAL_BALANCE + pay1, "seller1 is up its price");
        assertEq(
            token.balanceOf(seller2), INITIAL_BALANCE + pay2 - 2 * other, "seller2 is up its price, its other bond held"
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // resolveProcess() revert branches
    // ═══════════════════════════════════════════════════════════════

    function test_resolve_unknownProcess_reverts() public {
        CommitmentTypes.Commitment[] memory c = new CommitmentTypes.Commitment[](0);
        vm.expectRevert(FigaroCore.UnknownProcess.selector);
        core.resolveProcess(keccak256("nonexistent"), c);
    }

    function test_resolve_notBuyer_reverts() public {
        (bytes32 processId,, CommitmentTypes.Commitment memory rootC) = _commitRoot(50 ether, 1);

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](1);
        commitments[0] = rootC;

        vm.prank(outsider);
        vm.expectRevert(FigaroCore.NotProcessBuyer.selector);
        core.resolveProcess(processId, commitments);
    }

    function test_resolve_noActiveOrders_reverts() public {
        (bytes32 processId,, CommitmentTypes.Commitment memory rootC) = _commitRoot(50 ether, 1);

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](1);
        commitments[0] = rootC;

        vm.prank(buyer);
        core.resolveProcess(processId, commitments);

        vm.prank(buyer);
        vm.expectRevert(FigaroCore.NoActiveOrders.selector);
        core.resolveProcess(processId, commitments);
    }

    function test_resolve_incompleteOrderList_reverts() public {
        (bytes32 processId,, CommitmentTypes.Commitment memory rootC) = _commitRoot(10 ether, 1);

        // Add sub so activeOrderCount = 2
        CommitmentTypes.Commitment memory subC = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller2,
            token: address(token),
            payment: 20 ether,
            runningTotal: 30 ether,
            checkoutHash: keccak256("sub"),
            salt: 2,
            commitDeadline: block.timestamp + 1 hours
        });
        core.commit(subC, _signCommitment(subC, BUYER_KEY), _signCommitment(subC, SELLER2_KEY));

        // Only provide 1 of 2
        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](1);
        commitments[0] = rootC;

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(FigaroCore.IncompleteOrderList.selector, 2, 1));
        core.resolveProcess(processId, commitments);
    }

    function test_resolve_orderNotCommitted_reverts() public {
        (bytes32 processId,, CommitmentTypes.Commitment memory rootC) = _commitRoot(50 ether, 1);

        // Tamper
        CommitmentTypes.Commitment memory tampered = rootC;
        tampered.salt = 999;

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](1);
        commitments[0] = tampered;

        bytes32 tamperedHash = keccak256(abi.encodePacked(processId, CommitmentTypes.hashStruct(tampered)));
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(FigaroCore.OrderNotCommitted.selector, tamperedHash));
        core.resolveProcess(processId, commitments);
    }

    function test_resolve_alreadyResolvedOrder_reverts() public {
        (bytes32 processId,, CommitmentTypes.Commitment memory rootC) = _commitRoot(10 ether, 1);

        CommitmentTypes.Commitment memory subC = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller2,
            token: address(token),
            payment: 20 ether,
            runningTotal: 30 ether,
            checkoutHash: keccak256("sub"),
            salt: 2,
            commitDeadline: block.timestamp + 1 hours
        });
        core.commit(subC, _signCommitment(subC, BUYER_KEY), _signCommitment(subC, SELLER2_KEY));

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](2);
        commitments[0] = rootC;
        commitments[1] = subC;
        vm.prank(buyer);
        core.resolveProcess(processId, commitments);

        vm.prank(buyer);
        vm.expectRevert(FigaroCore.NoActiveOrders.selector);
        core.resolveProcess(processId, commitments);
    }

    // ═══════════════════════════════════════════════════════════════
    // DuplicateCommitment is a defensive backstop: every replay of an
    // identical commitment is preempted by an earlier check, so the
    // guard itself is unreachable through commit()'s public surface.
    // These tests pin the preempting error on each replay path.
    // ═══════════════════════════════════════════════════════════════

    function test_commit_rootReplay_preemptedByProcessAlreadyExists() public {
        (,, CommitmentTypes.Commitment memory c) = _commitRoot(10 ether, 1);

        vm.expectRevert(FigaroCore.ProcessAlreadyExists.selector);
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER1_KEY));
    }

    function test_commit_subReplay_preemptedByRunningTotalMismatch() public {
        (bytes32 processId,,) = _commitRoot(10 ether, 1);

        CommitmentTypes.Commitment memory subC = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller2,
            token: address(token),
            payment: 20 ether,
            runningTotal: 30 ether,
            checkoutHash: keccak256("sub"),
            salt: 2,
            commitDeadline: block.timestamp + 1 hours
        });
        core.commit(subC, _signCommitment(subC, BUYER_KEY), _signCommitment(subC, SELLER2_KEY));

        // Identical struct: the accumulator has moved to 30, so the replay's
        // runningTotal (30) no longer matches 30 + 20 = 50.
        vm.expectRevert(abi.encodeWithSelector(FigaroCore.RunningTotalMismatch.selector, 30 ether, 50 ether));
        core.commit(subC, _signCommitment(subC, BUYER_KEY), _signCommitment(subC, SELLER2_KEY));
    }
}
