// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroApplicableLawV1Validator} from "../../src/clauseValidators/FigaroApplicableLawV1Validator.sol";

contract FigaroApplicableLawV1ValidatorTest is Test {
    FigaroApplicableLawV1Validator validator;
    bytes32 constant ID = keccak256(abi.encode("figaro-applicable-law", uint64(1)));

    function setUp() public {
        validator = new FigaroApplicableLawV1Validator();
    }

    function _call(string memory law, string memory forum, string memory language)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(law, forum, language);
    }

    // ── Identity + happy paths ──────────────────────────────────────────────

    function test_clauseIdMatches() public view {
        assertEq(validator.clauseId(), ID);
    }

    function test_acceptsLawOnly() public view {
        bytes memory c = _call("US-CA", "", "");
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsLawForumLanguage() public view {
        bytes memory c = _call("US", "AAA-arbitration", "en");
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsTreatyLaw() public view {
        bytes memory c = _call("INTL", "ICC-arbitration", "fr");
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsNonStateLegalOrder() public view {
        bytes memory c = _call("Sharia", "", "ar");
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsEU() public view {
        bytes memory c = _call("EU", "", "");
        validator.validate(ID, 0, c, c);
    }

    // ── applicableLaw bounds ────────────────────────────────────────────────

    function test_rejectsApplicableLawEmpty() public {
        bytes memory c = _call("", "", "");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroApplicableLawV1Validator.ApplicableLawTooShort.selector, uint256(0))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsApplicableLawTooShort() public {
        bytes memory c = _call("U", "", "");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroApplicableLawV1Validator.ApplicableLawTooShort.selector, uint256(1))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsApplicableLawTooLong() public {
        bytes memory c = _call("AAAAAAAAAAAAAAAAA", "", "");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroApplicableLawV1Validator.ApplicableLawTooLong.selector, uint256(17))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsApplicableLawAtMaxLength() public view {
        bytes memory c = _call("AAAAAAAAAAAAAAAA", "", "");
        validator.validate(ID, 0, c, c);
    }

    // ── forum bounds ────────────────────────────────────────────────────────

    function test_rejectsForumTooLong() public {
        bytes memory longForum = new bytes(65);
        for (uint256 i = 0; i < 65; i++) longForum[i] = bytes1("a");
        bytes memory c = _call("US", string(longForum), "");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroApplicableLawV1Validator.ForumTooLong.selector, uint256(65))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsForumAtMaxLength() public view {
        bytes memory maxForum = new bytes(64);
        for (uint256 i = 0; i < 64; i++) maxForum[i] = bytes1("a");
        bytes memory c = _call("US", string(maxForum), "");
        validator.validate(ID, 0, c, c);
    }

    // ── language bounds ─────────────────────────────────────────────────────

    function test_rejectsLanguageTooLong() public {
        bytes memory longLang = new bytes(17);
        for (uint256 i = 0; i < 17; i++) longLang[i] = bytes1("a");
        bytes memory c = _call("US", "", string(longLang));
        vm.expectRevert(
            abi.encodeWithSelector(FigaroApplicableLawV1Validator.LanguageTooLong.selector, uint256(17))
        );
        validator.validate(ID, 0, c, c);
    }

    // ── Clause-id + section-data integrity ──────────────────────────────────

    function test_rejectsMismatchedClauseId() public {
        bytes memory c = _call("US", "", "");
        bytes32 other = keccak256("not-applicable-law");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroApplicableLawV1Validator.ClauseIdMismatch.selector, other, ID)
        );
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _call("US", "", "");
        bytes memory content = _call("NL", "", "");
        vm.expectRevert(FigaroApplicableLawV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
