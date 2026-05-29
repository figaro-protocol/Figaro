// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroFulfilmentV2Validator} from "../../src/clauseValidators/FigaroFulfilmentV2Validator.sol";

contract FigaroFulfilmentV2ValidatorTest is Test {
    FigaroFulfilmentV2Validator validator;
    bytes32 constant ID = keccak256("figaro-fulfilment-v2");
    bytes32 constant OTHER_ID = keccak256("figaro-other-v1");

    // Canonical 0-based enum positions (post-Keystone):
    //   modalities:    0=consume-onsite, 1=pickup, 2=delivery, 3=virtual
    //   coordinations: 0=buyer-assigned, 1=seller-assigned, 2=dutch-auction
    //   handoffPoints: 0=face-to-face, 1=dead-drop, 2=parking-area, 3=locker

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

    function test_clauseIdMatches() public view {
        assertEq(validator.clauseId(), ID);
    }

    function test_acceptsSingleConsumeOnsite() public view {
        bytes memory c = _encode(_u8(0), _empty(), _empty());
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsSinglePickup() public view {
        bytes memory c = _encode(_u8(1), _empty(), _empty());
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsSingleVirtual() public view {
        bytes memory c = _encode(_u8(3), _empty(), _empty());
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsDeliveryWithCoordinations() public view {
        // delivery=2, coordinations=[buyer-assigned, seller-assigned]=[0, 1]
        bytes memory c = _encode(_u8(2), _u8(0, 1), _empty());
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsMultiModalityWithDelivery() public view {
        // [pickup, delivery]=[1, 2], coordinations=[dutch-auction]=[2]
        bytes memory c = _encode(_u8(1, 2), _u8(2), _empty());
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsHandoffPoints() public view {
        for (uint8 hp = 0; hp <= 3; hp++) {
            bytes memory c = _encode(_u8(2), _u8(0), _u8(hp));
            validator.validate(ID, 0, c, c);
        }
    }

    function test_acceptsMultipleHandoffPoints() public view {
        // delivery=2, coord=[buyer-assigned]=[0], handoffs=[face-to-face, locker]=[0, 3]
        bytes memory c = _encode(_u8(2), _u8(0), _u8(0, 3));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsEmptyModalities() public {
        bytes memory c = _encode(_empty(), _empty(), _empty());
        vm.expectRevert(FigaroFulfilmentV2Validator.ModalitiesEmpty.selector);
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsOutOfRangeModality() public {
        bytes memory c = _encode(_u8(4), _empty(), _empty());
        vm.expectRevert(abi.encodeWithSelector(FigaroFulfilmentV2Validator.InvalidModality.selector, uint8(4)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsCoordinationsWithoutDelivery() public {
        // pickup=1, but coordinations supplied
        bytes memory c = _encode(_u8(1), _u8(0), _empty());
        vm.expectRevert(FigaroFulfilmentV2Validator.CoordinationsWithoutDelivery.selector);
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsDeliveryWithoutCoordinations() public {
        bytes memory c = _encode(_u8(2), _empty(), _empty());
        vm.expectRevert(FigaroFulfilmentV2Validator.CoordinationsRequiredForDelivery.selector);
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsInvalidCoordination() public {
        // delivery=2, coord=[3] (out of range; valid are 0..2)
        bytes memory c = _encode(_u8(2), _u8(3), _empty());
        vm.expectRevert(abi.encodeWithSelector(FigaroFulfilmentV2Validator.InvalidCoordination.selector, uint8(3)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsInvalidHandoffPoint() public {
        // pickup=1 (no coord), handoffs=[4] (out of range; valid are 0..3)
        bytes memory c = _encode(_u8(1), _empty(), _u8(4));
        vm.expectRevert(abi.encodeWithSelector(FigaroFulfilmentV2Validator.InvalidHandoffPoint.selector, uint8(4)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsMismatchedClauseId() public {
        bytes memory c = _encode(_u8(0), _empty(), _empty());
        vm.expectRevert(abi.encodeWithSelector(FigaroFulfilmentV2Validator.ClauseIdMismatch.selector, OTHER_ID, ID));
        validator.validate(OTHER_ID, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _encode(_u8(0), _empty(), _empty());
        bytes memory content = _encode(_u8(1), _empty(), _empty());
        vm.expectRevert(FigaroFulfilmentV2Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }

    function test_acceptsAnyStage() public view {
        bytes memory c = _encode(_u8(0), _empty(), _empty());
        validator.validate(ID, 0, c, c);
        validator.validate(ID, 1, c, c);
        validator.validate(ID, 255, c, c);
    }
}
