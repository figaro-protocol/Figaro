// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroGHGProtocolV1Validator} from "../../src/schemaValidators/FigaroGHGProtocolV1Validator.sol";

contract FigaroGHGProtocolV1ValidatorTest is Test {
    FigaroGHGProtocolV1Validator validator;
    bytes32 constant ID = keccak256("figaro-ghg-protocol-v1");

    function setUp() public {
        validator = new FigaroGHGProtocolV1Validator();
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
        vm.expectRevert(abi.encodeWithSelector(FigaroGHGProtocolV1Validator.InvalidScope.selector, uint8(4)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsMismatchedSchemaId() public {
        bytes memory c = _call(0);
        bytes32 other = keccak256("not-ghg-protocol");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroGHGProtocolV1Validator.SchemaIdMismatch.selector, other, ID)
        );
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _call(1); // Scope 1
        bytes memory content = _call(2); // Scope 2 — drift
        vm.expectRevert(FigaroGHGProtocolV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
