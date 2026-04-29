// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISchemaValidator} from "../ISchemaValidator.sol";

/// @title FigaroConsentV1Validator
/// @notice Validates `figaro-consent-v1` content — cryptographic consent
///         attestation to an off-chain legal document.
///
/// @dev Pattern: off-chain document semantics, on-chain anchor for shared
///      reference integrity (per PROTOCOL_EXTENSION_DOCTRINE.md
///      "Reusable Pattern Beyond GHG"). The 32-byte `documentHash` is the
///      binding identifier; `documentVersion` and `documentTitle` are
///      labels for off-chain rendering and dispute reference.
///
/// @dev Consenter address is recoverable from the EIP-712 signature on the
///      AttestationCoordinator call — visible as `attester` in the
///      Attestation event. It is intentionally NOT a content field:
///      duplicating it would let off-chain content drift from the
///      cryptographically recovered signer. Block timestamp captures when.
///
/// @dev Append-only identity: revocation is a separate off-chain process
///      (the participant withdraws via the consent agreement; the operator
///      removes the wallet from active lists). Revocation does NOT mutate
///      the on-chain attestation. A new document version requires
///      figaro-consent-v2.
///
/// @dev Content ABI encoding: `abi.encode(bytes32 documentHash, string documentVersion, string documentTitle)`.
///
///      documentHash    — required, 32 bytes. keccak256 of the canonical
///                        legal document text. The document itself lives
///                        off-chain (PDF receipt, IPFS pin, etc.).
///      documentVersion — required, 1-32 chars. Semver-style identifier
///                        (e.g., "1.0.0", "2025-04-29"). Bounded to
///                        prevent griefing via unbounded calldata.
///      documentTitle   — required, 1-200 chars. Human-readable name
///                        (e.g., "Figaro Beta Informed Consent Agreement").
contract FigaroConsentV1Validator is ISchemaValidator {
    bytes32 public constant override schemaId = keccak256("figaro-consent-v1");

    uint256 internal constant MIN_VERSION_LEN = 1;
    uint256 internal constant MAX_VERSION_LEN = 32;
    uint256 internal constant MIN_TITLE_LEN = 1;
    uint256 internal constant MAX_TITLE_LEN = 200;

    error SchemaIdMismatch(bytes32 got, bytes32 expected);
    error EmptyDocumentHash();
    error DocumentVersionTooShort(uint256 length);
    error DocumentVersionTooLong(uint256 length);
    error DocumentTitleTooShort(uint256 length);
    error DocumentTitleTooLong(uint256 length);
    /// @dev Runtime `content` must byte-equal the committed clause `sectionData`.
    ///      Consent is committed at agreement-signing time; runtime drift
    ///      would let a participant claim consent to v1 of a document and
    ///      attest under a different (documentHash, version, title) tuple.
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
        (bytes32 documentHash, string memory documentVersion, string memory documentTitle) =
            abi.decode(content, (bytes32, string, string));

        if (documentHash == bytes32(0)) revert EmptyDocumentHash();

        uint256 versionLen = bytes(documentVersion).length;
        if (versionLen < MIN_VERSION_LEN) revert DocumentVersionTooShort(versionLen);
        if (versionLen > MAX_VERSION_LEN) revert DocumentVersionTooLong(versionLen);

        uint256 titleLen = bytes(documentTitle).length;
        if (titleLen < MIN_TITLE_LEN) revert DocumentTitleTooShort(titleLen);
        if (titleLen > MAX_TITLE_LEN) revert DocumentTitleTooLong(titleLen);
    }
}
