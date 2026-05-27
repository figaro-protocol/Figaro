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

    function _doc(bytes32 h, string memory v, string memory t)
        internal
        pure
        returns (FigaroConsentV1Validator.ConsentDocument memory)
    {
        return FigaroConsentV1Validator.ConsentDocument({
            documentHash: h,
            documentVersion: v,
            documentTitle: t
        });
    }

    function _docs1(FigaroConsentV1Validator.ConsentDocument memory a)
        internal
        pure
        returns (FigaroConsentV1Validator.ConsentDocument[] memory arr)
    {
        arr = new FigaroConsentV1Validator.ConsentDocument[](1);
        arr[0] = a;
    }

    function _docs2(
        FigaroConsentV1Validator.ConsentDocument memory a,
        FigaroConsentV1Validator.ConsentDocument memory b
    )
        internal
        pure
        returns (FigaroConsentV1Validator.ConsentDocument[] memory arr)
    {
        arr = new FigaroConsentV1Validator.ConsentDocument[](2);
        arr[0] = a;
        arr[1] = b;
    }

    function _call(FigaroConsentV1Validator.ConsentDocument[] memory docs)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(docs);
    }

    // ── Identity ────────────────────────────────────────────────────────────

    function test_schemaIdMatches() public view {
        assertEq(validator.schemaId(), ID);
    }

    // ── Happy paths ─────────────────────────────────────────────────────────

    function test_acceptsSingleDocument() public view {
        bytes memory c = _call(_docs1(_doc(SAMPLE_HASH, "1.0.0", "Privacy Policy")));
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsMultipleDocuments() public view {
        bytes memory c = _call(_docs2(
            _doc(SAMPLE_HASH, "1.0.0", "Terms of Service"),
            _doc(ALT_HASH, "2025-04-29", "Privacy Policy")
        ));
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsArbitraryStage() public view {
        bytes memory c = _call(_docs1(_doc(SAMPLE_HASH, "1.0.0", "Privacy Policy")));
        validator.validate(ID, 7, c, c);
    }

    // ── documents array bounds ──────────────────────────────────────────────

    function test_rejectsEmptyDocuments() public {
        FigaroConsentV1Validator.ConsentDocument[] memory empty =
            new FigaroConsentV1Validator.ConsentDocument[](0);
        bytes memory c = _call(empty);
        vm.expectRevert(FigaroConsentV1Validator.DocumentsEmpty.selector);
        validator.validate(ID, 0, c, c);
    }

    // ── per-document bounds ─────────────────────────────────────────────────

    function test_rejectsZeroDocumentHash() public {
        bytes memory c = _call(_docs1(_doc(bytes32(0), "1.0.0", "Privacy Policy")));
        vm.expectRevert(abi.encodeWithSelector(FigaroConsentV1Validator.EmptyDocumentHash.selector, uint256(0)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsZeroDocumentHashAtIndex1() public {
        bytes memory c = _call(_docs2(
            _doc(SAMPLE_HASH, "1.0.0", "Terms"),
            _doc(bytes32(0), "1.0.0", "Privacy")
        ));
        vm.expectRevert(abi.encodeWithSelector(FigaroConsentV1Validator.EmptyDocumentHash.selector, uint256(1)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsEmptyDocumentVersion() public {
        bytes memory c = _call(_docs1(_doc(SAMPLE_HASH, "", "Privacy Policy")));
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
        bytes memory c = _call(_docs1(_doc(SAMPLE_HASH, string(longVersion), "Privacy Policy")));
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
        bytes memory c = _call(_docs1(_doc(SAMPLE_HASH, string(maxVersion), "Privacy Policy")));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsEmptyDocumentTitle() public {
        bytes memory c = _call(_docs1(_doc(SAMPLE_HASH, "1.0.0", "")));
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
        bytes memory c = _call(_docs1(_doc(SAMPLE_HASH, "1.0.0", string(longTitle))));
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
        bytes memory c = _call(_docs1(_doc(SAMPLE_HASH, "1.0.0", string(maxTitle))));
        validator.validate(ID, 0, c, c);
    }

    // ── Schema-id + section-data integrity ──────────────────────────────────

    function test_rejectsMismatchedSchemaId() public {
        bytes memory c = _call(_docs1(_doc(SAMPLE_HASH, "1.0.0", "Privacy Policy")));
        bytes32 other = keccak256("not-consent");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroConsentV1Validator.SchemaIdMismatch.selector, other, ID)
        );
        validator.validate(other, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        bytes memory section = _call(_docs1(_doc(SAMPLE_HASH, "1.0.0", "Privacy Policy")));
        bytes memory content = _call(_docs1(_doc(ALT_HASH, "1.0.0", "Privacy Policy")));
        vm.expectRevert(FigaroConsentV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
