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

    function _call(string memory law, string memory forum, string memory language)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(law, forum, language);
    }

    // ── Identity + happy paths ──────────────────────────────────────────────

    function test_schemaIdMatches() public view {
        assertEq(validator.schemaId(), ID);
    }

    function test_acceptsMinimalApplicableLawOnly() public view {
        bytes memory c = _call("US", "", "");
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsCommonStateLaw() public view {
        bytes memory c = _call("US-CA", "JAMS-arbitration", "en");
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsNonStateLegalOrder() public view {
        bytes memory c = _call("Kleros", "kleros", "en");
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsTreatyLaw() public view {
        bytes memory c = _call("INTL", "ICC-arbitration", "fr");
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsEuLaw() public view {
        bytes memory c = _call("EU", "", "de");
        validator.validate(ID, 0, c, c);
    }

    // ── Bounds: applicableLaw ───────────────────────────────────────────────

    function test_rejectsApplicableLawTooShort() public {
        bytes memory c = _call("U", "", "");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroJurisdictionV1Validator.ApplicableLawTooShort.selector, uint256(1))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsEmptyApplicableLaw() public {
        bytes memory c = _call("", "", "");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroJurisdictionV1Validator.ApplicableLawTooShort.selector, uint256(0))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsApplicableLawTooLong() public {
        // 17 chars — one over MAX_APPLICABLE_LAW_LEN (16)
        bytes memory c = _call("AAAAAAAAAAAAAAAAA", "", "");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroJurisdictionV1Validator.ApplicableLawTooLong.selector, uint256(17))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsApplicableLawAtMaxLength() public view {
        // 16 chars — exactly MAX_APPLICABLE_LAW_LEN
        bytes memory c = _call("AAAAAAAAAAAAAAAA", "", "");
        validator.validate(ID, 0, c, c);
    }

    // ── Bounds: forum ───────────────────────────────────────────────────────

    function test_rejectsForumTooLong() public {
        bytes memory longForum = new bytes(65);
        for (uint256 i = 0; i < 65; i++) longForum[i] = bytes1("a");
        bytes memory c = _call("US", string(longForum), "");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroJurisdictionV1Validator.ForumTooLong.selector, uint256(65))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsForumAtMaxLength() public view {
        bytes memory maxForum = new bytes(64);
        for (uint256 i = 0; i < 64; i++) maxForum[i] = bytes1("a");
        bytes memory c = _call("US", string(maxForum), "");
        validator.validate(ID, 0, c, c);
    }

    // ── Bounds: language ────────────────────────────────────────────────────

    function test_rejectsLanguageTooLong() public {
        bytes memory longLang = new bytes(17);
        for (uint256 i = 0; i < 17; i++) longLang[i] = bytes1("a");
        bytes memory c = _call("US", "", string(longLang));
        vm.expectRevert(
            abi.encodeWithSelector(FigaroJurisdictionV1Validator.LanguageTooLong.selector, uint256(17))
        );
        validator.validate(ID, 0, c, c);
    }

    // ── Schema-id + section-data integrity ──────────────────────────────────

    function test_rejectsMismatchedSchemaId() public {
        bytes memory c = _call("US", "", "");
        bytes32 other = keccak256("not-jurisdiction");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroJurisdictionV1Validator.SchemaIdMismatch.selector, other, ID)
        );
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _call("US-CA", "JAMS-arbitration", "en");
        bytes memory content = _call("US-NY", "AAA-arbitration", "en"); // drift
        vm.expectRevert(FigaroJurisdictionV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
