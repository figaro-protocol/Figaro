// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {IClauseValidator} from "../../src/IClauseValidator.sol";

/**
 * Shared test body for the 5 GHG sister-clause validators
 * (Protocol / ISO14064 / PAS2050 / EN16258 / Custom). They share the
 * `(uint8 scope)` content shape and the same three typed errors —
 * ClauseIdMismatch, InvalidScope, SectionDataMismatch — so the selectors
 * declared here match each validator's selectors at the wire level.
 *
 * Each concrete child contract sets `validator` + `ID` in setUp() and
 * inherits all 5 named tests from this base.
 */
abstract contract FigaroGHGScopeValidatorTestBase is Test {
    error ClauseIdMismatch(bytes32 got, bytes32 expected);
    error InvalidScope(uint8 got);
    error SectionDataMismatch();

    IClauseValidator internal validator;
    bytes32 internal ID;

    function _call(uint8 scope) internal pure returns (bytes memory) {
        return abi.encode(scope);
    }

    function test_clauseIdMatches() public view {
        assertEq(validator.clauseId(), ID);
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
        vm.expectRevert(abi.encodeWithSelector(InvalidScope.selector, uint8(4)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsMismatchedClauseId() public {
        bytes memory c = _call(0);
        bytes32 other = keccak256("not-this-clause");
        vm.expectRevert(abi.encodeWithSelector(ClauseIdMismatch.selector, other, ID));
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _call(1);
        bytes memory content = _call(2);
        vm.expectRevert(SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
