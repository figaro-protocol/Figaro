// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {UsageCounter} from "src/build/rewards/UsageCounter.sol";

/// @title MerkleParityTest — the Solidity leg of the three-way agreement-tree lock
/// @notice The SDK builds the agreement's merkle root and every section's
///         inclusion proof (`sdk/tests/merkleParity.test.ts` freezes them into
///         `test/fixtures/merkle-vectors.json`); the direct path verifies those
///         proofs in `AttestationCoordinator._verifyInclusion` and
///         `UsageCounter` through OpenZeppelin `MerkleProof`, from a leaf they
///         rebuild as `keccak256(keccak256(clauseKey ‖ sectionHash))`; the batch
///         path verifies them in the guest (`prover/lib/tests/merkle_parity.rs`
///         reads the same file). This test rebuilds each leaf exactly as the two
///         consumers do — from the section's `clauseKey` (keccak256 of the
///         clause spec's pinned bytes, the key `ClauseRegistry` registers) and
///         the section hash over the canonical bytes — and verifies every frozen
///         proof with the library the consumers call.
///
///         An agreement that instantiated an assembly carries one more leaf, the
///         format's reserved PROVENANCE leaf, frozen under the agreement's
///         optional `provenance` entry. It is keyed by the constant
///         `UsageCounter.provenanceLeaf` (`keccak256("figaro-agreement-provenance")`,
///         never a clause key), and its section bytes are exactly
///         `{"compositionHash":"0x<64 lowercase hex>"}` — the bytes
///         `UsageCounter.recordAssemblyUsage` reproduces from the composition
///         claimed. This test rebuilds that leaf the same way and opens its
///         frozen proof against the same root.
///
///         `MERKLE_VECTORS` names another file in the same format: the
///         differential fuzz (`scripts/test-cross-impl-fuzz.sh`) points it at
///         the agreements the SDK generated from a seed.
contract MerkleParityTest is Test {
    string internal constant FIXTURE = "test/fixtures/merkle-vectors.json";

    string internal path;
    bool internal generated;
    /// @dev The counter's own `provenanceLeaf`, read from a deployed counter so
    ///      the key under test is the contract's, never a copy of its label.
    bytes32 internal provenanceLeaf;

    function setUp() public {
        path = vm.envOr("MERKLE_VECTORS", FIXTURE);
        generated = keccak256(bytes(path)) != keccak256(bytes(FIXTURE));
        uint64[] memory periods = new uint64[](1);
        periods[0] = type(uint64).max;
        provenanceLeaf =
            new UsageCounter(address(1), address(1), address(1), address(1), address(1), 1, periods).provenanceLeaf();
    }

    function _leaf(bytes32 clauseKey, string memory sectionData) internal pure returns (bytes32) {
        bytes32 sectionHash = keccak256(bytes(sectionData));
        return keccak256(bytes.concat(keccak256(abi.encodePacked(clauseKey, sectionHash))));
    }

    /// @dev The provenance leaf as `UsageCounter.recordAssemblyUsage` rebuilds
    ///      it: the reserved key, and the section bytes reproduced from the
    ///      composition — never parsed from the fixture.
    function _provenanceLeaf(bytes32 compositionHash) internal view returns (bytes32) {
        bytes32 sectionHash = keccak256(_provenanceSection(compositionHash));
        return keccak256(bytes.concat(keccak256(abi.encodePacked(provenanceLeaf, sectionHash))));
    }

    function _provenanceSection(bytes32 compositionHash) internal pure returns (bytes memory) {
        return abi.encodePacked('{"compositionHash":"', vm.toString(compositionHash), '"}');
    }

    function test_everyFrozenProofOpensAgainstTheRebuiltLeaf() public view {
        // Held in memory: every lookup below passes the whole file to the
        // cheatcode, and from storage that is one SLOAD per word per lookup.
        string memory json = vm.readFile(path);
        uint256 agreements = vm.parseJsonUint(json, ".agreementCount");
        assertGt(agreements, 0, "fixture carries agreements");
        for (uint256 a = 0; a < agreements; a++) {
            string memory ab = string.concat(".agreements[", vm.toString(a), "]");
            bytes32 root = vm.parseJsonBytes32(json, string.concat(ab, ".agreementHash"));
            uint256 sections = vm.parseJsonUint(json, string.concat(ab, ".sectionCount"));
            for (uint256 i = 0; i < sections; i++) {
                string memory sb = string.concat(ab, ".sections[", vm.toString(i), "]");
                bytes32 leaf = _leaf(
                    vm.parseJsonBytes32(json, string.concat(sb, ".clauseKey")),
                    vm.parseJsonString(json, string.concat(sb, ".sectionData"))
                );
                assertEq(leaf, vm.parseJsonBytes32(json, string.concat(sb, ".leaf")), "the rebuilt leaf is the SDK's");
                bytes32[] memory proof = vm.parseJsonBytes32Array(json, string.concat(sb, ".proof"));
                assertTrue(MerkleProof.verify(proof, root, leaf), "the frozen proof opens");
                assertFalse(
                    MerkleProof.verify(proof, root, leaf ^ bytes32(uint256(1))), "a tampered leaf does not open"
                );
            }
            _assertProvenanceLeaf(json, ab, root);
        }
    }

    /// @dev The agreement's optional `provenance` entry: the reserved key is
    ///      the counter's constant, the frozen bytes are the ones the counter
    ///      reproduces, the rebuilt leaf is the SDK's, and its proof opens.
    function _assertProvenanceLeaf(string memory json, string memory ab, bytes32 root) internal view {
        string memory pb = string.concat(ab, ".provenance");
        if (!vm.keyExistsJson(json, pb)) return;
        assertEq(
            vm.parseJsonBytes32(json, string.concat(pb, ".leafKey")),
            provenanceLeaf,
            "the SDK's reserved key is the counter's"
        );
        bytes32 compositionHash = vm.parseJsonBytes32(json, string.concat(pb, ".compositionHash"));
        assertEq(
            keccak256(bytes(vm.parseJsonString(json, string.concat(pb, ".sectionData")))),
            keccak256(_provenanceSection(compositionHash)),
            "the SDK's section bytes are the ones the counter reproduces"
        );
        bytes32 leaf = _provenanceLeaf(compositionHash);
        assertEq(
            leaf, vm.parseJsonBytes32(json, string.concat(pb, ".leaf")), "the rebuilt provenance leaf is the SDK's"
        );
        bytes32[] memory proof = vm.parseJsonBytes32Array(json, string.concat(pb, ".proof"));
        assertTrue(MerkleProof.verify(proof, root, leaf), "the frozen provenance proof opens");
        assertFalse(
            MerkleProof.verify(proof, root, _provenanceLeaf(compositionHash ^ bytes32(uint256(1)))),
            "another composition's leaf does not open"
        );
    }

    /// The fixture pins one agreement that instantiated an assembly, so the
    /// provenance leg is never vacuous on the frozen file.
    function test_theFixturePinsAProvenanceLeaf() public view {
        if (generated) return; // the pinned case is the fixture's
        string memory json = vm.readFile(path);
        assertTrue(vm.keyExistsJson(json, ".agreements[2].provenance"), "the third agreement carries the leaf");
    }

    /// A single-section agreement's root IS its leaf and its proof is empty —
    /// the case the fixture's second agreement pins.
    function test_singleSectionRootIsTheLeaf() public view {
        if (generated) return; // the pinned case is the fixture's
        string memory json = vm.readFile(path);
        bytes32 root = vm.parseJsonBytes32(json, ".agreements[1].agreementHash");
        assertEq(vm.parseJsonUint(json, ".agreements[1].sectionCount"), 1);
        bytes32 leaf = vm.parseJsonBytes32(json, ".agreements[1].sections[0].leaf");
        assertEq(root, leaf, "root == leaf");
        assertEq(vm.parseJsonBytes32Array(json, ".agreements[1].sections[0].proof").length, 0, "empty proof");
    }
}
