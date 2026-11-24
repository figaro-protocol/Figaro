// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "src/core/kernel/FigaroCore.sol";
import "src/core/kernel/CommitmentTypes.sol";
import "src/core/attestation/AttestationCoordinator.sol";
import "src/mocks/MockPermitToken.sol";
import {AgreementTestHelper} from "test/helpers/AgreementTestHelper.sol";

/// @title An attestation changes nothing in FigaroCore
/// @notice Commits a process of three orders over two sellers, each under the
///         same three-clause agreement, then files fuzzed attestations through
///         `AttestationCoordinator`: any order, any clause of its agreement,
///         any stage, any `contentRef`, as its buyer or as its seller. After
///         every attestation, `FigaroCore.orderStatus` of each order,
///         `FigaroCore.processes` of the process, and the token balances of the
///         Core and of each party equal their values before the first one.
///         The buyer then resolves the process as if no attestation had been
///         filed. The Foundry companion of the Certora rules
///         `attestationCannotChangeOrderStatus` and
///         `attestationCannotChangeProcessState`
///         (`certora/AttestationCoordinator.spec`).
///
///         The batch path is not exercised here: `FigaroBatchVerifier`'s
///         constructor takes no `FigaroCore` address and the two paths share no
///         state, so a batched attestation has no call into the Core to make.
contract AttestationLeavesCoreUnchangedTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore core;
    AttestationCoordinator coordinator;
    MockPermitToken token;

    uint256 constant BUYER_KEY = 0xB0B;
    uint256 constant SELLER1_KEY = 0x5E11;
    uint256 constant SELLER2_KEY = 0x5E12;

    address buyer;
    address seller1;
    address seller2;

    uint256 constant ORDERS = 3;
    uint256 constant CLAUSES = 3;

    bytes32[CLAUSES] clauseIds;
    bytes[CLAUSES] clauseData;
    bytes32[] leaves;
    bytes32 agreementRoot;

    bytes32 processId;
    CommitmentTypes.Commitment[] orders;
    bytes32[ORDERS] orderHashes;

    /// @dev The Core's observable state for the process, before any attestation.
    struct Snapshot {
        uint8[ORDERS] status;
        address rootBuyer;
        address processToken;
        uint256 runningTotal;
        uint256 activeOrderCount;
        uint256 coreBalance;
        uint256 buyerBalance;
        uint256 seller1Balance;
        uint256 seller2Balance;
    }

    function setUp() public {
        core = new FigaroCore();
        coordinator = new AttestationCoordinator(address(core));
        token = new MockPermitToken();

        buyer = vm.addr(BUYER_KEY);
        seller1 = vm.addr(SELLER1_KEY);
        seller2 = vm.addr(SELLER2_KEY);
        address[3] memory parties = [buyer, seller1, seller2];
        for (uint256 i = 0; i < parties.length; i++) {
            token.mint(parties[i], 10_000 ether);
            vm.prank(parties[i]);
            token.approve(address(core), type(uint256).max);
        }

        for (uint256 i = 0; i < CLAUSES; i++) {
            clauseIds[i] = keccak256(abi.encodePacked("attestation-leaves-core-unchanged", i));
            clauseData[i] = abi.encodePacked("content of clause ", i);
            leaves.push(AgreementTestHelper.leafFor(clauseIds[i], clauseData[i]));
        }
        agreementRoot = AgreementTestHelper.rootFor(leaves);

        // Root order to seller1, then a sub-order to seller2 and one more to seller1.
        _commit(bytes32(0), seller1, SELLER1_KEY, 10 ether, 10 ether, 1);
        _commit(processId, seller2, SELLER2_KEY, 20 ether, 30 ether, 2);
        _commit(processId, seller1, SELLER1_KEY, 5 ether, 35 ether, 3);
    }

    function _commit(
        bytes32 pid,
        address seller,
        uint256 sellerKey,
        uint256 payment,
        uint256 runningTotal,
        uint256 salt
    ) internal {
        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: pid,
            buyer: buyer,
            seller: seller,
            token: address(token),
            payment: payment,
            runningTotal: runningTotal,
            checkoutHash: agreementRoot,
            salt: salt,
            commitDeadline: block.timestamp + 1 hours
        });
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", core.DOMAIN_SEPARATOR(), c.hashStruct()));
        (bytes32 newProcessId, bytes32 orderHash) = core.commit(c, _sig(BUYER_KEY, digest), _sig(sellerKey, digest));
        if (pid == bytes32(0)) processId = newProcessId;
        orderHashes[orders.length] = orderHash;
        orders.push(c);
    }

    function _sig(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _snapshot() internal view returns (Snapshot memory s) {
        for (uint256 i = 0; i < ORDERS; i++) {
            s.status[i] = core.orderStatus(orderHashes[i]);
        }
        (address rootBuyer, IERC20 processToken, uint256 runningTotal, uint256 activeOrderCount) =
            core.processes(processId);
        s.rootBuyer = rootBuyer;
        s.processToken = address(processToken);
        s.runningTotal = runningTotal;
        s.activeOrderCount = activeOrderCount;
        s.coreBalance = token.balanceOf(address(core));
        s.buyerBalance = token.balanceOf(buyer);
        s.seller1Balance = token.balanceOf(seller1);
        s.seller2Balance = token.balanceOf(seller2);
    }

    function _assertUnchanged(Snapshot memory before) internal view {
        Snapshot memory now_ = _snapshot();
        for (uint256 i = 0; i < ORDERS; i++) {
            assertEq(now_.status[i], before.status[i], "orderStatus");
        }
        assertEq(now_.rootBuyer, before.rootBuyer, "processes.rootBuyer");
        assertEq(now_.processToken, before.processToken, "processes.token");
        assertEq(now_.runningTotal, before.runningTotal, "processes.runningTotal");
        assertEq(now_.activeOrderCount, before.activeOrderCount, "processes.activeOrderCount");
        assertEq(now_.coreBalance, before.coreBalance, "FigaroCore token balance");
        assertEq(now_.buyerBalance, before.buyerBalance, "buyer token balance");
        assertEq(now_.seller1Balance, before.seller1Balance, "seller1 token balance");
        assertEq(now_.seller2Balance, before.seller2Balance, "seller2 token balance");
    }

    /// @dev Files one attestation on order `orderIdx`, clause `clauseIdx`, as the
    ///      order's buyer or its seller; the coordinator accepts it.
    function _attest(uint256 orderIdx, uint256 clauseIdx, uint8 stage, bytes32 contentRef, bool asBuyer) internal {
        CommitmentTypes.Commitment memory c = orders[orderIdx];
        bytes32[] memory proof = AgreementTestHelper.proofFor(leaves, clauseIdx);
        bytes32 dataHash = keccak256(clauseData[clauseIdx]);
        if (asBuyer) {
            vm.prank(c.buyer);
            coordinator.attestAsBuyer(c, clauseIds[clauseIdx], stage, dataHash, proof, contentRef);
        } else {
            vm.prank(c.seller);
            coordinator.attestAsSeller(c, clauseIds[clauseIdx], stage, dataHash, proof, contentRef);
        }
    }

    function testFuzz_oneAttestationLeavesTheCoreUnchanged(
        uint256 orderIdx,
        uint256 clauseIdx,
        uint8 stage,
        bytes32 contentRef,
        bool asBuyer
    ) public {
        orderIdx = bound(orderIdx, 0, ORDERS - 1);
        clauseIdx = bound(clauseIdx, 0, CLAUSES - 1);

        Snapshot memory before = _snapshot();
        _attest(orderIdx, clauseIdx, stage, contentRef, asBuyer);
        _assertUnchanged(before);
    }

    /// The coordinator keeps no storage of its own: an attestation by either
    /// party reads none of it and writes none of it, so the `Attestation`
    /// event is the whole of what the call leaves.
    function testFuzz_anAttestationTouchesNoCoordinatorStorage(
        uint256 orderIdx,
        uint256 clauseIdx,
        uint8 stage,
        bytes32 contentRef,
        bool asBuyer
    ) public {
        orderIdx = bound(orderIdx, 0, ORDERS - 1);
        clauseIdx = bound(clauseIdx, 0, CLAUSES - 1);

        vm.record();
        _attest(orderIdx, clauseIdx, stage, contentRef, asBuyer);
        (bytes32[] memory reads, bytes32[] memory writes) = vm.accesses(address(coordinator));
        assertEq(writes.length, 0, "the coordinator wrote storage");
        assertEq(reads.length, 0, "the coordinator read storage of its own");
    }

    function testFuzz_manyAttestationsLeaveTheCoreUnchanged(uint256 seed, uint8 count) public {
        count = uint8(bound(count, 1, 24));

        Snapshot memory before = _snapshot();
        for (uint256 i = 0; i < count; i++) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            _attest(r % ORDERS, (r >> 8) % CLAUSES, uint8(r >> 16), keccak256(abi.encode(r)), (r >> 24) & 1 == 1);
            _assertUnchanged(before);
        }

        // The buyer resolves the process as if no attestation had been filed:
        // every order moves to resolved and every bond leaves the Core.
        vm.prank(buyer);
        core.resolveProcess(processId, orders);
        for (uint256 i = 0; i < ORDERS; i++) {
            assertEq(core.orderStatus(orderHashes[i]), 2, "resolved");
        }
        assertEq(token.balanceOf(address(core)), 0, "the Core holds nothing after resolution");
    }
}
