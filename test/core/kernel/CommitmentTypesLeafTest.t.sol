// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {CommitmentTypes} from "../../../src/core/kernel/CommitmentTypes.sol";
import {FigaroCore} from "../../../src/core/kernel/FigaroCore.sol";
import {UsageCounter} from "../../../src/rewards/UsageCounter.sol";
import {MembersRegistry} from "../../../src/registries/MembersRegistry.sol";
import {MockERC20} from "../../../src/mocks/MockERC20.sol";
import {AgreementTestHelper} from "../../helpers/AgreementTestHelper.sol";
import {SigningTestHelper} from "../../helpers/SigningTestHelper.sol";
import {MockClauseOrAssemblyStake} from "../../helpers/MockClauseOrAssemblyStake.sol";

/// @notice `CommitmentTypes.clauseLeaf` is the agreement format's one leaf: the
///         coordinator and the counter open every inclusion proof against it, so
///         it must equal the formula the SDK builds and the test helper's own copy.
///         An assembly's tree uses another leaf, `UsageCounter`'s, with the
///         counter's `processLeafDomain` mixed in, so that no agreement-format
///         leaf ever opens as an assembly leaf.
contract CommitmentTypesLeafTest is Test {
    uint256 internal constant BUYER_KEY = 0xB0B;
    uint256 internal constant SELLER_KEY = 0x5E11;

    FigaroCore internal core;
    UsageCounter internal counter;
    MockERC20 internal token;

    function setUp() public {
        core = new FigaroCore();
        token = new MockERC20("Test", "TST");
        MembersRegistry members = new MembersRegistry(0, 0);
        vm.prank(vm.addr(SELLER_KEY));
        members.register("ipfs://seller");
        MockClauseOrAssemblyStake stake = new MockClauseOrAssemblyStake();
        uint64[] memory periods = new uint64[](1);
        periods[0] = 1_000_000;
        counter = new UsageCounter(
            address(core), address(members), address(stake), address(stake), address(stake), address(0xBA7C), 1, periods
        );
        vm.warp(1_000_000 - 1000);
        address[2] memory parties = [vm.addr(BUYER_KEY), vm.addr(SELLER_KEY)];
        for (uint256 i = 0; i < 2; i++) {
            token.mint(parties[i], 1_000 ether);
            vm.prank(parties[i]);
            token.approve(address(core), type(uint256).max);
        }
    }

    function test_clauseLeafIsTheAgreementFormatsLeaf() public pure {
        bytes32 key = keccak256("a clause key");
        bytes memory data = bytes("{\"grams\":200}");
        bytes32 dataHash = keccak256(data);
        bytes32 expected = keccak256(bytes.concat(keccak256(abi.encodePacked(key, dataHash))));
        assertEq(CommitmentTypes.clauseLeaf(key, dataHash), expected, "the double-hashed 64-byte preimage");
        assertEq(
            CommitmentTypes.clauseLeaf(key, dataHash), AgreementTestHelper.leafFor(key, data), "the helper's own copy"
        );
    }

    /// An agreement-format leaf never opens as an assembly leaf in the real
    /// counter. The assembly tree here is a one-leaf tree whose root, the
    /// processDesignHash, is `CommitmentTypes.clauseLeaf(key, dataHash)`; the
    /// counter's `recordProcessDesignUsage` builds its own assembly leaf from
    /// (`key`, `dataHash`) and must refuse the membership. Were the counter's
    /// assembly leaf the agreement format's (its domain dropped), the empty
    /// proof would open and this test would fail. The order the counter reads
    /// is a real one, committed and resolved through `FigaroCore`, whose
    /// agreement is the provenance leaf naming `key` and that root.
    function testFuzz_clauseLeafNeverOpensAsAnAssemblyLeaf(bytes32 key, bytes32 dataHash) public {
        // The two reserved keys are refused before any leaf is built.
        if (key == counter.provenanceLeaf() || key == counter.processTermsLeaf()) key ^= bytes32(uint256(1));
        bytes32 processDesignHash = CommitmentTypes.clauseLeaf(key, dataHash);
        bytes32 provenance = CommitmentTypes.clauseLeaf(
            counter.provenanceLeaf(), keccak256(AgreementTestHelper.provenanceLeaf(key, processDesignHash))
        );

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: vm.addr(BUYER_KEY),
            seller: vm.addr(SELLER_KEY),
            token: address(token),
            payment: 1 ether,
            runningTotal: 1 ether,
            checkoutHash: provenance,
            salt: 1,
            commitDeadline: block.timestamp + 1 hours
        });
        (bytes32 processId,) = core.commit(
            c,
            SigningTestHelper.signCommitment(address(core), c, BUYER_KEY),
            SigningTestHelper.signCommitment(address(core), c, SELLER_KEY)
        );
        CommitmentTypes.Commitment[] memory all = new CommitmentTypes.Commitment[](1);
        all[0] = c;
        vm.prank(c.buyer);
        core.resolveProcess(processId, all);

        vm.expectRevert(UsageCounter.InvalidMembershipProof.selector);
        counter.recordProcessDesignUsage(c, processDesignHash, key, dataHash, new bytes32[](0), new bytes32[](0));
    }
}
