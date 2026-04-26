// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroGHGISO14064V1Validator} from "../../src/schemaValidators/FigaroGHGISO14064V1Validator.sol";

contract FigaroGHGISO14064V1ValidatorTest is Test {
    FigaroGHGISO14064V1Validator validator;
    bytes32 constant ID = keccak256("figaro-ghg-iso-14064-v1");

    function setUp() public {
        validator = new FigaroGHGISO14064V1Validator();
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
        vm.expectRevert(abi.encodeWithSelector(FigaroGHGISO14064V1Validator.InvalidScope.selector, uint8(4)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsMismatchedSchemaId() public {
        bytes memory c = _call(0);
        bytes32 other = keccak256("not-iso-14064");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroGHGISO14064V1Validator.SchemaIdMismatch.selector, other, ID)
        );
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _call(1);
        bytes memory content = _call(2);
        vm.expectRevert(FigaroGHGISO14064V1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
