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

    function _encode(uint8[] memory modalities, uint8[] memory coordinations, uint8[] memory handoffPoints)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(modalities, coordinations, handoffPoints);
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

    function _empty() internal pure returns (uint8[] memory arr) {
        arr = new uint8[](0);
    }

    function test_schemaIdMatches() public view {
        assertEq(validator.schemaId(), ID);
    }

    function test_acceptsSingleConsumeOnsite() public view {
        bytes memory c = _encode(_u8(1), _empty(), _empty());
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsSinglePickup() public view {
        bytes memory c = _encode(_u8(2), _empty(), _empty());
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsSingleVirtual() public view {
        bytes memory c = _encode(_u8(4), _empty(), _empty());
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsDeliveryWithCoordinations() public view {
        bytes memory c = _encode(_u8(3), _u8(1, 2), _empty());
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsMultiModalityWithDelivery() public view {
        bytes memory c = _encode(_u8(2, 3), _u8(2), _empty());
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsHandoffPoints() public view {
        for (uint8 hp = 1; hp <= 4; hp++) {
            bytes memory c = _encode(_u8(3), _u8(2), _u8(hp));
            validator.validate(ID, 0, c, c);
        }
    }

    function test_acceptsMultipleHandoffPoints() public view {
        bytes memory c = _encode(_u8(3), _u8(2), _u8(1, 4));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsEmptyModalities() public {
        bytes memory c = _encode(_empty(), _empty(), _empty());
        vm.expectRevert(FigaroFulfilmentV2Validator.ModalitiesEmpty.selector);
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsZeroModalityIndex() public {
        bytes memory c = _encode(_u8(0), _empty(), _empty());
        vm.expectRevert(abi.encodeWithSelector(FigaroFulfilmentV2Validator.InvalidModality.selector, uint8(0)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsOutOfRangeModality() public {
        bytes memory c = _encode(_u8(5), _empty(), _empty());
        vm.expectRevert(abi.encodeWithSelector(FigaroFulfilmentV2Validator.InvalidModality.selector, uint8(5)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsCoordinationsWithoutDelivery() public {
        bytes memory c = _encode(_u8(2), _u8(1), _empty());
        vm.expectRevert(FigaroFulfilmentV2Validator.CoordinationsWithoutDelivery.selector);
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsDeliveryWithoutCoordinations() public {
        bytes memory c = _encode(_u8(3), _empty(), _empty());
        vm.expectRevert(FigaroFulfilmentV2Validator.CoordinationsRequiredForDelivery.selector);
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsInvalidCoordination() public {
        bytes memory c = _encode(_u8(3), _u8(4), _empty());
        vm.expectRevert(abi.encodeWithSelector(FigaroFulfilmentV2Validator.InvalidCoordination.selector, uint8(4)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsInvalidHandoffPoint() public {
        bytes memory c = _encode(_u8(2), _empty(), _u8(5));
        vm.expectRevert(abi.encodeWithSelector(FigaroFulfilmentV2Validator.InvalidHandoffPoint.selector, uint8(5)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsMismatchedSchemaId() public {
        bytes memory c = _encode(_u8(1), _empty(), _empty());
        vm.expectRevert(abi.encodeWithSelector(FigaroFulfilmentV2Validator.SchemaIdMismatch.selector, OTHER_ID, ID));
        validator.validate(OTHER_ID, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _encode(_u8(1), _empty(), _empty());
        bytes memory content = _encode(_u8(2), _empty(), _empty());
        vm.expectRevert(FigaroFulfilmentV2Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }

    function test_acceptsAnyStage() public view {
        bytes memory c = _encode(_u8(1), _empty(), _empty());
        validator.validate(ID, 0, c, c);
        validator.validate(ID, 1, c, c);
        validator.validate(ID, 255, c, c);
    }
}
