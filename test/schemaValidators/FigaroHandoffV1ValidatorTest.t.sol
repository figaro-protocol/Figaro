// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroHandoffV1Validator} from "../../src/schemaValidators/FigaroHandoffV1Validator.sol";

contract FigaroHandoffV1ValidatorTest is Test {
    FigaroHandoffV1Validator validator;
    bytes32 constant ID = keccak256("figaro-handoff-v1");
    bytes32 constant OTHER_ID = keccak256("figaro-other-v1");

    function setUp() public {
        validator = new FigaroHandoffV1Validator();
    }

    function test_schemaIdMatches() public view {
        assertEq(validator.schemaId(), ID);
    }

    function test_acceptsEachKnownMode() public view {
        for (uint8 m = 0; m <= 4; m++) {
            bytes memory c = abi.encode(m);
            validator.validate(ID, 0, c, c);
        }
    }

    function test_rejectsUnknownMode() public {
        bytes memory c5 = abi.encode(uint8(5));
        vm.expectRevert(abi.encodeWithSelector(FigaroHandoffV1Validator.InvalidMode.selector, uint8(5)));
        validator.validate(ID, 0, c5, c5);
        bytes memory c255 = abi.encode(uint8(255));
        vm.expectRevert(abi.encodeWithSelector(FigaroHandoffV1Validator.InvalidMode.selector, uint8(255)));
        validator.validate(ID, 0, c255, c255);
    }

    function test_rejectsMismatchedSchemaId() public {
        bytes memory c = abi.encode(uint8(0));
        vm.expectRevert(abi.encodeWithSelector(FigaroHandoffV1Validator.SchemaIdMismatch.selector, OTHER_ID, ID));
        validator.validate(OTHER_ID, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = abi.encode(uint8(0));
        bytes memory content = abi.encode(uint8(1));
        vm.expectRevert(FigaroHandoffV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }

    function test_acceptsAnyStage() public view {
        bytes memory c = abi.encode(uint8(0));
        validator.validate(ID, 0, c, c);
        validator.validate(ID, 1, c, c);
        validator.validate(ID, 255, c, c);
    }
}
