// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IClauseValidator} from "../IClauseValidator.sol";

/// @title FigaroGHGMeasurementV1Validator
/// @notice Validates `figaro-ghg-measurement-v1` content — a runtime grams
///         CO2e measurement attached to an order's delivery.
///
/// @dev Runtime-only (Category-1) clause. The committed agreement section
///      declares "this process measures in grams CO2e" (unit of account);
///      the actual grams value lives in each runtime attestation's `content`.
///      The validator does NOT cross-check `content` against `sectionData` —
///      the declared unit and the measured value are deliberately different.
///      Contrast with the `figaro-ghg-<standard>-v1` sister clauses
///      (figaro-ghg-protocol-v1, figaro-ghg-iso-14064-v1, figaro-ghg-pas-2050-v1,
///      figaro-ghg-en-16258-v1, figaro-ghg-custom-v1), which bind a committed
///      scope and enforce runtime byte-equality. Standard identity lives in
///      the clauseId, so each accounting standard has its own sister clause.
///
/// @dev Content ABI encoding: `abi.encode(uint256 grams)` — 32 bytes of
///      grams CO2e. No upper bound enforced; callers responsible for unit
///      sanity.
///
/// @dev Stage envelope (uint8):
///        0 = Estimate       — forecast ahead of the work
///        1 = Measured       — actual measurement after the work
///        2 = Restatement    — correction to a prior measurement
///        3 = Verification   — third-party validated measurement
contract FigaroGHGMeasurementV1Validator is IClauseValidator {
    function clauseId() public pure override returns (bytes32) {
        return keccak256(abi.encode("figaro-ghg-measurement", uint64(1)));
    }

    uint8 internal constant MAX_STAGE = 3;

    error ClauseIdMismatch(bytes32 got, bytes32 expected);
    error InvalidStage(uint8 got);

    function validate(
        bytes32 id,
        uint8 stage,
        bytes calldata,
        /* sectionData */
        bytes calldata content
    )
        external
        pure
        override
    {
        if (id != clauseId()) revert ClauseIdMismatch(id, clauseId());
        if (stage > MAX_STAGE) revert InvalidStage(stage);
        abi.decode(content, (uint256)); // reverts on malformed content
    }
}
