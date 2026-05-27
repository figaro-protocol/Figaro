// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISchemaValidator} from "../ISchemaValidator.sol";

/// @title FigaroGHGISO14064V1Validator
/// @notice Validates `figaro-ghg-iso-14064-v1` content — disclosure that the
///         seller will report scope 1 emissions for fulfilling this order
///         under the ISO 14064 family (parts 1, 2, and 3).
///
/// @dev Content ABI encoding: `abi.encode(uint256 scope)` (canonical: every `integer` field encodes as uint256).
///      scope: 0 = unset, 1 = direct (Scope 1), 2 = purchased energy (Scope 2),
///             3 = value chain (Scope 3)
///
///      The accounting standard is identified by the schemaId itself —
///      sister schemas `figaro-ghg-protocol-v1`, `figaro-ghg-pas-2050-v1`,
///      `figaro-ghg-en-16258-v1`, and `figaro-ghg-custom-v1` cover the
///      remaining standards. ISO 14064 part-level granularity (14064-1
///      organization-level, 14064-2 project-level, 14064-3 verification)
///      can be added in future v2 schemas without affecting v1 callers.
contract FigaroGHGISO14064V1Validator is ISchemaValidator {
    bytes32 public constant override schemaId = keccak256("figaro-ghg-iso-14064-v1");

    uint256 internal constant MAX_SCOPE = 3;

    error SchemaIdMismatch(bytes32 got, bytes32 expected);
    error InvalidScope(uint256 got);
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
        uint256 scope = abi.decode(content, (uint256));
        if (scope > MAX_SCOPE) revert InvalidScope(scope);
    }
}
