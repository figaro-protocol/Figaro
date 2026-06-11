// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IClauseValidator} from "../IClauseValidator.sol";

/// @title FigaroModalitiesV1Validator
/// @notice Validates `figaro-modalities-v1` content — the buyer's request.
///         Single-select: an assembly composes exactly one modality; a seller
///         offers variety as an array of assemblies, never options inside one.
///
/// @dev Content ABI encoding: `abi.encode(uint8 modality)`.
///
///      Canonical 0-based enum position (the spec's value order):
///        0 = consume-onsite, 1 = pickup, 2 = delivery, 3 = virtual
///
///      All positions are valid choices; an out-of-range index is rejected.
///      Coordination (how a delivery's courier edge is arranged) is its own
///      clause — `figaro-coordination-v1` — composed on the delivery order.
contract FigaroModalitiesV1Validator is IClauseValidator {
    bytes32 public constant override clauseId = keccak256("figaro-modalities-v1");

    uint8 internal constant MODALITY_MAX = 3;

    error ClauseIdMismatch(bytes32 got, bytes32 expected);
    error InvalidModality(uint8 value);
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

        uint8 modality = abi.decode(content, (uint8));
        if (modality > MODALITY_MAX) revert InvalidModality(modality);
    }
}
