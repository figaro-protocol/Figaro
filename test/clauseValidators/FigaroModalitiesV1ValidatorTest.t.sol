// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroModalitiesV1Validator} from "../../src/clauseValidators/FigaroModalitiesV1Validator.sol";

contract FigaroModalitiesV1ValidatorTest is Test {
    FigaroModalitiesV1Validator validator;
    bytes32 constant ID = keccak256(abi.encode("figaro-modalities", uint64(1)));
    bytes32 constant OTHER_ID = keccak256(abi.encode("figaro-other", uint64(1)));

    // Canonical 0-based enum positions (the spec's value order):
    //   0=consume-onsite, 1=pickup, 2=delivery, 3=virtual
    // Single-select: one modality per assembly; variety = an array of
    // assemblies. Coordination is its own clause (figaro-coordination-v1).

    function setUp() public {
        validator = new FigaroModalitiesV1Validator();
    }

    function test_clauseIdMatches() public view {
        assertEq(validator.clauseId(), ID);
    }

    function test_acceptsEveryValidModality() public view {
        for (uint8 m = 0; m <= 3; m++) {
            bytes memory c = abi.encode(m);
            validator.validate(ID, 0, c, c);
        }
    }

    function test_rejectsOutOfRangeModality() public {
        bytes memory c = abi.encode(uint8(4));
        vm.expectRevert(abi.encodeWithSelector(FigaroModalitiesV1Validator.InvalidModality.selector, uint8(4)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsMismatchedClauseId() public {
        bytes memory c = abi.encode(uint8(0));
        vm.expectRevert(abi.encodeWithSelector(FigaroModalitiesV1Validator.ClauseIdMismatch.selector, OTHER_ID, ID));
        validator.validate(OTHER_ID, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = abi.encode(uint8(0));
        bytes memory content = abi.encode(uint8(1));
        vm.expectRevert(FigaroModalitiesV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }

    function test_acceptsAnyStage() public view {
        bytes memory c = abi.encode(uint8(2));
        validator.validate(ID, 0, c, c);
        validator.validate(ID, 1, c, c);
        validator.validate(ID, 255, c, c);
    }
}
