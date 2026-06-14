// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IClauseValidator} from "../IClauseValidator.sol";

/// @title FigaroConsentV1Validator
/// @notice Validates `figaro-consent-v1` content — cryptographic consent
///         attestations to one or more off-chain legal documents.
///
/// @dev Pattern: off-chain document semantics, on-chain anchor for shared
///      reference integrity. Multi-valued — an agreement can bind to several
///      documents simultaneously. Each document is a `(hash, version, title)`
///      tuple; the documents field encodes as `tuple[]` per the canonical
///      object-array rule (the pre-Keystone struct-of-arrays shape was
///      retired in the keystone cutover).
///
/// @dev Content ABI encoding (post-Keystone canonical):
///        `abi.encode((bytes32 documentHash, string documentVersion, string documentTitle)[] documents)`.
///
///      MUST contain at least one document. Each documentHash is bytes32
///      (keccak256 of the canonical document text). version and title are
///      length-bounded to prevent griefing via unbounded calldata.
contract FigaroConsentV1Validator is IClauseValidator {
    function clauseId() public pure override returns (bytes32) {
        return keccak256(abi.encode("figaro-consent", uint64(1)));
    }

    uint256 internal constant MIN_VERSION_LEN = 1;
    uint256 internal constant MAX_VERSION_LEN = 32;
    uint256 internal constant MIN_TITLE_LEN = 1;
    uint256 internal constant MAX_TITLE_LEN = 200;

    struct ConsentDocument {
        bytes32 documentHash;
        string documentVersion;
        string documentTitle;
    }

    error ClauseIdMismatch(bytes32 got, bytes32 expected);
    error DocumentsEmpty();
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
        if (id != clauseId()) revert ClauseIdMismatch(id, clauseId());
        if (keccak256(sectionData) != keccak256(content)) revert SectionDataMismatch();

        ConsentDocument[] memory documents = abi.decode(content, (ConsentDocument[]));

        uint256 n = documents.length;
        if (n == 0) revert DocumentsEmpty();

        for (uint256 i = 0; i < n; i++) {
            if (documents[i].documentHash == bytes32(0)) revert EmptyDocumentHash(i);

            uint256 versionLen = bytes(documents[i].documentVersion).length;
            if (versionLen < MIN_VERSION_LEN) revert DocumentVersionTooShort(i, versionLen);
            if (versionLen > MAX_VERSION_LEN) revert DocumentVersionTooLong(i, versionLen);

            uint256 titleLen = bytes(documents[i].documentTitle).length;
            if (titleLen < MIN_TITLE_LEN) revert DocumentTitleTooShort(i, titleLen);
            if (titleLen > MAX_TITLE_LEN) revert DocumentTitleTooLong(i, titleLen);
        }
    }
}
