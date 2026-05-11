// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroFulfilmentV2Validator} from "../../src/schemaValidators/FigaroFulfilmentV2Validator.sol";

contract FigaroFulfilmentV2ValidatorTest is Test {
    FigaroFulfilmentV2Validator validator;
    bytes32 constant ID = keccak256("figaro-fulfilment-v2");
    bytes32 constant OTHER_ID = keccak256("figaro-other-v1");

    function setUp() public {
        validator = new FigaroFulfilmentV2Validator();
    }

    function test_schemaIdMatches() public view {
        assertEq(validator.schemaId(), ID);
    }

    function test_acceptsMinimalConsumeOnsite() public view {
        // modality=consume-onsite, coordination=unset, handoffPoint=unset
        bytes memory c = abi.encode(uint8(1), uint8(0), uint8(0));
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsMinimalPickup() public view {
        // modality=pickup, coordination=unset, handoffPoint=unset
        bytes memory c = abi.encode(uint8(2), uint8(0), uint8(0));
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsDeliveryWithEachCoordination() public view {
        // modality=delivery + each coordination value
        for (uint8 coord = 1; coord <= 3; coord++) {
            bytes memory c = abi.encode(uint8(3), coord, uint8(0));
            validator.validate(ID, 0, c, c);
        }
    }

    function test_acceptsEachHandoffPoint() public view {
        // modality=delivery + handoffPoint each known value
        for (uint8 hp = 0; hp <= 4; hp++) {
            bytes memory c = abi.encode(uint8(3), uint8(0), hp);
            validator.validate(ID, 0, c, c);
        }
    }

    function test_rejectsModalityUnset() public {
        bytes memory c = abi.encode(uint8(0), uint8(0), uint8(0));
        vm.expectRevert(FigaroFulfilmentV2Validator.ModalityUnset.selector);
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsInvalidModality() public {
        bytes memory c = abi.encode(uint8(4), uint8(0), uint8(0));
        vm.expectRevert(abi.encodeWithSelector(FigaroFulfilmentV2Validator.InvalidModality.selector, uint8(4)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsInvalidCoordination() public {
        // modality=delivery, coordination=4 (out of range)
        bytes memory c = abi.encode(uint8(3), uint8(4), uint8(0));
        vm.expectRevert(abi.encodeWithSelector(FigaroFulfilmentV2Validator.InvalidCoordination.selector, uint8(4)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsCoordinationWithoutDelivery() public {
        // modality=consume-onsite, coordination=1 (buyer-assigned) — illegal
        bytes memory c = abi.encode(uint8(1), uint8(1), uint8(0));
        vm.expectRevert(abi.encodeWithSelector(FigaroFulfilmentV2Validator.CoordinationRequiresDelivery.selector, uint8(1)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsCoordinationWithPickup() public {
        // modality=pickup, coordination=2 (seller-assigned) — illegal
        bytes memory c = abi.encode(uint8(2), uint8(2), uint8(0));
        vm.expectRevert(abi.encodeWithSelector(FigaroFulfilmentV2Validator.CoordinationRequiresDelivery.selector, uint8(2)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsInvalidHandoffPoint() public {
        bytes memory c = abi.encode(uint8(1), uint8(0), uint8(5));
        vm.expectRevert(abi.encodeWithSelector(FigaroFulfilmentV2Validator.InvalidHandoffPoint.selector, uint8(5)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsMismatchedSchemaId() public {
        bytes memory c = abi.encode(uint8(1), uint8(0), uint8(0));
        vm.expectRevert(abi.encodeWithSelector(FigaroFulfilmentV2Validator.SchemaIdMismatch.selector, OTHER_ID, ID));
        validator.validate(OTHER_ID, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = abi.encode(uint8(1), uint8(0), uint8(0));
        bytes memory content = abi.encode(uint8(2), uint8(0), uint8(0));
        vm.expectRevert(FigaroFulfilmentV2Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }

    function test_acceptsAnyStage() public view {
        bytes memory c = abi.encode(uint8(1), uint8(0), uint8(0));
        validator.validate(ID, 0, c, c);
        validator.validate(ID, 1, c, c);
        validator.validate(ID, 255, c, c);
    }
}
