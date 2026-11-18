// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "src/core/kernel/FigaroCore.sol";
import "src/core/kernel/CommitmentTypes.sol";
import "src/mocks/MockPermitToken.sol";

/// @title FigaroCoreTest — Core invariant tests for the enforcement-only FigaroCore
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
            token: address(token),
            payment: payment,
            runningTotal: payment,
            checkoutHash: keccak256("root-agreement"),
            salt: salt,
            commitDeadline: block.timestamp + 1 hours
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
            token: address(token),
            payment: payment,
            runningTotal: expectedCum,
            checkoutHash: keccak256(abi.encodePacked("sub-agreement-", salt)),
            salt: salt,
            commitDeadline: block.timestamp + 1 hours
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
    // 2: Sub-order with correct runningTotal succeeds
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
    // 3: Sub-order with WRONG runningTotal REVERTS
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
    // 6: Resolution payouts with cumulative bonding
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
            token: address(otherToken),
            payment: 10 ether,
            runningTotal: 60 ether,
            checkoutHash: keccak256("sub"),
            salt: 2,
            commitDeadline: block.timestamp + 1 hours
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
            token: address(otherToken),
            payment: 10 ether,
            runningTotal: 60 ether,
            checkoutHash: keccak256("sub"),
            salt: 2,
            commitDeadline: block.timestamp + 1 hours
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
    // 12: Root runningTotal must equal payment
    // ═══════════════════════════════════════════════════════════════

    function test_rootOrder_wrongExpectedCumulativeValue_reverts() public {
        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller1,
            token: address(token),
            payment: 50 ether,
            runningTotal: 99 ether,
            checkoutHash: keccak256("root"),
            salt: 1,
            commitDeadline: block.timestamp + 1 hours
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
            token: address(token),
            payment: 10 ether,
            runningTotal: 60 ether,
            checkoutHash: keccak256("sub"),
            salt: 2,
            commitDeadline: block.timestamp + 1 hours
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

        bytes32 tamperedHash = keccak256(abi.encodePacked(processId, CommitmentTypes.hashStruct(rootC)));
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(FigaroCore.OrderNotCommitted.selector, tamperedHash));
        core.resolveProcess(processId, commitments);
    }

    /// An order committed under process B, presented to resolve process A.
    /// The order hash is keccak256(processId ‖ structHash), so B's struct
    /// hashed under A names an order A never saw — for B's root and for B's
    /// sub-order alike. Nothing moves; B's orders stay committed; A then resolves
    /// with its own order.
    function test_resolve_orderFromAnotherProcess_reverts() public {
        (bytes32 processA,, CommitmentTypes.Commitment memory rootA) = _commitRoot(50 ether, 1);
        (bytes32 processB, bytes32 rootHashB, CommitmentTypes.Commitment memory rootB) = _commitRoot(50 ether, 2);
        (bytes32 subHashB, CommitmentTypes.Commitment memory subB) =
            _commitSub(processB, seller2, 20 ether, 70 ether, SELLER2_KEY, 3);
        assertTrue(processA != processB, "two processes");

        CommitmentTypes.Commitment[] memory foreign = new CommitmentTypes.Commitment[](1);

        foreign[0] = rootB;
        bytes32 foreignHash = keccak256(abi.encodePacked(processA, rootB.hashStruct()));
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(FigaroCore.OrderNotCommitted.selector, foreignHash));
        core.resolveProcess(processA, foreign);

        foreign[0] = subB;
        foreignHash = keccak256(abi.encodePacked(processA, subB.hashStruct()));
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(FigaroCore.OrderNotCommitted.selector, foreignHash));
        core.resolveProcess(processA, foreign);

        assertEq(core.orderStatus(rootHashB), 1, "B's root still committed");
        assertEq(core.orderStatus(subHashB), 1, "B's sub still committed");
        (,,, uint256 activeA) = core.processes(processA);
        assertEq(activeA, 1, "A untouched");
        // A: 2×50 + 2×50; B root: 2×50 + 2×50; B sub: 2×20 + 2×70.
        assertEq(token.balanceOf(address(core)), 200 ether + 200 ether + 180 ether, "no bond moved");

        foreign[0] = rootA;
        vm.prank(buyer);
        core.resolveProcess(processA, foreign);
        (,,, activeA) = core.processes(processA);
        assertEq(activeA, 0, "A resolves with its own order");
    }

    /// A commitment signed for this FigaroCore on another chain is refused here.
    /// The EIP-712 domain binds block.chainid, so the same signature bytes
    /// recover to a stranger once the chain changes — the signature is first
    /// shown valid where it was made, then replayed and refused.
    ///
    /// The domain is read from FigaroCore by external call, never from
    /// block.chainid in this frame: under --via-ir the optimizer folds every
    /// CHAINID read in a frame into one (the opcode is invariant within a
    /// real transaction), which would move a read past the cheatcode.
    function test_commit_signatureFromAnotherChain_reverts() public {
        uint256 home = 31337;
        vm.chainId(home);
        bytes32 homeDomain = core.DOMAIN_SEPARATOR();

        vm.chainId(home + 1);
        bytes32 awayDomain = core.DOMAIN_SEPARATOR();
        assertTrue(awayDomain != homeDomain, "the domain moves with the chain id");
        CommitmentTypes.Commitment memory accepted = _rootCommitment(50 ether, 1);
        core.commit(
            accepted, _signUnder(awayDomain, accepted, BUYER_KEY), _signUnder(awayDomain, accepted, SELLER1_KEY)
        );

        CommitmentTypes.Commitment memory replayed = _rootCommitment(50 ether, 2);
        bytes memory buyerSig = _signUnder(awayDomain, replayed, BUYER_KEY);
        bytes memory sellerSig = _signUnder(awayDomain, replayed, SELLER1_KEY);

        vm.chainId(home);
        assertEq(core.DOMAIN_SEPARATOR(), homeDomain, "back home");
        vm.expectRevert(FigaroCore.InvalidBuyerSignature.selector);
        core.commit(replayed, buyerSig, sellerSig);

        // The same struct, signed for this chain, is a valid order here.
        core.commit(
            replayed, _signUnder(homeDomain, replayed, BUYER_KEY), _signUnder(homeDomain, replayed, SELLER1_KEY)
        );
    }

    function _signUnder(bytes32 domain, CommitmentTypes.Commitment memory c, uint256 privateKey)
        internal
        pure
        returns (bytes memory)
    {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, c.hashStruct()));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
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

    /// Every universal payout proof above is single-order (Certora's
    /// `resolveSingleOrderPayout`, Halmos's root-only `check_resolutionPayouts`,
    /// the TLA+ model's two sub-orders). This fuzz walks the N-order loop the
    /// proofs stop short of: N orders (1..12) with random payments, sellers
    /// cycling over three wallets, and asserts, per seller, that resolution
    /// pays exactly the sum over its orders of 2 × cumulative value at that
    /// link plus the payment — the bond back and the price — and, for the
    /// buyer, exactly the sum of payments; FigaroCore holds nothing after.
    function testFuzz_resolve_paysEveryOrderItsBondPlusPayment(uint8 nRaw, uint256 seed) public {
        uint256 n = 1 + (nRaw % 12);
        address[3] memory sellers = [seller1, seller2, seller3];
        uint256[3] memory sellerKeys = [SELLER1_KEY, SELLER2_KEY, SELLER3_KEY];
        uint256[3] memory expectedSellerPayout;
        uint256 expectedBuyerPayout;

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](n);
        bytes32 processId;
        uint256 cumulative;
        for (uint256 i = 0; i < n; i++) {
            uint256 payment = 1 + (uint256(keccak256(abi.encodePacked(seed, i))) % 100 ether);
            cumulative += payment;
            uint256 who = i % 3;
            if (i == 0) {
                CommitmentTypes.Commitment memory root = _rootCommitment(payment, 1);
                (processId,) = core.commit(root, _signCommitment(root, BUYER_KEY), _signCommitment(root, SELLER1_KEY));
                commitments[0] = root;
            } else {
                (, commitments[i]) = _commitSub(processId, sellers[who], payment, cumulative, sellerKeys[who], i + 1);
            }
            expectedSellerPayout[who] += 2 * cumulative + payment;
            expectedBuyerPayout += payment;
        }

        uint256[3] memory sellerAfterCommit =
            [token.balanceOf(seller1), token.balanceOf(seller2), token.balanceOf(seller3)];
        uint256 buyerAfterCommit = token.balanceOf(buyer);

        vm.prank(buyer);
        core.resolveProcess(processId, commitments);

        assertEq(token.balanceOf(seller1) - sellerAfterCommit[0], expectedSellerPayout[0], "seller1 paid exactly");
        assertEq(token.balanceOf(seller2) - sellerAfterCommit[1], expectedSellerPayout[1], "seller2 paid exactly");
        assertEq(token.balanceOf(seller3) - sellerAfterCommit[2], expectedSellerPayout[2], "seller3 paid exactly");
        assertEq(token.balanceOf(buyer) - buyerAfterCommit, expectedBuyerPayout, "buyer refunded exactly");
        assertEq(token.balanceOf(address(core)), 0, "FigaroCore holds nothing after");
        (,,, uint256 active) = core.processes(processId);
        assertEq(active, 0, "process closed");
    }

    function test_selfDeal_isNetZero() public {
        uint256 payment = 50 ether;

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: buyer,
            token: address(token),
            payment: payment,
            runningTotal: payment,
            checkoutHash: keccak256("self-deal"),
            salt: 1,
            commitDeadline: block.timestamp + 1 hours
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
    // Process closure semantics: resolveProcess resolves every order in the
    // process atomically (activeOrderCount = 0). The processId is closed —
    // a new sub-order cannot extend it. Parties wanting a follow-on
    // bonded relationship sign a fresh root commitment, getting a new
    // processId.
    // ═══════════════════════════════════════════════════════════════

    function test_subOrder_onResolvedProcess_reverts() public {
        // Commit root + resolve the process.
        (bytes32 processId,, CommitmentTypes.Commitment memory rootC) = _commitRoot(10 ether, 1);

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](1);
        commitments[0] = rootC;
        vm.prank(buyer);
        core.resolveProcess(processId, commitments);

        // Confirm process is fully resolved (activeOrderCount cleared).
        (,,, uint256 activeCount) = core.processes(processId);
        assertEq(activeCount, 0, "process resolved");

        // Attempt a sub-order on the resolved processId — must revert.
        // runningTotal persists at 10 ether from the resolved round, so
        // a sub-order paying 5 ether would expect cumulative 15 ether. The
        // gate trips before the cumulative-value check.
        CommitmentTypes.Commitment memory subC = _subCommitment(processId, seller2, 5 ether, 15 ether, 99);
        bytes memory bSig = _signCommitment(subC, BUYER_KEY);
        bytes memory sSig = _signCommitment(subC, SELLER2_KEY);

        vm.expectRevert(FigaroCore.ProcessAlreadyResolved.selector);
        core.commit(subC, bSig, sSig);
    }

    // ═══════════════════════════════════════════════════════════════
    // 23: A resolve list names every open order of its process once
    //
    // resolveProcess checks the list's length against activeOrderCount,
    // then, per listed order, that its status is 1, pays it and sets it to
    // 2 inside the loop: a second listing of one order reads status 2 and
    // is refused (OrderNotCommitted). A list longer than the open orders is
    // refused by the length check first (IncompleteOrderList). Every refusal
    // moves no token and leaves every order committed.
    // ═══════════════════════════════════════════════════════════════

    /// A process of `n` orders (2 or 3): a root of 10 to seller1, then 20 to
    /// seller2 (running total 30) and 30 to seller3 (running total 60).
    function _openProcess(uint256 n, uint256 salt)
        internal
        returns (bytes32 processId, CommitmentTypes.Commitment[] memory orders, bytes32[] memory hashes)
    {
        orders = new CommitmentTypes.Commitment[](n);
        hashes = new bytes32[](n);
        (processId, hashes[0], orders[0]) = _commitRoot(10 ether, salt);
        (hashes[1], orders[1]) = _commitSub(processId, seller2, 20 ether, 30 ether, SELLER2_KEY, salt * 100 + 1);
        if (n == 3) {
            (hashes[2], orders[2]) = _commitSub(processId, seller3, 30 ether, 60 ether, SELLER3_KEY, salt * 100 + 2);
        }
    }

    function _pick(CommitmentTypes.Commitment[] memory orders, uint256[] memory at)
        internal
        pure
        returns (CommitmentTypes.Commitment[] memory list)
    {
        list = new CommitmentTypes.Commitment[](at.length);
        for (uint256 i = 0; i < at.length; i++) {
            list[i] = orders[at[i]];
        }
    }

    function _idx(uint256 a, uint256 b) internal pure returns (uint256[] memory at) {
        at = new uint256[](2);
        (at[0], at[1]) = (a, b);
    }

    function _idx(uint256 a, uint256 b, uint256 c) internal pure returns (uint256[] memory at) {
        at = new uint256[](3);
        (at[0], at[1], at[2]) = (a, b, c);
    }

    function _idx(uint256 a, uint256 b, uint256 c, uint256 d) internal pure returns (uint256[] memory at) {
        at = new uint256[](4);
        (at[0], at[1], at[2], at[3]) = (a, b, c, d);
    }

    /// The buyer's resolve over `list` reverts with `reason`; no wallet and
    /// not FigaroCore changes balance, every order stays committed, and the
    /// process keeps its open-order count.
    function _expectRefused(
        bytes32 processId,
        bytes32[] memory hashes,
        CommitmentTypes.Commitment[] memory list,
        bytes memory reason
    ) internal {
        address[5] memory wallets = [buyer, seller1, seller2, seller3, address(core)];
        uint256[5] memory before;
        for (uint256 i = 0; i < wallets.length; i++) {
            before[i] = token.balanceOf(wallets[i]);
        }
        (,,, uint256 openBefore) = core.processes(processId);

        vm.prank(buyer);
        vm.expectRevert(reason);
        core.resolveProcess(processId, list);

        for (uint256 i = 0; i < wallets.length; i++) {
            assertEq(token.balanceOf(wallets[i]), before[i], "no token moved");
        }
        for (uint256 i = 0; i < hashes.length; i++) {
            assertEq(core.orderStatus(hashes[i]), 1, "every order still committed");
        }
        (,,, uint256 openAfter) = core.processes(processId);
        assertEq(openAfter, openBefore, "the open-order count is unchanged");
    }

    function _notCommitted(bytes32 orderHash) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(FigaroCore.OrderNotCommitted.selector, orderHash);
    }

    function _incomplete(uint256 required, uint256 provided) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(FigaroCore.IncompleteOrderList.selector, required, provided);
    }

    function _resolveAll(bytes32 processId, CommitmentTypes.Commitment[] memory list) internal {
        vm.prank(buyer);
        core.resolveProcess(processId, list);
        (,,, uint256 open) = core.processes(processId);
        assertEq(open, 0, "the true list resolves");
        assertEq(token.balanceOf(address(core)), 0, "FigaroCore holds nothing after");
    }

    function test_resolve_listRepeatingAnOrder_twoOrders_reverts() public {
        (bytes32 pid, CommitmentTypes.Commitment[] memory o, bytes32[] memory h) = _openProcess(2, 1);

        // At the true length: the first listing is paid in the loop, the
        // second reads status 2, and the whole call reverts.
        _expectRefused(pid, h, _pick(o, _idx(0, 0)), _notCommitted(h[0]));
        _expectRefused(pid, h, _pick(o, _idx(1, 1)), _notCommitted(h[1]));
        // Longer than the open orders: the length check refuses it first.
        _expectRefused(pid, h, _pick(o, _idx(0, 1, 0)), _incomplete(2, 3));
        _expectRefused(pid, h, _pick(o, _idx(0, 1, 1)), _incomplete(2, 3));

        _resolveAll(pid, o);
    }

    function test_resolve_listRepeatingAnOrder_threeOrders_reverts() public {
        (bytes32 pid, CommitmentTypes.Commitment[] memory o, bytes32[] memory h) = _openProcess(3, 1);

        _expectRefused(pid, h, _pick(o, _idx(0, 0, 2)), _notCommitted(h[0])); // the first, twice
        _expectRefused(pid, h, _pick(o, _idx(0, 1, 1)), _notCommitted(h[1])); // a middle one, twice
        _expectRefused(pid, h, _pick(o, _idx(2, 1, 2)), _notCommitted(h[2])); // the last, twice
        _expectRefused(pid, h, _pick(o, _idx(0, 1, 2, 0)), _incomplete(3, 4));
        _expectRefused(pid, h, _pick(o, _idx(0, 1, 2, 1)), _incomplete(3, 4));
        _expectRefused(pid, h, _pick(o, _idx(0, 1, 2, 2)), _incomplete(3, 4));

        _resolveAll(pid, o);
    }

    function test_resolve_listMissingAnOrderOrEmpty_reverts() public {
        (bytes32 pid, CommitmentTypes.Commitment[] memory o, bytes32[] memory h) = _openProcess(3, 1);

        _expectRefused(pid, h, _pick(o, _idx(1, 2)), _incomplete(3, 2)); // the first dropped
        _expectRefused(pid, h, _pick(o, _idx(0, 2)), _incomplete(3, 2)); // a middle one dropped
        _expectRefused(pid, h, _pick(o, _idx(0, 1)), _incomplete(3, 2)); // the last dropped
        _expectRefused(pid, h, new CommitmentTypes.Commitment[](0), _incomplete(3, 0));

        _resolveAll(pid, o);
    }

    /// An order of another process in the place of one of this process's own,
    /// at the true length: hashed under this process it names no committed
    /// order. The other process's orders stay committed.
    function test_resolve_listWithAnotherProcesssOrderInPlaceOfItsOwn_reverts() public {
        (bytes32 pid, CommitmentTypes.Commitment[] memory o, bytes32[] memory h) = _openProcess(3, 1);
        (bytes32 otherPid, CommitmentTypes.Commitment[] memory other, bytes32[] memory otherHashes) = _openProcess(2, 2);
        assertTrue(pid != otherPid, "two processes");

        for (uint256 place = 0; place < 3; place++) {
            CommitmentTypes.Commitment[] memory list = _pick(o, _idx(0, 1, 2));
            CommitmentTypes.Commitment memory foreign = other[place % 2];
            list[place] = foreign;
            _expectRefused(pid, h, list, _notCommitted(keccak256(abi.encodePacked(pid, foreign.hashStruct()))));
        }
        assertEq(core.orderStatus(otherHashes[0]), 1, "the other root still committed");
        assertEq(core.orderStatus(otherHashes[1]), 1, "the other sub-order still committed");

        vm.prank(buyer);
        core.resolveProcess(pid, o);
        (,,, uint256 open) = core.processes(pid);
        assertEq(open, 0, "the true list resolves");
    }

    /// The sequence of the list is free: the code checks and pays each listed
    /// order on its own, and nothing compares a listed order to its place.
    /// A correct set in another sequence resolves, pays each party what the
    /// committed sequence pays, and emits OrderResolved in the list's sequence.
    function test_resolve_correctSetInAnotherSequence_resolves() public {
        (bytes32 pid, CommitmentTypes.Commitment[] memory o, bytes32[] memory h) = _openProcess(3, 1);
        uint256[4] memory before =
            [token.balanceOf(buyer), token.balanceOf(seller1), token.balanceOf(seller2), token.balanceOf(seller3)];

        uint256[] memory at = _idx(2, 0, 1);
        for (uint256 i = 0; i < at.length; i++) {
            CommitmentTypes.Commitment memory c = o[at[i]];
            vm.expectEmit(true, true, false, true, address(core));
            emit FigaroCore.OrderResolved(h[at[i]], pid, 2 * c.runningTotal + c.payment, c.payment);
        }
        vm.prank(buyer);
        core.resolveProcess(pid, _pick(o, at));

        // seller1: 2×10 + 10; seller2: 2×30 + 20; seller3: 2×60 + 30; buyer: 10 + 20 + 30.
        assertEq(token.balanceOf(seller1) - before[1], 30 ether, "seller1 paid as in sequence");
        assertEq(token.balanceOf(seller2) - before[2], 80 ether, "seller2 paid as in sequence");
        assertEq(token.balanceOf(seller3) - before[3], 150 ether, "seller3 paid as in sequence");
        assertEq(token.balanceOf(buyer) - before[0], 60 ether, "buyer paid as in sequence");
        assertEq(token.balanceOf(address(core)), 0, "FigaroCore holds nothing after");
    }
}
