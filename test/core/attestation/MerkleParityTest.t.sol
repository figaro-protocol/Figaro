// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroCore} from "src/core/kernel/FigaroCore.sol";
import {CommitmentTypes} from "src/core/kernel/CommitmentTypes.sol";
import {AttestationCoordinator} from "src/core/attestation/AttestationCoordinator.sol";
import {UsageCounter} from "src/rewards/UsageCounter.sol";
import {MembersRegistry} from "src/registries/MembersRegistry.sol";
import {MockERC20} from "src/mocks/MockERC20.sol";
import {AgreementTestHelper} from "test/helpers/AgreementTestHelper.sol";
import {SigningTestHelper} from "test/helpers/SigningTestHelper.sol";
import {MockClauseOrAssemblyStake} from "test/helpers/MockClauseOrAssemblyStake.sol";

/// @title MerkleParityTest — the Solidity leg of the three-way agreement-tree lock
/// @notice The SDK builds the agreement's merkle root and every clause's
///         inclusion proof (`sdk/tests/merkleParity.test.ts` freezes them into
///         `test/fixtures/merkle-vectors.json`); the batch path verifies them
///         in the guest (`prover/lib/tests/merkle_parity.rs` reads the same
///         file). Here every vector goes through the shipped contracts, never
///         through a copy of their leaf code:
///
///           - a clause leaf is `CommitmentTypes.clauseLeaf`, the one
///             definition both the coordinator and the counter open proofs
///             against, and it must equal the SDK's leaf;
///           - each frozen proof is opened by a real `AttestationCoordinator`
///             over an order a real `FigaroCore` committed with the vector's
///             root as its `checkoutHash`: the attestation is emitted, and a
///             tampered data hash is refused;
///           - the reserved PROVENANCE leaf is opened by a real `UsageCounter`
///             (`recordAgreementUsage`), which reproduces the leaf's bytes from
///             the two keys itself, once the order resolves;
///           - an assembly tree's agreement leaves are opened by a real
///             `UsageCounter.recordProcessDesignUsage`, which builds the
///             assembly leaf (`processLeafDomain` mixed in) itself.
///
///         What no shipped function opens: an assembly tree's TERMS leaf.
///         `recordProcessDesignUsage` refuses the terms key as an agreement
///         key, and no other function reads it, so the terms leaf's value is
///         not rebuilt here. The test checks its key is the counter's constant
///         and that the fixture's leaf is a member of the tree the
///         processDesignHash roots, and says no more.
///
///         `MERKLE_VECTORS` names another file in the same format: the
///         differential fuzz (`scripts/test-cross-impl-fuzz.sh`) points it at
///         the agreements the SDK generated from a seed.
contract MerkleParityTest is Test {
    string internal constant FIXTURE = "test/fixtures/merkle-vectors.json";
    string internal constant ASSEMBLY_FIXTURE = "test/fixtures/assembly-vectors.json";
    uint256 internal constant BUYER_KEY = 0xB0B;
    uint256 internal constant SELLER_KEY = 0x5E11;
    uint64 internal constant PERIOD_END = 1_000_000;

    string internal path;
    bool internal generated;

    FigaroCore internal core;
    AttestationCoordinator internal coordinator;
    UsageCounter internal counter;
    MockERC20 internal token;
    address internal buyer;
    address internal seller;
    uint256 internal nextSalt = 1;

    /// @dev The counter's own `provenanceLeaf` and `processTermsLeaf`, read
    ///      from the deployed counter so the keys under test are the contract's.
    bytes32 internal provenanceLeaf;
    bytes32 internal processTermsLeaf;

    function setUp() public {
        path = vm.envOr("MERKLE_VECTORS", FIXTURE);
        generated = keccak256(bytes(path)) != keccak256(bytes(FIXTURE));

        buyer = vm.addr(BUYER_KEY);
        seller = vm.addr(SELLER_KEY);
        core = new FigaroCore();
        coordinator = new AttestationCoordinator(address(core));
        token = new MockERC20("Test", "TST");
        MembersRegistry members = new MembersRegistry(0, 0);
        vm.prank(seller);
        members.register("ipfs://seller");
        // Every designer key is live: the subject here is the leaf and the
        // proof, not the stake gate (`UsageCounterTest` holds the gate).
        MockClauseOrAssemblyStake stake = new MockClauseOrAssemblyStake();
        uint64[] memory periods = new uint64[](1);
        periods[0] = PERIOD_END;
        counter = new UsageCounter(
            address(core), address(members), address(stake), address(stake), address(stake), address(0xBA7C), 1, periods
        );
        vm.warp(PERIOD_END - 1000);
        provenanceLeaf = counter.provenanceLeaf();
        processTermsLeaf = counter.processTermsLeaf();
        assertEq(
            counter.processLeafDomain(),
            keccak256("figaro-assembly-leaf"),
            "the assembly tree's leaf domain is the hash of its label"
        );

        address[2] memory parties = [buyer, seller];
        for (uint256 i = 0; i < 2; i++) {
            token.mint(parties[i], type(uint128).max);
            vm.prank(parties[i]);
            token.approve(address(core), type(uint256).max);
        }
    }

    // ── Orders over a vector's root, through the real Core ──────────

    /// @dev An order the Core committed, and the ids it returned.
    struct Placed {
        CommitmentTypes.Commitment c;
        bytes32 processId;
        bytes32 orderHash;
    }

    /// @dev Commits a one-order process whose agreement root is `checkoutHash`.
    function _commitOver(bytes32 checkoutHash) internal returns (Placed memory p) {
        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            token: address(token),
            payment: 1 ether,
            runningTotal: 1 ether,
            checkoutHash: checkoutHash,
            salt: nextSalt++,
            commitDeadline: block.timestamp + 1 hours
        });
        p.c = c;
        (p.processId, p.orderHash) = core.commit(
            c,
            SigningTestHelper.signCommitment(address(core), c, BUYER_KEY),
            SigningTestHelper.signCommitment(address(core), c, SELLER_KEY)
        );
    }

    function _resolve(Placed memory p) internal {
        CommitmentTypes.Commitment[] memory all = new CommitmentTypes.Commitment[](1);
        all[0] = p.c;
        vm.prank(buyer);
        core.resolveProcess(p.processId, all);
    }

    /// @dev The coordinator opens `proof` for (`key`, `dataHash`) under the
    ///      order's root and emits the attestation; a tampered data hash is
    ///      refused by name.
    function _coordinatorOpens(Placed memory p, bytes32 key, bytes32 dataHash, bytes32[] memory proof) internal {
        vm.expectEmit(true, true, true, true, address(coordinator));
        emit AttestationCoordinator.Attestation(p.orderHash, p.processId, seller, key, 0, dataHash);
        vm.prank(seller);
        coordinator.attestAsSeller(p.c, key, 0, dataHash, proof, dataHash);

        bytes32 tampered = dataHash ^ bytes32(uint256(1));
        vm.expectRevert(
            abi.encodeWithSelector(AttestationCoordinator.InvalidInclusionProof.selector, p.c.checkoutHash, key)
        );
        vm.prank(seller);
        coordinator.attestAsSeller(p.c, key, 0, tampered, proof, tampered);
    }

    // ── The agreement trees ─────────────────────────────────────────

    /// @dev One frozen clause of `merkle-vectors.json`: the shipped leaf is
    ///      the SDK's, and the coordinator opens its proof under the order.
    function _assertClause(string memory json, string memory sb, Placed memory p) internal {
        bytes32 key = vm.parseJsonBytes32(json, string.concat(sb, ".clauseKey"));
        bytes32 dataHash = keccak256(bytes(vm.parseJsonString(json, string.concat(sb, ".clauseData"))));
        assertEq(
            CommitmentTypes.clauseLeaf(key, dataHash),
            vm.parseJsonBytes32(json, string.concat(sb, ".leaf")),
            "the shipped clause leaf is the SDK's"
        );
        _coordinatorOpens(p, key, dataHash, vm.parseJsonBytes32Array(json, string.concat(sb, ".proof")));
    }

    function test_everyFrozenProofOpensInTheCoordinator() public {
        // Held in memory: every lookup below passes the whole file to the
        // cheatcode, and from storage that is one SLOAD per word per lookup.
        string memory json = vm.readFile(path);
        uint256 agreements = vm.parseJsonUint(json, ".agreementCount");
        assertGt(agreements, 0, "fixture carries agreements");
        for (uint256 a = 0; a < agreements; a++) {
            string memory ab = string.concat(".agreements[", vm.toString(a), "]");
            bytes32 root = vm.parseJsonBytes32(json, string.concat(ab, ".checkoutHash"));
            Placed memory p = _commitOver(root);
            uint256 clauseCount = vm.parseJsonUint(json, string.concat(ab, ".clauseCount"));
            for (uint256 i = 0; i < clauseCount; i++) {
                _assertClause(json, string.concat(ab, ".clauses[", vm.toString(i), "]"), p);
            }
            _assertProvenanceLeaf(json, ab, p);
        }
    }

    /// @dev The agreement's optional `provenance` entry: the reserved key is
    ///      the counter's constant; the coordinator opens the frozen proof for
    ///      the frozen bytes; and once the order resolves, the counter opens it
    ///      from the two keys alone, reproducing the bytes itself, and refuses
    ///      another composition's.
    function _assertProvenanceLeaf(string memory json, string memory ab, Placed memory p) internal {
        string memory pb = string.concat(ab, ".provenance");
        if (!vm.keyExistsJson(json, pb)) return;
        assertEq(
            vm.parseJsonBytes32(json, string.concat(pb, ".leafKey")),
            provenanceLeaf,
            "the SDK's reserved key is the counter's"
        );
        bytes32 agreementHash = vm.parseJsonBytes32(json, string.concat(pb, ".agreementHash"));
        bytes32 processDesignHash = vm.parseJsonBytes32(json, string.concat(pb, ".processDesignHash"));
        bytes32 dataHash = keccak256(bytes(vm.parseJsonString(json, string.concat(pb, ".clauseData"))));
        assertEq(
            CommitmentTypes.clauseLeaf(provenanceLeaf, dataHash),
            vm.parseJsonBytes32(json, string.concat(pb, ".leaf")),
            "the shipped leaf over the SDK's provenance bytes is the SDK's"
        );
        bytes32[] memory proof = vm.parseJsonBytes32Array(json, string.concat(pb, ".proof"));
        _coordinatorOpens(p, provenanceLeaf, dataHash, proof);

        _resolve(p);
        vm.expectRevert(UsageCounter.InvalidInclusionProof.selector);
        counter.recordAgreementUsage(p.c, agreementHash, processDesignHash ^ bytes32(uint256(1)), proof);
        vm.expectRevert(UsageCounter.InvalidInclusionProof.selector);
        counter.recordAgreementUsage(p.c, agreementHash ^ bytes32(uint256(1)), processDesignHash, proof);
        (uint64 before,,) = counter.accrualOf(counter.KIND_AGREEMENT(), agreementHash, 0);
        counter.recordAgreementUsage(p.c, agreementHash, processDesignHash, proof);
        (uint64 count,,) = counter.accrualOf(counter.KIND_AGREEMENT(), agreementHash, 0);
        assertEq(count, before + 1, "the counter opened the provenance leaf from the two keys");
    }

    /// The fixture pins one agreement that instantiated an assembly, so the
    /// provenance leg is never vacuous on the frozen file.
    function test_theFixturePinsAProvenanceLeaf() public view {
        if (generated) return; // the pinned case is the fixture's
        string memory json = vm.readFile(path);
        assertTrue(vm.keyExistsJson(json, ".agreements[2].provenance"), "the third agreement carries the leaf");
    }

    /// A single-clause agreement's root IS its leaf and its proof is empty —
    /// the case the fixture's second agreement pins. The coordinator opens it.
    function test_singleClauseRootIsTheLeaf() public {
        if (generated) return; // the pinned case is the fixture's
        string memory json = vm.readFile(path);
        bytes32 root = vm.parseJsonBytes32(json, ".agreements[1].checkoutHash");
        assertEq(vm.parseJsonUint(json, ".agreements[1].clauseCount"), 1);
        bytes32 key = vm.parseJsonBytes32(json, ".agreements[1].clauses[0].clauseKey");
        bytes32 dataHash = keccak256(bytes(vm.parseJsonString(json, ".agreements[1].clauses[0].clauseData")));
        assertEq(root, CommitmentTypes.clauseLeaf(key, dataHash), "root == the shipped leaf");
        assertEq(vm.parseJsonBytes32Array(json, ".agreements[1].clauses[0].proof").length, 0, "empty proof");
        Placed memory p = _commitOver(root);
        _coordinatorOpens(p, key, dataHash, new bytes32[](0));
    }

    // ── The assembly's tree ─────────────────────────────────────────

    /// @dev The length of the JSON array at `key`.
    function _count(string memory json, string memory key) internal view returns (uint256 n) {
        while (vm.keyExistsJson(json, string.concat(key, "[", vm.toString(n), "]"))) n++;
    }

    /// Every registered agreement's hash is the merkle root over one leaf per
    /// composed clause, under the one leaf convention: each clause leaf is the
    /// shipped `clauseLeaf` over the designer's fills, and the coordinator
    /// opens each frozen membership proof over an order whose root is the
    /// agreementHash.
    function test_everyAgreementHashIsTheRootOverItsClauseLeaves() public {
        string memory json = vm.readFile(ASSEMBLY_FIXTURE);
        uint256 n = _count(json, ".agreements");
        assertGt(n, 0, "fixture carries agreements");
        for (uint256 a = 0; a < n; a++) {
            string memory ab = string.concat(".agreements[", vm.toString(a), "]");
            bytes32 key = vm.parseJsonBytes32(json, string.concat(ab, ".agreementHash"));
            Placed memory p = _commitOver(key);
            uint256 clauses = _count(json, string.concat(ab, ".clauses"));
            assertGt(clauses, 0, "an agreement composes at least one clause");
            for (uint256 i = 0; i < clauses; i++) {
                _assertAgreementClause(json, string.concat(ab, ".clauses[", vm.toString(i), "]"), p);
            }
        }
    }

    /// @dev One clause of a registered agreement: the fills hash, the shipped
    ///      leaf, and the coordinator opening the membership proof.
    function _assertAgreementClause(string memory json, string memory cb, Placed memory p) internal {
        bytes32 fillsHash = keccak256(bytes(vm.parseJsonString(json, string.concat(cb, ".fillsBytes"))));
        assertEq(
            fillsHash, vm.parseJsonBytes32(json, string.concat(cb, ".fillsHash")), "fillsHash = keccak256(fillsBytes)"
        );
        bytes32 clauseKey = vm.parseJsonBytes32(json, string.concat(cb, ".clauseKey"));
        assertEq(
            CommitmentTypes.clauseLeaf(clauseKey, fillsHash),
            vm.parseJsonBytes32(json, string.concat(cb, ".leaf")),
            "the shipped clause leaf is the SDK's"
        );
        _coordinatorOpens(
            p, clauseKey, fillsHash, vm.parseJsonBytes32Array(json, string.concat(cb, ".membershipProof"))
        );
    }

    /// Every agreement's leaf in an assembly's tree is opened by the real
    /// counter: an order whose root is the agreement's provenance leaf (the
    /// shipped `clauseLeaf` over the SDK's provenance bytes) resolves, and
    /// `recordProcessDesignUsage` builds the agreement's assembly leaf itself
    /// and opens the frozen membership proof under the processDesignHash; a
    /// tampered content hash is refused. The terms leaf's key is the
    /// counter's constant; no shipped function opens its value (see the
    /// contract notice).
    function test_everyAssemblyVectorOpensUnderItsRoot() public {
        string memory json = vm.readFile(ASSEMBLY_FIXTURE);
        uint256 n = _count(json, ".assemblies");
        assertGt(n, 0, "fixture carries assemblies");
        bool sawTerms;
        for (uint256 a = 0; a < n; a++) {
            string memory ab = string.concat(".assemblies[", vm.toString(a), "]");
            bytes32 root = vm.parseJsonBytes32(json, string.concat(ab, ".processDesignHash"));
            uint256 entries = _count(json, string.concat(ab, ".agreements"));
            bool hasTerms = vm.keyExistsJson(json, string.concat(ab, ".terms.leaf"));
            bytes32[] memory leaves = new bytes32[](entries + (hasTerms ? 1 : 0));
            for (uint256 i = 0; i < entries; i++) {
                leaves[i] = _assertAgreement(json, string.concat(ab, ".agreements[", vm.toString(i), "]"), root);
            }
            if (hasTerms) {
                sawTerms = true;
                string memory tb = string.concat(ab, ".terms");
                assertEq(
                    vm.parseJsonBytes32(json, string.concat(tb, ".leafKey")), processTermsLeaf, "the counter's key"
                );
                leaves[entries] = vm.parseJsonBytes32(json, string.concat(tb, ".leaf"));
            }
            // The fixture's leaves, every agreement leaf among them opened by
            // the counter above, make up exactly the tree the root names.
            assertEq(AgreementTestHelper.rootFor(leaves), root, "the root over every leaf is the processDesignHash");
        }
        assertTrue(sawTerms, "the fixture pins a terms leaf");
    }

    /// @dev One agreement of an assembly: its provenance bytes, and its leaf
    ///      opened under the root by the counter. Returns the SDK's leaf.
    function _assertAgreement(string memory json, string memory sb, bytes32 root) internal returns (bytes32 leaf) {
        bytes32 agreementHash = vm.parseJsonBytes32(json, string.concat(sb, ".agreementHash"));
        bytes32 contentHash = keccak256(bytes(vm.parseJsonString(json, string.concat(sb, ".agreementBytes"))));
        assertEq(
            contentHash,
            vm.parseJsonBytes32(json, string.concat(sb, ".agreementContentHash")),
            "agreementContentHash = keccak256(agreementBytes)"
        );
        leaf = vm.parseJsonBytes32(json, string.concat(sb, ".leaf"));

        string memory pb = string.concat(sb, ".provenance");
        assertEq(vm.parseJsonBytes32(json, string.concat(pb, ".leafKey")), provenanceLeaf, "the counter's key");
        assertEq(vm.parseJsonBytes32(json, string.concat(pb, ".agreementHash")), agreementHash, "names the agreement's");
        assertEq(vm.parseJsonBytes32(json, string.concat(pb, ".processDesignHash")), root, "names the assembly");
        bytes32 provenanceDataHash = keccak256(bytes(vm.parseJsonString(json, string.concat(pb, ".clauseData"))));
        assertEq(vm.parseJsonBytes32(json, string.concat(pb, ".clauseDataHash")), provenanceDataHash);
        bytes32 provenance = CommitmentTypes.clauseLeaf(provenanceLeaf, provenanceDataHash);
        assertEq(
            provenance,
            vm.parseJsonBytes32(json, string.concat(pb, ".leaf")),
            "the shipped provenance leaf is the SDK's"
        );

        // An order whose agreement is the provenance leaf alone (a one-leaf
        // tree: the root is the leaf, the proof empty), resolved.
        Placed memory p = _commitOver(provenance);
        _resolve(p);
        bytes32[] memory membershipProof = vm.parseJsonBytes32Array(json, string.concat(sb, ".membershipProof"));

        vm.expectRevert(UsageCounter.InvalidMembershipProof.selector);
        counter.recordProcessDesignUsage(
            p.c, root, agreementHash, contentHash ^ bytes32(uint256(1)), new bytes32[](0), membershipProof
        );
        (uint64 before,,) = counter.accrualOf(counter.KIND_PROCESS(), root, 0);
        counter.recordProcessDesignUsage(p.c, root, agreementHash, contentHash, new bytes32[](0), membershipProof);
        (uint64 count,,) = counter.accrualOf(counter.KIND_PROCESS(), root, 0);
        assertEq(count, before + 1, "the counter opened the agreement's leaf under the processDesignHash");
    }
}
