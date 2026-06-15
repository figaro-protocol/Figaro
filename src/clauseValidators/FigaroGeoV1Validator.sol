// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IClauseValidator} from "../IClauseValidator.sol";

/// @title FigaroGeoV1Validator
/// @notice Validates `figaro-geo` content — origin, destination, mass, volume.
///         Handling class is no longer part of geo: it is its own elective
///         clause (`figaro-class-of-service`), so logistics attributes are
///         never unconditionally bundled. Every field here is required when
///         this clause is included.
///
/// @dev Content ABI encoding:
///        `abi.encode(string originGeohash, string destinationGeohash,
///                    uint256 massGrams, uint256 volumeMl)`.
///      (Integer fields encode as uint256; range checks enforced here.)
///
///      Geohash alphabet (base32): 0–9, b, c, d, e, f, g, h, j, k, m, n, p, q, r,
///        s, t, u, v, w, x, y, z (excludes a, i, l, o). 1–12 characters each.
///      massGrams: 1 ≤ value ≤ uint32-max.
///      volumeMl:  1 ≤ value ≤ uint32-max.
contract FigaroGeoV1Validator is IClauseValidator {
    function clauseId() public pure override returns (bytes32) {
        return keccak256(abi.encode("figaro-geo", uint64(1)));
    }

    uint256 internal constant MIN_GEOHASH_LEN = 1;
    uint256 internal constant MAX_GEOHASH_LEN = 12;
    uint256 internal constant MIN_DIMENSION = 1;
    uint256 internal constant MAX_DIMENSION = type(uint32).max;

    error ClauseIdMismatch(bytes32 got, bytes32 expected);
    error GeohashTooShort(string field, uint256 length);
    error GeohashTooLong(string field, uint256 length);
    error InvalidGeohashChar(string field, uint256 index, bytes1 charByte);
    error MassOutOfRange(uint256 value);
    error VolumeOutOfRange(uint256 value);
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

        (string memory origin, string memory destination, uint256 massGrams, uint256 volumeMl) =
            abi.decode(content, (string, string, uint256, uint256));

        _validateGeohash(origin, "originGeohash");
        _validateGeohash(destination, "destinationGeohash");

        if (massGrams < MIN_DIMENSION || massGrams > MAX_DIMENSION) revert MassOutOfRange(massGrams);
        if (volumeMl < MIN_DIMENSION || volumeMl > MAX_DIMENSION) revert VolumeOutOfRange(volumeMl);
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
