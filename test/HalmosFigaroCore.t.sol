// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../src/FigaroCore.sol";
import "../src/CommitmentTypes.sol";
import "../src/mocks/MockPermitToken.sol";

/// @title HalmosFigaroCore — Symbolic verification of FigaroCore invariants
/// @notice Uses Halmos symbolic execution to prove properties hold for ALL inputs,
///         not just concrete test vectors. Function names use `check_` prefix
///         (Halmos convention) instead of `test_`.
contract HalmosFigaroCore is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore internal core;
    MockPermitToken internal token;

    uint256 internal constant BUYER_KEY = 0xB0B;
    uint256 internal constant SELLER_KEY = 0x5E11;

    address internal buyer;
    address internal seller;

    uint256 internal constant INITIAL_BALANCE = type(uint128).max;

    function setUp() public {
        buyer = vm.addr(BUYER_KEY);
        seller = vm.addr(SELLER_KEY);

        token = new MockPermitToken();
        core = new FigaroCore();

        token.mint(buyer, INITIAL_BALANCE);
        token.mint(seller, INITIAL_BALANCE);
        vm.prank(buyer);
        token.approve(address(core), type(uint256).max);
        vm.prank(seller);
        token.approve(address(core), type(uint256).max);
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

    function _commitRoot(uint256 payment) internal returns (bytes32 processId) {
        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            currency: address(token),
            payment: payment,
            expectedCumulativeValue: payment,
            agreementHash: keccak256("test"),
            salt: 1,
            deadline: block.timestamp + 1 hours
        });

        bytes memory buyerSig = _signCommitment(c, BUYER_KEY);
        bytes memory sellerSig = _signCommitment(c, SELLER_KEY);

        (processId,) = core.commit(c, buyerSig, sellerSig);
    }

    // ── INVARIANT 1: Token Conservation ──────────────────────────
    //
    // For any payment amount, after commit the sum of all balances
    // (buyer + seller + contract) equals the initial supply.

    function check_tokenConservation_afterCommit(uint256 payment) public {
        // Bound payment to avoid overflow in 2× multiplication and ensure nonzero
        vm.assume(payment > 0 && payment <= type(uint128).max / 4);
        // Ensure both parties can afford their bonds
        vm.assume(payment * 2 <= INITIAL_BALANCE);
        vm.assume(payment * 2 <= INITIAL_BALANCE);

        uint256 totalBefore = token.balanceOf(buyer) + token.balanceOf(seller) + token.balanceOf(address(core));

        _commitRoot(payment);

        uint256 totalAfter = token.balanceOf(buyer) + token.balanceOf(seller) + token.balanceOf(address(core));

        assert(totalBefore == totalAfter);
    }

    // ── INVARIANT 2: Contract Solvency ───────────────────────────
    //
    // After commit, the contract holds exactly buyer_bond + seller_bond.
    // For a root order: 2*payment + 2*payment = 4*payment.

    function check_contractSolvency_afterCommit(uint256 payment) public {
        vm.assume(payment > 0 && payment <= type(uint128).max / 4);
        vm.assume(payment * 2 <= INITIAL_BALANCE);

        _commitRoot(payment);

        uint256 contractBalance = token.balanceOf(address(core));
        // Root order: buyer bonds 2P, seller bonds 2*cumulativeValue = 2P
        assert(contractBalance == payment * 4);
    }

    // ── INVARIANT 3: Correct Bond Amounts ────────────────────────
    //
    // After commit, buyer loses exactly 2*payment and seller loses
    // exactly 2*cumulativeValue (= 2*payment for root).

    function check_correctBondAmounts(uint256 payment) public {
        vm.assume(payment > 0 && payment <= type(uint128).max / 4);
        vm.assume(payment * 2 <= INITIAL_BALANCE);

        uint256 buyerBefore = token.balanceOf(buyer);
        uint256 sellerBefore = token.balanceOf(seller);

        _commitRoot(payment);

        uint256 buyerAfter = token.balanceOf(buyer);
        uint256 sellerAfter = token.balanceOf(seller);

        assert(buyerBefore - buyerAfter == payment * 2);
        assert(sellerBefore - sellerAfter == payment * 2);
    }

    // ── INVARIANT 4: Resolution Payouts ──────────────────────────
    //
    // After commit + resolve, seller receives sellerBond + payment
    // and buyer receives payment (their change back).
    // Net: seller gains +payment, buyer loses -payment. Token conservation holds.

    function check_resolutionPayouts(uint256 payment) public {
        vm.assume(payment > 0 && payment <= type(uint128).max / 4);
        vm.assume(payment * 2 <= INITIAL_BALANCE);

        uint256 buyerBefore = token.balanceOf(buyer);
        uint256 sellerBefore = token.balanceOf(seller);

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            currency: address(token),
            payment: payment,
            expectedCumulativeValue: payment,
            agreementHash: keccak256("test"),
            salt: 1,
            deadline: block.timestamp + 1 hours
        });

        bytes memory buyerSig = _signCommitment(c, BUYER_KEY);
        bytes memory sellerSig = _signCommitment(c, SELLER_KEY);

        (bytes32 processId,) = core.commit(c, buyerSig, sellerSig);

        // Resolve
        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](1);
        commitments[0] = c;

        vm.prank(buyer);
        core.resolveProcess(processId, commitments);

        uint256 buyerAfter = token.balanceOf(buyer);
        uint256 sellerAfter = token.balanceOf(seller);

        // Seller net gain = +payment
        assert(sellerAfter - sellerBefore == payment);
        // Buyer net loss = -payment
        assert(buyerBefore - buyerAfter == payment);
        // Contract is empty
        assert(token.balanceOf(address(core)) == 0);
    }

    // ── INVARIANT 5: Order Status Transitions ────────────────────
    //
    // Order status transitions are monotonic: 0 → 1 → 2 (never backwards).

    function check_orderStatusTransition(uint256 payment) public {
        vm.assume(payment > 0 && payment <= type(uint128).max / 4);
        vm.assume(payment * 2 <= INITIAL_BALANCE);

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            currency: address(token),
            payment: payment,
            expectedCumulativeValue: payment,
            agreementHash: keccak256("test"),
            salt: 1,
            deadline: block.timestamp + 1 hours
        });

        bytes memory buyerSig = _signCommitment(c, BUYER_KEY);
        bytes memory sellerSig = _signCommitment(c, SELLER_KEY);

        (bytes32 processId, bytes32 orderHash) = core.commit(c, buyerSig, sellerSig);

        // After commit: status = 1 (committed)
        assert(core.orderStatus(orderHash) == 1);

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](1);
        commitments[0] = c;

        vm.prank(buyer);
        core.resolveProcess(processId, commitments);

        // After resolve: status = 2 (resolved)
        assert(core.orderStatus(orderHash) == 2);
    }

    // ── INVARIANT 6: Buyer Dominance ─────────────────────────────
    //
    // Only the root buyer can resolve. Any other caller must revert.
    // Uses low-level call instead of vm.expectRevert (Halmos compatibility).

    function check_buyerDominance_revert(uint256 payment) public {
        vm.assume(payment > 0 && payment <= type(uint128).max / 4);
        vm.assume(payment * 2 <= INITIAL_BALANCE);

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            currency: address(token),
            payment: payment,
            expectedCumulativeValue: payment,
            agreementHash: keccak256("test"),
            salt: 1,
            deadline: block.timestamp + 1 hours
        });

        bytes memory buyerSig = _signCommitment(c, BUYER_KEY);
        bytes memory sellerSig = _signCommitment(c, SELLER_KEY);

        (bytes32 processId,) = core.commit(c, buyerSig, sellerSig);

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](1);
        commitments[0] = c;

        // Seller trying to resolve must revert — use low-level call for Halmos
        vm.prank(seller);
        (bool success,) = address(core).call(abi.encodeCall(core.resolveProcess, (processId, commitments)));
        assert(!success);
    }

    // ── INVARIANT 7: Cumulative Value Monotonic ──────────────────
    //
    // After each sub-order commit, cumulativeValue strictly increases.

    function check_cumulativeValueMonotonic(uint256 payment1, uint256 payment2) public {
        vm.assume(payment1 > 0 && payment1 <= type(uint64).max);
        vm.assume(payment2 > 0 && payment2 <= type(uint64).max);
        uint256 cumAfterSub = payment1 + payment2;
        vm.assume(cumAfterSub * 2 <= INITIAL_BALANCE);

        // Mint extra for the sub-order bonds
        token.mint(buyer, cumAfterSub * 2);
        token.mint(seller, cumAfterSub * 2);

        bytes32 processId = _commitRoot(payment1);

        (,, uint256 cumBefore,) = core.processes(processId);
        assert(cumBefore == payment1);

        // Sub-order
        CommitmentTypes.Commitment memory c2 = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller,
            currency: address(token),
            payment: payment2,
            expectedCumulativeValue: cumAfterSub,
            agreementHash: keccak256("sub"),
            salt: 2,
            deadline: block.timestamp + 1 hours
        });

        bytes memory buyerSig2 = _signCommitment(c2, BUYER_KEY);
        bytes memory sellerSig2 = _signCommitment(c2, SELLER_KEY);

        core.commit(c2, buyerSig2, sellerSig2);

        (,, uint256 cumAfter,) = core.processes(processId);
        assert(cumAfter == cumAfterSub);
        assert(cumAfter > cumBefore);
    }
}
