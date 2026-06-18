// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroArbitrationKlerosV1Validator} from "../../src/clauseValidators/FigaroArbitrationKlerosV1Validator.sol";

contract FigaroArbitrationKlerosV1ValidatorTest is Test {
    FigaroArbitrationKlerosV1Validator validator;
    bytes32 constant ID = keccak256(abi.encode("figaro-arbitration-kleros", uint64(1)));

    function setUp() public {
        validator = new FigaroArbitrationKlerosV1Validator();
    }

    function _call(uint8 klerosCourt, uint8 klerosMinJurors) internal pure returns (bytes memory) {
        return abi.encode(klerosCourt, klerosMinJurors);
    }

    // ── Identity + happy paths ──────────────────────────────────────────────

    function test_clauseIdMatches() public view {
        assertEq(validator.clauseId(), ID);
    }

    function test_acceptsAllFourKlerosCourts() public view {
        for (uint8 court = 0; court <= 3; court++) {
            bytes memory c = _call(court, 3);
            validator.validate(ID, 0, c, c);
        }
    }

    function test_acceptsMinJurorsUnset() public view {
        bytes memory c = _call(1, 0);
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsMinJurorsAtMax() public view {
        bytes memory c = _call(1, 99);
        validator.validate(ID, 0, c, c);
    }

    // ── Court bounds ────────────────────────────────────────────────────────

    function test_rejectsKlerosCourtAboveMax() public {
        bytes memory c = _call(4, 3);
        vm.expectRevert(
            abi.encodeWithSelector(FigaroArbitrationKlerosV1Validator.InvalidKlerosCourt.selector, uint8(4))
        );
        validator.validate(ID, 0, c, c);
    }

    // ── Juror bounds ────────────────────────────────────────────────────────

    function test_rejectsMinJurorsAboveMax() public {
        bytes memory c = _call(1, 100);
        vm.expectRevert(
            abi.encodeWithSelector(FigaroArbitrationKlerosV1Validator.InvalidKlerosMinJurors.selector, uint8(100))
        );
        validator.validate(ID, 0, c, c);
    }

    // ── Clause-id + section-data integrity ──────────────────────────────────

    function test_rejectsMismatchedClauseId() public {
        bytes memory c = _call(1, 3);
        bytes32 other = keccak256("not-arbitration-kleros");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroArbitrationKlerosV1Validator.ClauseIdMismatch.selector, other, ID)
        );
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _call(1, 3);
        bytes memory content = _call(2, 5);
        vm.expectRevert(FigaroArbitrationKlerosV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
