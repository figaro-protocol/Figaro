// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {CommitmentTypes} from "../../../src/core/kernel/CommitmentTypes.sol";
import {AgreementTestHelper} from "../../helpers/AgreementTestHelper.sol";

/// @notice `CommitmentTypes.clauseLeaf` is the agreement format's one leaf: the
///         coordinator and the counter open every inclusion proof against it, so
///         it must equal the formula the SDK builds and the test helper's own copy.
contract CommitmentTypesLeafTest is Test {
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

    function testFuzz_clauseLeafNeverHasTheAssemblyTreesShape(bytes32 key, bytes32 dataHash) public pure {
        bytes32 formatLeaf = CommitmentTypes.clauseLeaf(key, dataHash);
        bytes32 assemblyLeaf = keccak256(
            bytes.concat(keccak256(abi.encodePacked(AgreementTestHelper.ASSEMBLY_LEAF_DOMAIN, key, dataHash)))
        );
        assertTrue(formatLeaf != assemblyLeaf, "the two trees never share a leaf");
    }
}
