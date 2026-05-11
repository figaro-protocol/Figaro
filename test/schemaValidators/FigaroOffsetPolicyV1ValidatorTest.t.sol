// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroOffsetPolicyV1Validator} from "../../src/schemaValidators/FigaroOffsetPolicyV1Validator.sol";

contract FigaroOffsetPolicyV1ValidatorTest is Test {
    FigaroOffsetPolicyV1Validator validator;
    bytes32 constant ID = keccak256("figaro-offset-policy-v1");

    function setUp() public {
        validator = new FigaroOffsetPolicyV1Validator();
    }

    function _encode(uint8[] memory providers) internal pure returns (bytes memory) {
        return abi.encode(providers);
    }

    function _u8(uint8 a) internal pure returns (uint8[] memory arr) {
        arr = new uint8[](1);
        arr[0] = a;
    }

    function _u8(uint8 a, uint8 b) internal pure returns (uint8[] memory arr) {
        arr = new uint8[](2);
        arr[0] = a;
        arr[1] = b;
    }

    function test_schemaIdMatches() public view {
        assertEq(validator.schemaId(), ID);
    }

    function test_acceptsEachKnownProvider() public view {
        for (uint8 p = 1; p <= 4; p++) {
            bytes memory c = _encode(_u8(p));
            validator.validate(ID, 0, c, c);
        }
    }

    function test_acceptsMultipleProviders() public view {
        bytes memory c = _encode(_u8(1, 4));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsEmptyProviders() public {
        uint8[] memory empty = new uint8[](0);
        bytes memory c = _encode(empty);
        vm.expectRevert(FigaroOffsetPolicyV1Validator.ProvidersEmpty.selector);
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsZeroProviderIndex() public {
        bytes memory c = _encode(_u8(0));
        vm.expectRevert(abi.encodeWithSelector(FigaroOffsetPolicyV1Validator.InvalidProvider.selector, uint8(0)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsProviderAboveFour() public {
        bytes memory c = _encode(_u8(5));
        vm.expectRevert(abi.encodeWithSelector(FigaroOffsetPolicyV1Validator.InvalidProvider.selector, uint8(5)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsMismatchedSchemaId() public {
        bytes memory c = _encode(_u8(1));
        bytes32 other = keccak256("not-offset-policy");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroOffsetPolicyV1Validator.SchemaIdMismatch.selector, other, ID)
        );
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _encode(_u8(1));
        bytes memory content = _encode(_u8(2));
        vm.expectRevert(FigaroOffsetPolicyV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
