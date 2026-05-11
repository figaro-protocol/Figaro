// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISchemaValidator} from "../ISchemaValidator.sol";

/// @title FigaroJurisdictionV1Validator
/// @notice Validates `figaro-jurisdiction-v1` content — three-layer dispute
///         resolution. Layer 1 (kernel mechanisms) is always active and not
///         encoded here. Layer 2 (Kleros ODR) lives in `klerosCourt` +
///         `klerosMinJurors`. Layer 3 (state / ADR / traditional) lives in
///         `applicableLaw` + `forum` + `language`. At least one of
///         `klerosCourt` or `applicableLaw` must be set.
///
/// @dev Content ABI encoding:
///        `abi.encode(uint8 klerosCourt, uint8 klerosMinJurors,
///                    string applicableLaw, string forum, string language)`.
///
///      klerosCourt — 0 = unset (layer 2 not selected), 1 = general,
///                    2 = blockchain-nontechnical, 3 = blockchain-technical,
///                    4 = english-language.
///      klerosMinJurors — 0 = unset, otherwise 1-99.
///      applicableLaw — empty = layer 3 not selected; otherwise 2-16 chars.
///      forum — 0-64 chars (layer 3 venue).
///      language — 0-16 chars (ISO 639 code).
contract FigaroJurisdictionV1Validator is ISchemaValidator {
    bytes32 public constant override schemaId = keccak256("figaro-jurisdiction-v1");

    uint8 internal constant KLEROS_COURT_MAX = 4;
    uint8 internal constant KLEROS_MIN_JURORS_MAX = 99;
    uint256 internal constant MIN_APPLICABLE_LAW_LEN = 2;
    uint256 internal constant MAX_APPLICABLE_LAW_LEN = 16;
    uint256 internal constant MAX_FORUM_LEN = 64;
    uint256 internal constant MAX_LANGUAGE_LEN = 16;

    error SchemaIdMismatch(bytes32 got, bytes32 expected);
    error NoJurisdictionLayerSet();
    error InvalidKlerosCourt(uint8 value);
    error InvalidKlerosMinJurors(uint8 value);
    error ApplicableLawTooShort(uint256 length);
    error ApplicableLawTooLong(uint256 length);
    error ForumTooLong(uint256 length);
    error LanguageTooLong(uint256 length);
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

        (
            uint8 klerosCourt,
            uint8 klerosMinJurors,
            string memory applicableLaw,
            string memory forum,
            string memory language
        ) = abi.decode(content, (uint8, uint8, string, string, string));

        if (klerosCourt > KLEROS_COURT_MAX) revert InvalidKlerosCourt(klerosCourt);
        if (klerosMinJurors > KLEROS_MIN_JURORS_MAX) revert InvalidKlerosMinJurors(klerosMinJurors);

        uint256 lawLen = bytes(applicableLaw).length;
        if (klerosCourt == 0 && lawLen == 0) revert NoJurisdictionLayerSet();

        if (lawLen != 0) {
            if (lawLen < MIN_APPLICABLE_LAW_LEN) revert ApplicableLawTooShort(lawLen);
            if (lawLen > MAX_APPLICABLE_LAW_LEN) revert ApplicableLawTooLong(lawLen);
        }

        uint256 forumLen = bytes(forum).length;
        if (forumLen > MAX_FORUM_LEN) revert ForumTooLong(forumLen);

        uint256 languageLen = bytes(language).length;
        if (languageLen > MAX_LANGUAGE_LEN) revert LanguageTooLong(languageLen);
    }
}
