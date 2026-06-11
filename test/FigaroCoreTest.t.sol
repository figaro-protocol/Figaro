// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../src/FigaroCore.sol";
import "../src/CommitmentTypes.sol";
import "../src/mocks/MockPermitToken.sol";

/// @title FigaroCoreTest — Core invariant tests for the enforcement-only kernel
contract FigaroCoreTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore internal core;
    MockPermitToken internal token;

    uint256 internal constant BUYER_KEY = 0xB0B;
    uint256 internal constant SELLER1_KEY = 0x5E11;
    uint256 internal constant SELLER2_KEY = 0x5E12;
    uint256 internal constant SELLER3_KEY = 0x5E13;
    uint256 internal constant OUTSIDER_KEY = 0xBAD;

    address internal buyer;
    address internal seller1;
    address internal seller2;
    address internal seller3;
    address internal outsider;

    uint256 internal constant INITIAL_BALANCE = 100_000 ether;

    function setUp() public {
        buyer = vm.addr(BUYER_KEY);
        seller1 = vm.addr(SELLER1_KEY);
        seller2 = vm.addr(SELLER2_KEY);
        seller3 = vm.addr(SELLER3_KEY);
        outsider = vm.addr(OUTSIDER_KEY);

        token = new MockPermitToken();
        core = new FigaroCore();

        address[5] memory participants = [buyer, seller1, seller2, seller3, outsider];
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
            agreementHash: keccak256("root-manifest"),
            salt: salt,
            deadline: block.timestamp + 1 hours
        });
    }

    function _commitRoot(uint256 payment, uint256 salt)
        internal
        returns (bytes32 processId, bytes32 orderHash, CommitmentTypes.Commitment memory c)
    {
        c = _rootCommitment(payment, salt);
        bytes memory buyerSig = _signCommitment(c, BUYER_KEY);
        bytes memory sellerSig = _signCommitment(c, SELLER1_KEY);
        (processId, orderHash) = core.commit(c, buyerSig, sellerSig);
    }

    function _subCommitment(bytes32 processId, address seller, uint256 payment, uint256 expectedCum, uint256 salt)
        internal
        view
        returns (CommitmentTypes.Commitment memory)
    {
        return CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller,
            currency: address(token),
            payment: payment,
            expectedCumulativeValue: expectedCum,
            agreementHash: keccak256(abi.encodePacked("sub-manifest-", salt)),
            salt: salt,
            deadline: block.timestamp + 1 hours
        });
    }

    function _commitSub(
        bytes32 processId,
        address seller,
        uint256 payment,
        uint256 expectedCum,
        uint256 sellerKey,
        uint256 salt
    ) internal returns (bytes32 orderHash, CommitmentTypes.Commitment memory c) {
        c = _subCommitment(processId, seller, payment, expectedCum, salt);
        bytes memory buyerSig = _signCommitment(c, BUYER_KEY);
        bytes memory sellerSig = _signCommitment(c, sellerKey);
        (, orderHash) = core.commit(c, buyerSig, sellerSig);
    }

    // ═══════════════════════════════════════════════════════════════
    // 1: Root order sets accumulator correctly
    // ═══════════════════════════════════════════════════════════════

    function test_rootOrder_setsAccumulator() public {
        uint256 payment = 50 ether;
        (bytes32 processId,,) = _commitRoot(payment, 1);

        (address rootBuyer,, uint256 cumValue, uint256 activeCount) = core.processes(processId);
        assertEq(rootBuyer, buyer, "root buyer");
        assertEq(cumValue, payment, "cumulative == payment for root");
        assertEq(activeCount, 1, "one active order");
    }

    // ═══════════════════════════════════════════════════════════════
    // 2: Sub-order with correct expectedCumulativeValue succeeds
    // ═══════════════════════════════════════════════════════════════

    function test_subOrder_correctCumulativeValue_succeeds() public {
        uint256 rootPayment = 50 ether;
        (bytes32 processId,,) = _commitRoot(rootPayment, 1);

        uint256 subPayment = 30 ether;
        uint256 expectedCum = rootPayment + subPayment;
        _commitSub(processId, seller2, subPayment, expectedCum, SELLER2_KEY, 2);

        (,, uint256 cumValue, uint256 activeCount) = core.processes(processId);
        assertEq(cumValue, expectedCum, "accumulator advanced");
        assertEq(activeCount, 2, "two active orders");
    }

    // ═══════════════════════════════════════════════════════════════
    // 3: Sub-order with WRONG expectedCumulativeValue REVERTS
    // ═══════════════════════════════════════════════════════════════

    function test_subOrder_wrongCumulativeValue_reverts() public {
        uint256 rootPayment = 50 ether;
        (bytes32 processId,,) = _commitRoot(rootPayment, 1);

        uint256 subPayment = 30 ether;
        uint256 liedCumValue = 999 ether;

        CommitmentTypes.Commitment memory sub = _subCommitment(processId, seller2, subPayment, liedCumValue, 2);
        bytes memory bSig = _signCommitment(sub, BUYER_KEY);
        bytes memory sSig = _signCommitment(sub, SELLER2_KEY);

        uint256 actualCum = rootPayment + subPayment;
        vm.expectRevert(abi.encodeWithSelector(FigaroCore.CumulativeValueMismatch.selector, liedCumValue, actualCum));
        core.commit(sub, bSig, sSig);
    }

    // ═══════════════════════════════════════════════════════════════
    // 4: Three sub-orders — accumulator advances correctly
    // ═══════════════════════════════════════════════════════════════

    function test_threeSubOrders_accumulatorAdvancesCorrectly() public {
        (bytes32 processId,,) = _commitRoot(10 ether, 1);

        _commitSub(processId, seller2, 20 ether, 30 ether, SELLER2_KEY, 2);
        _commitSub(processId, seller3, 15 ether, 45 ether, SELLER3_KEY, 3);
        _commitSub(processId, seller1, 5 ether, 50 ether, SELLER1_KEY, 4);

        (,, uint256 cumValue, uint256 activeCount) = core.processes(processId);
        assertEq(cumValue, 50 ether, "cumulative: 10+20+15+5");
        assertEq(activeCount, 4, "four active orders");
    }

    // ═══════════════════════════════════════════════════════════════
    // 5: Seller bond scales with cumulative value
    // ═══════════════════════════════════════════════════════════════

    function test_sellerBond_scalesWithCumulativeValue() public {
        (bytes32 processId,,) = _commitRoot(10 ether, 1);

        uint256 seller2Before = token.balanceOf(seller2);
        _commitSub(processId, seller2, 20 ether, 30 ether, SELLER2_KEY, 2);
        uint256 seller2After = token.balanceOf(seller2);

        // seller2 bonds 2 × cumValue = 2 × 30 = 60
        assertEq(seller2Before - seller2After, 60 ether, "seller bonds 2x cumulative");
    }

    // ═══════════════════════════════════════════════════════════════
    // 6: Resolution payouts with cumulative upstream bonding
    // ═══════════════════════════════════════════════════════════════

    function test_resolution_payouts_progressiveCollateral() public {
        // Root: payment=50, cumValue=50
        (bytes32 processId,, CommitmentTypes.Commitment memory rootC) = _commitRoot(50 ether, 1);

        // Sub: payment=30, cumValue=80
        (, CommitmentTypes.Commitment memory subC) = _commitSub(processId, seller2, 30 ether, 80 ether, SELLER2_KEY, 2);

        uint256 seller1Before = token.balanceOf(seller1);
        uint256 seller2Before = token.balanceOf(seller2);
        uint256 buyerBefore = token.balanceOf(buyer);

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](2);
        commitments[0] = rootC;
        commitments[1] = subC;

        vm.prank(buyer);
        core.resolveProcess(processId, commitments);

        // Root: seller gets 2×50 + 50 = 150, buyer gets 50
        // Sub:  seller gets 2×80 + 30 = 190, buyer gets 30
        assertEq(token.balanceOf(seller1) - seller1Before, 150 ether, "seller1 payout");
        assertEq(token.balanceOf(seller2) - seller2Before, 190 ether, "seller2 payout");
        assertEq(token.balanceOf(buyer) - buyerBefore, 80 ether, "buyer payout (50+30)");
    }

    // ═══════════════════════════════════════════════════════════════
    // 7: Root buyer can resolve
    // ═══════════════════════════════════════════════════════════════

    function test_rootBuyer_canResolve() public {
        (bytes32 processId,, CommitmentTypes.Commitment memory rootC) = _commitRoot(50 ether, 1);

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](1);
        commitments[0] = rootC;

        vm.prank(buyer);
        core.resolveProcess(processId, commitments);

        assertEq(core.orderStatus(processId), 0, "processId itself not an order");
    }

    // ═══════════════════════════════════════════════════════════════
    // 8: Outsider cannot resolve
    // ═══════════════════════════════════════════════════════════════

    function test_outsider_cannotResolve() public {
        (bytes32 processId,, CommitmentTypes.Commitment memory rootC) = _commitRoot(50 ether, 1);

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](1);
        commitments[0] = rootC;

        vm.prank(outsider);
        vm.expectRevert(FigaroCore.NotProcessBuyer.selector);
        core.resolveProcess(processId, commitments);
    }

    // ═══════════════════════════════════════════════════════════════
    // 9: Process currency is set by root and immutable
    // ═══════════════════════════════════════════════════════════════

    function test_processCurrency_isSetByRootAndImmutable() public {
        (bytes32 processId,,) = _commitRoot(50 ether, 1);
        (, IERC20 currency_,,) = core.processes(processId);
        assertEq(address(currency_), address(token), "currency set by root");

        // Sub-order with different token reverts
        MockPermitToken otherToken = new MockPermitToken();
        otherToken.mint(buyer, INITIAL_BALANCE);
        otherToken.mint(seller2, INITIAL_BALANCE);
        vm.prank(buyer);
        otherToken.approve(address(core), type(uint256).max);
        vm.prank(seller2);
        otherToken.approve(address(core), type(uint256).max);

        CommitmentTypes.Commitment memory sub = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller2,
            currency: address(otherToken),
            payment: 10 ether,
            expectedCumulativeValue: 60 ether,
            agreementHash: keccak256("sub"),
            salt: 2,
            deadline: block.timestamp + 1 hours
        });
        vm.expectRevert(FigaroCore.CurrencyMismatch.selector);
        core.commit(sub, _signCommitment(sub, BUYER_KEY), _signCommitment(sub, SELLER2_KEY));
    }

    // ═══════════════════════════════════════════════════════════════
    // 10: Sub-order currency mismatch reverts
    // ═══════════════════════════════════════════════════════════════

    function test_subOrder_currencyMismatch_reverts() public {
        (bytes32 processId,,) = _commitRoot(50 ether, 1);

        MockPermitToken otherToken = new MockPermitToken();
        otherToken.mint(buyer, INITIAL_BALANCE);
        otherToken.mint(seller2, INITIAL_BALANCE);
        vm.prank(buyer);
        otherToken.approve(address(core), type(uint256).max);
        vm.prank(seller2);
        otherToken.approve(address(core), type(uint256).max);

        CommitmentTypes.Commitment memory sub = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller2,
            currency: address(otherToken),
            payment: 10 ether,
            expectedCumulativeValue: 60 ether,
            agreementHash: keccak256("sub"),
            salt: 2,
            deadline: block.timestamp + 1 hours
        });
        vm.expectRevert(FigaroCore.CurrencyMismatch.selector);
        core.commit(sub, _signCommitment(sub, BUYER_KEY), _signCommitment(sub, SELLER2_KEY));
    }

    // ═══════════════════════════════════════════════════════════════
    // 11: Sub-order bonds use process currency
    // ═══════════════════════════════════════════════════════════════

    function test_subOrder_bondsUseProcessCurrency() public {
        (bytes32 processId,,) = _commitRoot(50 ether, 1);

        // Create a second token but commit sub in the correct currency
        MockPermitToken otherToken = new MockPermitToken();
        otherToken.mint(buyer, INITIAL_BALANCE);
        otherToken.mint(seller2, INITIAL_BALANCE);

        uint256 buyerTokenBefore = token.balanceOf(buyer);
        uint256 buyerOtherBefore = otherToken.balanceOf(buyer);

        _commitSub(processId, seller2, 20 ether, 70 ether, SELLER2_KEY, 2);

        // Only process currency was pulled
        assertEq(buyerTokenBefore - token.balanceOf(buyer), 40 ether, "process currency pulled");
        assertEq(otherToken.balanceOf(buyer), buyerOtherBefore, "other token untouched");
    }

    // ═══════════════════════════════════════════════════════════════
    // 12: Root expectedCumulativeValue must equal payment
    // ═══════════════════════════════════════════════════════════════

    function test_rootOrder_wrongExpectedCumulativeValue_reverts() public {
        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller1,
            currency: address(token),
            payment: 50 ether,
            expectedCumulativeValue: 99 ether,
            agreementHash: keccak256("root"),
            salt: 1,
            deadline: block.timestamp + 1 hours
        });
        vm.expectRevert(FigaroCore.InvalidRootCumulativeValue.selector);
        core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER1_KEY));
    }

    // ═══════════════════════════════════════════════════════════════
    // 13: Outsider buyer cannot add sub-order
    // ═══════════════════════════════════════════════════════════════

    function test_outsiderBuyer_cannotAddSubOrder() public {
        (bytes32 processId,,) = _commitRoot(50 ether, 1);

        CommitmentTypes.Commitment memory sub = CommitmentTypes.Commitment({
            processId: processId,
            buyer: outsider,
            seller: seller2,
            currency: address(token),
            payment: 10 ether,
            expectedCumulativeValue: 60 ether,
            agreementHash: keccak256("sub"),
            salt: 2,
            deadline: block.timestamp + 1 hours
        });
        vm.expectRevert(FigaroCore.NotProcessBuyer.selector);
        core.commit(sub, _signCommitment(sub, OUTSIDER_KEY), _signCommitment(sub, SELLER2_KEY));
    }

    // ═══════════════════════════════════════════════════════════════
    // 14: Order status transitions (0 → 1 → 2)
    // ═══════════════════════════════════════════════════════════════

    function test_orderStatus_transitions() public {
        CommitmentTypes.Commitment memory c = _rootCommitment(50 ether, 1);
        bytes32 structHash = c.hashStruct();
        bytes32 digest = _typedDataHash(structHash);
        bytes32 expectedProcessId = digest;
        bytes32 expectedOrderHash = keccak256(abi.encodePacked(expectedProcessId, structHash));

        assertEq(core.orderStatus(expectedOrderHash), 0, "before commit: unknown");

        (bytes32 processId, bytes32 orderHash) =
            core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER1_KEY));
        assertEq(orderHash, expectedOrderHash, "orderHash matches prediction");
        assertEq(core.orderStatus(orderHash), 1, "after commit: committed");

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](1);
        commitments[0] = c;
        vm.prank(buyer);
        core.resolveProcess(processId, commitments);

        assertEq(core.orderStatus(orderHash), 2, "after resolve: resolved");
    }

    // ═══════════════════════════════════════════════════════════════
    // 15: Full process — root + two subs → resolve
    // ═══════════════════════════════════════════════════════════════

    function test_fullProcess_rootPlusTwoSubs_resolve() public {
        (bytes32 processId,, CommitmentTypes.Commitment memory rootC) = _commitRoot(10 ether, 1);
        (, CommitmentTypes.Commitment memory sub1C) = _commitSub(processId, seller2, 20 ether, 30 ether, SELLER2_KEY, 2);
        (, CommitmentTypes.Commitment memory sub2C) = _commitSub(processId, seller3, 15 ether, 45 ether, SELLER3_KEY, 3);

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](3);
        commitments[0] = rootC;
        commitments[1] = sub1C;
        commitments[2] = sub2C;

        vm.prank(buyer);
        core.resolveProcess(processId, commitments);

        (,,, uint256 activeCount) = core.processes(processId);
        assertEq(activeCount, 0, "all resolved");
    }

    // ═══════════════════════════════════════════════════════════════
    // 16: Wrong commitment at resolve reverts
    // ═══════════════════════════════════════════════════════════════

    function test_resolve_wrongCommitment_reverts() public {
        (bytes32 processId,, CommitmentTypes.Commitment memory rootC) = _commitRoot(50 ether, 1);

        // Tamper with the commitment
        rootC.salt = 999;

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](1);
        commitments[0] = rootC;

        vm.prank(buyer);
        vm.expectRevert(); // OrderNotCommitted
        core.resolveProcess(processId, commitments);
    }

    // ═══════════════════════════════════════════════════════════════
    // 17: Solvency — contract balance zero after resolve
    // ═══════════════════════════════════════════════════════════════

    function test_solvency_contractBalanceZeroAfterResolve() public {
        (bytes32 processId,, CommitmentTypes.Commitment memory rootC) = _commitRoot(50 ether, 1);
        (, CommitmentTypes.Commitment memory subC) = _commitSub(processId, seller2, 30 ether, 80 ether, SELLER2_KEY, 2);

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](2);
        commitments[0] = rootC;
        commitments[1] = subC;

        vm.prank(buyer);
        core.resolveProcess(processId, commitments);

        assertEq(token.balanceOf(address(core)), 0, "contract drained to zero");
    }

    // ═══════════════════════════════════════════════════════════════
    // 18: Duplicate root commitment reverts (ProcessAlreadyExists)
    // ═══════════════════════════════════════════════════════════════

    function test_duplicateCommitment_reverts() public {
        CommitmentTypes.Commitment memory c = _rootCommitment(50 ether, 1);
        bytes memory bSig = _signCommitment(c, BUYER_KEY);
        bytes memory sSig = _signCommitment(c, SELLER1_KEY);

        core.commit(c, bSig, sSig);

        vm.expectRevert(FigaroCore.ProcessAlreadyExists.selector);
        core.commit(c, bSig, sSig);
    }

    // ═══════════════════════════════════════════════════════════════
    // 19: Double resolve reverts
    // ═══════════════════════════════════════════════════════════════

    function test_doubleResolve_reverts() public {
        (bytes32 processId,, CommitmentTypes.Commitment memory rootC) = _commitRoot(50 ether, 1);

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](1);
        commitments[0] = rootC;

        vm.prank(buyer);
        core.resolveProcess(processId, commitments);

        vm.prank(buyer);
        vm.expectRevert(FigaroCore.NoActiveOrders.selector);
        core.resolveProcess(processId, commitments);
    }

    // ═══════════════════════════════════════════════════════════════
    // 20: Stale cumulative value reverts (concurrent sub-orders)
    // ═══════════════════════════════════════════════════════════════

    function test_subOrder_staleCumulativeValue_reverts() public {
        (bytes32 processId,,) = _commitRoot(50 ether, 1);

        // Prepare two sub-orders that both expect cum=80
        CommitmentTypes.Commitment memory sub1 = _subCommitment(processId, seller2, 30 ether, 80 ether, 2);
        CommitmentTypes.Commitment memory sub2 = _subCommitment(processId, seller3, 30 ether, 80 ether, 3);

        // First succeeds
        core.commit(sub1, _signCommitment(sub1, BUYER_KEY), _signCommitment(sub1, SELLER2_KEY));

        // Second fails — accumulator already at 80, actual would be 110
        vm.expectRevert(abi.encodeWithSelector(FigaroCore.CumulativeValueMismatch.selector, 80 ether, 110 ether));
        core.commit(sub2, _signCommitment(sub2, BUYER_KEY), _signCommitment(sub2, SELLER3_KEY));
    }

    // ═══════════════════════════════════════════════════════════════
    // 21: Self-deal is harmless (net-zero operation)
    // ═══════════════════════════════════════════════════════════════

    function test_selfDeal_isNetZero() public {
        uint256 payment = 50 ether;

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: buyer,
            currency: address(token),
            payment: payment,
            expectedCumulativeValue: payment,
            agreementHash: keccak256("self-deal"),
            salt: 1,
            deadline: block.timestamp + 1 hours
        });

        bytes memory sig = _signCommitment(c, BUYER_KEY);
        uint256 balBefore = token.balanceOf(buyer);

        (bytes32 processId,) = core.commit(c, sig, sig);

        // Buyer bonds 2×payment + seller bonds 2×cumValue = 4×payment from same address
        assertEq(token.balanceOf(buyer), balBefore - 4 * payment, "self bonds 4x");

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](1);
        commitments[0] = c;

        vm.prank(buyer);
        core.resolveProcess(processId, commitments);

        // sellerPayout (150) + buyerPayout (50) = 200 = 4×payment back to same address
        assertEq(token.balanceOf(buyer), balBefore, "net zero after self-deal");
    }

    // ═══════════════════════════════════════════════════════════════
    // 22: Sub-order on a resolved process reverts (ProcessAlreadyResolved)
    //
    // Process closure semantics: resolveProcess settles every order in the
    // process atomically (activeOrderCount = 0). The processId is closed —
    // a new sub-order cannot extend it. Parties wanting a follow-on
    // bonded relationship sign a fresh root commitment, getting a new
    // processId.
    // ═══════════════════════════════════════════════════════════════

    function test_subOrder_onResolvedProcess_reverts() public {
        // Commit root + resolve the process.
        (bytes32 processId, , CommitmentTypes.Commitment memory rootC) = _commitRoot(10 ether, 1);

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](1);
        commitments[0] = rootC;
        vm.prank(buyer);
        core.resolveProcess(processId, commitments);

        // Confirm process is fully resolved (activeOrderCount cleared).
        (, , , uint256 activeCount) = core.processes(processId);
        assertEq(activeCount, 0, "process resolved");

        // Attempt a sub-order on the resolved processId — must revert.
        // cumulativeValue persists at 10 ether from the resolved round, so
        // a sub-order paying 5 ether would expect cumulative 15 ether. The
        // gate trips before the cumulative-value check.
        CommitmentTypes.Commitment memory subC = _subCommitment(processId, seller2, 5 ether, 15 ether, 99);
        bytes memory bSig = _signCommitment(subC, BUYER_KEY);
        bytes memory sSig = _signCommitment(subC, SELLER2_KEY);

        vm.expectRevert(FigaroCore.ProcessAlreadyResolved.selector);
        core.commit(subC, bSig, sSig);
    }
}
