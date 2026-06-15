// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroClassOfServiceValidator} from "../../src/clauseValidators/FigaroClassOfServiceValidator.sol";

contract FigaroClassOfServiceValidatorTest is Test {
    FigaroClassOfServiceValidator validator;
    bytes32 constant ID = keccak256(abi.encode("figaro-class-of-service", uint64(1)));

    function setUp() public {
        validator = new FigaroClassOfServiceValidator();
    }

    function _call(uint8 cls) internal pure returns (bytes memory) {
        return abi.encode(cls);
    }

    function test_clauseIdMatches() public view {
        assertEq(validator.clauseId(), ID);
    }

    function test_acceptsAllClassValues() public view {
        // 0=S, 1=E, 2=F, 3=C
        for (uint8 cls = 0; cls <= 3; cls++) {
            bytes memory c = _call(cls);
            validator.validate(ID, 0, c, c);
        }
    }

    function test_rejectsClassAboveMax() public {
        bytes memory c = _call(4);
        vm.expectRevert(abi.encodeWithSelector(FigaroClassOfServiceValidator.InvalidClassOfService.selector, uint8(4)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsMismatchedClauseId() public {
        bytes memory c = _call(0);
        bytes32 other = keccak256("not-class");
        vm.expectRevert(abi.encodeWithSelector(FigaroClassOfServiceValidator.ClauseIdMismatch.selector, other, ID));
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _call(0);
        bytes memory content = _call(3);
        vm.expectRevert(FigaroClassOfServiceValidator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
