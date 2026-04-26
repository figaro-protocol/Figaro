// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISchemaValidator} from "../ISchemaValidator.sol";

/// @title FigaroGHGProtocolV1Validator
/// @notice Validates `figaro-ghg-protocol-v1` content — disclosure that the
///         seller will report scope 1 emissions for fulfilling this order
///         under the GHG Protocol Corporate Standard (and related WRI/WBCSD
///         GHG Protocol guidance documents).
///
/// @dev Content ABI encoding: `abi.encode(uint8 scope)`.
///      scope: 0 = unset, 1 = direct (Scope 1), 2 = purchased energy (Scope 2),
///             3 = value chain (Scope 3)
///
///      The accounting standard is identified by the schemaId itself —
///      sister schemas `figaro-ghg-iso-14064-v1`, `figaro-ghg-pas-2050-v1`,
///      `figaro-ghg-en-16258-v1`, and `figaro-ghg-custom-v1` cover the
///      remaining standards. Standard-specific extensions (reporting
///      boundaries, period, etc.) can be added to this validator without
///      affecting the siblings.
contract FigaroGHGProtocolV1Validator is ISchemaValidator {
    bytes32 public constant override schemaId = keccak256("figaro-ghg-protocol-v1");

    uint8 internal constant MAX_SCOPE = 3;

    error SchemaIdMismatch(bytes32 got, bytes32 expected);
    error InvalidScope(uint8 got);
    /// @dev Runtime `content` must byte-equal the committed clause `sectionData`.
    ///      A seller who signed a Scope 1 clause cannot later attest under a
    ///      different scope via this schema.
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
        uint8 scope = abi.decode(content, (uint8));
        if (scope > MAX_SCOPE) revert InvalidScope(scope);
    }
}
