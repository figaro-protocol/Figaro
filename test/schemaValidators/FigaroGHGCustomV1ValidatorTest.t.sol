// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroGHGCustomV1Validator} from "../../src/schemaValidators/FigaroGHGCustomV1Validator.sol";

contract FigaroGHGCustomV1ValidatorTest is Test {
    FigaroGHGCustomV1Validator validator;
    bytes32 constant ID = keccak256("figaro-ghg-custom-v1");

    function setUp() public {
        validator = new FigaroGHGCustomV1Validator();
    }

    function _call(uint8 scope) internal pure returns (bytes memory) {
        return abi.encode(scope);
    }

    function test_schemaIdMatches() public view {
        assertEq(validator.schemaId(), ID);
    }

    function test_acceptsUnsetScope() public view {
        bytes memory c = _call(0);
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsAllKnownScopes() public view {
        for (uint8 s = 0; s <= 3; s++) {
            bytes memory c = _call(s);
            validator.validate(ID, 0, c, c);
        }
    }

    function test_rejectsScopeAboveThree() public {
        bytes memory c = _call(4);
        vm.expectRevert(abi.encodeWithSelector(FigaroGHGCustomV1Validator.InvalidScope.selector, uint8(4)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsMismatchedSchemaId() public {
        bytes memory c = _call(0);
        bytes32 other = keccak256("not-ghg-custom");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroGHGCustomV1Validator.SchemaIdMismatch.selector, other, ID)
        );
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _call(1);
        bytes memory content = _call(2);
        vm.expectRevert(FigaroGHGCustomV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
