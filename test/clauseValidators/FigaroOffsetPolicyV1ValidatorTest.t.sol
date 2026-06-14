// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroOffsetPolicyV1Validator} from "../../src/clauseValidators/FigaroOffsetPolicyV1Validator.sol";

contract FigaroOffsetPolicyV1ValidatorTest is Test {
    FigaroOffsetPolicyV1Validator validator;
    bytes32 constant ID = keccak256(abi.encode("figaro-offset-policy", uint64(1)));

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

    function test_clauseIdMatches() public view {
        assertEq(validator.clauseId(), ID);
    }

    // Canonical 0-based positions: 0=klima, 1=toucan, 2=moss, 3=custom

    function test_acceptsEachKnownProvider() public view {
        for (uint8 p = 0; p <= 3; p++) {
            bytes memory c = _encode(_u8(p));
            validator.validate(ID, 0, c, c);
        }
    }

    function test_acceptsMultipleProviders() public view {
        bytes memory c = _encode(_u8(0, 3));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsEmptyProviders() public {
        uint8[] memory empty = new uint8[](0);
        bytes memory c = _encode(empty);
        vm.expectRevert(FigaroOffsetPolicyV1Validator.ProvidersEmpty.selector);
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsProviderAboveMax() public {
        bytes memory c = _encode(_u8(4));
        vm.expectRevert(abi.encodeWithSelector(FigaroOffsetPolicyV1Validator.InvalidProvider.selector, uint8(4)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsMismatchedClauseId() public {
        bytes memory c = _encode(_u8(0));
        bytes32 other = keccak256("not-offset-policy");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroOffsetPolicyV1Validator.ClauseIdMismatch.selector, other, ID)
        );
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _encode(_u8(0));
        bytes memory content = _encode(_u8(1));
        vm.expectRevert(FigaroOffsetPolicyV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
