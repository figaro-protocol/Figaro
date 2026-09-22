// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title MerkleParityTest — the Solidity leg of the three-way agreement-tree lock
/// @notice The SDK builds the agreement's merkle root and every section's
///         inclusion proof (`sdk/tests/merkleParity.test.ts` freezes them into
///         `test/fixtures/merkle-vectors.json`); the direct path verifies those
///         proofs in `AttestationCoordinator._verifyInclusion` and
///         `UsageCounter` through OpenZeppelin `MerkleProof`, from a leaf they
///         rebuild as `keccak256(keccak256(clauseKey ‖ sectionHash))`; the batch
///         path verifies them in the guest (`prover/lib/tests/merkle_parity.rs`
///         reads the same file). This test rebuilds each leaf exactly as the two
///         consumers do — clause key `keccak256(abi.encode(clause, uint64(version)))`
///         as `ClauseRegistry` computes it, section hash over the canonical bytes
///         — and verifies every frozen proof with the library the consumers call.
contract MerkleParityTest is Test {
    string internal json;

    function setUp() public {
        json = vm.readFile("test/fixtures/merkle-vectors.json");
    }

    function _leaf(string memory clause, uint256 version, string memory sectionData) internal pure returns (bytes32) {
        bytes32 clauseKey = keccak256(abi.encode(clause, uint64(version)));
        bytes32 sectionHash = keccak256(bytes(sectionData));
        return keccak256(bytes.concat(keccak256(abi.encodePacked(clauseKey, sectionHash))));
    }

    function test_everyFrozenProofOpensAgainstTheRebuiltLeaf() public view {
        uint256 agreements = vm.parseJsonUint(json, ".agreementCount");
        assertGt(agreements, 0, "fixture carries agreements");
        for (uint256 a = 0; a < agreements; a++) {
            string memory ab = string.concat(".agreements[", vm.toString(a), "]");
            bytes32 root = vm.parseJsonBytes32(json, string.concat(ab, ".agreementHash"));
            uint256 sections = vm.parseJsonUint(json, string.concat(ab, ".sectionCount"));
            for (uint256 i = 0; i < sections; i++) {
                string memory sb = string.concat(ab, ".sections[", vm.toString(i), "]");
                bytes32 leaf = _leaf(
                    vm.parseJsonString(json, string.concat(sb, ".clause")),
                    vm.parseJsonUint(json, string.concat(sb, ".version")),
                    vm.parseJsonString(json, string.concat(sb, ".sectionData"))
                );
                assertEq(leaf, vm.parseJsonBytes32(json, string.concat(sb, ".leaf")), "the rebuilt leaf is the SDK's");
                bytes32[] memory proof = vm.parseJsonBytes32Array(json, string.concat(sb, ".proof"));
                assertTrue(MerkleProof.verify(proof, root, leaf), "the frozen proof opens");
                assertFalse(
                    MerkleProof.verify(proof, root, leaf ^ bytes32(uint256(1))), "a tampered leaf does not open"
                );
            }
        }
    }

    /// A single-section agreement's root IS its leaf and its proof is empty —
    /// the case the fixture's second agreement pins.
    function test_singleSectionRootIsTheLeaf() public view {
        bytes32 root = vm.parseJsonBytes32(json, ".agreements[1].agreementHash");
        assertEq(vm.parseJsonUint(json, ".agreements[1].sectionCount"), 1);
        bytes32 leaf = vm.parseJsonBytes32(json, ".agreements[1].sections[0].leaf");
        assertEq(root, leaf, "root == leaf");
        assertEq(vm.parseJsonBytes32Array(json, ".agreements[1].sections[0].proof").length, 0, "empty proof");
    }
}
