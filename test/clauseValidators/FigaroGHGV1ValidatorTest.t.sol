// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroGHGV1Validator} from "../../src/clauseValidators/FigaroGHGV1Validator.sol";

/// Tests the consolidated GHG disclosure validator. Content is
/// `abi.encode(string standard, uint256 scope)` — the standard is free-form
/// (replacing the 5 former per-standard clauses), scope is 0..3.
contract FigaroGHGV1ValidatorTest is Test {
    FigaroGHGV1Validator internal validator;
    bytes32 internal ID;

    error ClauseIdMismatch(bytes32 got, bytes32 expected);
    error EmptyStandard();
    error InvalidScope(uint256 got);
    error SectionDataMismatch();

    function setUp() public {
        validator = new FigaroGHGV1Validator();
        ID = keccak256(abi.encode("figaro-ghg", uint64(1)));
    }

    function _c(string memory standard, uint256 scope) internal pure returns (bytes memory) {
        return abi.encode(standard, scope);
    }

    function test_clauseIdMatches() public view {
        assertEq(validator.clauseId(), ID);
    }

    function test_acceptsValid() public view {
        bytes memory c = _c("ISO 14064", 2);
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsAllKnownScopes() public view {
        for (uint256 s = 0; s <= 3; s++) {
            bytes memory c = _c("GHG Protocol Corporate Standard", s);
            validator.validate(ID, 0, c, c);
        }
    }

    function test_acceptsAnyFreeFormStandard() public view {
        bytes memory c = _c("My bespoke methodology v9", 1);
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsEmptyStandard() public {
        bytes memory c = _c("", 1);
        vm.expectRevert(EmptyStandard.selector);
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsScopeAboveMax() public {
        bytes memory c = _c("custom", 4);
        vm.expectRevert(abi.encodeWithSelector(InvalidScope.selector, uint256(4)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory committed = _c("ISO 14064", 1);
        bytes memory attested = _c("ISO 14064", 2);
        vm.expectRevert(SectionDataMismatch.selector);
        validator.validate(ID, 0, committed, attested);
    }

    function test_rejectsClauseIdMismatch() public {
        bytes32 wrong = keccak256(abi.encode("figaro-ghg", uint64(2)));
        bytes memory c = _c("ISO 14064", 1);
        vm.expectRevert(abi.encodeWithSelector(ClauseIdMismatch.selector, wrong, ID));
        validator.validate(wrong, 0, c, c);
    }
}
