// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FigaroCore.sol";
import "../src/CommitmentTypes.sol";
import "../src/ProcessOffsetReceipt.sol";
import "../src/mocks/MockPermitToken.sol";

/// @title ProcessOffsetReceiptTest
/// @notice Tests for the permissionless process-offset receipts contract.
///         Covers happy path (rootBuyer records), every typed revert
///         (non-buyer / unknown process / each zero-field guard), and
///         multi-receipt-per-process semantics.
contract ProcessOffsetReceiptTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore core;
    ProcessOffsetReceipt receipts;
    MockPermitToken token;

    uint256 constant BUYER_KEY = 0xB0B;
    uint256 constant SELLER_KEY = 0x5E11;
    uint256 constant ATTACKER_KEY = 0xBAD;

    address buyer;
    address seller;
    address attacker;

    bytes32 processId;
    bytes32 constant SAMPLE_TX_HASH = keccak256("sample-retirement-tx");
    address constant SAMPLE_AGGREGATOR = 0x8cE54d9625371fb2a068986d32C85De8E6e995f8; // KlimaInfinity, polygon
    uint256 constant SAMPLE_TONS = 1.5 ether; // 1.5 tonnes in 1e18 fixed-point
    uint256 constant SAMPLE_INPUT_AMOUNT = 30e6; // 30 USDC (6 decimals)

    uint256 constant INITIAL_BALANCE = 10_000 ether;

    event ReceiptRecorded(
        bytes32 indexed processId,
        address indexed buyer,
        bytes32 indexed retirementTxHash,
        address aggregator,
        uint256 tonsRetired,
        address inputToken,
        uint256 inputAmount
    );

    function setUp() public {
        core = new FigaroCore();
        receipts = new ProcessOffsetReceipt(core);
        token = new MockPermitToken();

        buyer = vm.addr(BUYER_KEY);
        seller = vm.addr(SELLER_KEY);
        attacker = vm.addr(ATTACKER_KEY);

        address[3] memory ppl = [buyer, seller, attacker];
        for (uint256 i = 0; i < ppl.length; i++) {
            token.mint(ppl[i], INITIAL_BALANCE);
            vm.prank(ppl[i]);
            token.approve(address(core), type(uint256).max);
        }

        // Bootstrap a real process so processes[processId].rootBuyer == buyer.
        processId = _commitRoot();
    }

    // ── Helpers ──────────────────────────────────────────────────────

    function _signCommitment(CommitmentTypes.Commitment memory c, uint256 privateKey)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = c.hashStruct();
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("FigaroCore"),
                keccak256("3"),
                block.chainid,
                address(core)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _commitRoot() internal returns (bytes32) {
        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            currency: address(token),
            payment: 100 ether,
            expectedCumulativeValue: 100 ether,
            agreementHash: keccak256("agreement"),
            salt: 1,
            deadline: block.timestamp + 1 hours
        });
        bytes memory buyerSig = _signCommitment(c, BUYER_KEY);
        bytes memory sellerSig = _signCommitment(c, SELLER_KEY);
        (bytes32 pid,) = core.commit(c, buyerSig, sellerSig);
        return pid;
    }

    function _record() internal {
        vm.prank(buyer);
        receipts.record(
            processId, SAMPLE_TX_HASH, SAMPLE_AGGREGATOR, SAMPLE_TONS, address(token), SAMPLE_INPUT_AMOUNT
        );
    }

    // ── Construction ─────────────────────────────────────────────────

    function test_constructor_setsCoreImmutable() public view {
        assertEq(address(receipts.core()), address(core), "core mismatch");
    }

    // ── Happy path ───────────────────────────────────────────────────

    function test_record_emitsReceiptRecorded() public {
        vm.expectEmit(true, true, true, true, address(receipts));
        emit ReceiptRecorded(
            processId, buyer, SAMPLE_TX_HASH, SAMPLE_AGGREGATOR, SAMPLE_TONS, address(token), SAMPLE_INPUT_AMOUNT
        );
        _record();
    }

    function test_record_acceptsMultipleReceiptsForSameProcess() public {
        // First receipt
        vm.prank(buyer);
        receipts.record(
            processId, keccak256("tx-1"), SAMPLE_AGGREGATOR, 1 ether, address(token), 20e6
        );

        // Second receipt (different aggregator, different tx hash, same process)
        vm.prank(buyer);
        receipts.record(
            processId, keccak256("tx-2"), address(0xCafe), 0.5 ether, address(token), 10e6
        );

        // No revert — multiple receipts per process is supported.
    }

    function test_record_acceptsTinyAmounts() public {
        // Boundary: 1 wei tonne, 1 wei input amount, all addresses non-zero.
        vm.prank(buyer);
        receipts.record(processId, SAMPLE_TX_HASH, SAMPLE_AGGREGATOR, 1, address(token), 1);
    }

    // ── Authorization ─────────────────────────────────────────────────

    function test_record_revertsForNonRootBuyer() public {
        vm.expectRevert(ProcessOffsetReceipt.NotRootBuyer.selector);
        vm.prank(seller);
        receipts.record(
            processId, SAMPLE_TX_HASH, SAMPLE_AGGREGATOR, SAMPLE_TONS, address(token), SAMPLE_INPUT_AMOUNT
        );
    }

    function test_record_revertsForAttacker() public {
        vm.expectRevert(ProcessOffsetReceipt.NotRootBuyer.selector);
        vm.prank(attacker);
        receipts.record(
            processId, SAMPLE_TX_HASH, SAMPLE_AGGREGATOR, SAMPLE_TONS, address(token), SAMPLE_INPUT_AMOUNT
        );
    }

    function test_record_revertsForUnknownProcessId() public {
        // Unknown processId → rootBuyer == address(0) → mismatches any caller.
        bytes32 unknownProcessId = keccak256("not-a-real-process");
        vm.expectRevert(ProcessOffsetReceipt.NotRootBuyer.selector);
        vm.prank(buyer);
        receipts.record(
            unknownProcessId, SAMPLE_TX_HASH, SAMPLE_AGGREGATOR, SAMPLE_TONS, address(token), SAMPLE_INPUT_AMOUNT
        );
    }

    // ── Field guards ──────────────────────────────────────────────────

    function test_record_revertsOnZeroRetirementTxHash() public {
        vm.expectRevert(ProcessOffsetReceipt.ZeroRetirementTxHash.selector);
        vm.prank(buyer);
        receipts.record(
            processId, bytes32(0), SAMPLE_AGGREGATOR, SAMPLE_TONS, address(token), SAMPLE_INPUT_AMOUNT
        );
    }

    function test_record_revertsOnZeroAggregator() public {
        vm.expectRevert(ProcessOffsetReceipt.ZeroAggregator.selector);
        vm.prank(buyer);
        receipts.record(
            processId, SAMPLE_TX_HASH, address(0), SAMPLE_TONS, address(token), SAMPLE_INPUT_AMOUNT
        );
    }

    function test_record_revertsOnZeroTonsRetired() public {
        vm.expectRevert(ProcessOffsetReceipt.ZeroTonsRetired.selector);
        vm.prank(buyer);
        receipts.record(
            processId, SAMPLE_TX_HASH, SAMPLE_AGGREGATOR, 0, address(token), SAMPLE_INPUT_AMOUNT
        );
    }

    function test_record_revertsOnZeroInputToken() public {
        vm.expectRevert(ProcessOffsetReceipt.ZeroInputToken.selector);
        vm.prank(buyer);
        receipts.record(processId, SAMPLE_TX_HASH, SAMPLE_AGGREGATOR, SAMPLE_TONS, address(0), SAMPLE_INPUT_AMOUNT);
    }

    function test_record_revertsOnZeroInputAmount() public {
        vm.expectRevert(ProcessOffsetReceipt.ZeroInputAmount.selector);
        vm.prank(buyer);
        receipts.record(processId, SAMPLE_TX_HASH, SAMPLE_AGGREGATOR, SAMPLE_TONS, address(token), 0);
    }

    // ── Authorization-before-validation ──────────────────────────────

    function test_record_authChecksFirst_evenWithMalformedFields() public {
        // Non-buyer with all-zero fields should still fail with NotRootBuyer,
        // not a field-shape error — auth is the first guard in `record`.
        vm.expectRevert(ProcessOffsetReceipt.NotRootBuyer.selector);
        vm.prank(attacker);
        receipts.record(processId, bytes32(0), address(0), 0, address(0), 0);
    }
}
