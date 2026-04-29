// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroConsentV1Validator} from "../../src/schemaValidators/FigaroConsentV1Validator.sol";

contract FigaroConsentV1ValidatorTest is Test {
    FigaroConsentV1Validator validator;
    bytes32 constant ID = keccak256("figaro-consent-v1");
    bytes32 constant SAMPLE_HASH = keccak256("sample-document-text-v1");

    function setUp() public {
        validator = new FigaroConsentV1Validator();
    }

    function _call(bytes32 documentHash, string memory version, string memory title)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(documentHash, version, title);
    }

    // ── Identity ────────────────────────────────────────────────────────────

    function test_schemaIdMatches() public view {
        assertEq(validator.schemaId(), ID);
    }

    // ── Happy paths ─────────────────────────────────────────────────────────

    function test_acceptsTypicalConsent() public view {
        bytes memory c = _call(SAMPLE_HASH, "1.0.0", "Figaro Beta Informed Consent Agreement");
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsDateBasedVersion() public view {
        bytes memory c = _call(SAMPLE_HASH, "2025-04-29", "Privacy Policy");
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsArbitraryStage() public view {
        // Validator ignores stage — schema has no per-stage overrides.
        bytes memory c = _call(SAMPLE_HASH, "1.0.0", "Privacy Policy");
        validator.validate(ID, 7, c, c);
    }

    // ── documentHash bounds ─────────────────────────────────────────────────

    function test_rejectsZeroDocumentHash() public {
        bytes memory c = _call(bytes32(0), "1.0.0", "Privacy Policy");
        vm.expectRevert(FigaroConsentV1Validator.EmptyDocumentHash.selector);
        validator.validate(ID, 0, c, c);
    }

    // ── documentVersion bounds ──────────────────────────────────────────────

    function test_rejectsEmptyDocumentVersion() public {
        bytes memory c = _call(SAMPLE_HASH, "", "Privacy Policy");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroConsentV1Validator.DocumentVersionTooShort.selector, uint256(0))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsDocumentVersionTooLong() public {
        // 33 chars — one over MAX_VERSION_LEN (32)
        bytes memory longVersion = new bytes(33);
        for (uint256 i = 0; i < 33; i++) longVersion[i] = bytes1("a");
        bytes memory c = _call(SAMPLE_HASH, string(longVersion), "Privacy Policy");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroConsentV1Validator.DocumentVersionTooLong.selector, uint256(33))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsDocumentVersionAtMaxLength() public view {
        // 32 chars — exactly MAX_VERSION_LEN
        bytes memory maxVersion = new bytes(32);
        for (uint256 i = 0; i < 32; i++) maxVersion[i] = bytes1("a");
        bytes memory c = _call(SAMPLE_HASH, string(maxVersion), "Privacy Policy");
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsDocumentVersionAtMinLength() public view {
        // 1 char — exactly MIN_VERSION_LEN
        bytes memory c = _call(SAMPLE_HASH, "1", "Privacy Policy");
        validator.validate(ID, 0, c, c);
    }

    // ── documentTitle bounds ────────────────────────────────────────────────

    function test_rejectsEmptyDocumentTitle() public {
        bytes memory c = _call(SAMPLE_HASH, "1.0.0", "");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroConsentV1Validator.DocumentTitleTooShort.selector, uint256(0))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsDocumentTitleTooLong() public {
        // 201 chars — one over MAX_TITLE_LEN (200)
        bytes memory longTitle = new bytes(201);
        for (uint256 i = 0; i < 201; i++) longTitle[i] = bytes1("a");
        bytes memory c = _call(SAMPLE_HASH, "1.0.0", string(longTitle));
        vm.expectRevert(
            abi.encodeWithSelector(FigaroConsentV1Validator.DocumentTitleTooLong.selector, uint256(201))
        );
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsDocumentTitleAtMaxLength() public view {
        // 200 chars — exactly MAX_TITLE_LEN
        bytes memory maxTitle = new bytes(200);
        for (uint256 i = 0; i < 200; i++) maxTitle[i] = bytes1("a");
        bytes memory c = _call(SAMPLE_HASH, "1.0.0", string(maxTitle));
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsDocumentTitleAtMinLength() public view {
        // 1 char — exactly MIN_TITLE_LEN
        bytes memory c = _call(SAMPLE_HASH, "1.0.0", "T");
        validator.validate(ID, 0, c, c);
    }

    // ── Schema-id + section-data integrity ──────────────────────────────────

    function test_rejectsMismatchedSchemaId() public {
        bytes memory c = _call(SAMPLE_HASH, "1.0.0", "Privacy Policy");
        bytes32 other = keccak256("not-consent");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroConsentV1Validator.SchemaIdMismatch.selector, other, ID)
        );
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        // Participant signed for one document at commit time but attests with another.
        bytes memory section = _call(SAMPLE_HASH, "1.0.0", "Privacy Policy");
        bytes memory content = _call(keccak256("different-document"), "1.0.0", "Privacy Policy");
        vm.expectRevert(FigaroConsentV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }

    function test_rejectsSectionDataMismatchOnVersionDrift() public {
        // Same hash but version drift between commit-time and runtime.
        bytes memory section = _call(SAMPLE_HASH, "1.0.0", "Privacy Policy");
        bytes memory content = _call(SAMPLE_HASH, "2.0.0", "Privacy Policy");
        vm.expectRevert(FigaroConsentV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }

    // ── Malformed input ─────────────────────────────────────────────────────

    function test_rejectsTruncatedAbi() public {
        // Only the bytes32 hash, no string fields — abi.decode reverts.
        bytes memory bad = abi.encode(SAMPLE_HASH);
        vm.expectRevert(); // abi.decode revert (no specific selector)
        validator.validate(ID, 0, bad, bad);
    }

    // ── Gas bound ───────────────────────────────────────────────────────────
    //
    // Validator must not be unboundedly expensive. The two unbounded inputs
    // (documentVersion, documentTitle) are length-capped in code (32 / 200);
    // gas at the maxes should remain well under typical kernel-call budgets.
    function test_gasBoundAtMaxInputs() public view {
        bytes memory maxVersion = new bytes(32);
        for (uint256 i = 0; i < 32; i++) maxVersion[i] = bytes1("a");
        bytes memory maxTitle = new bytes(200);
        for (uint256 i = 0; i < 200; i++) maxTitle[i] = bytes1("b");
        bytes memory c = _call(SAMPLE_HASH, string(maxVersion), string(maxTitle));

        uint256 gasBefore = gasleft();
        validator.validate(ID, 0, c, c);
        uint256 gasUsed = gasBefore - gasleft();

        // Bound: should be < 50k gas at input maxes (decode + four length checks).
        // 50k is generous — typical observed cost on similar string-pair
        // validators (jurisdiction) is well under 30k.
        assertLt(gasUsed, 50_000);
    }
}
