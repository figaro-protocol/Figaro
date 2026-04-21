// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../src/FigaroCore.sol";
import "../src/CommitmentTypes.sol";
import "../src/mocks/MockPermitToken.sol";
import "../src/mocks/MockERC20FeeOnTransfer.sol";

/// @title FigaroCore_RevertBranch — Negative-path coverage for the
///        enforcement-only kernel. No SelfDeal tests (removed from kernel).
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
            currency: address(token),
            payment: payment,
            expectedCumulativeValue: payment,
            agreementHash: keccak256("test"),
            salt: salt,
            deadline: block.timestamp + 1 hours
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
        c.deadline = block.timestamp - 1;

        vm.expectRevert(FigaroCore.DeadlineExpired.selector);
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER1_KEY));
    }

    function test_commit_zeroPayment_reverts() public {
        CommitmentTypes.Commitment memory c = _rootCommitment(0, 1);
        c.expectedCumulativeValue = 0;

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

    function test_commit_invalidRootCumulativeValue_reverts() public {
        CommitmentTypes.Commitment memory c = _rootCommitment(50 ether, 1);
        c.expectedCumulativeValue = 99 ether;

        vm.expectRevert(FigaroCore.InvalidRootCumulativeValue.selector);
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER1_KEY));
    }

    function test_commit_sub_unknownProcess_reverts() public {
        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: keccak256("nonexistent"),
            buyer: buyer,
            seller: seller1,
            currency: address(token),
            payment: 10 ether,
            expectedCumulativeValue: 10 ether,
            agreementHash: keccak256("test"),
            salt: 1,
            deadline: block.timestamp + 1 hours
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
            currency: address(token),
            payment: 10 ether,
            expectedCumulativeValue: 60 ether,
            agreementHash: keccak256("test"),
            salt: 2,
            deadline: block.timestamp + 1 hours
        });

        vm.expectRevert(FigaroCore.NotProcessBuyer.selector);
        core.commit(c, _signCommitment(c, OUTSIDER_KEY), _signCommitment(c, SELLER2_KEY));
    }

    function test_commit_sub_currencyMismatch_reverts() public {
        (bytes32 processId,,) = _commitRoot(50 ether, 1);
        MockPermitToken otherToken = new MockPermitToken();

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller2,
            currency: address(otherToken),
            payment: 10 ether,
            expectedCumulativeValue: 60 ether,
            agreementHash: keccak256("test"),
            salt: 2,
            deadline: block.timestamp + 1 hours
        });

        vm.expectRevert(FigaroCore.CurrencyMismatch.selector);
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER2_KEY));
    }

    function test_commit_sub_cumulativeValueMismatch_reverts() public {
        (bytes32 processId,,) = _commitRoot(50 ether, 1);

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller2,
            currency: address(token),
            payment: 10 ether,
            expectedCumulativeValue: 999 ether,
            agreementHash: keccak256("test"),
            salt: 2,
            deadline: block.timestamp + 1 hours
        });

        vm.expectRevert(abi.encodeWithSelector(FigaroCore.CumulativeValueMismatch.selector, 999 ether, 60 ether));
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER2_KEY));
    }

    function test_commit_sub_deadlineExpired_reverts() public {
        (bytes32 processId,,) = _commitRoot(50 ether, 1);

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller2,
            currency: address(token),
            payment: 10 ether,
            expectedCumulativeValue: 60 ether,
            agreementHash: keccak256("test"),
            salt: 2,
            deadline: block.timestamp - 1
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
            currency: address(feeToken),
            payment: 50 ether,
            expectedCumulativeValue: 50 ether,
            agreementHash: keccak256("test"),
            salt: 1,
            deadline: block.timestamp + 1 hours
        });

        vm.expectRevert(FigaroCore.FeeOnTransferDetected.selector);
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER1_KEY));
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
            currency: address(token),
            payment: 20 ether,
            expectedCumulativeValue: 30 ether,
            agreementHash: keccak256("sub"),
            salt: 2,
            deadline: block.timestamp + 1 hours
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

        vm.prank(buyer);
        vm.expectRevert(); // OrderNotCommitted
        core.resolveProcess(processId, commitments);
    }

    function test_resolve_alreadyResolvedOrder_reverts() public {
        (bytes32 processId,, CommitmentTypes.Commitment memory rootC) = _commitRoot(10 ether, 1);

        CommitmentTypes.Commitment memory subC = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller2,
            currency: address(token),
            payment: 20 ether,
            expectedCumulativeValue: 30 ether,
            agreementHash: keccak256("sub"),
            salt: 2,
            deadline: block.timestamp + 1 hours
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
}
