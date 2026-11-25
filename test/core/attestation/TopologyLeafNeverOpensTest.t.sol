// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroCore} from "src/core/kernel/FigaroCore.sol";
import {CommitmentTypes} from "src/core/kernel/CommitmentTypes.sol";
import {AttestationCoordinator} from "src/core/attestation/AttestationCoordinator.sol";
import {MembersRegistry} from "src/registries/MembersRegistry.sol";
import {UsageCounter} from "src/rewards/UsageCounter.sol";
import {MockERC20} from "src/mocks/MockERC20.sol";
import {AgreementTestHelper} from "test/helpers/AgreementTestHelper.sol";
import {SigningTestHelper} from "test/helpers/SigningTestHelper.sol";
import {MockClauseOrAssemblyStake} from "test/helpers/MockClauseOrAssemblyStake.sol";

/// @notice An agreement's topology leaf does not open as a clause leaf.
///
///         The topology leaf is `keccak256(keccak256(TOPOLOGY_LEAF_DOMAIN ‖ uint256(n) ‖ dataHash))`,
///         a 96-byte inner preimage, where the clause leaf both contracts
///         rebuild, `CommitmentTypes.clauseLeaf`, hashes a 64-byte one
///         (`docs/DESIGN_DECISIONS.md` § 31; `computeTopologyLeaf`,
///         `sdk/src/agreement.ts`). This file builds an agreement root over
///         one clause leaf and one topology leaf, in the SDK's bytes (pinned to
///         the SDK's vector in `test/fixtures/merkle-vectors.json`), and hands
///         each contract the topology leaf's own inclusion proof.
///
///         What it proves: `AttestationCoordinator` refuses an attestation, by
///         buyer or seller, that names the topology leaf's position under the
///         topology domain as its clause key, or under a fuzzed key, with a
///         fuzzed `clauseDataHash`; `UsageCounter.recordClauseUsage` refuses
///         the same once the order resolves. The clause leaf of the same order
///         opens in both, so the refusal is the leaf's shape and nothing else.
///
///         What it does not prove: a fuzz test samples the inputs; it shows no
///         sampled (key, hash) pair opens the leaf, not that none exists. That
///         none exists rests on keccak256 being collision resistant across the
///         two preimage lengths. The batch path's proof program is not run here.
contract TopologyLeafNeverOpensTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    /// @dev The SDK's `TOPOLOGY_LEAF_DOMAIN`. No contract holds it.
    bytes32 internal constant TOPOLOGY_LEAF_DOMAIN = keccak256("figaro-agreement-topology");

    /// @dev The SDK's `computeTopologyLeaf([FOLLOWED])`, the leaf this file's tree holds.
    ///      The SDK's fixture holds no one-edge topology vector, so this value
    ///      is written here; the empty topology leaf is read from the fixture.
    bytes32 internal constant SDK_ONE_EDGE_TOPOLOGY_LEAF =
        0x273816c76df314153c93a9c7a224e643f4a0b87341ab2acae9c19abfb4cfefe5;

    bytes32 internal constant CLAUSE_KEY = keccak256('{"clauseId":"a-clause","version":1}');
    bytes internal constant CLAUSE_DATA = hex"c0ffee";
    /// @dev `0x1cbaf93c…45ab`, the edge the SDK-side value above was computed for.
    bytes32 internal constant FOLLOWED = keccak256("an order this order follows");

    uint256 internal constant BUYER_KEY = 0xB0;
    uint256 internal constant SELLER_KEY = 0x51;
    uint64 internal constant P0_END = 1_000_000;

    FigaroCore internal core;
    AttestationCoordinator internal coordinator;
    UsageCounter internal counter;
    MockERC20 internal token;

    address internal buyer;
    address internal seller;

    bytes32[] internal leaves;
    bytes32 internal topologyLeaf;
    bytes32 internal root;
    bytes32[] internal topologyProof;
    bytes32[] internal clauseProof;
    CommitmentTypes.Commitment internal order;
    bytes32 internal processId;
    bytes32 internal orderHash;

    /// @dev The topology leaf as the SDK builds it: the canonical JSON
    ///      `{"follows":["0x<64 lowercase hex>",…]}`, its keccak256 as the data
    ///      hash, and the edge count as a 32-byte word between it and the domain.
    function _topologyLeaf(bytes32[] memory follows) internal pure returns (bytes32) {
        bytes memory json = '{"follows":[';
        for (uint256 i = 0; i < follows.length; i++) {
            json = abi.encodePacked(json, i == 0 ? "" : ",", '"', vm.toString(follows[i]), '"');
        }
        json = abi.encodePacked(json, "]}");
        return
            keccak256(bytes.concat(keccak256(abi.encodePacked(TOPOLOGY_LEAF_DOMAIN, follows.length, keccak256(json)))));
    }

    function setUp() public {
        buyer = vm.addr(BUYER_KEY);
        seller = vm.addr(SELLER_KEY);
        core = new FigaroCore();
        coordinator = new AttestationCoordinator(address(core));
        token = new MockERC20("Test", "TST");

        MembersRegistry members = new MembersRegistry(0, 0);
        vm.prank(seller);
        members.register("ipfs://seller");
        MockClauseOrAssemblyStake stake = new MockClauseOrAssemblyStake();
        uint64[] memory periods = new uint64[](1);
        periods[0] = P0_END;
        counter = new UsageCounter(
            address(core), address(members), address(stake), address(stake), address(stake), address(0xBA7C), 1, periods
        );
        vm.warp(P0_END - 1000);

        bytes32[] memory follows = new bytes32[](1);
        follows[0] = FOLLOWED;
        topologyLeaf = _topologyLeaf(follows);
        leaves.push(AgreementTestHelper.leafFor(CLAUSE_KEY, CLAUSE_DATA));
        leaves.push(topologyLeaf);
        root = AgreementTestHelper.rootFor(leaves);
        clauseProof = AgreementTestHelper.proofFor(leaves, 0);
        topologyProof = AgreementTestHelper.proofFor(leaves, 1);

        address[2] memory parties = [buyer, seller];
        for (uint256 i = 0; i < 2; i++) {
            token.mint(parties[i], 1_000 ether);
            vm.prank(parties[i]);
            token.approve(address(core), type(uint256).max);
        }
        order = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            token: address(token),
            payment: 10 ether,
            runningTotal: 10 ether,
            checkoutHash: root,
            salt: 1,
            commitDeadline: block.timestamp + 1 hours
        });
        (processId, orderHash) = core.commit(
            order,
            SigningTestHelper.signCommitment(address(core), order, BUYER_KEY),
            SigningTestHelper.signCommitment(address(core), order, SELLER_KEY)
        );
    }

    /// @dev The SDK's topology leaf for a root order (`follows: []`), read from
    ///      the vector `one-clause-a-topology-and-a-design` in
    ///      `test/fixtures/merkle-vectors.json`.
    function _sdkEmptyTopologyLeaf() internal view returns (bytes32) {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/merkle-vectors.json"));
        assertEq(
            vm.parseJsonString(json, ".agreements[2].label"),
            "one-clause-a-topology-and-a-design",
            "the fixture's third agreement is the topology vector"
        );
        assertEq(vm.parseJsonString(json, ".agreements[2].topology.clauseData"), '{"follows":[]}', "no edge");
        return vm.parseJsonBytes32(json, ".agreements[2].topology.leaf");
    }

    function _resolve() internal {
        CommitmentTypes.Commitment[] memory all = new CommitmentTypes.Commitment[](1);
        all[0] = order;
        vm.prank(buyer);
        core.resolveProcess(processId, all);
    }

    function _expectCoordinatorRefuses(bytes32 clauseId, bytes32 clauseDataHash) internal {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(AttestationCoordinator.InvalidInclusionProof.selector, root, clauseId));
        coordinator.attestAsBuyer(order, clauseId, 0, clauseDataHash, topologyProof, clauseDataHash);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(AttestationCoordinator.InvalidInclusionProof.selector, root, clauseId));
        coordinator.attestAsSeller(order, clauseId, 1, clauseDataHash, topologyProof, clauseDataHash);
    }

    /// The Solidity leaf here is the SDK's: with no edge and with one edge it
    /// equals what the SDK's `computeTopologyLeaf` returns, and the tree holds
    /// it beside the clause leaf.
    function test_theTopologyLeafIsTheSdksAndIsALeafOfTheRoot() public view {
        assertEq(_topologyLeaf(new bytes32[](0)), _sdkEmptyTopologyLeaf(), "the SDK's empty topology leaf");
        assertEq(topologyLeaf, SDK_ONE_EDGE_TOPOLOGY_LEAF, "the SDK's one-edge topology leaf");
        assertEq(topologyProof.length, 1, "the topology leaf's proof is its sibling");
        assertEq(AgreementTestHelper.rootFor(leaves), order.checkoutHash, "the order signs this root");
    }

    /// The same order's clause leaf opens in the coordinator: the order is
    /// known and open, and the proof is the tree's.
    function test_theClauseLeafOfTheSameOrderOpensInTheCoordinator() public {
        vm.expectEmit(true, true, true, true, address(coordinator));
        emit AttestationCoordinator.Attestation(orderHash, processId, buyer, CLAUSE_KEY, 0, bytes32(0));
        vm.prank(buyer);
        coordinator.attestAsBuyer(order, CLAUSE_KEY, 0, keccak256(CLAUSE_DATA), clauseProof, bytes32(0));
    }

    /// Under the topology domain as the clause key, no sampled data hash
    /// opens the topology leaf in the coordinator, for buyer or seller.
    function testFuzz_theCoordinatorRefusesTheTopologyLeafUnderItsDomain(bytes32 clauseDataHash) public {
        _expectCoordinatorRefuses(TOPOLOGY_LEAF_DOMAIN, clauseDataHash);
    }

    /// Under any sampled clause key and data hash, the topology leaf's proof
    /// opens nothing in the coordinator.
    function testFuzz_theCoordinatorRefusesTheTopologyLeafUnderAnyKey(bytes32 clauseId, bytes32 clauseDataHash) public {
        _expectCoordinatorRefuses(clauseId, clauseDataHash);
    }

    /// Once the order resolves, its clause leaf counts in the counter.
    function test_theClauseLeafOfTheSameOrderCountsOnceResolved() public {
        _resolve();
        counter.recordClauseUsage(order, CLAUSE_KEY, keccak256(CLAUSE_DATA), clauseProof);
        (uint64 count,,) = counter.accrualOf(0, CLAUSE_KEY, 0);
        assertEq(count, 1, "the clause counts once");
    }

    /// Once the order resolves, no sampled data hash under the topology
    /// domain opens the topology leaf in the counter.
    function testFuzz_theCounterRefusesTheTopologyLeafUnderItsDomain(bytes32 clauseDataHash) public {
        _resolve();
        vm.expectRevert(UsageCounter.InvalidInclusionProof.selector);
        counter.recordClauseUsage(order, TOPOLOGY_LEAF_DOMAIN, clauseDataHash, topologyProof);
    }

    /// Once the order resolves, no sampled clause key and data hash opens
    /// the topology leaf in the counter.
    function testFuzz_theCounterRefusesTheTopologyLeafUnderAnyKey(bytes32 clauseId, bytes32 clauseDataHash) public {
        _resolve();
        vm.expectRevert(UsageCounter.InvalidInclusionProof.selector);
        counter.recordClauseUsage(order, clauseId, clauseDataHash, topologyProof);
    }
}
