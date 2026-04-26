// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroDeliveryLifecycleV1Validator} from "../../src/schemaValidators/FigaroDeliveryLifecycleV1Validator.sol";

contract FigaroDeliveryLifecycleV1ValidatorTest is Test {
    FigaroDeliveryLifecycleV1Validator validator;
    bytes32 constant ID = keccak256("figaro-delivery-lifecycle-v1");

    function setUp() public {
        validator = new FigaroDeliveryLifecycleV1Validator();
    }

    function test_schemaIdMatches() public view {
        assertEq(validator.schemaId(), ID);
    }

    function test_acceptsEachKnownStage() public view {
        for (uint8 s = 0; s <= 4; s++) {
            validator.validate(ID, s,"", abi.encode(""));
        }
    }

    function test_acceptsEvidenceUri() public view {
        validator.validate(ID, 3,"", abi.encode("ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"));
    }

    function test_acceptsEmptyEvidenceUri() public view {
        validator.validate(ID, 0,"", abi.encode(""));
    }

    function test_rejectsStageAboveFour() public {
        vm.expectRevert(abi.encodeWithSelector(FigaroDeliveryLifecycleV1Validator.InvalidStage.selector, uint8(5)));
        validator.validate(ID, 5,"", abi.encode(""));
    }

    function test_rejectsTooLongEvidenceUri() public {
        bytes memory longUri = new bytes(513);
        for (uint256 i = 0; i < 513; i++) longUri[i] = bytes1("a");
        vm.expectRevert(abi.encodeWithSelector(FigaroDeliveryLifecycleV1Validator.EvidenceUriTooLong.selector, uint256(513)));
        validator.validate(ID, 0,"", abi.encode(string(longUri)));
    }

    function test_rejectsMismatchedSchemaId() public {
        bytes32 other = keccak256("not-lifecycle");
        vm.expectRevert(abi.encodeWithSelector(FigaroDeliveryLifecycleV1Validator.SchemaIdMismatch.selector, other, ID));
        validator.validate(other, 0,"", abi.encode(""));
    }
}
