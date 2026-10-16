// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {UsageCounter} from "src/build/rewards/UsageCounter.sol";
import {AgreementTestHelper} from "test/helpers/AgreementTestHelper.sol";

/// @title MerkleParityTest — the Solidity leg of the three-way agreement-tree lock
/// @notice The SDK builds the agreement's merkle root and every section's
///         inclusion proof (`sdk/tests/merkleParity.test.ts` freezes them into
///         `test/fixtures/merkle-vectors.json`); the direct path verifies those
///         proofs in `AttestationCoordinator._verifyInclusion` and
///         `UsageCounter` through OpenZeppelin `MerkleProof`, from a leaf they
///         rebuild as `keccak256(keccak256(clauseKey ‖ clauseDataHash))`; the batch
///         path verifies them in the guest (`prover/lib/tests/merkle_parity.rs`
///         reads the same file). This test rebuilds each leaf exactly as the two
///         consumers do — from the section's `clauseKey` (keccak256 of the
///         clause spec's pinned bytes, the key `ClauseRegistry` registers) and
///         the section hash over the canonical bytes — and verifies every frozen
///         proof with the library the consumers call.
///
///         An agreement that instantiated an agreement of an assembly carries
///         one more leaf, the format's reserved PROVENANCE leaf, frozen under
///         the agreement's optional `provenance` entry. It is keyed by the
///         constant `UsageCounter.provenanceLeaf`
///         (`keccak256("figaro-agreement-provenance")`, never a clause key), and
///         its section bytes are exactly `{"agreementKey":"0x<64 lowercase
///         hex>","compositionHash":"0x<64 lowercase hex>"}` — the bytes
///         `UsageCounter.recordAgreementUsage` and `recordAssemblyUsage`
///         reproduce from the two keys claimed. This test rebuilds that leaf the
///         same way and opens its frozen proof against the same root.
///
///         The assembly's own tree is locked the same way against
///         `test/fixtures/assembly-vectors.json`: one leaf per agreement and
///         the terms leaf under the compositionHash, each agreement's
///         membership proof opened with the library `recordAssemblyUsage`
///         calls (`test_everyAssemblyVectorOpensUnderItsRoot`).
///
///         `MERKLE_VECTORS` names another file in the same format: the
///         differential fuzz (`scripts/test-cross-impl-fuzz.sh`) points it at
///         the agreements the SDK generated from a seed.
contract MerkleParityTest is Test {
    string internal constant FIXTURE = "test/fixtures/merkle-vectors.json";

    string internal path;
    bool internal generated;
    string internal constant ASSEMBLY_FIXTURE = "test/fixtures/assembly-vectors.json";

    /// @dev The counter's own `provenanceLeaf` and `assemblyTermsLeaf`, read
    ///      from a deployed counter so the keys under test are the contract's,
    ///      never a copy of their labels.
    bytes32 internal provenanceLeaf;
    bytes32 internal assemblyTermsLeaf;

    function setUp() public {
        path = vm.envOr("MERKLE_VECTORS", FIXTURE);
        generated = keccak256(bytes(path)) != keccak256(bytes(FIXTURE));
        uint64[] memory periods = new uint64[](1);
        periods[0] = type(uint64).max;
        UsageCounter counter =
            new UsageCounter(address(1), address(1), address(1), address(1), address(1), address(1), 1, periods);
        provenanceLeaf = counter.provenanceLeaf();
        assemblyTermsLeaf = counter.assemblyTermsLeaf();
    }

    function _leaf(bytes32 clauseKey, string memory clauseData) internal pure returns (bytes32) {
        bytes32 clauseDataHash = keccak256(bytes(clauseData));
        return keccak256(bytes.concat(keccak256(abi.encodePacked(clauseKey, clauseDataHash))));
    }

    /// @dev The provenance leaf as `UsageCounter` rebuilds it: the reserved
    ///      key, and the section bytes reproduced from the two keys — never
    ///      parsed from the fixture.
    function _provenanceLeaf(bytes32 agreementKey, bytes32 compositionHash) internal view returns (bytes32) {
        bytes32 clauseDataHash = keccak256(AgreementTestHelper.provenanceLeaf(agreementKey, compositionHash));
        return keccak256(bytes.concat(keccak256(abi.encodePacked(provenanceLeaf, clauseDataHash))));
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
            uint256 sections = vm.parseJsonUint(json, string.concat(ab, ".clauseCount"));
            for (uint256 i = 0; i < sections; i++) {
                string memory sb = string.concat(ab, ".sections[", vm.toString(i), "]");
                bytes32 leaf = _leaf(
                    vm.parseJsonBytes32(json, string.concat(sb, ".clauseKey")),
                    vm.parseJsonString(json, string.concat(sb, ".clauseData"))
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
        bytes32 agreementKey = vm.parseJsonBytes32(json, string.concat(pb, ".agreementKey"));
        bytes32 compositionHash = vm.parseJsonBytes32(json, string.concat(pb, ".compositionHash"));
        assertEq(
            keccak256(bytes(vm.parseJsonString(json, string.concat(pb, ".clauseData")))),
            keccak256(AgreementTestHelper.provenanceLeaf(agreementKey, compositionHash)),
            "the SDK's section bytes are the ones the counter reproduces"
        );
        bytes32 leaf = _provenanceLeaf(agreementKey, compositionHash);
        assertEq(
            leaf, vm.parseJsonBytes32(json, string.concat(pb, ".leaf")), "the rebuilt provenance leaf is the SDK's"
        );
        bytes32[] memory proof = vm.parseJsonBytes32Array(json, string.concat(pb, ".proof"));
        assertTrue(MerkleProof.verify(proof, root, leaf), "the frozen provenance proof opens");
        assertFalse(
            MerkleProof.verify(proof, root, _provenanceLeaf(agreementKey, compositionHash ^ bytes32(uint256(1)))),
            "another composition's leaf does not open"
        );
        assertFalse(
            MerkleProof.verify(proof, root, _provenanceLeaf(agreementKey ^ bytes32(uint256(1)), compositionHash)),
            "another agreement's leaf does not open"
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
        assertEq(vm.parseJsonUint(json, ".agreements[1].clauseCount"), 1);
        bytes32 leaf = vm.parseJsonBytes32(json, ".agreements[1].sections[0].leaf");
        assertEq(root, leaf, "root == leaf");
        assertEq(vm.parseJsonBytes32Array(json, ".agreements[1].sections[0].proof").length, 0, "empty proof");
    }

    // ── The assembly's tree ─────────────────────────────────────────

    /// @dev The length of the JSON array at `key`.
    function _count(string memory json, string memory key) internal view returns (uint256 n) {
        while (vm.keyExistsJson(json, string.concat(key, "[", vm.toString(n), "]"))) n++;
    }

    /// @dev `keccak256(keccak256(key ‖ clauseDataHash))` — the one leaf convention.
    function _leafOf(bytes32 key, bytes32 clauseDataHash) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encodePacked(key, clauseDataHash))));
    }

    /// Every registered agreement's key is the merkle root over one leaf per
    /// composed clause — the clause key and the hash of the designer's fills,
    /// under the one leaf convention — and every clause's frozen membership
    /// proof opens under the key with the library the counter calls.
    function test_everyAgreementKeyIsTheRootOverItsClauseLeaves() public view {
        string memory json = vm.readFile(ASSEMBLY_FIXTURE);
        uint256 n = _count(json, ".agreements");
        assertGt(n, 0, "fixture carries agreements");
        for (uint256 a = 0; a < n; a++) {
            string memory ab = string.concat(".agreements[", vm.toString(a), "]");
            bytes32 key = vm.parseJsonBytes32(json, string.concat(ab, ".agreementKey"));
            uint256 clauses = _count(json, string.concat(ab, ".clauses"));
            assertGt(clauses, 0, "an agreement composes at least one clause");
            bytes32[] memory leaves = new bytes32[](clauses);
            for (uint256 c = 0; c < clauses; c++) {
                string memory cb = string.concat(ab, ".clauses[", vm.toString(c), "]");
                bytes32 fillsHash = keccak256(bytes(vm.parseJsonString(json, string.concat(cb, ".fillsBytes"))));
                assertEq(
                    fillsHash,
                    vm.parseJsonBytes32(json, string.concat(cb, ".fillsHash")),
                    "fillsHash = keccak256(fillsBytes)"
                );
                bytes32 clauseKey = vm.parseJsonBytes32(json, string.concat(cb, ".clauseKey"));
                leaves[c] = _leafOf(clauseKey, fillsHash);
                assertEq(
                    leaves[c],
                    vm.parseJsonBytes32(json, string.concat(cb, ".leaf")),
                    "the rebuilt clause leaf is the SDK's"
                );
                bytes32[] memory proof = vm.parseJsonBytes32Array(json, string.concat(cb, ".membershipProof"));
                assertTrue(
                    MerkleProof.verify(proof, key, leaves[c]), "the frozen clause proof opens under the agreement key"
                );
                assertFalse(
                    MerkleProof.verify(proof, key, _leafOf(clauseKey ^ bytes32(uint256(1)), fillsHash)),
                    "a tampered clause key does not open"
                );
            }
            assertEq(AgreementTestHelper.rootFor(leaves), key, "the root over every clause leaf is the agreementKey");
        }
    }

    /// Every agreement's leaf is rebuilt as `recordAssemblyUsage` rebuilds it
    /// and its frozen membership proof opens under the compositionHash with the
    /// library the counter calls; the terms leaf is keyed by the counter's
    /// constant; the root over every leaf is the compositionHash; and every
    /// agreement's provenance bytes are the ones the counter reproduces from
    /// the two keys.
    function test_everyAssemblyVectorOpensUnderItsRoot() public view {
        string memory json = vm.readFile(ASSEMBLY_FIXTURE);
        uint256 n = _count(json, ".assemblies");
        assertGt(n, 0, "fixture carries assemblies");
        bool sawTerms;
        for (uint256 a = 0; a < n; a++) {
            string memory ab = string.concat(".assemblies[", vm.toString(a), "]");
            bytes32 root = vm.parseJsonBytes32(json, string.concat(ab, ".compositionHash"));
            uint256 entries = _count(json, string.concat(ab, ".agreements"));
            bool hasTerms = vm.keyExistsJson(json, string.concat(ab, ".terms.leaf"));
            bytes32[] memory leaves = new bytes32[](entries + (hasTerms ? 1 : 0));
            for (uint256 i = 0; i < entries; i++) {
                leaves[i] = _assertAgreement(json, string.concat(ab, ".agreements[", vm.toString(i), "]"), root);
            }
            if (hasTerms) {
                sawTerms = true;
                leaves[entries] = _assertTerms(json, string.concat(ab, ".terms"));
            }
            assertEq(AgreementTestHelper.rootFor(leaves), root, "the root over every leaf is the compositionHash");
        }
        assertTrue(sawTerms, "the fixture pins a terms leaf");
    }

    /// @dev One agreement: its content hash, its leaf, its membership proof,
    ///      and its provenance leaf. Returns the leaf.
    function _assertAgreement(string memory json, string memory sb, bytes32 root) internal view returns (bytes32 leaf) {
        bytes32 agreementKey = vm.parseJsonBytes32(json, string.concat(sb, ".agreementKey"));
        bytes32 slotContentHash = keccak256(bytes(vm.parseJsonString(json, string.concat(sb, ".agreementBytes"))));
        assertEq(
            slotContentHash,
            vm.parseJsonBytes32(json, string.concat(sb, ".slotContentHash")),
            "slotContentHash = keccak256(agreementBytes)"
        );
        leaf = _leafOf(agreementKey, slotContentHash);
        assertEq(leaf, vm.parseJsonBytes32(json, string.concat(sb, ".leaf")), "the rebuilt agreement leaf is the SDK's");
        bytes32[] memory proof = vm.parseJsonBytes32Array(json, string.concat(sb, ".membershipProof"));
        assertTrue(MerkleProof.verify(proof, root, leaf), "the frozen membership proof opens");
        assertFalse(
            MerkleProof.verify(proof, root, _leafOf(agreementKey ^ bytes32(uint256(1)), slotContentHash)),
            "another agreement's agreement leaf does not open"
        );

        string memory pb = string.concat(sb, ".provenance");
        assertEq(vm.parseJsonBytes32(json, string.concat(pb, ".leafKey")), provenanceLeaf, "the counter's key");
        assertEq(vm.parseJsonBytes32(json, string.concat(pb, ".agreementKey")), agreementKey, "names the agreement's");
        assertEq(vm.parseJsonBytes32(json, string.concat(pb, ".compositionHash")), root, "names the assembly");
        bytes32 clauseDataHash = keccak256(AgreementTestHelper.provenanceLeaf(agreementKey, root));
        assertEq(
            keccak256(bytes(vm.parseJsonString(json, string.concat(pb, ".clauseData")))),
            clauseDataHash,
            "the SDK's provenance bytes are the ones the counter reproduces"
        );
        assertEq(vm.parseJsonBytes32(json, string.concat(pb, ".clauseDataHash")), clauseDataHash);
        assertEq(
            vm.parseJsonBytes32(json, string.concat(pb, ".leaf")),
            _provenanceLeaf(agreementKey, root),
            "the rebuilt provenance leaf is the SDK's"
        );
    }

    /// @dev The terms leaf: keyed by the counter's constant, over the terms bytes.
    function _assertTerms(string memory json, string memory tb) internal view returns (bytes32 leaf) {
        assertEq(vm.parseJsonBytes32(json, string.concat(tb, ".leafKey")), assemblyTermsLeaf, "the counter's key");
        bytes32 clauseDataHash = keccak256(bytes(vm.parseJsonString(json, string.concat(tb, ".termsBytes"))));
        assertEq(vm.parseJsonBytes32(json, string.concat(tb, ".clauseDataHash")), clauseDataHash);
        leaf = _leafOf(assemblyTermsLeaf, clauseDataHash);
        assertEq(leaf, vm.parseJsonBytes32(json, string.concat(tb, ".leaf")), "the rebuilt terms leaf is the SDK's");
    }
}
