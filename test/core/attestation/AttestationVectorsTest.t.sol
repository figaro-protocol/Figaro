// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "src/core/kernel/FigaroCore.sol";
import "src/core/kernel/CommitmentTypes.sol";
import "src/core/attestation/AttestationCoordinator.sol";
import "src/mocks/MockPermitToken.sol";

/// @title AttestationVectorsTest — the attestation lock between the
///        coordinator and the batch path's hash-only form
/// @notice A batched attestation in its default form carries exactly what
///         `AttestationCoordinator` takes — the `clauseDataHash`, the
///         inclusion proof and the `contentRef` — and the event the batch
///         re-emits must be the coordinator's, byte for byte. This test
///         RUNS three direct attestations on the coordinator (a seller's on
///         a clause, the buyer's on another at stage 1, the buyer's on the
///         reserved provenance leaf) over one order whose signed
///         `checkoutHash` is a three-leaf agreement, and writes each call's
///         arguments and the log it emitted — topics and data — to
///         `test/fixtures/attestation-vectors.json`;
///         `prover/lib/tests/attestation_vectors.rs` submits the same
///         arguments as hash-only batched attestations and asserts the
///         guest's events encode to the same topics and data.
///
///         `HARVEST_ATTESTATION_VECTORS=true` regenerates the fixture;
///         otherwise the run must reproduce the frozen bytes.
///
///         The token and FigaroCore deploy at the addresses the Rust
///         mirror's parity vectors pin (the domain separator binds the
///         FigaroCore address), and the keys are the parity keys.
contract AttestationVectorsTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    string internal constant FIXTURE = "test/fixtures/attestation-vectors.json";
    address internal constant PINNED_TOKEN = 0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f;
    address internal constant PINNED_CORE = 0x2e234DAe75C793f67A35089C9d99245E1C58470b;

    uint256 internal constant BUYER_KEY = 0xB0B;
    uint256 internal constant SELLER1_KEY = 0x5E11;

    FigaroCore internal core;
    AttestationCoordinator internal coordinator;
    MockPermitToken internal token;
    address internal buyer;
    address internal seller;

    /// The agreement's three leaves: two clauses and the provenance leaf.
    bytes32[3] internal keys;
    bytes32[3] internal dataHashes;
    bytes32[3] internal leaves;

    function setUp() public {
        buyer = vm.addr(BUYER_KEY);
        seller = vm.addr(SELLER1_KEY);
        token = new MockPermitToken();
        core = new FigaroCore();
        coordinator = new AttestationCoordinator(address(core));
        assertEq(address(token), PINNED_TOKEN, "the token deploys at the parity address");
        assertEq(address(core), PINNED_CORE, "FigaroCore deploys at the parity address");

        token.mint(buyer, 1_000 ether);
        token.mint(seller, 1_000 ether);
        vm.prank(buyer);
        token.approve(address(core), type(uint256).max);
        vm.prank(seller);
        token.approve(address(core), type(uint256).max);

        keys[0] = keccak256('{"clauseId":"vector-clause-a","version":1}');
        keys[1] = keccak256('{"clauseId":"vector-clause-b","version":1}');
        keys[2] = keccak256("figaro-agreement-provenance");
        dataHashes[0] = keccak256('{"a":1}');
        dataHashes[1] = keccak256('{"b":2}');
        dataHashes[2] = keccak256("the provenance leaf's bytes");
        for (uint256 i = 0; i < 3; i++) {
            leaves[i] = CommitmentTypes.clauseLeaf(keys[i], dataHashes[i]);
        }
    }

    function test_attestationVectors_matchTheFrozenFixture() public {
        bytes32 pair = _hashPair(leaves[0], leaves[1]);
        bytes32 root = _hashPair(pair, leaves[2]);

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            currency: address(token),
            payment: 10 ether,
            expectedCumulativeValue: 10 ether,
            checkoutHash: root,
            salt: 7,
            deadline: 2000
        });
        vm.warp(1000);
        core.commit(c, _sign(c, BUYER_KEY), _sign(c, SELLER1_KEY));

        string memory top = "top";
        vm.serializeString(top, "chainId", vm.toString(block.chainid));
        vm.serializeAddress(top, "verifyingContract", address(core));
        vm.serializeAddress(top, "buyer", buyer);
        vm.serializeAddress(top, "seller", seller);
        vm.serializeAddress(top, "currency", address(token));
        vm.serializeString(top, "payment", vm.toString(c.payment));
        vm.serializeBytes32(top, "checkoutHash", root);
        vm.serializeString(top, "salt", vm.toString(c.salt));
        vm.serializeString(top, "deadline", vm.toString(c.deadline));
        vm.serializeString(top, "vectorCount", "3");

        bytes32[] memory proof0 = new bytes32[](2);
        proof0[0] = leaves[1];
        proof0[1] = leaves[2];
        vm.serializeString(top, "v0", _attest(c, "seller", 0, 0, proof0, keccak256("the seller's evidence")));

        bytes32[] memory proof1 = new bytes32[](2);
        proof1[0] = leaves[0];
        proof1[1] = leaves[2];
        vm.serializeString(top, "v1", _attest(c, "buyer", 1, 1, proof1, keccak256("the buyer's evidence")));

        bytes32[] memory proof2 = new bytes32[](1);
        proof2[0] = pair;
        string memory json =
            vm.serializeString(top, "v2", _attest(c, "buyer", 2, 0, proof2, keccak256("the provenance evidence")));

        if (vm.envOr("HARVEST_ATTESTATION_VECTORS", false)) {
            vm.writeFile(FIXTURE, json);
            return;
        }
        assertEq(
            keccak256(bytes(json)),
            keccak256(bytes(vm.readFile(FIXTURE))),
            "the coordinator reproduces the frozen fixture; re-harvest deliberately with HARVEST_ATTESTATION_VECTORS=true"
        );
    }

    /// One direct attestation: its arguments and the one log it emitted.
    function _attest(
        CommitmentTypes.Commitment memory c,
        string memory role,
        uint256 leaf,
        uint8 stage,
        bytes32[] memory proof,
        bytes32 contentRef
    ) internal returns (string memory) {
        vm.recordLogs();
        if (keccak256(bytes(role)) == keccak256("seller")) {
            vm.prank(seller);
            coordinator.attestAsSeller(c, keys[leaf], stage, dataHashes[leaf], proof, contentRef);
        } else {
            vm.prank(buyer);
            coordinator.attestAsBuyer(c, keys[leaf], stage, dataHashes[leaf], proof, contentRef);
        }
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1, "one attestation, one log");
        assertEq(logs[0].emitter, address(coordinator));

        string memory key = string.concat("vector", vm.toString(leaf));
        vm.serializeString(key, "role", role);
        vm.serializeBytes32(key, "clauseId", keys[leaf]);
        vm.serializeString(key, "stage", vm.toString(stage));
        vm.serializeBytes32(key, "clauseDataHash", dataHashes[leaf]);
        vm.serializeBytes32(key, "inclusionProof", proof);
        vm.serializeBytes32(key, "contentRef", contentRef);
        vm.serializeBytes32(key, "topics", logs[0].topics);
        return vm.serializeBytes(key, "data", logs[0].data);
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function _sign(CommitmentTypes.Commitment memory c, uint256 privateKey) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", core.DOMAIN_SEPARATOR(), c.hashStruct()));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
