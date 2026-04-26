// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroFulfilmentV1Validator} from "../../src/schemaValidators/FigaroFulfilmentV1Validator.sol";

contract FigaroFulfilmentV1ValidatorTest is Test {
    FigaroFulfilmentV1Validator validator;
    bytes32 constant ID = keccak256("figaro-fulfilment-v1");

    function setUp() public {
        validator = new FigaroFulfilmentV1Validator();
    }

    function _call(uint8 method) internal pure returns (bytes memory) {
        return abi.encode(method);
    }

    function test_schemaIdMatches() public view {
        assertEq(validator.schemaId(), ID);
    }

    function test_acceptsUnset() public view {
        bytes memory c = _call(0);
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsAllKnownMethods() public view {
        for (uint8 m = 0; m <= 5; m++) {
            bytes memory c = _call(m);
            validator.validate(ID, 0, c, c);
        }
    }

    function test_acceptsCommonCase_deliverDutchAuction() public view {
        bytes memory c = _call(5); // deliver:dutch-auction
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsCommonCase_consumeOnsite() public view {
        bytes memory c = _call(1); // consume-onsite
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsUnknownMethod() public {
        bytes memory c = _call(6);
        vm.expectRevert(abi.encodeWithSelector(FigaroFulfilmentV1Validator.InvalidMethod.selector, uint8(6)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsMismatchedSchemaId() public {
        bytes memory c = _call(0);
        bytes32 other = keccak256("not-fulfilment");
        vm.expectRevert(abi.encodeWithSelector(FigaroFulfilmentV1Validator.SchemaIdMismatch.selector, other, ID));
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _call(2); // pickup
        bytes memory content = _call(5); // deliver:dutch-auction — drift
        vm.expectRevert(FigaroFulfilmentV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
