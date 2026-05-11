// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroJurisdictionV1Validator} from "../../src/schemaValidators/FigaroJurisdictionV1Validator.sol";

contract FigaroJurisdictionV1ValidatorTest is Test {
    FigaroJurisdictionV1Validator validator;
    bytes32 constant ID = keccak256("figaro-jurisdiction-v1");

    function setUp() public {
        validator = new FigaroJurisdictionV1Validator();
    }

    function _call(
        uint8 klerosCourt,
        uint8 klerosMinJurors,
        string memory law,
        string memory forum,
        string memory language
    ) internal pure returns (bytes memory) {
        return abi.encode(klerosCourt, klerosMinJurors, law, forum, language);
    }

    // ── Identity + happy paths ──────────────────────────────────────────────

    function test_schemaIdMatches() public view {
        assertEq(validator.schemaId(), ID);
    }

    function test_acceptsKlerosOnly() public view {
        bytes memory c = _call(1, 3, "", "", "");
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsAllFourKlerosCourts() public view {
        for (uint8 court = 1; court <= 4; court++) {
            bytes memory c = _call(court, 3, "", "", "");
            validator.validate(ID, 0, c, c);
        }
    }

    function test_acceptsLayer3Only() public view {
        bytes memory c = _call(0, 0, "US-CA", "JAMS-arbitration", "en");
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsBothLayers() public view {
        bytes memory c = _call(2, 5, "US", "AAA-arbitration", "en");
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsTreatyLaw() public view {
        bytes memory c = _call(0, 0, "INTL", "ICC-arbitration", "fr");
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsNonStateLegalOrder() public view {
        bytes memory c = _call(0, 0, "Sharia", "", "ar");
        validator.validate(ID, 0, c, c);
    }

    // ── Layer-presence rule ─────────────────────────────────────────────────

    function test_rejectsNoLayerSet() public {
        bytes memory c = _call(0, 0, "", "", "");
        vm.expectRevert(FigaroJurisdictionV1Validator.NoJurisdictionLayerSet.selector);
        validator.validate(ID, 0, c, c);
    }

    // ── Kleros bounds ───────────────────────────────────────────────────────

    function test_rejectsKlerosCourtAboveMax() public {
        bytes memory c = _call(5, 3, "", "", "");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroJurisdictionV1Validator.InvalidKlerosCourt.selector, uint8(5))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsKlerosMinJurorsAboveMax() public {
        bytes memory c = _call(1, 100, "", "", "");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroJurisdictionV1Validator.InvalidKlerosMinJurors.selector, uint8(100))
        );
        validator.validate(ID, 0, c, c);
    }

    // ── Bounds: applicableLaw ───────────────────────────────────────────────

    function test_rejectsApplicableLawTooShort() public {
        bytes memory c = _call(0, 0, "U", "", "");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroJurisdictionV1Validator.ApplicableLawTooShort.selector, uint256(1))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsApplicableLawTooLong() public {
        bytes memory c = _call(0, 0, "AAAAAAAAAAAAAAAAA", "", "");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroJurisdictionV1Validator.ApplicableLawTooLong.selector, uint256(17))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsApplicableLawAtMaxLength() public view {
        bytes memory c = _call(0, 0, "AAAAAAAAAAAAAAAA", "", "");
        validator.validate(ID, 0, c, c);
    }

    // ── Bounds: forum ───────────────────────────────────────────────────────

    function test_rejectsForumTooLong() public {
        bytes memory longForum = new bytes(65);
        for (uint256 i = 0; i < 65; i++) longForum[i] = bytes1("a");
        bytes memory c = _call(0, 0, "US", string(longForum), "");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroJurisdictionV1Validator.ForumTooLong.selector, uint256(65))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsForumAtMaxLength() public view {
        bytes memory maxForum = new bytes(64);
        for (uint256 i = 0; i < 64; i++) maxForum[i] = bytes1("a");
        bytes memory c = _call(0, 0, "US", string(maxForum), "");
        validator.validate(ID, 0, c, c);
    }

    // ── Bounds: language ────────────────────────────────────────────────────

    function test_rejectsLanguageTooLong() public {
        bytes memory longLang = new bytes(17);
        for (uint256 i = 0; i < 17; i++) longLang[i] = bytes1("a");
        bytes memory c = _call(0, 0, "US", "", string(longLang));
        vm.expectRevert(
            abi.encodeWithSelector(FigaroJurisdictionV1Validator.LanguageTooLong.selector, uint256(17))
        );
        validator.validate(ID, 0, c, c);
    }

    // ── Schema-id + section-data integrity ──────────────────────────────────

    function test_rejectsMismatchedSchemaId() public {
        bytes memory c = _call(1, 3, "", "", "");
        bytes32 other = keccak256("not-jurisdiction");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroJurisdictionV1Validator.SchemaIdMismatch.selector, other, ID)
        );
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _call(1, 3, "", "", "");
        bytes memory content = _call(2, 5, "", "", "");
        vm.expectRevert(FigaroJurisdictionV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
