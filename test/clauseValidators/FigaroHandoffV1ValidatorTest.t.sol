// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroHandoffV1Validator} from "../../src/clauseValidators/FigaroHandoffV1Validator.sol";

contract FigaroHandoffV1ValidatorTest is Test {
    FigaroHandoffV1Validator validator;
    bytes32 constant ID = keccak256("figaro-handoff-v1");

    function setUp() public {
        validator = new FigaroHandoffV1Validator();
    }

    function _encode(uint8[] memory points) internal pure returns (bytes memory) {
        return abi.encode(points);
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

    function test_clauseIdMatches() public view {
        assertEq(validator.clauseId(), ID);
    }

    // Canonical 0-based positions: 0=face-to-face, 1=dead-drop, 2=parking-area, 3=locker

    function test_acceptsEachKnownPoint() public view {
        for (uint8 p = 0; p <= 3; p++) {
            bytes memory c = _encode(_u8(p));
            validator.validate(ID, 0, c, c);
        }
    }

    function test_acceptsMultiplePoints() public view {
        bytes memory c = _encode(_u8(0, 3));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsEmptyHandoff() public {
        uint8[] memory empty = new uint8[](0);
        bytes memory c = _encode(empty);
        vm.expectRevert(FigaroHandoffV1Validator.HandoffEmpty.selector);
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsPointAboveMax() public {
        bytes memory c = _encode(_u8(4));
        vm.expectRevert(abi.encodeWithSelector(FigaroHandoffV1Validator.InvalidHandoffPoint.selector, uint8(4)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsMismatchedClauseId() public {
        bytes memory c = _encode(_u8(0));
        bytes32 other = keccak256("not-handoff");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroHandoffV1Validator.ClauseIdMismatch.selector, other, ID)
        );
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _encode(_u8(1));
        bytes memory content = _encode(_u8(2));
        vm.expectRevert(FigaroHandoffV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
