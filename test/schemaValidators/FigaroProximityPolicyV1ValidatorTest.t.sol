// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroProximityPolicyV1Validator} from "../../src/schemaValidators/FigaroProximityPolicyV1Validator.sol";

contract FigaroProximityPolicyV1ValidatorTest is Test {
    FigaroProximityPolicyV1Validator validator;
    bytes32 constant ID = keccak256("figaro-proximity-policy-v1");

    function setUp() public {
        validator = new FigaroProximityPolicyV1Validator();
    }

    function _encode(uint8[] memory bands) internal pure returns (bytes memory) {
        return abi.encode(bands);
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

    function test_acceptsEachKnownBand() public view {
        for (uint8 b = 1; b <= 3; b++) {
            bytes memory c = _encode(_u8(b));
            validator.validate(ID, 0, c, c);
        }
    }

    function test_acceptsMultipleBands() public view {
        bytes memory c = _encode(_u8(1, 3));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsEmptyBands() public {
        uint8[] memory empty = new uint8[](0);
        bytes memory c = _encode(empty);
        vm.expectRevert(FigaroProximityPolicyV1Validator.BandsEmpty.selector);
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsZeroBandIndex() public {
        bytes memory c = _encode(_u8(0));
        vm.expectRevert(abi.encodeWithSelector(FigaroProximityPolicyV1Validator.InvalidBand.selector, uint8(0)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsBandAboveThree() public {
        bytes memory c = _encode(_u8(4));
        vm.expectRevert(abi.encodeWithSelector(FigaroProximityPolicyV1Validator.InvalidBand.selector, uint8(4)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsMismatchedSchemaId() public {
        bytes memory c = _encode(_u8(1));
        bytes32 other = keccak256("not-proximity-policy");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroProximityPolicyV1Validator.SchemaIdMismatch.selector, other, ID)
        );
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _encode(_u8(2));
        bytes memory content = _encode(_u8(3));
        vm.expectRevert(FigaroProximityPolicyV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
