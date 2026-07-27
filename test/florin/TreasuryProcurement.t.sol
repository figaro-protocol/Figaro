// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroCore} from "src/kernel/FigaroCore.sol";
import {CommitmentTypes} from "src/kernel/CommitmentTypes.sol";
import {FlorinToken} from "src/florin/FlorinToken.sol";
import {MockTreasuryMultisig} from "src/mocks/MockTreasuryMultisig.sol";

/// @title TreasuryProcurementTest
/// @notice The DAO treasury structure, rehearsed end to end: a 2-of-3
///         multisig holds the 300M genesis allocation; a procurement funds a
///         dedicated operator-EOA with EXACTLY the deal's needs (blast radius
///         = the current procurement, never the treasury); the EOA buys
///         through the kernel as an ordinary bonded buyer (the treasury
///         itself can never sign — the kernel is ECDSA-only); settlement
///         returns the bond and the residual sweeps back, so the treasury's
///         net spend is exactly the payment. Custody negatives: no owner
///         moves funds alone, no approval replays.
contract TreasuryProcurementTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore internal core;
    FlorinToken internal florin;
    MockTreasuryMultisig internal treasury;

    uint256 internal constant OWNER1_KEY = 0x0101;
    uint256 internal constant OWNER2_KEY = 0x0102;
    uint256 internal constant OWNER3_KEY = 0x0103;
    uint256 internal constant OPERATOR_KEY = 0x0EA0;
    uint256 internal constant SELLER_KEY = 0x5E11;

    address internal owner1;
    address internal owner2;
    address internal owner3;
    address internal operator;
    address internal seller;

    uint256 internal constant DAO_ALLOC = 300_000_000 ether;
    uint256 internal constant PAYMENT = 1_000 ether;

    function setUp() public {
        owner1 = vm.addr(OWNER1_KEY);
        owner2 = vm.addr(OWNER2_KEY);
        owner3 = vm.addr(OWNER3_KEY);
        operator = vm.addr(OPERATOR_KEY);
        seller = vm.addr(SELLER_KEY);

        core = new FigaroCore();
        florin = new FlorinToken();

        address[] memory owners = new address[](3);
        owners[0] = owner1;
        owners[1] = owner2;
        owners[2] = owner3;
        treasury = new MockTreasuryMultisig(owners, 2);

        // Genesis shape: the DAO's allocation mints to the MULTISIG, plus an
        // arm's-length seller float for the deal's own bond; then renounce.
        florin.registerMinter(address(this), DAO_ALLOC + 10_000 ether);
        florin.mint(address(treasury), DAO_ALLOC);
        florin.mint(seller, 10_000 ether);
        florin.renounceDeployerMint();

        vm.prank(seller);
        florin.approve(address(core), type(uint256).max);
    }

    // ── EIP-712 helpers (the kernel-test idiom) ─────────────────────

    function _signCommitment(CommitmentTypes.Commitment memory c, uint256 privateKey)
        internal
        view
        returns (bytes memory)
    {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("FigaroCore"),
                keccak256("3"),
                block.chainid,
                address(core)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, c.hashStruct()));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _procurementCommitment() internal view returns (CommitmentTypes.Commitment memory) {
        return CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: operator,
            seller: seller,
            currency: address(florin),
            payment: PAYMENT,
            expectedCumulativeValue: PAYMENT,
            agreementHash: keccak256("procurement-agreement"),
            salt: 1,
            deadline: block.timestamp + 1 hours
        });
    }

    /// @dev The 2-of-3 funding act: owner1 proposes the transfer, owner2
    ///      approves, anyone executes.
    function _fundOperator(uint256 amount) internal {
        bytes memory data = abi.encodeCall(florin.transfer, (operator, amount));
        uint256 fundingNonce = treasury.nonce();
        vm.prank(owner1);
        bytes32 txHash = treasury.propose(address(florin), 0, data);
        vm.prank(owner2);
        treasury.approveHash(txHash);
        treasury.execute(address(florin), 0, data, fundingNonce);
    }

    // ── The rehearsal ───────────────────────────────────────────────

    function test_ProcurementEndToEnd_TreasuryNetSpendIsExactlyThePayment() public {
        // 1. Fund the operator-EOA with EXACTLY the deal's pull (the kernel
        //    pulls 2× payment from the buyer at commit).
        _fundOperator(2 * PAYMENT);
        assertEq(florin.balanceOf(operator), 2 * PAYMENT, "blast radius: the EOA holds only this procurement");
        assertEq(florin.balanceOf(address(treasury)), DAO_ALLOC - 2 * PAYMENT);

        // 2. The EOA buys through the kernel as an ordinary bonded buyer.
        vm.prank(operator);
        florin.approve(address(core), 2 * PAYMENT);
        CommitmentTypes.Commitment memory c = _procurementCommitment();
        (bytes32 processId,) = core.commit(c, _signCommitment(c, OPERATOR_KEY), _signCommitment(c, SELLER_KEY));
        assertEq(florin.balanceOf(operator), 0, "in flight, the EOA holds nothing outside escrow");

        // 3. Buyer-dominant resolution: the seller is paid, the buyer bond
        //    residual returns to the EOA.
        uint256 sellerBefore = florin.balanceOf(seller);
        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](1);
        commitments[0] = c;
        vm.prank(operator);
        core.resolveProcess(processId, commitments);
        assertEq(florin.balanceOf(seller) - sellerBefore, 3 * PAYMENT, "seller: own 2x bond back + the payment");
        assertEq(florin.balanceOf(operator), PAYMENT, "buyer residual: 2x locked, payment spent");

        // 4. Sweep-back: the residual returns to the treasury; the DAO's net
        //    spend is EXACTLY the payment.
        vm.prank(operator);
        florin.transfer(address(treasury), PAYMENT);
        assertEq(florin.balanceOf(address(treasury)), DAO_ALLOC - PAYMENT, "net spend == payment");
        assertEq(florin.balanceOf(operator), 0, "the EOA ends empty");
    }

    // ── Custody negatives ───────────────────────────────────────────

    function test_RevertWhen_SingleOwnerExecutesAlone() public {
        bytes memory data = abi.encodeCall(florin.transfer, (operator, 1 ether));
        uint256 fundingNonce = treasury.nonce();
        vm.prank(owner1);
        treasury.propose(address(florin), 0, data);
        vm.expectRevert(abi.encodeWithSelector(MockTreasuryMultisig.ThresholdNotMet.selector, 1, 2));
        treasury.execute(address(florin), 0, data, fundingNonce);
        assertEq(florin.balanceOf(operator), 0, "no owner moves treasury funds alone");
    }

    function test_RevertWhen_NonOwnerProposes() public {
        bytes memory data = abi.encodeCall(florin.transfer, (operator, 1 ether));
        vm.expectRevert(MockTreasuryMultisig.NotOwner.selector);
        vm.prank(operator);
        treasury.propose(address(florin), 0, data);
    }

    function test_RevertWhen_ApprovedTransactionReplayed() public {
        _fundOperator(1 ether);
        bytes memory data = abi.encodeCall(florin.transfer, (operator, 1 ether));
        vm.expectRevert(MockTreasuryMultisig.AlreadyExecuted.selector);
        treasury.execute(address(florin), 0, data, 0);
    }

    function test_TreasuryCannotBeAKernelParty() public {
        // The kernel recovers ECDSA signatures; a contract address can never
        // produce one for itself — the structural reason the operator-EOA
        // exists. A commitment naming the treasury as buyer cannot carry a
        // valid buyer signature from the treasury.
        CommitmentTypes.Commitment memory c = _procurementCommitment();
        c.buyer = address(treasury);
        bytes memory anySig = _signCommitment(c, OWNER1_KEY); // an owner signing is NOT the treasury signing
        vm.expectRevert();
        core.commit(c, anySig, _signCommitment(c, SELLER_KEY));
    }
}
