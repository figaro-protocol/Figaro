// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroGeoV1Validator} from "../../src/schemaValidators/FigaroGeoV1Validator.sol";

contract FigaroGeoV1ValidatorTest is Test {
    FigaroGeoV1Validator validator;
    bytes32 constant ID = keccak256("figaro-geo-v1");

    function setUp() public {
        validator = new FigaroGeoV1Validator();
    }

    function _call(string memory origin, string memory destination) internal pure returns (bytes memory) {
        return abi.encode(origin, destination);
    }

    function test_schemaIdMatches() public view {
        assertEq(validator.schemaId(), ID);
    }

    function test_acceptsValidGeohashes() public view {
        bytes memory c1 = _call("u4pruydqqv", "9q8yyk8yvr");
        validator.validate(ID, 0, c1, c1);
        bytes memory c2 = _call("d", "z");
        validator.validate(ID, 0, c2, c2);
        bytes memory c3 = _call("dr5ru7c02wn", "9q8yywe56gc");
        validator.validate(ID, 0, c3, c3);
    }

    function test_rejectsEmptyOrigin() public {
        bytes memory c = _call("", "u4pruydqqv");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroGeoV1Validator.GeohashTooShort.selector, "originGeohash", uint256(0))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsEmptyDestination() public {
        bytes memory c = _call("u4pruydqqv", "");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroGeoV1Validator.GeohashTooShort.selector, "destinationGeohash", uint256(0))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsTooLong() public {
        bytes memory c = _call("u4pruydqqvjk0", "u4pruydqqv");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroGeoV1Validator.GeohashTooLong.selector, "originGeohash", uint256(13))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsForbiddenChar_a() public {
        bytes memory c = _call("abc", "u4pruydqqv");
        vm.expectRevert();
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsForbiddenChar_l() public {
        bytes memory c = _call("u4pruydqqv", "lmn");
        vm.expectRevert();
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsUppercase() public {
        bytes memory c = _call("U4PRUYDQQV", "u4pruydqqv");
        vm.expectRevert();
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsMismatchedSchemaId() public {
        bytes memory c = _call("u4pruydqqv", "u4pruydqqv");
        bytes32 other = keccak256("not-geo");
        vm.expectRevert(abi.encodeWithSelector(FigaroGeoV1Validator.SchemaIdMismatch.selector, other, ID));
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _call("u4pruydqqv", "u4pruydqqv");
        bytes memory content = _call("u4pruydqqv", "9q8yyk8yvr");
        vm.expectRevert(FigaroGeoV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
