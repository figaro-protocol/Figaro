// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroConsentV1Validator} from "../../src/schemaValidators/FigaroConsentV1Validator.sol";

contract FigaroConsentV1ValidatorTest is Test {
    FigaroConsentV1Validator validator;
    bytes32 constant ID = keccak256("figaro-consent-v1");
    bytes32 constant SAMPLE_HASH = keccak256("sample-document-text-v1");
    bytes32 constant ALT_HASH = keccak256("alt-document-text");

    function setUp() public {
        validator = new FigaroConsentV1Validator();
    }

    function _h1(bytes32 a) internal pure returns (bytes32[] memory arr) {
        arr = new bytes32[](1);
        arr[0] = a;
    }

    function _h2(bytes32 a, bytes32 b) internal pure returns (bytes32[] memory arr) {
        arr = new bytes32[](2);
        arr[0] = a;
        arr[1] = b;
    }

    function _s1(string memory a) internal pure returns (string[] memory arr) {
        arr = new string[](1);
        arr[0] = a;
    }

    function _s2(string memory a, string memory b) internal pure returns (string[] memory arr) {
        arr = new string[](2);
        arr[0] = a;
        arr[1] = b;
    }

    function _call(bytes32[] memory hashes, string[] memory versions, string[] memory titles)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(hashes, versions, titles);
    }

    // ── Identity ────────────────────────────────────────────────────────────

    function test_schemaIdMatches() public view {
        assertEq(validator.schemaId(), ID);
    }

    // ── Happy paths ─────────────────────────────────────────────────────────

    function test_acceptsSingleDocument() public view {
        bytes memory c = _call(_h1(SAMPLE_HASH), _s1("1.0.0"), _s1("Privacy Policy"));
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsMultipleDocuments() public view {
        bytes memory c = _call(
            _h2(SAMPLE_HASH, ALT_HASH),
            _s2("1.0.0", "2025-04-29"),
            _s2("Terms of Service", "Privacy Policy")
        );
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsArbitraryStage() public view {
        bytes memory c = _call(_h1(SAMPLE_HASH), _s1("1.0.0"), _s1("Privacy Policy"));
        validator.validate(ID, 7, c, c);
    }

    // ── documents array bounds ──────────────────────────────────────────────

    function test_rejectsEmptyDocuments() public {
        bytes32[] memory hashes = new bytes32[](0);
        string[] memory versions = new string[](0);
        string[] memory titles = new string[](0);
        bytes memory c = _call(hashes, versions, titles);
        vm.expectRevert(FigaroConsentV1Validator.DocumentsEmpty.selector);
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsArrayLengthMismatch_versions() public {
        bytes memory c = _call(_h2(SAMPLE_HASH, ALT_HASH), _s1("1.0.0"), _s2("A", "B"));
        vm.expectRevert(FigaroConsentV1Validator.ArrayLengthMismatch.selector);
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsArrayLengthMismatch_titles() public {
        bytes memory c = _call(_h2(SAMPLE_HASH, ALT_HASH), _s2("1.0.0", "2.0.0"), _s1("A"));
        vm.expectRevert(FigaroConsentV1Validator.ArrayLengthMismatch.selector);
        validator.validate(ID, 0, c, c);
    }

    // ── per-document bounds ─────────────────────────────────────────────────

    function test_rejectsZeroDocumentHash() public {
        bytes memory c = _call(_h1(bytes32(0)), _s1("1.0.0"), _s1("Privacy Policy"));
        vm.expectRevert(abi.encodeWithSelector(FigaroConsentV1Validator.EmptyDocumentHash.selector, uint256(0)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsZeroDocumentHashAtIndex1() public {
        bytes memory c = _call(
            _h2(SAMPLE_HASH, bytes32(0)),
            _s2("1.0.0", "1.0.0"),
            _s2("Terms", "Privacy")
        );
        vm.expectRevert(abi.encodeWithSelector(FigaroConsentV1Validator.EmptyDocumentHash.selector, uint256(1)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsEmptyDocumentVersion() public {
        bytes memory c = _call(_h1(SAMPLE_HASH), _s1(""), _s1("Privacy Policy"));
        vm.expectRevert(
            abi.encodeWithSelector(
                FigaroConsentV1Validator.DocumentVersionTooShort.selector, uint256(0), uint256(0)
            )
        );
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsDocumentVersionTooLong() public {
        bytes memory longVersion = new bytes(33);
        for (uint256 i = 0; i < 33; i++) longVersion[i] = bytes1("a");
        bytes memory c = _call(_h1(SAMPLE_HASH), _s1(string(longVersion)), _s1("Privacy Policy"));
        vm.expectRevert(
            abi.encodeWithSelector(
                FigaroConsentV1Validator.DocumentVersionTooLong.selector, uint256(0), uint256(33)
            )
        );
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsDocumentVersionAtMaxLength() public view {
        bytes memory maxVersion = new bytes(32);
        for (uint256 i = 0; i < 32; i++) maxVersion[i] = bytes1("a");
        bytes memory c = _call(_h1(SAMPLE_HASH), _s1(string(maxVersion)), _s1("Privacy Policy"));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsEmptyDocumentTitle() public {
        bytes memory c = _call(_h1(SAMPLE_HASH), _s1("1.0.0"), _s1(""));
        vm.expectRevert(
            abi.encodeWithSelector(
                FigaroConsentV1Validator.DocumentTitleTooShort.selector, uint256(0), uint256(0)
            )
        );
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsDocumentTitleTooLong() public {
        bytes memory longTitle = new bytes(201);
        for (uint256 i = 0; i < 201; i++) longTitle[i] = bytes1("a");
        bytes memory c = _call(_h1(SAMPLE_HASH), _s1("1.0.0"), _s1(string(longTitle)));
        vm.expectRevert(
            abi.encodeWithSelector(
                FigaroConsentV1Validator.DocumentTitleTooLong.selector, uint256(0), uint256(201)
            )
        );
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsDocumentTitleAtMaxLength() public view {
        bytes memory maxTitle = new bytes(200);
        for (uint256 i = 0; i < 200; i++) maxTitle[i] = bytes1("a");
        bytes memory c = _call(_h1(SAMPLE_HASH), _s1("1.0.0"), _s1(string(maxTitle)));
        validator.validate(ID, 0, c, c);
    }

    // ── Schema-id + section-data integrity ──────────────────────────────────

    function test_rejectsMismatchedSchemaId() public {
        bytes memory c = _call(_h1(SAMPLE_HASH), _s1("1.0.0"), _s1("Privacy Policy"));
        bytes32 other = keccak256("not-consent");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroConsentV1Validator.SchemaIdMismatch.selector, other, ID)
        );
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _call(_h1(SAMPLE_HASH), _s1("1.0.0"), _s1("Privacy Policy"));
        bytes memory content = _call(_h1(ALT_HASH), _s1("1.0.0"), _s1("Privacy Policy"));
        vm.expectRevert(FigaroConsentV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
