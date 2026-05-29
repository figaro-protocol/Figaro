// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISchemaValidator} from "../ISchemaValidator.sol";

/// @title FigaroProximityPolicyV1Validator
/// @notice Validates `figaro-proximity-policy-v1` content — committed
///         proximity-verification options. Multi-valued: the set of detection
///         bands a seller offers (or a buyer's commitment selects) for this
///         order. Per-handoff nonce + signed witness travel in the sister
///         schema `figaro-proximity-proof-v1` at runtime.
///
/// @dev Content ABI encoding: `abi.encode(uint8[] bands)`.
///
///      Post-Keystone canonical 0-based positions:
///        0 = zone-wifi    (same WiFi network)
///        1 = nearby-ble   (BLE proximity)
///        2 = contact-nfc  (physical NFC tap)
///
///      An order without proximity verification has no proximity-policy clause
///      in its agreement; an INCLUDED clause must carry at least one band.
contract FigaroProximityPolicyV1Validator is ISchemaValidator {
    bytes32 public constant override schemaId = keccak256("figaro-proximity-policy-v1");

    uint8 internal constant MAX_BAND = 2;

    error SchemaIdMismatch(bytes32 got, bytes32 expected);
    error BandsEmpty();
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
        uint8[] memory bands = abi.decode(content, (uint8[]));
        if (bands.length == 0) revert BandsEmpty();
        for (uint256 i = 0; i < bands.length; i++) {
            uint8 b = bands[i];
            if (b > MAX_BAND) revert InvalidBand(b);
        }
    }
}
