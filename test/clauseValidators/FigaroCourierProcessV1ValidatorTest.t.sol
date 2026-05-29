// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroCourierProcessV1Validator} from "../../src/clauseValidators/FigaroCourierProcessV1Validator.sol";

contract FigaroCourierProcessV1ValidatorTest is Test {
    FigaroCourierProcessV1Validator validator;
    bytes32 constant ID = keccak256("figaro-courier-process-v1");

    function setUp() public {
        validator = new FigaroCourierProcessV1Validator();
    }

    function test_clauseIdMatches() public view {
        assertEq(validator.clauseId(), ID);
    }

    function test_acceptsEachKnownEventType() public view {
        for (uint8 e = 0; e <= 7; e++) {
            validator.validate(ID, 0,"", abi.encode(e, ""));
        }
    }

    function test_acceptsEvidenceUri() public view {
        validator.validate(ID, 0,"", abi.encode(uint8(4), "ipfs://gps-log-cid"));
    }

    function test_rejectsUnknownEventType() public {
        vm.expectRevert(abi.encodeWithSelector(FigaroCourierProcessV1Validator.InvalidEventType.selector, uint8(8)));
        validator.validate(ID, 0,"", abi.encode(uint8(8), ""));
    }

    function test_rejectsTooLongEvidenceUri() public {
        bytes memory longUri = new bytes(513);
        for (uint256 i = 0; i < 513; i++) longUri[i] = bytes1("a");
        vm.expectRevert(abi.encodeWithSelector(FigaroCourierProcessV1Validator.EvidenceUriTooLong.selector, uint256(513)));
        validator.validate(ID, 0,"", abi.encode(uint8(0), string(longUri)));
    }

    function test_rejectsMismatchedClauseId() public {
        bytes32 other = keccak256("not-courier-process");
        vm.expectRevert(abi.encodeWithSelector(FigaroCourierProcessV1Validator.ClauseIdMismatch.selector, other, ID));
        validator.validate(other, 0,"", abi.encode(uint8(0), ""));
    }
}
