// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroGHGMeasurementV1Validator} from "../../src/clauseValidators/FigaroGHGMeasurementV1Validator.sol";

contract FigaroGHGMeasurementV1ValidatorTest is Test {
    FigaroGHGMeasurementV1Validator validator;
    bytes32 constant ID = keccak256("figaro-ghg-measurement-v1");

    function setUp() public {
        validator = new FigaroGHGMeasurementV1Validator();
    }

    function test_clauseIdMatches() public view {
        assertEq(validator.clauseId(), ID);
    }

    function test_acceptsEachKnownStage() public view {
        for (uint8 s = 0; s <= 3; s++) {
            validator.validate(ID, s, "", abi.encode(uint256(1250)));
        }
    }

    function test_acceptsZeroGrams() public view {
        validator.validate(ID, 1, "", abi.encode(uint256(0)));
    }

    function test_acceptsLargeGrams() public view {
        validator.validate(ID, 1, "", abi.encode(type(uint256).max));
    }

    function test_rejectsStageAboveThree() public {
        vm.expectRevert(abi.encodeWithSelector(FigaroGHGMeasurementV1Validator.InvalidStage.selector, uint8(4)));
        validator.validate(ID, 4, "", abi.encode(uint256(100)));
    }

    function test_rejectsMismatchedClauseId() public {
        bytes32 other = keccak256("not-measurement");
        vm.expectRevert(abi.encodeWithSelector(FigaroGHGMeasurementV1Validator.ClauseIdMismatch.selector, other, ID));
        validator.validate(other, 1, "", abi.encode(uint256(100)));
    }

    function test_rejectsMalformedContent() public {
        // Content shorter than 32 bytes cannot decode as uint256.
        vm.expectRevert();
        validator.validate(ID, 1, "", hex"1234");
    }

    function test_sectionDataIgnored() public view {
        // Category-1: any sectionData is accepted regardless of content.
        validator.validate(ID, 1, hex"deadbeef", abi.encode(uint256(500)));
        validator.validate(ID, 1, abi.encode("arbitrary-json"), abi.encode(uint256(500)));
    }
}
