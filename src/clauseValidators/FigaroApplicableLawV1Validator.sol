// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IClauseValidator} from "../IClauseValidator.sol";

/// @title FigaroApplicableLawV1Validator
/// @notice Validates `figaro-applicable-law-v1` content — state / ADR /
///         traditional-jurisdiction recourse layer. Identifies the body of law
///         governing the order and, optionally, a named adjudication venue and
///         proceedings language. Compose with `figaro-arbitration-kleros-v1`
///         (or another `figaro-arbitration-<provider>-v1`) to add a
///         decentralized ODR layer.
///
/// @dev Content ABI encoding:
///        `abi.encode(string applicableLaw, string forum, string language)`.
///
///      applicableLaw — REQUIRED. 2-16 chars (ISO 3166-1 alpha-2 / alpha-2 + 3166-2
///                      subdivision; 'EU'; 'INTL'; or a free-form non-state
///                      legal-order identifier). Empty is rejected (the clause
///                      is meaningless without a law — omit the whole clause
///                      instead).
///      forum — 0-64 chars. Empty means: courts of competent jurisdiction within
///              applicableLaw.
///      language — 0-16 chars. ISO 639-1 / 639-2 code. Empty means: official
///                 language of the forum.
contract FigaroApplicableLawV1Validator is IClauseValidator {
    function clauseId() public pure override returns (bytes32) {
        return keccak256(abi.encode("figaro-applicable-law", uint64(1)));
    }

    uint256 internal constant MIN_APPLICABLE_LAW_LEN = 2;
    uint256 internal constant MAX_APPLICABLE_LAW_LEN = 16;
    uint256 internal constant MAX_FORUM_LEN = 64;
    uint256 internal constant MAX_LANGUAGE_LEN = 16;

    error ClauseIdMismatch(bytes32 got, bytes32 expected);
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
        if (id != clauseId()) revert ClauseIdMismatch(id, clauseId());
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
