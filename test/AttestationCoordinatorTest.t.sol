// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FigaroCore.sol";
import "../src/CommitmentTypes.sol";
import "../src/AttestationCoordinator.sol";
import "../src/ClauseRegistry.sol";
import "../src/IRoleResolver.sol";
import "../src/IClauseValidator.sol";
import "../src/mocks/MockPermitToken.sol";
import {AgreementTestHelper} from "./helpers/AgreementTestHelper.sol";

/// @dev Permissive test validator — implements IClauseValidator for a given
///      clauseId and accepts any content. Used only in these tests to isolate
///      coordinator semantics from per-clause validation rules. Production
///      validators live in src/clauseValidators/.
contract PermissiveTestValidator is IClauseValidator {
    bytes32 public immutable override clauseId;
    error ClauseIdMismatch(bytes32 got, bytes32 expected);
    constructor(bytes32 _clauseId) {
        clauseId = _clauseId;
    }
    function validate(
        bytes32 id,
        uint8, /* stage */
        bytes calldata, /* sectionData */
        bytes calldata /* content */
    ) external view override {
        // Test mock uses `view` because Solidity treats reading the
        // constructor-set `immutable clauseId` as a state read. Production
        // validators in src/clauseValidators/ are `external pure override`
        // because they decode against compile-time `constant` clauseIds —
        // see IClauseValidator NatSpec for the discipline.
        if (id != clauseId) revert ClauseIdMismatch(id, clauseId);
    }
}

/// @title AttestationCoordinatorTest
/// @notice Tests for the rewritten zero-storage attestation coordinator.
///         Covers: seller/buyer attestation, unauthorized callers, cross-order
///         attestation, resolver delegation, unknown order, contentRef emission,
///         constructor zero address.
contract AttestationCoordinatorTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore core;
    AttestationCoordinator coordinator;
    ClauseRegistry clauses;
    MockPermitToken token;

    uint256 constant BUYER_KEY = 0xB0B;
    uint256 constant SELLER1_KEY = 0x5E11;
    uint256 constant SELLER2_KEY = 0x5E12;

    address buyer;
    address seller1;
    address seller2;

    uint256 constant INITIAL_BALANCE = 10_000 ether;

    string constant LIFECYCLE_CLAUSE_ID = "figaro-courier-process-v1";
    string constant GHG_CLAUSE_ID = "figaro-ghg-iso-14064-v1";
    string constant PROXIMITY_CLAUSE_ID = "figaro-proximity-proof-v1";
    string constant COMMERCE_CLAUSE_ID = "figaro-commerce-v1";
    string constant FULFILMENT_CLAUSE_ID = "figaro-fulfilment-v2";

    bytes32 constant LIFECYCLE_CLAUSE = keccak256("figaro-courier-process-v1");
    bytes32 constant GHG_CLAUSE = keccak256("figaro-ghg-iso-14064-v1");
    bytes32 constant PROXIMITY_CLAUSE = keccak256("figaro-proximity-proof-v1");
    bytes32 constant COMMERCE_CLAUSE = keccak256("figaro-commerce-v1");
    bytes32 constant FULFILMENT_CLAUSE = keccak256("figaro-fulfilment-v2");

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

        // ── ClauseRegistry: register all local-commerce clauses ────────
        clauses = new ClauseRegistry();
        bytes32 testContentHash = keccak256("spec-json");
        string memory testUri = "ipfs://figaro-test-uri";
        bytes32 testFamily = keccak256("test-family");
        clauses.registerClause(LIFECYCLE_CLAUSE_ID, 1, testContentHash, testUri, testFamily);
        clauses.registerClause(GHG_CLAUSE_ID, 1, testContentHash, testUri, testFamily);
        clauses.registerClause(PROXIMITY_CLAUSE_ID, 1, testContentHash, testUri, testFamily);
        clauses.registerClause(COMMERCE_CLAUSE_ID, 1, testContentHash, testUri, testFamily);
        clauses.registerClause(FULFILMENT_CLAUSE_ID, 1, testContentHash, testUri, testFamily);

        // ── AttestationCoordinator: register a permissive validator for each clause ─
        // Production deployments register the real per-clause validators from
        // src/clauseValidators/. These tests isolate coordinator semantics, so
        // they use PermissiveTestValidator (accepts any content).
        coordinator.setValidator(LIFECYCLE_CLAUSE, address(new PermissiveTestValidator(LIFECYCLE_CLAUSE)));
        coordinator.setValidator(GHG_CLAUSE,       address(new PermissiveTestValidator(GHG_CLAUSE)));
        coordinator.setValidator(PROXIMITY_CLAUSE, address(new PermissiveTestValidator(PROXIMITY_CLAUSE)));
        coordinator.setValidator(COMMERCE_CLAUSE,  address(new PermissiveTestValidator(COMMERCE_CLAUSE)));
        coordinator.setValidator(FULFILMENT_CLAUSE, address(new PermissiveTestValidator(FULFILMENT_CLAUSE)));

        // AttestationCoordinator declares which clauses it uses.
        // In production this is called from the deploy script (post-audit amendment);
        // in tests we use vm.prank to simulate the coordinator calling setMechanismClause.
        vm.startPrank(address(coordinator));
        clauses.setMechanismClause(LIFECYCLE_CLAUSE);
        clauses.setMechanismClause(GHG_CLAUSE);
        clauses.setMechanismClause(PROXIMITY_CLAUSE);
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

    function _rootCommitment(uint256 payment, uint256 salt, bytes32 agreementHash)
        internal
        view
        returns (CommitmentTypes.Commitment memory)
    {
        return CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller1,
            currency: address(token),
            payment: payment,
            expectedCumulativeValue: payment,
            agreementHash: agreementHash,
            salt: salt,
            deadline: block.timestamp + 1 hours
        });
    }

    function _commitRoot(uint256 payment, uint256 salt, bytes32 agreementHash)
        internal
        returns (bytes32 processId, bytes32 orderHash, CommitmentTypes.Commitment memory c)
    {
        c = _rootCommitment(payment, salt, agreementHash);
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
        uint256 salt,
        bytes32 agreementHash
    ) internal returns (bytes32 orderHash, CommitmentTypes.Commitment memory c) {
        c = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller,
            currency: address(token),
            payment: payment,
            expectedCumulativeValue: expectedCum,
            agreementHash: agreementHash,
            salt: salt,
            deadline: block.timestamp + 1 hours
        });
        bytes memory buyerSig = _signCommitment(c, BUYER_KEY);
        bytes memory sellerSig = _signCommitment(c, sellerKey);
        (, orderHash) = core.commit(c, buyerSig, sellerSig);
    }

    /// @dev Shortcut: commit a root order whose agreement is a single clause
    ///      under `clauseId` with `sectionData`. The resulting commitment's
    ///      `agreementHash` equals `leafFor(clauseId, sectionData)`, which is
    ///      a valid single-leaf merkle tree — attestations use `sectionData`
    ///      plus an empty proof.
    function _commitRootSingle(
        uint256 payment,
        uint256 salt,
        bytes32 clauseIdLocal,
        bytes memory sectionData
    ) internal returns (bytes32 processId, bytes32 orderHash, CommitmentTypes.Commitment memory c) {
        return _commitRoot(payment, salt, AgreementTestHelper.singleSectionRoot(clauseIdLocal, sectionData));
    }

    /// @dev Shortcut: commit a sub-order whose agreement is a single clause.
    function _commitSubSingle(
        bytes32 processId,
        address seller,
        uint256 payment,
        uint256 expectedCum,
        uint256 sellerKey,
        uint256 salt,
        bytes32 clauseIdLocal,
        bytes memory sectionData
    ) internal returns (bytes32 orderHash, CommitmentTypes.Commitment memory c) {
        return _commitSub(
            processId, seller, payment, expectedCum, sellerKey, salt,
            AgreementTestHelper.singleSectionRoot(clauseIdLocal, sectionData)
        );
    }

    /// @dev Empty proof sentinel — single-leaf agreements have empty proof arrays.
    function _emptyProof() internal pure returns (bytes32[] memory) {
        return new bytes32[](0);
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 1: Seller attests a lifecycle stage
    // ═══════════════════════════════════════════════════════════════

    function test_sellerAttestation_lifecycle() public {
        (bytes32 processId, bytes32 rootHash, CommitmentTypes.Commitment memory c) =
            _commitRootSingle(50 ether, 1, LIFECYCLE_CLAUSE, "");

        vm.recordLogs();
        vm.prank(seller1);
        coordinator.attestAsSeller(c, c, LIFECYCLE_CLAUSE, 1, "", _emptyProof(), "");
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 attSig = keccak256("Attestation(bytes32,bytes32,address,bytes32,uint8,bytes32)");
        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == attSig) {
                assertEq(logs[i].topics[1], rootHash, "indexed orderHash");
                assertEq(logs[i].topics[2], processId, "indexed processId");
                assertEq(logs[i].topics[3], bytes32(uint256(uint160(seller1))), "indexed attester");

                (bytes32 clauseId, uint8 stage, bytes32 contentRef) =
                    abi.decode(logs[i].data, (bytes32, uint8, bytes32));
                assertEq(clauseId, LIFECYCLE_CLAUSE, "clauseId");
                assertEq(stage, 1, "stage");
                assertEq(contentRef, keccak256(""), "contentRef is keccak256 of empty content");
                found = true;
            }
        }
        assertTrue(found, "Attestation event found");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 2: Seller attests GHG disclosure (different clause)
    // ═══════════════════════════════════════════════════════════════

    function test_sellerAttestation_ghgDisclosure() public {
        (, , CommitmentTypes.Commitment memory c) = _commitRootSingle(50 ether, 1, GHG_CLAUSE, "");

        bytes memory ipfsCidContent = "QmSomeIpfsCid";

        vm.prank(seller1);
        coordinator.attestAsSeller(c, c, GHG_CLAUSE, 2, "", _emptyProof(), ipfsCidContent);
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 3: Buyer attests
    // ═══════════════════════════════════════════════════════════════

    function test_buyerAttestation() public {
        (, , CommitmentTypes.Commitment memory c) = _commitRootSingle(50 ether, 1, LIFECYCLE_CLAUSE, "");

        vm.prank(buyer);
        coordinator.attestAsBuyer(c, LIFECYCLE_CLAUSE, 5, "", _emptyProof(), "");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 4: Unauthorized seller reverts
    // ═══════════════════════════════════════════════════════════════

    function test_unauthorizedSeller_reverts() public {
        (, , CommitmentTypes.Commitment memory c) = _commitRootSingle(50 ether, 1, LIFECYCLE_CLAUSE, "");

        vm.prank(buyer); // buyer tries to attest as seller
        vm.expectRevert(AttestationCoordinator.NotAuthorized.selector);
        coordinator.attestAsSeller(c, c, LIFECYCLE_CLAUSE, 1, "", _emptyProof(), "");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 5: Unauthorized buyer reverts
    // ═══════════════════════════════════════════════════════════════

    function test_unauthorizedBuyer_reverts() public {
        (, , CommitmentTypes.Commitment memory c) = _commitRootSingle(50 ether, 1, LIFECYCLE_CLAUSE, "");

        vm.prank(seller1); // seller tries to attest as buyer
        vm.expectRevert(AttestationCoordinator.NotAuthorized.selector);
        coordinator.attestAsBuyer(c, LIFECYCLE_CLAUSE, 1, "", _emptyProof(), "");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 6: Cross-order attestation within same process
    // ═══════════════════════════════════════════════════════════════

    function test_crossOrderAttestation_sameProcess() public {
        // Root and sub-order each commit under a single-section LIFECYCLE
        // agreement so a lifecycle attestation against either has a valid
        // inclusion proof from the respective commitment.
        bytes32 agHash = AgreementTestHelper.singleSectionRoot(LIFECYCLE_CLAUSE, "");
        (bytes32 processId, , CommitmentTypes.Commitment memory rootC) = _commitRoot(10 ether, 1, agHash);
        (, CommitmentTypes.Commitment memory subC) =
            _commitSub(processId, seller2, 20 ether, 30 ether, SELLER2_KEY, 2, agHash);

        // seller2 attests ON the root order, using their subC as role proof.
        vm.prank(seller2);
        coordinator.attestAsSeller(subC, rootC, LIFECYCLE_CLAUSE, 3, "", _emptyProof(), "");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 6B: Cross-order seller attestation across processes reverts
    // ═══════════════════════════════════════════════════════════════

    function test_crossOrderAttestation_crossProcess_reverts() public {
        bytes32 agHash = AgreementTestHelper.singleSectionRoot(LIFECYCLE_CLAUSE, "");
        (, bytes32 rootHashA, CommitmentTypes.Commitment memory rootA) = _commitRoot(10 ether, 1, agHash);
        (, bytes32 rootHashB, CommitmentTypes.Commitment memory rootB) = _commitRoot(20 ether, 2, agHash);

        assertTrue(rootHashA != rootHashB, "distinct orders");

        // seller1 is the seller of both root orders but they belong to distinct
        // processes — the coordinator must refuse cross-process attestation.
        vm.prank(seller1);
        vm.expectRevert(AttestationCoordinator.ProcessMismatch.selector);
        coordinator.attestAsSeller(rootA, rootB, LIFECYCLE_CLAUSE, 3, "", _emptyProof(), "");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 7: Resolver attestation (mock)
    // ═══════════════════════════════════════════════════════════════

    function test_resolverAttestation() public {
        (,, CommitmentTypes.Commitment memory c) = _commitRootSingle(50 ether, 1, LIFECYCLE_CLAUSE, "");

        // Mock seller1 as a resolver that authorizes seller2
        vm.mockCall(seller1, abi.encodeWithSelector(IRoleResolver.isAuthorized.selector), abi.encode(true));

        vm.prank(seller2);
        coordinator.attestViaResolver(c, LIFECYCLE_CLAUSE, 3, "", _emptyProof(), "");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 8: Resolver rejects unauthorized caller
    // ═══════════════════════════════════════════════════════════════

    function test_resolverAttestation_unauthorized_reverts() public {
        (,, CommitmentTypes.Commitment memory c) = _commitRootSingle(50 ether, 1, LIFECYCLE_CLAUSE, "");

        vm.mockCall(seller1, abi.encodeWithSelector(IRoleResolver.isAuthorized.selector), abi.encode(false));

        vm.prank(seller2);
        vm.expectRevert(AttestationCoordinator.NotAuthorized.selector);
        coordinator.attestViaResolver(c, LIFECYCLE_CLAUSE, 3, "", _emptyProof(), "");
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

        vm.prank(seller1);
        vm.expectRevert(AttestationCoordinator.UnknownOrder.selector);
        coordinator.attestAsSeller(fake, fake, LIFECYCLE_CLAUSE, 1, "", _emptyProof(), "");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 10: Unknown order reverts (buyer)
    // ═══════════════════════════════════════════════════════════════

    function test_unknownOrder_buyer_reverts() public {
        // Craft a commitment that was never committed — _requireKnownCommitment
        // reverts UnknownOrder before the buyer role check runs.
        CommitmentTypes.Commitment memory fake = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller1,
            currency: address(token),
            payment: 50 ether,
            expectedCumulativeValue: 50 ether,
            agreementHash: keccak256("fake-buyer"),
            salt: 998,
            deadline: block.timestamp + 1 hours
        });

        vm.prank(buyer);
        vm.expectRevert(AttestationCoordinator.UnknownOrder.selector);
        coordinator.attestAsBuyer(fake, LIFECYCLE_CLAUSE, 1, "", _emptyProof(), "");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 11: ContentRef is emitted correctly
    // ═══════════════════════════════════════════════════════════════

    function test_contentRef_emitted() public {
        (, , CommitmentTypes.Commitment memory c) = _commitRootSingle(50 ether, 1, GHG_CLAUSE, "");

        bytes memory ipfsContent = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
        bytes32 ipfsRef = keccak256(ipfsContent);

        vm.recordLogs();
        vm.prank(seller1);
        coordinator.attestAsSeller(c, c, GHG_CLAUSE, 1, "", _emptyProof(), ipfsContent);
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
        (bytes32 processId, , CommitmentTypes.Commitment memory c) =
            _commitRootSingle(50 ether, 1, LIFECYCLE_CLAUSE, "");

        // Resolve the process
        CommitmentTypes.Commitment[] memory cs = new CommitmentTypes.Commitment[](1);
        cs[0] = c;
        vm.prank(buyer);
        core.resolveProcess(processId, cs);

        // Seller can still attest after resolution (orderStatus == 2 != 0)
        vm.prank(seller1);
        coordinator.attestAsSeller(c, c, LIFECYCLE_CLAUSE, 10, "", _emptyProof(), "");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 14: Buyer attestation on resolved order still works
    // ═══════════════════════════════════════════════════════════════

    function test_buyerAttestation_resolvedOrder() public {
        (bytes32 processId, , CommitmentTypes.Commitment memory c) =
            _commitRootSingle(50 ether, 1, LIFECYCLE_CLAUSE, "");

        CommitmentTypes.Commitment[] memory cs = new CommitmentTypes.Commitment[](1);
        cs[0] = c;
        vm.prank(buyer);
        core.resolveProcess(processId, cs);

        vm.prank(buyer);
        coordinator.attestAsBuyer(c, LIFECYCLE_CLAUSE, 10, "", _emptyProof(), "");
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
        coordinator.attestViaResolver(fake, LIFECYCLE_CLAUSE, 3, "", _emptyProof(), "");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 16: Cross-order seller attestation with unknown target order reverts
    // ═══════════════════════════════════════════════════════════════

    function test_crossOrderAttestation_unknownTarget_reverts() public {
        // Commit a valid root order — seller1 is the seller
        (,, CommitmentTypes.Commitment memory c) = _commitRootSingle(10 ether, 1, LIFECYCLE_CLAUSE, "");

        // Craft a target commitment that was never committed — _requireKnownCommitment
        // reverts UnknownOrder on the target leg before role checks run.
        CommitmentTypes.Commitment memory fakeTarget = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller1,
            currency: address(token),
            payment: 1 ether,
            expectedCumulativeValue: 1 ether,
            agreementHash: keccak256("never-committed-target"),
            salt: 42,
            deadline: block.timestamp + 1 hours
        });

        vm.prank(seller1);
        vm.expectRevert(AttestationCoordinator.UnknownOrder.selector);
        coordinator.attestAsSeller(c, fakeTarget, LIFECYCLE_CLAUSE, 1, "", _emptyProof(), "");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 17: Buyer attestation from non-buyer on valid process reverts
    // ═══════════════════════════════════════════════════════════════

    function test_buyerAttestation_nonBuyer_validProcess_reverts() public {
        (, , CommitmentTypes.Commitment memory c) = _commitRootSingle(50 ether, 1, LIFECYCLE_CLAUSE, "");

        // seller1 tries to attest as buyer — they are not the commitment's buyer.
        vm.prank(seller1);
        vm.expectRevert(AttestationCoordinator.NotAuthorized.selector);
        coordinator.attestAsBuyer(c, LIFECYCLE_CLAUSE, 1, "", _emptyProof(), "");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 18: Buyer attestation with unknown order hash on valid process reverts
    // ═══════════════════════════════════════════════════════════════

    function test_buyerAttestation_unknownOrderHash_reverts() public {
        // Buyer passes a commitment struct that was never committed; _requireKnownCommitment
        // reverts UnknownOrder. (Under the new symmetric design "wrong-order-in-valid-process"
        // becomes "uncommitted-commitment" — there is no separate processId/orderHash split.)
        _commitRootSingle(50 ether, 1, LIFECYCLE_CLAUSE, ""); // anchor a real process for good measure

        CommitmentTypes.Commitment memory fake = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller1,
            currency: address(token),
            payment: 50 ether,
            expectedCumulativeValue: 50 ether,
            agreementHash: keccak256("nonexistent-order-in-process"),
            salt: 666,
            deadline: block.timestamp + 1 hours
        });

        vm.prank(buyer);
        vm.expectRevert(AttestationCoordinator.UnknownOrder.selector);
        coordinator.attestAsBuyer(fake, LIFECYCLE_CLAUSE, 1, "", _emptyProof(), "");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 19: Buyer attestation across processes is no longer a distinct
    // failure mode — the new symmetric design authorizes purely on
    // `msg.sender == target.buyer`. A buyer trying to attest under a
    // commitment they did not buy simply triggers `NotAuthorized`; there is
    // no separate cross-process check because target is self-contained.
    // ═══════════════════════════════════════════════════════════════

    function test_buyerAttestation_crossProcess_reverts() public {
        // Anchor one process for `buyer`.
        _commitRootSingle(50 ether, 1, LIFECYCLE_CLAUSE, "");

        // A committed order in a different process with a different buyer address
        // (seller1 as buyer — irrelevant because the fake isn't committed here).
        address otherBuyer = seller1;
        CommitmentTypes.Commitment memory c2 = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: otherBuyer,
            seller: seller2,
            currency: address(token),
            payment: 25 ether,
            expectedCumulativeValue: 25 ether,
            agreementHash: AgreementTestHelper.singleSectionRoot(LIFECYCLE_CLAUSE, ""),
            salt: 2,
            deadline: block.timestamp + 1 hours
        });
        bytes memory bs = _signCommitment(c2, SELLER1_KEY);  // seller1 acts as buyer here
        bytes memory ss = _signCommitment(c2, SELLER2_KEY);
        core.commit(c2, bs, ss);

        // `buyer` (from our setUp) is NOT c2.buyer, so the call must revert NotAuthorized.
        vm.prank(buyer);
        vm.expectRevert(AttestationCoordinator.NotAuthorized.selector);
        coordinator.attestAsBuyer(c2, LIFECYCLE_CLAUSE, 1, "", _emptyProof(), "");
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 20: Full local-commerce lifecycle with ClauseRegistry
    //
    // Verifies that all 5 delivery lifecycle stages can be attested
    // with properly registered clause IDs, and that the AttestationCoordinator
    // has been wired as the declaring mechanism for each attestation clause.
    //
    // Roles:
    //   seller1 = restaurant (stages 0–1, root order)
    //   seller2 = driver     (stages 2–4, cross-order via sub-order)
    // ═══════════════════════════════════════════════════════════════

    function test_eatsFull_lifecycleWithClause() public {
        // ── Clause registry invariants ────────────────────────────
        assertTrue(clauses.registered(LIFECYCLE_CLAUSE), "lifecycle clause registered");
        assertTrue(clauses.registered(PROXIMITY_CLAUSE), "proximity clause registered");
        assertTrue(clauses.registered(GHG_CLAUSE), "ghg clause registered");
        assertTrue(clauses.registered(COMMERCE_CLAUSE), "commerce clause registered");
        assertTrue(clauses.registered(FULFILMENT_CLAUSE), "fulfilment clause registered");

        // ── Multi-section agreement ───────────────────────────────
        // Both root and driver commitments use the same two-clause agreement:
        // one LIFECYCLE clause (empty) and one PROXIMITY clause (empty). The
        // merkle root is the agreementHash both parties sign at commit time;
        // each attestation carries the other leaf as its inclusion proof.
        bytes32 lifecycleLeaf = AgreementTestHelper.leafFor(LIFECYCLE_CLAUSE, "");
        bytes32 proximityLeaf = AgreementTestHelper.leafFor(PROXIMITY_CLAUSE, "");
        bytes32[] memory leaves = new bytes32[](2);
        leaves[0] = lifecycleLeaf;
        leaves[1] = proximityLeaf;
        bytes32 agreementRoot = AgreementTestHelper.rootFor(leaves);

        bytes32[] memory proofLifecycle = AgreementTestHelper.proofFor(leaves, 0);
        bytes32[] memory proofProximity = AgreementTestHelper.proofFor(leaves, 1);

        // ── Process setup ─────────────────────────────────────────
        (bytes32 processId, bytes32 rootHash, CommitmentTypes.Commitment memory rootC) =
            _commitRoot(50 ether, 10, agreementRoot);
        (, CommitmentTypes.Commitment memory driverC) =
            _commitSub(processId, seller2, 10 ether, 60 ether, SELLER2_KEY, 11, agreementRoot);

        bytes32 attSig = keccak256("Attestation(bytes32,bytes32,address,bytes32,uint8,bytes32)");

        // ── Stage 0: PreparationStarted (restaurant) ─────────────
        vm.prank(seller1);
        coordinator.attestAsSeller(rootC, rootC, LIFECYCLE_CLAUSE, 0, "", proofLifecycle, "");

        // ── Stage 1: ReadyForPickup (restaurant) ──────────────────
        vm.prank(seller1);
        coordinator.attestAsSeller(rootC, rootC, LIFECYCLE_CLAUSE, 1, "", proofLifecycle, "");

        // ── Stage 2: CourierEnRoute (courier, cross-order against root) ───
        vm.prank(seller2);
        coordinator.attestAsSeller(driverC, rootC, LIFECYCLE_CLAUSE, 2, "", proofLifecycle, "");

        // ── Stage 3: PickedUp (driver) + proximity proof (BLE) ────
        bytes memory pickupProofContent = "pickup-proximity-proof-band-2";
        vm.prank(seller2);
        coordinator.attestAsSeller(driverC, rootC, PROXIMITY_CLAUSE, 2, "", proofProximity, pickupProofContent);
        vm.prank(seller2);
        coordinator.attestAsSeller(driverC, rootC, LIFECYCLE_CLAUSE, 3, "", proofLifecycle, pickupProofContent);

        // ── Stage 4: Delivered (driver) + proximity proof (NFC) ───
        bytes memory deliveryProofContent = "delivery-proximity-proof-band-3";
        bytes32 deliveryProofRef = keccak256(deliveryProofContent);
        vm.prank(seller2);
        coordinator.attestAsSeller(driverC, rootC, PROXIMITY_CLAUSE, 3, "", proofProximity, deliveryProofContent);

        vm.recordLogs();
        vm.prank(seller2);
        coordinator.attestAsSeller(driverC, rootC, LIFECYCLE_CLAUSE, 4, "", proofLifecycle, deliveryProofContent);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // ── Verify final Delivered attestation event ───────────────
        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == attSig) {
                assertEq(logs[i].topics[1], rootHash, "orderHash");
                assertEq(logs[i].topics[2], bytes32(processId), "processId");
                assertEq(logs[i].topics[3], bytes32(uint256(uint160(seller2))), "driver as attester");
                (bytes32 clauseId, uint8 stage, bytes32 contentRef) =
                    abi.decode(logs[i].data, (bytes32, uint8, bytes32));
                assertEq(clauseId, LIFECYCLE_CLAUSE, "registered delivery lifecycle clause");
                assertEq(stage, 4, "stage Delivered");
                assertEq(contentRef, deliveryProofRef, "proximity proof ref");
                found = true;
            }
        }
        assertTrue(found, "Delivered attestation event emitted");
    }

    // ═══════════════════════════════════════════════════════════════
    // Validator-gate tests (Layer C on-chain validation)
    // ═══════════════════════════════════════════════════════════════

    bytes32 constant UNUSED_CLAUSE = keccak256("figaro-never-registered-v1");

    function test_setValidator_rejectsZeroAddress() public {
        vm.expectRevert(AttestationCoordinator.ZeroValidator.selector);
        coordinator.setValidator(UNUSED_CLAUSE, address(0));
    }

    function test_setValidator_rejectsAlreadySet() public {
        // LIFECYCLE_CLAUSE validator is already set in setUp()
        PermissiveTestValidator v = new PermissiveTestValidator(LIFECYCLE_CLAUSE);
        vm.expectRevert(abi.encodeWithSelector(
            AttestationCoordinator.ValidatorAlreadySet.selector, LIFECYCLE_CLAUSE
        ));
        coordinator.setValidator(LIFECYCLE_CLAUSE, address(v));
    }

    function test_setValidator_rejectsMismatchedBinding() public {
        // Validator claims it handles UNUSED_CLAUSE, but we try to register under a different ID.
        PermissiveTestValidator v = new PermissiveTestValidator(UNUSED_CLAUSE);
        bytes32 differentId = keccak256("figaro-yet-another-v1");
        vm.expectRevert(abi.encodeWithSelector(
            AttestationCoordinator.InvalidValidatorBinding.selector, differentId, UNUSED_CLAUSE
        ));
        coordinator.setValidator(differentId, address(v));
    }

    function test_setValidator_happyPath() public {
        PermissiveTestValidator v = new PermissiveTestValidator(UNUSED_CLAUSE);
        coordinator.setValidator(UNUSED_CLAUSE, address(v));
        assertEq(coordinator.clauseValidator(UNUSED_CLAUSE), address(v));
    }

    function test_attestAsSeller_revertsOnUnregisteredClause() public {
        // ValidatorNotSet fires before merkle-proof check, so agreementHash is
        // irrelevant — any commit works.
        (, , CommitmentTypes.Commitment memory c) = _commitRootSingle(1 ether, 1, LIFECYCLE_CLAUSE, "");
        vm.prank(seller1);
        vm.expectRevert(abi.encodeWithSelector(
            AttestationCoordinator.ValidatorNotSet.selector, UNUSED_CLAUSE
        ));
        coordinator.attestAsSeller(c, c, UNUSED_CLAUSE, 1, "", _emptyProof(), "");
    }

    function test_attestAsBuyer_revertsOnUnregisteredClause() public {
        (, , CommitmentTypes.Commitment memory c) = _commitRootSingle(1 ether, 2, LIFECYCLE_CLAUSE, "");
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(
            AttestationCoordinator.ValidatorNotSet.selector, UNUSED_CLAUSE
        ));
        coordinator.attestAsBuyer(c, UNUSED_CLAUSE, 1, "", _emptyProof(), "");
    }

    function test_attestViaResolver_revertsOnUnregisteredClause() public {
        (,, CommitmentTypes.Commitment memory c) = _commitRootSingle(1 ether, 5, LIFECYCLE_CLAUSE, "");
        // Resolver would authorize the caller, but the validator gate fires first.
        vm.mockCall(seller1, abi.encodeWithSelector(IRoleResolver.isAuthorized.selector), abi.encode(true));
        vm.prank(seller2);
        vm.expectRevert(abi.encodeWithSelector(
            AttestationCoordinator.ValidatorNotSet.selector, UNUSED_CLAUSE
        ));
        coordinator.attestViaResolver(c, UNUSED_CLAUSE, 3, "", _emptyProof(), "");
    }

    function test_contentRefIsKeccakOfContent() public {
        (, , CommitmentTypes.Commitment memory c) = _commitRootSingle(1 ether, 3, LIFECYCLE_CLAUSE, "");
        bytes memory content = "arbitrary-content-bytes";
        bytes32 expected = keccak256(content);

        bytes32 attSig = keccak256("Attestation(bytes32,bytes32,address,bytes32,uint8,bytes32)");
        vm.recordLogs();
        vm.prank(seller1);
        coordinator.attestAsSeller(c, c, LIFECYCLE_CLAUSE, 1, "", _emptyProof(), content);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == attSig) {
                (, , bytes32 contentRef) = abi.decode(logs[i].data, (bytes32, uint8, bytes32));
                assertEq(contentRef, expected, "contentRef = keccak256(content)");
                found = true;
            }
        }
        assertTrue(found, "Attestation event emitted");
    }

    // Fuzz companion to test_contentRefIsKeccakOfContent — universal coverage
    // over content bytes. Complements the Certora rule 7 / 8 / 9 proofs
    // (see certora/AttestationCoordinator.spec) for the invariants that
    // can't be expressed as pure AC-level CVL rules without a mock-validator
    // scene.
    function testFuzz_contentRefIsKeccakOfContent(bytes calldata content) public {
        (, , CommitmentTypes.Commitment memory c) = _commitRootSingle(1 ether, 4, LIFECYCLE_CLAUSE, "");
        bytes32 expected = keccak256(content);

        bytes32 attSig = keccak256("Attestation(bytes32,bytes32,address,bytes32,uint8,bytes32)");
        vm.recordLogs();
        vm.prank(seller1);
        coordinator.attestAsSeller(c, c, LIFECYCLE_CLAUSE, 1, "", _emptyProof(), content);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == attSig) {
                (, , bytes32 contentRef) = abi.decode(logs[i].data, (bytes32, uint8, bytes32));
                assertEq(contentRef, expected, "contentRef = keccak256(content) for any content");
                found = true;
            }
        }
        assertTrue(found, "Attestation event emitted");
    }

    // Fuzz companion to test_setValidator_rejectsMismatchedBinding — every
    // pair (clauseId, boundId) with clauseId != boundId must revert with
    // InvalidValidatorBinding. Together with the Certora first-write-wins
    // rule (rule 8), this closes the binding-integrity half of the validator
    // gate.
    function testFuzz_setValidator_rejectsMismatchedBinding(
        bytes32 clauseId,
        bytes32 boundId
    ) public {
        vm.assume(clauseId != boundId);
        // Avoid colliding with the clauses pre-registered in setUp(); if clauseId
        // is already bound, the contract reverts with ValidatorAlreadySet before
        // ever reaching the binding check. That is a separate invariant
        // (Certora rule 8) and not what this fuzz targets.
        vm.assume(coordinator.clauseValidator(clauseId) == address(0));

        PermissiveTestValidator v = new PermissiveTestValidator(boundId);
        vm.expectRevert(abi.encodeWithSelector(
            AttestationCoordinator.InvalidValidatorBinding.selector, clauseId, boundId
        ));
        coordinator.setValidator(clauseId, address(v));
    }
}
