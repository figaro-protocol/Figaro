// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FigaroCore.sol";
import "../src/CommitmentTypes.sol";
import "../src/AttestationCoordinator.sol";
import "../src/SchemaRegistry.sol";
import "../src/IRoleResolver.sol";
import "../src/mocks/MockPermitToken.sol";

/// @title AttestationCoordinatorTest
/// @notice Tests for the rewritten zero-storage attestation coordinator.
///         Covers: seller/buyer attestation, unauthorized callers, cross-order
///         attestation, resolver delegation, unknown order, contentRef emission,
///         constructor zero address.
contract AttestationCoordinatorTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore core;
    AttestationCoordinator coordinator;
    SchemaRegistry schemas;
    MockPermitToken token;

    uint256 constant BUYER_KEY = 0xB0B;
    uint256 constant SELLER1_KEY = 0x5E11;
    uint256 constant SELLER2_KEY = 0x5E12;

    address buyer;
    address seller1;
    address seller2;

    uint256 constant INITIAL_BALANCE = 10_000 ether;

    bytes32 constant LIFECYCLE_SCHEMA = keccak256("figaro-delivery-lifecycle-v1");
    bytes32 constant GHG_SCHEMA = keccak256("figaro-ghg-disclosure-v1");
    bytes32 constant PROXIMITY_SCHEMA = keccak256("figaro-proximity-v1");
    bytes32 constant COMMERCE_SCHEMA = keccak256("figaro-commerce-v1");
    bytes32 constant HANDOFF_SCHEMA = keccak256("figaro-handoff-v1");

    function setUp() public {
        core = new FigaroCore();
        coordinator = new AttestationCoordinator(address(core));
        token = new MockPermitToken();

        buyer = vm.addr(BUYER_KEY);
        seller1 = vm.addr(SELLER1_KEY);
        seller2 = vm.addr(SELLER2_KEY);

        address[3] memory ppl = [buyer, seller1, seller2];
        for (uint256 i = 0; i < ppl.length; i++) {
            token.mint(ppl[i], INITIAL_BALANCE);
            vm.prank(ppl[i]);
            token.approve(address(core), type(uint256).max);
        }

        // ── SchemaRegistry: register all figaro-eats schemas ────────
        schemas = new SchemaRegistry();
        bytes32 testUri = keccak256("ipfs://figaro-test-uri");
        schemas.registerSchema(LIFECYCLE_SCHEMA, 1, testUri);
        schemas.registerSchema(GHG_SCHEMA, 1, testUri);
        schemas.registerSchema(PROXIMITY_SCHEMA, 1, testUri);
        schemas.registerSchema(COMMERCE_SCHEMA, 1, testUri);
        schemas.registerSchema(HANDOFF_SCHEMA, 1, testUri);

        // AttestationCoordinator declares which schemas it uses.
        // In production this is called from the deploy script (post-audit amendment);
        // in tests we use vm.prank to simulate the coordinator calling setMechanismSchema.
        vm.startPrank(address(coordinator));
        schemas.setMechanismSchema(LIFECYCLE_SCHEMA);
        schemas.setMechanismSchema(GHG_SCHEMA);
        schemas.setMechanismSchema(PROXIMITY_SCHEMA);
        vm.stopPrank();
    }

    // ── Helpers ──────────────────────────────────────────────────────

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
            agreementHash: keccak256(abi.encodePacked("root-", salt)),
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
            agreementHash: keccak256(abi.encodePacked("sub-", salt)),
            salt: salt,
            deadline: block.timestamp + 1 hours
        });
        bytes memory buyerSig = _signCommitment(c, BUYER_KEY);
        bytes memory sellerSig = _signCommitment(c, sellerKey);
        (, orderHash) = core.commit(c, buyerSig, sellerSig);
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 1: Seller attests a lifecycle stage
    // ═══════════════════════════════════════════════════════════════

    function test_sellerAttestation_lifecycle() public {
        (bytes32 processId, bytes32 rootHash, CommitmentTypes.Commitment memory c) = _commitRoot(50 ether, 1);

        vm.recordLogs();
        vm.prank(seller1);
        coordinator.attestAsSeller(c, rootHash, LIFECYCLE_SCHEMA, 1, bytes32(0));
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 attSig = keccak256("Attestation(bytes32,bytes32,address,bytes32,uint8,bytes32)");
        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == attSig) {
                assertEq(logs[i].topics[1], rootHash, "indexed orderHash");
                assertEq(logs[i].topics[2], processId, "indexed processId");
                assertEq(logs[i].topics[3], bytes32(uint256(uint160(seller1))), "indexed attester");

                (bytes32 schemaId, uint8 stage, bytes32 contentRef) =
                    abi.decode(logs[i].data, (bytes32, uint8, bytes32));
                assertEq(schemaId, LIFECYCLE_SCHEMA, "schemaId");
                assertEq(stage, 1, "stage");
                assertEq(contentRef, bytes32(0), "no content ref");
                found = true;
            }
        }
        assertTrue(found, "Attestation event found");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 2: Seller attests GHG disclosure (different schema)
    // ═══════════════════════════════════════════════════════════════

    function test_sellerAttestation_ghgDisclosure() public {
        (, bytes32 rootHash, CommitmentTypes.Commitment memory c) = _commitRoot(50 ether, 1);

        bytes32 ipfsCidHash = keccak256("QmSomeIpfsCid");

        vm.prank(seller1);
        coordinator.attestAsSeller(c, rootHash, GHG_SCHEMA, 2, ipfsCidHash);
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 3: Buyer attests
    // ═══════════════════════════════════════════════════════════════

    function test_buyerAttestation() public {
        (bytes32 processId, bytes32 rootHash,) = _commitRoot(50 ether, 1);

        vm.prank(buyer);
        coordinator.attestAsBuyer(processId, rootHash, LIFECYCLE_SCHEMA, 5, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 4: Unauthorized seller reverts
    // ═══════════════════════════════════════════════════════════════

    function test_unauthorizedSeller_reverts() public {
        (, bytes32 rootHash, CommitmentTypes.Commitment memory c) = _commitRoot(50 ether, 1);

        vm.prank(buyer); // buyer tries to attest as seller
        vm.expectRevert(AttestationCoordinator.NotAuthorized.selector);
        coordinator.attestAsSeller(c, rootHash, LIFECYCLE_SCHEMA, 1, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 5: Unauthorized buyer reverts
    // ═══════════════════════════════════════════════════════════════

    function test_unauthorizedBuyer_reverts() public {
        (bytes32 processId, bytes32 rootHash,) = _commitRoot(50 ether, 1);

        vm.prank(seller1); // seller tries to attest as buyer
        vm.expectRevert(AttestationCoordinator.NotAuthorized.selector);
        coordinator.attestAsBuyer(processId, rootHash, LIFECYCLE_SCHEMA, 1, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 6: Cross-order attestation within same process
    // ═══════════════════════════════════════════════════════════════

    function test_crossOrderAttestation_sameProcess() public {
        (bytes32 processId, bytes32 rootHash,) = _commitRoot(10 ether, 1);

        // Sub-order: buyer → seller2
        (, CommitmentTypes.Commitment memory subC) = _commitSub(processId, seller2, 20 ether, 30 ether, SELLER2_KEY, 2);

        // seller2 attests ON rootHash, using their subC as role proof
        vm.prank(seller2);
        coordinator.attestAsSeller(subC, rootHash, LIFECYCLE_SCHEMA, 3, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 6B: Cross-order seller attestation across processes reverts
    // ═══════════════════════════════════════════════════════════════

    function test_crossOrderAttestation_crossProcess_reverts() public {
        (, bytes32 rootHashA, CommitmentTypes.Commitment memory rootA) = _commitRoot(10 ether, 1);
        (, bytes32 rootHashB,) = _commitRoot(20 ether, 2);

        assertTrue(rootHashA != rootHashB, "distinct orders");

        vm.prank(seller1);
        vm.expectRevert(AttestationCoordinator.ProcessMismatch.selector);
        coordinator.attestAsSeller(rootA, rootHashB, LIFECYCLE_SCHEMA, 3, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 7: Resolver attestation (mock)
    // ═══════════════════════════════════════════════════════════════

    function test_resolverAttestation() public {
        (,, CommitmentTypes.Commitment memory c) = _commitRoot(50 ether, 1);

        // Mock seller1 as a resolver that authorizes seller2
        vm.mockCall(seller1, abi.encodeWithSelector(IRoleResolver.isAuthorized.selector), abi.encode(true));

        vm.prank(seller2);
        coordinator.attestViaResolver(c, LIFECYCLE_SCHEMA, 3, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 8: Resolver rejects unauthorized caller
    // ═══════════════════════════════════════════════════════════════

    function test_resolverAttestation_unauthorized_reverts() public {
        (,, CommitmentTypes.Commitment memory c) = _commitRoot(50 ether, 1);

        vm.mockCall(seller1, abi.encodeWithSelector(IRoleResolver.isAuthorized.selector), abi.encode(false));

        vm.prank(seller2);
        vm.expectRevert(AttestationCoordinator.NotAuthorized.selector);
        coordinator.attestViaResolver(c, LIFECYCLE_SCHEMA, 3, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 9: Unknown order reverts (seller)
    // ═══════════════════════════════════════════════════════════════

    function test_unknownOrder_seller_reverts() public {
        // Craft a commitment that was never committed
        CommitmentTypes.Commitment memory fake = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller1,
            currency: address(token),
            payment: 50 ether,
            expectedCumulativeValue: 50 ether,
            agreementHash: keccak256("fake"),
            salt: 999,
            deadline: block.timestamp + 1 hours
        });

        bytes32 fakeStructHash = fake.hashStruct();
        bytes32 fakeProcessId = _typedDataHash(fakeStructHash);
        bytes32 fakeOrderHash = keccak256(abi.encodePacked(fakeProcessId, fakeStructHash));

        vm.prank(seller1);
        vm.expectRevert(AttestationCoordinator.UnknownOrder.selector);
        coordinator.attestAsSeller(fake, fakeOrderHash, LIFECYCLE_SCHEMA, 1, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 10: Unknown order reverts (buyer)
    // ═══════════════════════════════════════════════════════════════

    function test_unknownOrder_buyer_reverts() public {
        bytes32 fakeProcessId = keccak256("nonexistent-process");
        bytes32 fakeOrderHash = keccak256("nonexistent-order");

        vm.prank(buyer);
        vm.expectRevert(AttestationCoordinator.UnknownOrder.selector);
        coordinator.attestAsBuyer(fakeProcessId, fakeOrderHash, LIFECYCLE_SCHEMA, 1, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 11: ContentRef is emitted correctly
    // ═══════════════════════════════════════════════════════════════

    function test_contentRef_emitted() public {
        (, bytes32 rootHash, CommitmentTypes.Commitment memory c) = _commitRoot(50 ether, 1);

        bytes32 ipfsRef = keccak256("bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi");

        vm.recordLogs();
        vm.prank(seller1);
        coordinator.attestAsSeller(c, rootHash, GHG_SCHEMA, 1, ipfsRef);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 attSig = keccak256("Attestation(bytes32,bytes32,address,bytes32,uint8,bytes32)");
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == attSig) {
                (,, bytes32 contentRef) = abi.decode(logs[i].data, (bytes32, uint8, bytes32));
                assertEq(contentRef, ipfsRef, "content ref matches");
                return;
            }
        }
        fail("Attestation event not found");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 12: Constructor rejects zero address
    // ═══════════════════════════════════════════════════════════════

    function test_constructor_zeroAddress_reverts() public {
        vm.expectRevert("ZeroAddress");
        new AttestationCoordinator(address(0));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 13: Seller attestation on resolved order still works
    // ═══════════════════════════════════════════════════════════════

    function test_sellerAttestation_resolvedOrder() public {
        (bytes32 processId, bytes32 rootHash, CommitmentTypes.Commitment memory c) = _commitRoot(50 ether, 1);

        // Resolve the process
        CommitmentTypes.Commitment[] memory cs = new CommitmentTypes.Commitment[](1);
        cs[0] = c;
        vm.prank(buyer);
        core.resolveProcess(processId, cs);

        // Seller can still attest after resolution (orderStatus == 2 != 0)
        vm.prank(seller1);
        coordinator.attestAsSeller(c, rootHash, LIFECYCLE_SCHEMA, 10, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 14: Buyer attestation on resolved order still works
    // ═══════════════════════════════════════════════════════════════

    function test_buyerAttestation_resolvedOrder() public {
        (bytes32 processId, bytes32 rootHash, CommitmentTypes.Commitment memory c) = _commitRoot(50 ether, 1);

        CommitmentTypes.Commitment[] memory cs = new CommitmentTypes.Commitment[](1);
        cs[0] = c;
        vm.prank(buyer);
        core.resolveProcess(processId, cs);

        vm.prank(buyer);
        coordinator.attestAsBuyer(processId, rootHash, LIFECYCLE_SCHEMA, 10, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 15: Resolver attestation for unknown commitment reverts
    // ═══════════════════════════════════════════════════════════════

    function test_resolverAttestation_unknownCommitment_reverts() public {
        CommitmentTypes.Commitment memory fake = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller1,
            currency: address(token),
            payment: 50 ether,
            expectedCumulativeValue: 50 ether,
            agreementHash: keccak256("fake-resolver"),
            salt: 777,
            deadline: block.timestamp + 1 hours
        });

        vm.prank(seller2);
        vm.expectRevert(AttestationCoordinator.UnknownOrder.selector);
        coordinator.attestViaResolver(fake, LIFECYCLE_SCHEMA, 3, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 16: Cross-order seller attestation with unknown target order reverts
    // ═══════════════════════════════════════════════════════════════

    function test_crossOrderAttestation_unknownTarget_reverts() public {
        // Commit a valid root order — seller1 is the seller
        (,, CommitmentTypes.Commitment memory c) = _commitRoot(10 ether, 1);

        bytes32 fakeTargetHash = keccak256("nonexistent-target-order");

        // seller1 attests on fakeTargetHash, proving role via their valid commitment
        vm.prank(seller1);
        vm.expectRevert(AttestationCoordinator.UnknownOrder.selector);
        coordinator.attestAsSeller(c, fakeTargetHash, LIFECYCLE_SCHEMA, 1, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 17: Buyer attestation from non-buyer on valid process reverts
    // ═══════════════════════════════════════════════════════════════

    function test_buyerAttestation_nonBuyer_validProcess_reverts() public {
        (bytes32 processId, bytes32 rootHash,) = _commitRoot(50 ether, 1);

        // seller1 tries to attest as buyer on a process where buyer is the root buyer
        vm.prank(seller1);
        vm.expectRevert(AttestationCoordinator.NotAuthorized.selector);
        coordinator.attestAsBuyer(processId, rootHash, LIFECYCLE_SCHEMA, 1, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 18: Buyer attestation with unknown order hash on valid process reverts
    // ═══════════════════════════════════════════════════════════════

    function test_buyerAttestation_unknownOrderHash_reverts() public {
        (bytes32 processId,,) = _commitRoot(50 ether, 1);

        bytes32 fakeOrderHash = keccak256("nonexistent-order-in-process");

        // buyer is correct, process is correct, but order hash doesn't exist
        vm.prank(buyer);
        vm.expectRevert(AttestationCoordinator.UnknownOrder.selector);
        coordinator.attestAsBuyer(processId, fakeOrderHash, LIFECYCLE_SCHEMA, 1, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 19: Buyer attestation across processes reverts
    // ═══════════════════════════════════════════════════════════════

    function test_buyerAttestation_crossProcess_reverts() public {
        (bytes32 processIdA,,) = _commitRoot(50 ether, 1);
        (, bytes32 rootHashB,) = _commitRoot(25 ether, 2);

        vm.prank(buyer);
        vm.expectRevert(AttestationCoordinator.ProcessMismatch.selector);
        coordinator.attestAsBuyer(processIdA, rootHashB, LIFECYCLE_SCHEMA, 1, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 20: Full figaro-eats lifecycle with SchemaRegistry
    //
    // Verifies that all 5 delivery lifecycle stages can be attested
    // with properly registered schema IDs, and that the AttestationCoordinator
    // has been wired as the declaring mechanism for each attestation schema.
    //
    // Roles:
    //   seller1 = restaurant (stages 0–1, root order)
    //   seller2 = driver     (stages 2–4, cross-order via sub-order)
    // ═══════════════════════════════════════════════════════════════

    function test_eatsFull_lifecycleWithSchema() public {
        // ── Schema registry invariants ────────────────────────────
        assertTrue(schemas.registered(LIFECYCLE_SCHEMA), "lifecycle schema registered");
        assertTrue(schemas.registered(PROXIMITY_SCHEMA), "proximity schema registered");
        assertTrue(schemas.registered(GHG_SCHEMA), "ghg schema registered");
        assertTrue(schemas.registered(COMMERCE_SCHEMA), "commerce schema registered");
        assertTrue(schemas.registered(HANDOFF_SCHEMA), "handoff schema registered");

        // ── Process setup ─────────────────────────────────────────
        // Root order: buyer → seller1 (restaurant, 50 ETH payment)
        (bytes32 processId, bytes32 rootHash, CommitmentTypes.Commitment memory rootC) = _commitRoot(50 ether, 10);

        // Delivery sub-order: buyer → seller2 (driver, 10 ETH fee)
        (, CommitmentTypes.Commitment memory driverC) =
            _commitSub(processId, seller2, 10 ether, 60 ether, SELLER2_KEY, 11);

        bytes32 attSig = keccak256("Attestation(bytes32,bytes32,address,bytes32,uint8,bytes32)");

        // ── Stage 0: PreparationStarted (restaurant) ─────────────
        vm.prank(seller1);
        coordinator.attestAsSeller(rootC, rootHash, LIFECYCLE_SCHEMA, 0, bytes32(0));

        // ── Stage 1: ReadyForPickup (restaurant) ──────────────────
        vm.prank(seller1);
        coordinator.attestAsSeller(rootC, rootHash, LIFECYCLE_SCHEMA, 1, bytes32(0));

        // ── Stage 2: DriverEnRoute (driver, cross-order) ──────────
        vm.prank(seller2);
        coordinator.attestAsSeller(driverC, rootHash, LIFECYCLE_SCHEMA, 2, bytes32(0));

        // ── Stage 3: PickedUp (driver) + proximity proof (BLE) ────
        bytes32 pickupProofRef = keccak256("pickup-proximity-proof-band-2");
        vm.prank(seller2);
        coordinator.attestAsSeller(driverC, rootHash, PROXIMITY_SCHEMA, 2, pickupProofRef);
        vm.prank(seller2);
        coordinator.attestAsSeller(driverC, rootHash, LIFECYCLE_SCHEMA, 3, pickupProofRef);

        // ── Stage 4: Delivered (driver) + proximity proof (NFC) ───
        bytes32 deliveryProofRef = keccak256("delivery-proximity-proof-band-3");
        vm.prank(seller2);
        coordinator.attestAsSeller(driverC, rootHash, PROXIMITY_SCHEMA, 3, deliveryProofRef);

        vm.recordLogs();
        vm.prank(seller2);
        coordinator.attestAsSeller(driverC, rootHash, LIFECYCLE_SCHEMA, 4, deliveryProofRef);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // ── Verify final Delivered attestation event ───────────────
        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == attSig) {
                assertEq(logs[i].topics[1], rootHash, "orderHash");
                assertEq(logs[i].topics[2], bytes32(processId), "processId");
                assertEq(logs[i].topics[3], bytes32(uint256(uint160(seller2))), "driver as attester");
                (bytes32 schemaId, uint8 stage, bytes32 contentRef) =
                    abi.decode(logs[i].data, (bytes32, uint8, bytes32));
                assertEq(schemaId, LIFECYCLE_SCHEMA, "registered delivery lifecycle schema");
                assertEq(stage, 4, "stage Delivered");
                assertEq(contentRef, deliveryProofRef, "proximity proof ref");
                found = true;
            }
        }
        assertTrue(found, "Delivered attestation event emitted");
    }
}
