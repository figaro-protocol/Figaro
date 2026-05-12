// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISchemaValidator} from "../ISchemaValidator.sol";

/// @title FigaroGeoV2Validator
/// @notice Validates `figaro-geo-v2` content — origin, destination, mass, volume, class of service.
///         Extends v1 by promoting mass/volume/class from optional metadata to first-class
///         validated fields. Every field is required when this clause is included.
///
/// @dev Content ABI encoding:
///        `abi.encode(string originGeohash, string destinationGeohash,
///                    uint32 massGrams, uint32 volumeMl, uint8 classOfService)`.
///
///      Geohash alphabet (base32): 0–9, b, c, d, e, f, g, h, j, k, m, n, p, q, r,
///        s, t, u, v, w, x, y, z (excludes a, i, l, o). 1–12 characters each.
///      massGrams: 1 ≤ value ≤ uint32-max. 0 rejected.
///      volumeMl:  1 ≤ value ≤ uint32-max. 0 rejected.
///      classOfService: 1 = Standard, 2 = Express, 3 = Fragile, 4 = Cold Chain.
///                      0 reserved as "unset" and rejected; >4 rejected.
contract FigaroGeoV2Validator is ISchemaValidator {
    bytes32 public constant override schemaId = keccak256("figaro-geo-v2");

    uint256 internal constant MIN_GEOHASH_LEN = 1;
    uint256 internal constant MAX_GEOHASH_LEN = 12;
    uint8 internal constant CLASS_MAX = 4;

    error SchemaIdMismatch(bytes32 got, bytes32 expected);
    error GeohashTooShort(string field, uint256 length);
    error GeohashTooLong(string field, uint256 length);
    error InvalidGeohashChar(string field, uint256 index, bytes1 charByte);
    error MassZero();
    error VolumeZero();
    error InvalidClassOfService(uint8 value);
    /// @dev Runtime `content` must byte-equal the committed clause `sectionData`.
    ///      Parties who signed specific origin/destination/mass/volume/class at
    ///      commit cannot later attest different values under the same schema.
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

        (string memory origin, string memory destination, uint32 massGrams, uint32 volumeMl, uint8 classOfService) =
            abi.decode(content, (string, string, uint32, uint32, uint8));

        _validateGeohash(origin, "originGeohash");
        _validateGeohash(destination, "destinationGeohash");

        if (massGrams == 0) revert MassZero();
        if (volumeMl == 0) revert VolumeZero();
        if (classOfService == 0 || classOfService > CLASS_MAX) revert InvalidClassOfService(classOfService);
    }

    function _validateGeohash(string memory value, string memory field) internal pure {
        bytes memory b = bytes(value);
        if (b.length < MIN_GEOHASH_LEN) revert GeohashTooShort(field, b.length);
        if (b.length > MAX_GEOHASH_LEN) revert GeohashTooLong(field, b.length);
        for (uint256 i = 0; i < b.length; i++) {
            if (!_isGeohashChar(b[i])) revert InvalidGeohashChar(field, i, b[i]);
        }
    }

    function _isGeohashChar(bytes1 c) internal pure returns (bool) {
        // Digits 0-9
        if (c >= 0x30 && c <= 0x39) return true;
        // Disallowed lowercase: a (0x61), i (0x69), l (0x6c), o (0x6f)
        if (c == 0x61 || c == 0x69 || c == 0x6c || c == 0x6f) return false;
        // Lowercase b-z (excluding the four above)
        if (c >= 0x62 && c <= 0x7a) return true;
        return false;
    }
}
