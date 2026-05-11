// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISchemaValidator} from "../ISchemaValidator.sol";

/// @title FigaroConsentV1Validator
/// @notice Validates `figaro-consent-v1` content — cryptographic consent
///         attestations to one or more off-chain legal documents.
///
/// @dev Pattern: off-chain document semantics, on-chain anchor for shared
///      reference integrity. Multi-valued — an agreement can bind to several
///      documents simultaneously. Three parallel arrays of equal length
///      carry the per-document (hash, version, title) tuples.
///
/// @dev Content ABI encoding:
///        `abi.encode(bytes32[] documentHashes, string[] documentVersions, string[] documentTitles)`.
///
///      All three arrays MUST have the same length and MUST contain at
///      least one entry. Each documentHashes[i] is bytes32 (keccak256 of
///      the canonical document text). versions and titles are length-bounded
///      to prevent griefing via unbounded calldata.
contract FigaroConsentV1Validator is ISchemaValidator {
    bytes32 public constant override schemaId = keccak256("figaro-consent-v1");

    uint256 internal constant MIN_VERSION_LEN = 1;
    uint256 internal constant MAX_VERSION_LEN = 32;
    uint256 internal constant MIN_TITLE_LEN = 1;
    uint256 internal constant MAX_TITLE_LEN = 200;

    error SchemaIdMismatch(bytes32 got, bytes32 expected);
    error DocumentsEmpty();
    error ArrayLengthMismatch();
    error EmptyDocumentHash(uint256 index);
    error DocumentVersionTooShort(uint256 index, uint256 length);
    error DocumentVersionTooLong(uint256 index, uint256 length);
    error DocumentTitleTooShort(uint256 index, uint256 length);
    error DocumentTitleTooLong(uint256 index, uint256 length);
    /// @dev Runtime `content` must byte-equal the committed clause `sectionData`.
    error SectionDataMismatch();

    function validate(
        bytes32 id,
        uint8,
        /* stage */
        bytes calldata sectionData,
        bytes calldata content
    )
        external
        pure
        override
    {
        if (id != schemaId) revert SchemaIdMismatch(id, schemaId);
        if (keccak256(sectionData) != keccak256(content)) revert SectionDataMismatch();

        (bytes32[] memory documentHashes, string[] memory documentVersions, string[] memory documentTitles) =
            abi.decode(content, (bytes32[], string[], string[]));

        uint256 n = documentHashes.length;
        if (n == 0) revert DocumentsEmpty();
        if (documentVersions.length != n || documentTitles.length != n) revert ArrayLengthMismatch();

        for (uint256 i = 0; i < n; i++) {
            if (documentHashes[i] == bytes32(0)) revert EmptyDocumentHash(i);

            uint256 versionLen = bytes(documentVersions[i]).length;
            if (versionLen < MIN_VERSION_LEN) revert DocumentVersionTooShort(i, versionLen);
            if (versionLen > MAX_VERSION_LEN) revert DocumentVersionTooLong(i, versionLen);

            uint256 titleLen = bytes(documentTitles[i]).length;
            if (titleLen < MIN_TITLE_LEN) revert DocumentTitleTooShort(i, titleLen);
            if (titleLen > MAX_TITLE_LEN) revert DocumentTitleTooLong(i, titleLen);
        }
    }
}
