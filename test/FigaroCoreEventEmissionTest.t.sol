// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../src/FigaroCore.sol";
import "../src/CommitmentTypes.sol";
import "../src/mocks/MockPermitToken.sol";

/// @title FigaroCore_EventEmission — Slim events, no derivable data
/// @notice No buyerBond, sellerBond, or timestamp in events. No OrderParents.
contract FigaroCore_EventEmission is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore internal core;
    MockPermitToken internal token;

    uint256 internal constant BUYER_KEY = 0xB0B;
    uint256 internal constant SELLER1_KEY = 0x5E11;
    uint256 internal constant SELLER2_KEY = 0x5E12;

    address internal buyer;
    address internal seller1;
    address internal seller2;

    uint256 internal constant INITIAL_BALANCE = 100_000 ether;

    bytes32 internal constant COMMITTED_SIG =
        keccak256("OrderCommitted(bytes32,bytes32,address,address,address,uint256,uint256,bytes32,uint256,uint256)");
    bytes32 internal constant SELLER_SIG = keccak256("OrderSeller(bytes32,address)");
    bytes32 internal constant CURRENCY_SIG = keccak256("OrderCurrency(bytes32,address)");
    bytes32 internal constant ORDER_RESOLVED_SIG = keccak256("OrderResolved(bytes32,bytes32,uint256,uint256)");
    bytes32 internal constant PROCESS_RESOLVED_SIG = keccak256("ProcessResolved(bytes32,address,uint256)");

    function setUp() public {
        buyer = vm.addr(BUYER_KEY);
        seller1 = vm.addr(SELLER1_KEY);
        seller2 = vm.addr(SELLER2_KEY);

        token = new MockPermitToken();
        core = new FigaroCore();

        address[3] memory ppl = [buyer, seller1, seller2];
        for (uint256 i = 0; i < ppl.length; i++) {
            token.mint(ppl[i], INITIAL_BALANCE);
            vm.prank(ppl[i]);
            token.approve(address(core), type(uint256).max);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────

    function _signCommitment(CommitmentTypes.Commitment memory c, uint256 key) internal view returns (bytes memory) {
        bytes32 structHash = c.hashStruct();
        bytes32 digest = _typedDataHash(structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
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

    function _commitRoot(uint256 payment, uint256 salt)
        internal
        returns (bytes32 processId, bytes32 orderHash, CommitmentTypes.Commitment memory c)
    {
        c = CommitmentTypes.Commitment({
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
        (processId, orderHash) = core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER1_KEY));
    }

    function _commitSub(
        bytes32 processId,
        address seller,
        uint256 payment,
        uint256 expectedCum,
        uint256 sellerKey,
        uint256 salt
    ) internal returns (bytes32 orderHash, CommitmentTypes.Commitment memory c) {
        c = CommitmentTypes.Commitment({
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
        (, orderHash) = core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, sellerKey));
    }

    /// @dev Decode and assert non-indexed data of the slim OrderCommitted.
    function _assertCommittedData(
        bytes memory data,
        address expectedSeller,
        address expectedCurrency,
        uint256 expectedPayment,
        uint256 expectedCumValue,
        bytes32 expectedAgreementHash
    ) internal pure {
        (
            address seller_,
            address currency_,
            uint256 payment_,
            uint256 cumValue_,
            bytes32 agreement_,, // salt
        ) =
            abi.decode( // deadline
                data,
                (address, address, uint256, uint256, bytes32, uint256, uint256)
            );

        assertEq(seller_, expectedSeller, "seller");
        assertEq(currency_, expectedCurrency, "currency");
        assertEq(payment_, expectedPayment, "payment");
        assertEq(cumValue_, expectedCumValue, "cumulativeValue");
        assertEq(agreement_, expectedAgreementHash, "agreementHash");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 1: Root order emits slim OrderCommitted
    // ═══════════════════════════════════════════════════════════════

    function test_rootOrder_emitsOrderCommitted() public {
        uint256 payment = 50 ether;
        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller1,
            currency: address(token),
            payment: payment,
            expectedCumulativeValue: payment,
            agreementHash: keccak256("root-manifest"),
            salt: 1,
            deadline: block.timestamp + 1 hours
        });

        vm.recordLogs();
        (bytes32 processId, bytes32 orderHash) =
            core.commit(c, _signCommitment(c, BUYER_KEY), _signCommitment(c, SELLER1_KEY));
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == COMMITTED_SIG) {
                assertEq(logs[i].topics[1], orderHash, "indexed orderHash");
                assertEq(logs[i].topics[2], processId, "indexed processId");
                assertEq(logs[i].topics[3], bytes32(uint256(uint160(buyer))), "indexed buyer");
                _assertCommittedData(
                    logs[i].data, seller1, address(token), payment, payment, keccak256("root-manifest")
                );
                found = true;
                break;
            }
        }
        assertTrue(found, "OrderCommitted not emitted");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 2: Root order emits OrderSeller
    // ═══════════════════════════════════════════════════════════════

    function test_rootOrder_emitsOrderSeller() public {
        vm.recordLogs();
        (, bytes32 orderHash,) = _commitRoot(50 ether, 1);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == SELLER_SIG) {
                assertEq(logs[i].topics[1], orderHash, "indexed orderHash");
                assertEq(logs[i].topics[2], bytes32(uint256(uint160(seller1))), "indexed seller");
                found = true;
                break;
            }
        }
        assertTrue(found, "OrderSeller not emitted");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 2b: Root order emits OrderCurrency
    // ═══════════════════════════════════════════════════════════════

    function test_rootOrder_emitsOrderCurrency() public {
        vm.recordLogs();
        (, bytes32 orderHash,) = _commitRoot(50 ether, 1);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == CURRENCY_SIG) {
                assertEq(logs[i].topics[1], orderHash, "indexed orderHash");
                assertEq(logs[i].topics[2], bytes32(uint256(uint160(address(token)))), "indexed currency");
                found = true;
                break;
            }
        }
        assertTrue(found, "OrderCurrency not emitted");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 3: Resolution emits OrderResolved per order (no timestamp)
    // ═══════════════════════════════════════════════════════════════

    function test_resolution_emitsOrderResolvedPerOrder() public {
        uint256 rootPayment = 50 ether;
        (bytes32 processId, bytes32 rootHash, CommitmentTypes.Commitment memory rootC) = _commitRoot(rootPayment, 1);

        uint256 subPayment = 30 ether;
        uint256 expectedCum = rootPayment + subPayment;
        (bytes32 subHash, CommitmentTypes.Commitment memory subC) =
            _commitSub(processId, seller2, subPayment, expectedCum, SELLER2_KEY, 2);

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](2);
        commitments[0] = rootC;
        commitments[1] = subC;

        vm.recordLogs();
        vm.prank(buyer);
        core.resolveProcess(processId, commitments);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        uint256 resolvedCount = 0;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == ORDER_RESOLVED_SIG) {
                resolvedCount++;
                bytes32 emittedHash = logs[i].topics[1];
                bytes32 emittedProcess = logs[i].topics[2];
                assertEq(emittedProcess, processId, "processId");

                // Slim decode: sellerPayout, buyerPayout (no timestamp)
                (uint256 sellerPayout, uint256 buyerPayout) = abi.decode(logs[i].data, (uint256, uint256));

                if (emittedHash == rootHash) {
                    assertEq(sellerPayout, 150 ether, "root seller payout");
                    assertEq(buyerPayout, 50 ether, "root buyer payout");
                } else if (emittedHash == subHash) {
                    assertEq(sellerPayout, 190 ether, "sub seller payout");
                    assertEq(buyerPayout, 30 ether, "sub buyer payout");
                } else {
                    revert("unexpected order hash");
                }
            }
        }
        assertEq(resolvedCount, 2, "OrderResolved for each order");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 4: Resolution emits ProcessResolved (no timestamp)
    // ═══════════════════════════════════════════════════════════════

    function test_resolution_emitsProcessResolved() public {
        (bytes32 processId,, CommitmentTypes.Commitment memory rootC) = _commitRoot(50 ether, 1);
        (, CommitmentTypes.Commitment memory subC) = _commitSub(processId, seller2, 20 ether, 70 ether, SELLER2_KEY, 2);

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](2);
        commitments[0] = rootC;
        commitments[1] = subC;

        vm.recordLogs();
        vm.prank(buyer);
        core.resolveProcess(processId, commitments);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == PROCESS_RESOLVED_SIG) {
                assertEq(logs[i].topics[1], processId, "indexed processId");
                assertEq(logs[i].topics[2], bytes32(uint256(uint160(buyer))), "indexed buyer");

                // Slim decode: orderCount only (no timestamp)
                uint256 orderCount = abi.decode(logs[i].data, (uint256));
                assertEq(orderCount, 2, "orderCount");
                found = true;
                break;
            }
        }
        assertTrue(found, "ProcessResolved not emitted");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 5: Sub-order emits OrderCommitted with cumulative value
    // ═══════════════════════════════════════════════════════════════

    function test_subOrder_emitsOrderCommittedWithCumulativeValue() public {
        uint256 rootPayment = 50 ether;
        (bytes32 processId,,) = _commitRoot(rootPayment, 1);

        uint256 subPayment = 30 ether;
        uint256 expectedCum = rootPayment + subPayment;

        CommitmentTypes.Commitment memory sub = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller2,
            currency: address(token),
            payment: subPayment,
            expectedCumulativeValue: expectedCum,
            agreementHash: keccak256("sub-manifest"),
            salt: 2,
            deadline: block.timestamp + 1 hours
        });

        vm.recordLogs();
        (, bytes32 subHash) = core.commit(sub, _signCommitment(sub, BUYER_KEY), _signCommitment(sub, SELLER2_KEY));
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == COMMITTED_SIG) {
                assertEq(logs[i].topics[1], subHash, "indexed orderHash");
                assertEq(logs[i].topics[2], processId, "indexed processId");
                _assertCommittedData(
                    logs[i].data, seller2, address(token), subPayment, expectedCum, keccak256("sub-manifest")
                );
                found = true;
                break;
            }
        }
        assertTrue(found, "OrderCommitted not emitted for sub-order");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 6: Full lifecycle event timeline
    // ═══════════════════════════════════════════════════════════════

    function test_fullLifecycle_eventTimeline() public {
        vm.recordLogs();

        (bytes32 processId,, CommitmentTypes.Commitment memory rootC) = _commitRoot(40 ether, 1);

        CommitmentTypes.Commitment memory subC = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller2,
            currency: address(token),
            payment: 25 ether,
            expectedCumulativeValue: 65 ether,
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

        Vm.Log[] memory logs = vm.getRecordedLogs();

        uint256 commitCount;
        uint256 sellerCount;
        uint256 currencyCount;
        uint256 resolvedCount;
        uint256 procResolvedCount;

        for (uint256 i = 0; i < logs.length; i++) {
            bytes32 sig = logs[i].topics[0];
            if (sig == COMMITTED_SIG) commitCount++;
            else if (sig == SELLER_SIG) sellerCount++;
            else if (sig == CURRENCY_SIG) currencyCount++;
            else if (sig == ORDER_RESOLVED_SIG) resolvedCount++;
            else if (sig == PROCESS_RESOLVED_SIG) procResolvedCount++;
        }

        // No OrderParents — topology is not a kernel concern
        assertEq(commitCount, 2, "2 OrderCommitted (root + sub)");
        assertEq(sellerCount, 2, "2 OrderSeller (root + sub)");
        assertEq(currencyCount, 2, "2 OrderCurrency (root + sub)");
        assertEq(resolvedCount, 2, "2 OrderResolved (root + sub)");
        assertEq(procResolvedCount, 1, "1 ProcessResolved");
    }
}
