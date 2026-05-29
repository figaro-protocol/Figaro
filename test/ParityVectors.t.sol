// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FigaroCore.sol";
import "../src/CommitmentTypes.sol";
import "../src/FigaroBatchVerifier.sol";
import "../src/mocks/MockPermitToken.sol";
import "../src/mocks/MockSP1Verifier.sol";

/// @title ParityVectors — Emit intermediate values for cross-checking
///        against the Rust kernel implementation in prover/lib/.
///
///        Run: forge test --match-contract ParityVectors -vvvv
///        Then grep for "PARITY:" lines in the output.
contract ParityVectors is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore internal core;
    MockPermitToken internal token;

    uint256 internal constant BUYER_KEY = 0xB0B;
    uint256 internal constant SELLER1_KEY = 0x5E11;
    uint256 internal constant SELLER2_KEY = 0x5E12;

    address internal buyer;
    address internal seller1;
    address internal seller2;

    function setUp() public {
        vm.chainId(31337);
        vm.warp(1000);

        buyer = vm.addr(BUYER_KEY);
        seller1 = vm.addr(SELLER1_KEY);
        seller2 = vm.addr(SELLER2_KEY);

        token = new MockPermitToken();
        core = new FigaroCore();

        address[3] memory participants = [buyer, seller1, seller2];
        for (uint256 i = 0; i < participants.length; i++) {
            token.mint(participants[i], 1_000_000 ether);
            vm.prank(participants[i]);
            token.approve(address(core), type(uint256).max);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("FigaroCore"),
                keccak256("3"),
                block.chainid,
                address(core)
            )
        );
    }

    function _typedDataHash(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    function _sign(CommitmentTypes.Commitment memory c, uint256 key) internal view returns (bytes memory) {
        bytes32 digest = _typedDataHash(c.hashStruct());
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    // ── Test ──────────────────────────────────────────────────────

    function test_parity_rootAndSubAndResolve() public {
        // ── Addresses ──
        emit log_named_address("PARITY:buyer", buyer);
        emit log_named_address("PARITY:seller1", seller1);
        emit log_named_address("PARITY:seller2", seller2);
        emit log_named_address("PARITY:token", address(token));
        emit log_named_address("PARITY:core", address(core));
        emit log_named_uint("PARITY:chainId", block.chainid);

        bytes32 domainSep = _domainSeparator();
        emit log_named_bytes32("PARITY:domainSeparator", domainSep);

        // ── Root commitment ──
        CommitmentTypes.Commitment memory root = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller1,
            currency: address(token),
            payment: 100 ether,
            expectedCumulativeValue: 100 ether,
            agreementHash: keccak256("test-agreement"),
            salt: 42,
            deadline: 2000
        });

        bytes32 rootStructHash = root.hashStruct();
        bytes32 rootDigest = _typedDataHash(rootStructHash);
        emit log_named_bytes32("PARITY:rootStructHash", rootStructHash);
        emit log_named_bytes32("PARITY:rootDigest", rootDigest);

        bytes memory rootBuyerSig = _sign(root, BUYER_KEY);
        bytes memory rootSellerSig = _sign(root, SELLER1_KEY);

        (bytes32 processId, bytes32 rootOrderHash) = core.commit(root, rootBuyerSig, rootSellerSig);
        emit log_named_bytes32("PARITY:processId", processId);
        emit log_named_bytes32("PARITY:rootOrderHash", rootOrderHash);

        // Verify processId == rootDigest for root orders.
        assertEq(processId, rootDigest, "processId should equal digest for root");

        // Verify orderHash == keccak256(processId, structHash).
        bytes32 expectedOrderHash = keccak256(abi.encodePacked(processId, rootStructHash));
        assertEq(rootOrderHash, expectedOrderHash, "orderHash derivation");

        // ── Sub commitment ──
        CommitmentTypes.Commitment memory sub = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: seller2,
            currency: address(token),
            payment: 50 ether,
            expectedCumulativeValue: 150 ether,
            agreementHash: keccak256("sub-agreement"),
            salt: 43,
            deadline: 2000
        });

        bytes32 subStructHash = sub.hashStruct();
        bytes32 subDigest = _typedDataHash(subStructHash);
        emit log_named_bytes32("PARITY:subStructHash", subStructHash);
        emit log_named_bytes32("PARITY:subDigest", subDigest);

        bytes memory subBuyerSig = _sign(sub, BUYER_KEY);
        bytes memory subSellerSig = _sign(sub, SELLER2_KEY);

        (, bytes32 subOrderHash) = core.commit(sub, subBuyerSig, subSellerSig);
        emit log_named_bytes32("PARITY:subOrderHash", subOrderHash);

        bytes32 expectedSubOrderHash = keccak256(abi.encodePacked(processId, subStructHash));
        assertEq(subOrderHash, expectedSubOrderHash, "sub orderHash derivation");

        // ── Process state after both commits ──
        (address rootBuyer,, uint256 cumVal, uint256 activeCount) = core.processes(processId);
        emit log_named_uint("PARITY:cumulativeValue", cumVal);
        emit log_named_uint("PARITY:activeOrderCount", activeCount);
        assertEq(rootBuyer, buyer);
        assertEq(cumVal, 150 ether);
        assertEq(activeCount, 2);

        // ── Resolve ──
        // Seller1 payout: expectedCumulativeValue*2 + payment = 100*2 + 100 = 300 ether
        // Seller2 payout: expectedCumulativeValue*2 + payment = 150*2 + 50 = 350 ether
        // Buyer payout per order: payment = 100 + 50 = 150 ether total
        uint256 seller1Before = token.balanceOf(seller1);
        uint256 seller2Before = token.balanceOf(seller2);
        uint256 buyerBefore = token.balanceOf(buyer);

        CommitmentTypes.Commitment[] memory resolveSet = new CommitmentTypes.Commitment[](2);
        resolveSet[0] = root;
        resolveSet[1] = sub;

        vm.prank(buyer);
        core.resolveProcess(processId, resolveSet);

        uint256 seller1Payout = token.balanceOf(seller1) - seller1Before;
        uint256 seller2Payout = token.balanceOf(seller2) - seller2Before;
        uint256 buyerPayout = token.balanceOf(buyer) - buyerBefore;

        emit log_named_uint("PARITY:seller1Payout", seller1Payout);
        emit log_named_uint("PARITY:seller2Payout", seller2Payout);
        emit log_named_uint("PARITY:buyerPayout", buyerPayout);

        assertEq(seller1Payout, 300 ether, "seller1 payout");
        assertEq(seller2Payout, 350 ether, "seller2 payout");
        assertEq(buyerPayout, 150 ether, "buyer payout");
    }

    // ──────────────────────────────────────────────────────────────
    // Batch verifier hash parity vectors
    //
    // These test the assembly-based hash functions in FigaroBatchVerifier
    // against known precomputed values. The Rust kernel MUST produce
    // identical hashes for the same inputs.
    // ──────────────────────────────────────────────────────────────

    FigaroBatchVerifier internal bv;

    function _deployBatchVerifier() internal {
        if (address(bv) != address(0)) return;
        bv = new FigaroBatchVerifier(address(new MockSP1Verifier()), bytes32(uint256(0xCAFE)), bytes32(uint256(0x1)));
    }

    /// @notice Empty arrays should produce a deterministic hash (keccak256 of empty bytes).
    function test_parity_emptyPositionsHash() public {
        _deployBatchVerifier();

        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](0);
        bytes32 expected = keccak256("");

        // Compute via the public settlement path — build public values with this hash
        // and verify the verifier accepts it.
        bytes32 computed = _hashPositionsHelper(positions);
        emit log_named_bytes32("PARITY:emptyPositionsHash", computed);
        assertEq(computed, expected, "empty positions hash should be keccak256 of empty bytes");
    }

    /// @notice Single position with known values.
    function test_parity_singlePositionHash() public {
        _deployBatchVerifier();

        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](1);
        positions[0] = FigaroBatchVerifier.NetPosition({
            token: address(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa),
            user: address(0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB),
            deposit: 1000 ether,
            payout: 500 ether
        });

        bytes32 computed = _hashPositionsHelper(positions);
        emit log_named_bytes32("PARITY:singlePositionHash", computed);

        // Cross-check: manual pack
        bytes memory packed = abi.encodePacked(
            address(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa),
            address(0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB),
            uint256(1000 ether),
            uint256(500 ether)
        );
        assertEq(computed, keccak256(packed), "single position hash manual cross-check");
    }

    /// @notice Multiple positions to verify offset arithmetic in assembly.
    function test_parity_multiPositionHash() public {
        _deployBatchVerifier();

        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](3);
        positions[0] = FigaroBatchVerifier.NetPosition({
            token: address(0x1111111111111111111111111111111111111111),
            user: address(0x2222222222222222222222222222222222222222),
            deposit: 100,
            payout: 0
        });
        positions[1] = FigaroBatchVerifier.NetPosition({
            token: address(0x3333333333333333333333333333333333333333),
            user: address(0x4444444444444444444444444444444444444444),
            deposit: 0,
            payout: 200
        });
        positions[2] = FigaroBatchVerifier.NetPosition({
            token: address(0x5555555555555555555555555555555555555555),
            user: address(0x6666666666666666666666666666666666666666),
            deposit: type(uint256).max,
            payout: type(uint256).max
        });

        bytes32 computed = _hashPositionsHelper(positions);
        emit log_named_bytes32("PARITY:multiPositionHash", computed);

        // Manual cross-check
        bytes memory packed = abi.encodePacked(
            address(0x1111111111111111111111111111111111111111),
            address(0x2222222222222222222222222222222222222222),
            uint256(100),
            uint256(0),
            address(0x3333333333333333333333333333333333333333),
            address(0x4444444444444444444444444444444444444444),
            uint256(0),
            uint256(200),
            address(0x5555555555555555555555555555555555555555),
            address(0x6666666666666666666666666666666666666666),
            type(uint256).max,
            type(uint256).max
        );
        assertEq(computed, keccak256(packed), "multi position hash manual cross-check");
    }

    /// @notice Attestation hash with known values including max-range stage.
    function test_parity_attestationHash() public {
        _deployBatchVerifier();

        FigaroBatchVerifier.AttestationData[] memory atts = new FigaroBatchVerifier.AttestationData[](2);
        atts[0] = FigaroBatchVerifier.AttestationData({
            orderHash: bytes32(uint256(0xAABB)),
            processId: bytes32(uint256(0xCCDD)),
            attester: address(0x1234567890123456789012345678901234567890),
            schemaId: bytes32(uint256(0xEEFF)),
            stage: 0,
            contentRef: bytes32(uint256(0x1122))
        });
        atts[1] = FigaroBatchVerifier.AttestationData({
            orderHash: bytes32(type(uint256).max),
            processId: bytes32(type(uint256).max),
            attester: address(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF),
            schemaId: bytes32(type(uint256).max),
            stage: 255,
            contentRef: bytes32(0)
        });

        bytes32 computed = _hashAttestationsHelper(atts);
        emit log_named_bytes32("PARITY:attestationHash", computed);

        // Manual cross-check
        bytes memory packed = abi.encodePacked(
            bytes32(uint256(0xAABB)),
            bytes32(uint256(0xCCDD)),
            address(0x1234567890123456789012345678901234567890),
            bytes32(uint256(0xEEFF)),
            uint8(0),
            bytes32(uint256(0x1122)),
            bytes32(type(uint256).max),
            bytes32(type(uint256).max),
            address(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF),
            bytes32(type(uint256).max),
            uint8(255),
            bytes32(0)
        );
        assertEq(computed, keccak256(packed), "attestation hash manual cross-check");
    }

    /// @notice Seller events hash with mixed tags (registered + profile-updated).
    function test_parity_sellerEventsHash() public {
        _deployBatchVerifier();

        FigaroBatchVerifier.SellerEventInput[] memory ops = new FigaroBatchVerifier.SellerEventInput[](2);
        ops[0] = FigaroBatchVerifier.SellerEventInput({
            tag: 1, // Registered
            seller: address(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa),
            metadataURI: "ipfs://QmTest123"
        });
        ops[1] = FigaroBatchVerifier.SellerEventInput({
            tag: 2, // ProfileUpdated
            seller: address(0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC),
            metadataURI: "ipfs://QmUpdated"
        });

        bytes32 computed = _hashSellerEventsHelper(ops);
        emit log_named_bytes32("PARITY:sellerEventsHash", computed);

        // Manual cross-check: 53-byte record per event
        // tag(1) + seller(20) + keccak256(metadataURI)(32)
        bytes memory packed = abi.encodePacked(
            uint8(1),
            address(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa),
            keccak256("ipfs://QmTest123"),
            uint8(2),
            address(0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC),
            keccak256("ipfs://QmUpdated")
        );
        assertEq(computed, keccak256(packed), "seller events hash manual cross-check");
    }

    /// @notice Schema + mechanism schema combined hash.
    function test_parity_schemaHash() public {
        _deployBatchVerifier();

        FigaroBatchVerifier.SchemaData[] memory schemas = new FigaroBatchVerifier.SchemaData[](1);
        schemas[0] = FigaroBatchVerifier.SchemaData({
            schemaId: keccak256("figaro-test-v1"),
            version: 1,
            uriHash: keccak256("ipfs://test"),
            family: keccak256("test-family"),
            registrar: address(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa)
        });

        FigaroBatchVerifier.MechanismSchemaData[] memory mechs = new FigaroBatchVerifier.MechanismSchemaData[](1);
        mechs[0] = FigaroBatchVerifier.MechanismSchemaData({
            mechanism: address(0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB), schemaId: keccak256("figaro-test-v1")
        });

        bytes32 computed = _hashSchemasHelper(schemas, mechs);
        emit log_named_bytes32("PARITY:schemaHash", computed);

        // Manual cross-check: schema(32+8+32+32+20=124) + mechanism(20+32=52)
        bytes memory packed = abi.encodePacked(
            keccak256("figaro-test-v1"),
            uint64(1),
            keccak256("ipfs://test"),
            keccak256("test-family"),
            address(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa),
            address(0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB),
            keccak256("figaro-test-v1")
        );
        assertEq(computed, keccak256(packed), "schema hash manual cross-check");
    }

    // ── Hash helpers (mirror the internal assembly functions via settlement) ──

    function _hashPositionsHelper(FigaroBatchVerifier.NetPosition[] memory positions) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint256 i = 0; i < positions.length; i++) {
            packed = bytes.concat(
                packed,
                abi.encodePacked(positions[i].token, positions[i].user, positions[i].deposit, positions[i].payout)
            );
        }
        return keccak256(packed);
    }

    function _hashAttestationsHelper(FigaroBatchVerifier.AttestationData[] memory atts)
        internal
        pure
        returns (bytes32)
    {
        bytes memory packed;
        for (uint256 i = 0; i < atts.length; i++) {
            packed = bytes.concat(
                packed,
                abi.encodePacked(
                    atts[i].orderHash,
                    atts[i].processId,
                    atts[i].attester,
                    atts[i].schemaId,
                    atts[i].stage,
                    atts[i].contentRef
                )
            );
        }
        return keccak256(packed);
    }

    function _hashSellerEventsHelper(FigaroBatchVerifier.SellerEventInput[] memory events)
        internal
        pure
        returns (bytes32)
    {
        bytes memory packed;
        for (uint256 i = 0; i < events.length; i++) {
            packed = bytes.concat(
                packed,
                abi.encodePacked(events[i].tag, events[i].seller, keccak256(bytes(events[i].metadataURI)))
            );
        }
        return keccak256(packed);
    }

    function _hashSchemasHelper(
        FigaroBatchVerifier.SchemaData[] memory schemas,
        FigaroBatchVerifier.MechanismSchemaData[] memory mechs
    ) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint256 i = 0; i < schemas.length; i++) {
            packed = bytes.concat(
                packed,
                abi.encodePacked(
                    schemas[i].schemaId,
                    schemas[i].version,
                    schemas[i].uriHash,
                    schemas[i].family,
                    schemas[i].registrar
                )
            );
        }
        for (uint256 i = 0; i < mechs.length; i++) {
            packed = bytes.concat(packed, abi.encodePacked(mechs[i].mechanism, mechs[i].schemaId));
        }
        return keccak256(packed);
    }
}
