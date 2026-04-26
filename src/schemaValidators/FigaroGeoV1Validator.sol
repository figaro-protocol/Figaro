// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISchemaValidator} from "../ISchemaValidator.sol";

/// @title FigaroGeoV1Validator
/// @notice Validates `figaro-geo-v1` content — origin and destination geohashes.
///
/// @dev Content ABI encoding: `abi.encode(string originGeohash, string destinationGeohash)`.
///      Each geohash MUST be 1–12 characters using the geohash base32 alphabet:
///        0–9, b, c, d, e, f, g, h, j, k, m, n, p, q, r, s, t, u, v, w, x, y, z
///        (excludes a, i, l, o)
contract FigaroGeoV1Validator is ISchemaValidator {
    bytes32 public constant override schemaId = keccak256("figaro-geo-v1");

    uint256 internal constant MIN_GEOHASH_LEN = 1;
    uint256 internal constant MAX_GEOHASH_LEN = 12;

    error SchemaIdMismatch(bytes32 got, bytes32 expected);
    error GeohashTooShort(string field, uint256 length);
    error GeohashTooLong(string field, uint256 length);
    error InvalidGeohashChar(string field, uint256 index, bytes1 charByte);
    /// @dev Runtime `content` must byte-equal the committed clause `sectionData`.
    ///      Parties who signed specific origin/destination geohashes at commit
    ///      cannot later attest different coordinates under the same schema.
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
        (string memory origin, string memory destination) = abi.decode(content, (string, string));
        _validateGeohash(origin, "originGeohash");
        _validateGeohash(destination, "destinationGeohash");
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
