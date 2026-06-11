// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IClauseValidator} from "../IClauseValidator.sol";

/// @title FigaroCoordinationV1Validator
/// @notice Validates `figaro-coordination-v1` content — how the courier edge
///         of a delivery is arranged across the process DAG. Composes on the
///         delivery (parent) order; the courier order is just another
///         buyer↔seller order. Single-select: coordination variants are
///         separate assemblies, never options inside one.
///
/// @dev Content ABI encoding: `abi.encode(uint8 coordination)`.
///
///      Canonical 0-based enum position (the spec's value order):
///        0 = seller-assigned, 1 = buyer-assigned, 2 = dutch-auction
///
///      All positions are valid choices; an out-of-range index is rejected.
contract FigaroCoordinationV1Validator is IClauseValidator {
    bytes32 public constant override clauseId = keccak256("figaro-coordination-v1");

    uint8 internal constant COORDINATION_MAX = 2;

    error ClauseIdMismatch(bytes32 got, bytes32 expected);
    error InvalidCoordination(uint8 value);
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
        if (id != clauseId) revert ClauseIdMismatch(id, clauseId);
        if (keccak256(sectionData) != keccak256(content)) revert SectionDataMismatch();

        uint8 coordination = abi.decode(content, (uint8));
        if (coordination > COORDINATION_MAX) revert InvalidCoordination(coordination);
    }
}
