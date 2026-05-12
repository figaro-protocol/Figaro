// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroGeoV2Validator} from "../../src/schemaValidators/FigaroGeoV2Validator.sol";

contract FigaroGeoV2ValidatorTest is Test {
    FigaroGeoV2Validator validator;
    bytes32 constant ID = keccak256("figaro-geo-v2");

    function setUp() public {
        validator = new FigaroGeoV2Validator();
    }

    function _call(
        string memory origin,
        string memory destination,
        uint32 massGrams,
        uint32 volumeMl,
        uint8 classOfService
    ) internal pure returns (bytes memory) {
        return abi.encode(origin, destination, massGrams, volumeMl, classOfService);
    }

    // ── schemaId ────────────────────────────────────────────────────────────

    function test_schemaIdMatches() public view {
        assertEq(validator.schemaId(), ID);
    }

    // ── happy paths ─────────────────────────────────────────────────────────

    function test_acceptsValidContent() public view {
        bytes memory c1 = _call("u4pruydqqv", "9q8yyk8yvr", 500, 1000, 1);
        validator.validate(ID, 0, c1, c1);
        bytes memory c2 = _call("d", "z", 1, 1, 4);
        validator.validate(ID, 0, c2, c2);
        bytes memory c3 = _call("dr5ru7c02wn", "9q8yywe56gc", 25_000, 50_000, 3);
        validator.validate(ID, 0, c3, c3);
    }

    function test_acceptsAllClassValues() public view {
        for (uint8 cls = 1; cls <= 4; cls++) {
            bytes memory c = _call("u", "v", 1, 1, cls);
            validator.validate(ID, 0, c, c);
        }
    }

    function test_acceptsMaxMassVolume() public view {
        bytes memory c = _call("u", "v", type(uint32).max, type(uint32).max, 1);
        validator.validate(ID, 0, c, c);
    }

    // ── geohash rejection ──────────────────────────────────────────────────

    function test_rejectsEmptyOrigin() public {
        bytes memory c = _call("", "u4pruydqqv", 1, 1, 1);
        vm.expectRevert(
            abi.encodeWithSelector(FigaroGeoV2Validator.GeohashTooShort.selector, "originGeohash", uint256(0))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsEmptyDestination() public {
        bytes memory c = _call("u4pruydqqv", "", 1, 1, 1);
        vm.expectRevert(
            abi.encodeWithSelector(FigaroGeoV2Validator.GeohashTooShort.selector, "destinationGeohash", uint256(0))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsTooLongOrigin() public {
        bytes memory c = _call("u4pruydqqvjk0", "u4pruydqqv", 1, 1, 1);
        vm.expectRevert(
            abi.encodeWithSelector(FigaroGeoV2Validator.GeohashTooLong.selector, "originGeohash", uint256(13))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsForbiddenChar_a() public {
        bytes memory c = _call("abc", "u4pruydqqv", 1, 1, 1);
        vm.expectRevert();
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsForbiddenChar_l() public {
        bytes memory c = _call("u4pruydqqv", "lmn", 1, 1, 1);
        vm.expectRevert();
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsUppercase() public {
        bytes memory c = _call("U4PRUYDQQV", "u4pruydqqv", 1, 1, 1);
        vm.expectRevert();
        validator.validate(ID, 0, c, c);
    }

    // ── mass / volume rejection ────────────────────────────────────────────

    function test_rejectsZeroMass() public {
        bytes memory c = _call("u", "v", 0, 1, 1);
        vm.expectRevert(FigaroGeoV2Validator.MassZero.selector);
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsZeroVolume() public {
        bytes memory c = _call("u", "v", 1, 0, 1);
        vm.expectRevert(FigaroGeoV2Validator.VolumeZero.selector);
        validator.validate(ID, 0, c, c);
    }

    // ── classOfService rejection ───────────────────────────────────────────

    function test_rejectsZeroClass() public {
        bytes memory c = _call("u", "v", 1, 1, 0);
        vm.expectRevert(
            abi.encodeWithSelector(FigaroGeoV2Validator.InvalidClassOfService.selector, uint8(0))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsClassAboveMax() public {
        bytes memory c = _call("u", "v", 1, 1, 5);
        vm.expectRevert(
            abi.encodeWithSelector(FigaroGeoV2Validator.InvalidClassOfService.selector, uint8(5))
        );
        validator.validate(ID, 0, c, c);
    }

    // ── schemaId + sectionData cross-checks ────────────────────────────────

    function test_rejectsMismatchedSchemaId() public {
        bytes memory c = _call("u", "v", 1, 1, 1);
        bytes32 other = keccak256("not-geo");
        vm.expectRevert(abi.encodeWithSelector(FigaroGeoV2Validator.SchemaIdMismatch.selector, other, ID));
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _call("u4pruydqqv", "u4pruydqqv", 1, 1, 1);
        bytes memory content = _call("u4pruydqqv", "9q8yyk8yvr", 1, 1, 1);
        vm.expectRevert(FigaroGeoV2Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
