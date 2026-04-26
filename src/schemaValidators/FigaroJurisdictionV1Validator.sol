// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISchemaValidator} from "../ISchemaValidator.sol";

/// @title FigaroJurisdictionV1Validator
/// @notice Validates `figaro-jurisdiction-v1` content — off-chain dispute-
///         resolution jurisdiction (applicable law + forum + language).
///
/// @dev Per Paper E: settlement on-chain by nature; adjudication off-chain by
///      nature. Every signed contract sits inside *some* jurisdiction even
///      though FigaroCore never reads it. Jurisdiction is a baseline graph
///      alongside capital flow, geolocation, GHG, DAG topology, handoff, and
///      proximity — universal in the same sense as those other baselines.
///
/// @dev Generic across legal traditions: state law (ISO 3166 codes), religious
///      law (Sharia, Halakha), customary law (named tribal/community order),
///      and ODR systems (Kleros, ICANN-UDRP, etc.). The `applicableLaw` field
///      is intentionally a free-form string so a non-state legal order can be
///      named directly without forcing it into a state-centric taxonomy.
///
/// @dev Content ABI encoding: `abi.encode(string applicableLaw, string forum, string language)`.
///
///      applicableLaw — required, 2-16 chars. ISO 3166-1 alpha-2 country code
///                      (e.g., "US", "NL", "JP"), optionally with ISO 3166-2
///                      subdivision (e.g., "US-CA", "CA-ON"). "EU" for
///                      European Union law. "INTL" for international/treaty
///                      law. Free-form for non-state legal orders (e.g.,
///                      "Sharia", "ICANN-UDRP", "Kleros").
///      forum         — optional, 0-64 chars. Named adjudication venue
///                      (e.g., "JAMS-arbitration", "AAA-arbitration",
///                      "ICC-arbitration", "us-federal-court", "kleros").
///                      Empty means: courts of competent jurisdiction within
///                      applicableLaw.
///      language      — optional, 0-16 chars. ISO 639-1/639-2 language code
///                      for adjudication proceedings (e.g., "en", "fr", "zh",
///                      "ar"). Empty means: official language of the forum.
contract FigaroJurisdictionV1Validator is ISchemaValidator {
    bytes32 public constant override schemaId = keccak256("figaro-jurisdiction-v1");

    uint256 internal constant MIN_APPLICABLE_LAW_LEN = 2;
    uint256 internal constant MAX_APPLICABLE_LAW_LEN = 16;
    uint256 internal constant MAX_FORUM_LEN = 64;
    uint256 internal constant MAX_LANGUAGE_LEN = 16;

    error SchemaIdMismatch(bytes32 got, bytes32 expected);
    error ApplicableLawTooShort(uint256 length);
    error ApplicableLawTooLong(uint256 length);
    error ForumTooLong(uint256 length);
    error LanguageTooLong(uint256 length);
    /// @dev Runtime `content` must byte-equal the committed clause `sectionData`.
    ///      Jurisdiction is a contract-time commitment; runtime drift would
    ///      undermine the evidentiary value of the on-chain record.
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
        (string memory applicableLaw, string memory forum, string memory language) =
            abi.decode(content, (string, string, string));

        uint256 lawLen = bytes(applicableLaw).length;
        if (lawLen < MIN_APPLICABLE_LAW_LEN) revert ApplicableLawTooShort(lawLen);
        if (lawLen > MAX_APPLICABLE_LAW_LEN) revert ApplicableLawTooLong(lawLen);

        uint256 forumLen = bytes(forum).length;
        if (forumLen > MAX_FORUM_LEN) revert ForumTooLong(forumLen);

        uint256 languageLen = bytes(language).length;
        if (languageLen > MAX_LANGUAGE_LEN) revert LanguageTooLong(languageLen);
    }
}
