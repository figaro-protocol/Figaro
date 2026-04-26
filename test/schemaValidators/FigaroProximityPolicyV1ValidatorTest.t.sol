// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroProximityPolicyV1Validator} from "../../src/schemaValidators/FigaroProximityPolicyV1Validator.sol";

contract FigaroProximityPolicyV1ValidatorTest is Test {
    FigaroProximityPolicyV1Validator validator;
    bytes32 constant ID = keccak256("figaro-proximity-policy-v1");

    function setUp() public {
        validator = new FigaroProximityPolicyV1Validator();
    }

    function _call(uint8 band) internal pure returns (bytes memory) {
        return abi.encode(band);
    }

    function test_schemaIdMatches() public view {
        assertEq(validator.schemaId(), ID);
    }

    function test_acceptsAllKnownBands() public view {
        for (uint8 b = 0; b <= 3; b++) {
            bytes memory c = _call(b);
            validator.validate(ID, 0, c, c);
        }
    }

    function test_rejectsBandAboveThree() public {
        bytes memory c = _call(4);
        vm.expectRevert(abi.encodeWithSelector(FigaroProximityPolicyV1Validator.InvalidBand.selector, uint8(4)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsMismatchedSchemaId() public {
        bytes memory c = _call(0);
        bytes32 other = keccak256("not-proximity-policy");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroProximityPolicyV1Validator.SchemaIdMismatch.selector, other, ID)
        );
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _call(2); // nearby-ble
        bytes memory content = _call(3); // contact-nfc — drift
        vm.expectRevert(FigaroProximityPolicyV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
