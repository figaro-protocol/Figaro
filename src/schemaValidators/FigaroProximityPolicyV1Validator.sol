// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISchemaValidator} from "../ISchemaValidator.sol";

/// @title FigaroProximityPolicyV1Validator
/// @notice Validates `figaro-proximity-policy-v1` content — the committed
///         policy declaration for proximity verification on this assembly.
///         Captures the required detection band; nonce + signed witness
///         travel in the sister schema `figaro-proximity-proof-v1` at runtime.
///
/// @dev Sister-schema split (2026-04-26): the prior `figaro-proximity-v1`
///      conflated commit-time policy declaration with runtime handoff proof.
///      Mirrors the GHG split (per-standard disclosure committed +
///      ghg-measurement runtime). Path B per the policy-vs-proof backlog item.
///
/// @dev Category-2: byte-equality enforced. Designer commits the band at
///      agreement signing; runtime cannot drift to a different band.
///
/// @dev Content ABI encoding: `abi.encode(uint8 bandIndex)`.
///
///      bandIndex:
///        0 = none         (no proximity verification required)
///        1 = zone-wifi    (same WiFi network)
///        2 = nearby-ble   (BLE proximity)
///        3 = contact-nfc  (physical NFC tap)
contract FigaroProximityPolicyV1Validator is ISchemaValidator {
    bytes32 public constant override schemaId = keccak256("figaro-proximity-policy-v1");

    uint8 internal constant MAX_BAND = 3;

    error SchemaIdMismatch(bytes32 got, bytes32 expected);
    error InvalidBand(uint8 got);
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
        uint8 band = abi.decode(content, (uint8));
        if (band > MAX_BAND) revert InvalidBand(band);
    }
}
