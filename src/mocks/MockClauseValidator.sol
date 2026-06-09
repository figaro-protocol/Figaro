// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IClauseValidator} from "../IClauseValidator.sol";

/// @title MockClauseValidator
/// @notice Constructor-parameterized permissive validator for Foundry tests and
///         devnet e2e: binds to any clauseId and accepts any content under it.
///         Lets a test register a never-seen clause through the full
///         `ClauseRegistrationHelper.registerClauseAndValidator` path without
///         authoring a per-clause production validator.
/// @dev The `view` (not `pure`) `validate` shape is the parameterized-test-mock
///      carve-out documented in `IClauseValidator`'s NatSpec: reading the
///      constructor-set `immutable clauseId` is a state read to Solidity.
///      Production validators declare `external pure override`.
contract MockClauseValidator is IClauseValidator {
    bytes32 public immutable override clauseId;

    error ClauseIdMismatch(bytes32 got, bytes32 expected);

    constructor(bytes32 _clauseId) {
        clauseId = _clauseId;
    }

    /// @notice Permissive: any stage, any sectionData, any content — only the
    ///         clauseId binding is enforced.
    function validate(
        bytes32 id,
        uint8, /* stage */
        bytes calldata, /* sectionData */
        bytes calldata /* content */
    )
        external
        view
        override
    {
        if (id != clauseId) revert ClauseIdMismatch(id, clauseId);
    }
}
