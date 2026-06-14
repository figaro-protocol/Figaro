// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IClauseValidator} from "../IClauseValidator.sol";

/// @title FigaroGHGEN16258V1Validator
/// @notice Validates `figaro-ghg-en-16258-v1` content — disclosure that the
///         seller will report scope 1 emissions for fulfilling this order
///         under EN 16258 (European methodology for the calculation and
///         declaration of energy consumption and GHG emissions of transport
///         services).
///
/// @dev Content ABI encoding: `abi.encode(uint256 scope)` (canonical: every `integer` field encodes as uint256).
///      scope: 0 = unset, 1 = direct (Scope 1), 2 = purchased energy (Scope 2),
///             3 = value chain (Scope 3)
///
///      The accounting standard is identified by the clauseId itself —
///      sister clauses `figaro-ghg-protocol-v1`, `figaro-ghg-iso-14064-v1`,
///      `figaro-ghg-pas-2050-v1`, and `figaro-ghg-custom-v1` cover the
///      remaining standards.
contract FigaroGHGEN16258V1Validator is IClauseValidator {
    function clauseId() public pure override returns (bytes32) {
        return keccak256(abi.encode("figaro-ghg-en-16258", uint64(1)));
    }

    uint256 internal constant MAX_SCOPE = 3;

    error ClauseIdMismatch(bytes32 got, bytes32 expected);
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
        if (id != clauseId()) revert ClauseIdMismatch(id, clauseId());
        if (keccak256(sectionData) != keccak256(content)) revert SectionDataMismatch();
        uint256 scope = abi.decode(content, (uint256));
        if (scope > MAX_SCOPE) revert InvalidScope(scope);
    }
}
