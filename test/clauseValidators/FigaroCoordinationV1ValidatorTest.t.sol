// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroCoordinationV1Validator} from "../../src/clauseValidators/FigaroCoordinationV1Validator.sol";

contract FigaroCoordinationV1ValidatorTest is Test {
    FigaroCoordinationV1Validator validator;
    bytes32 constant ID = keccak256(abi.encode("figaro-coordination", uint64(1)));
    bytes32 constant OTHER_ID = keccak256(abi.encode("figaro-other", uint64(1)));

    // Canonical 0-based enum positions (the spec's value order):
    //   0=seller-assigned, 1=buyer-assigned, 2=dutch-auction
    // Single-select: coordination variants are separate assemblies.

    function setUp() public {
        validator = new FigaroCoordinationV1Validator();
    }

    function test_clauseIdMatches() public view {
        assertEq(validator.clauseId(), ID);
    }

    function test_acceptsEveryValidCoordination() public view {
        for (uint8 c = 0; c <= 2; c++) {
            bytes memory data = abi.encode(c);
            validator.validate(ID, 0, data, data);
        }
    }

    function test_rejectsOutOfRangeCoordination() public {
        bytes memory c = abi.encode(uint8(3));
        vm.expectRevert(abi.encodeWithSelector(FigaroCoordinationV1Validator.InvalidCoordination.selector, uint8(3)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsMismatchedClauseId() public {
        bytes memory c = abi.encode(uint8(0));
        vm.expectRevert(abi.encodeWithSelector(FigaroCoordinationV1Validator.ClauseIdMismatch.selector, OTHER_ID, ID));
        validator.validate(OTHER_ID, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = abi.encode(uint8(0));
        bytes memory content = abi.encode(uint8(1));
        vm.expectRevert(FigaroCoordinationV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }

    function test_acceptsAnyStage() public view {
        bytes memory c = abi.encode(uint8(1));
        validator.validate(ID, 0, c, c);
        validator.validate(ID, 1, c, c);
        validator.validate(ID, 255, c, c);
    }
}
