// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IClauseValidator} from "../IClauseValidator.sol";

/// @title FigaroGHGV1Validator
/// @notice Validates `figaro-ghg` content — disclosure that the seller reports
///         GHG emissions under a named accounting methodology and scope.
///
/// @dev Replaces the former per-standard clauses (GHG Protocol, ISO 14064,
///      PAS 2050, EN 16258, custom), which were byte-identical in shape and
///      differed only by clauseId/name. The accounting methodology is now a
///      FREE-FORM `standard` field — the protocol keeps no closed list of
///      standards; any methodology (existing or future) is a value.
///
///      Content ABI encoding: `abi.encode(string standard, uint256 scope)`
///      (top-level fields in spec declaration order; `integer` → uint256).
///        - standard: non-empty
///        - scope: 0..3 (Layer A enforces 1..3; on-chain rejects only > 3)
contract FigaroGHGV1Validator is IClauseValidator {
    function clauseId() public pure override returns (bytes32) {
        return keccak256(abi.encode("figaro-ghg", uint64(1)));
    }

    uint256 internal constant MAX_SCOPE = 3;

    error ClauseIdMismatch(bytes32 got, bytes32 expected);
    error EmptyStandard();
    error InvalidScope(uint256 got);
    /// @dev Runtime `content` must byte-equal the committed clause `sectionData` —
    ///      a seller cannot attest a different standard/scope than was signed.
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
        (string memory standard, uint256 scope) = abi.decode(content, (string, uint256));
        if (bytes(standard).length == 0) revert EmptyStandard();
        if (scope > MAX_SCOPE) revert InvalidScope(scope);
    }
}
