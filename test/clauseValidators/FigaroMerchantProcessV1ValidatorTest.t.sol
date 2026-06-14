// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroMerchantProcessV1Validator} from "../../src/clauseValidators/FigaroMerchantProcessV1Validator.sol";

contract FigaroMerchantProcessV1ValidatorTest is Test {
    FigaroMerchantProcessV1Validator validator;
    bytes32 constant ID = keccak256(abi.encode("figaro-merchant-process", uint64(1)));

    function setUp() public {
        validator = new FigaroMerchantProcessV1Validator();
    }

    function test_clauseIdMatches() public view {
        assertEq(validator.clauseId(), ID);
    }

    function test_acceptsEachKnownEventType() public view {
        for (uint8 e = 0; e <= 2; e++) {
            validator.validate(ID, 0,"", abi.encode(e, ""));
        }
    }

    function test_acceptsEvidenceUri() public view {
        validator.validate(ID, 0,"", abi.encode(uint8(2), "ipfs://meal-photo-cid"));
    }

    function test_rejectsUnknownEventType() public {
        vm.expectRevert(abi.encodeWithSelector(FigaroMerchantProcessV1Validator.InvalidEventType.selector, uint8(6)));
        validator.validate(ID, 0,"", abi.encode(uint8(6), ""));
    }

    function test_rejectsTooLongEvidenceUri() public {
        bytes memory longUri = new bytes(513);
        for (uint256 i = 0; i < 513; i++) longUri[i] = bytes1("a");
        vm.expectRevert(abi.encodeWithSelector(FigaroMerchantProcessV1Validator.EvidenceUriTooLong.selector, uint256(513)));
        validator.validate(ID, 0,"", abi.encode(uint8(0), string(longUri)));
    }

    function test_rejectsMismatchedClauseId() public {
        bytes32 other = keccak256("not-merchant-process");
        vm.expectRevert(abi.encodeWithSelector(FigaroMerchantProcessV1Validator.ClauseIdMismatch.selector, other, ID));
        validator.validate(other, 0,"", abi.encode(uint8(0), ""));
    }
}
