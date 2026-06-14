// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IClauseValidator} from "../IClauseValidator.sol";

/// @title FigaroHandoffV1Validator
/// @notice Validates `figaro-handoff-v1` content — where the physical hand-off
///         happens for an order's exchange. Multi-valued: the set of hand-off
///         points the parties accept. The proximity-verification policy
///         (`figaro-proximity-policy-v1`) nests under this hand-off.
///
/// @dev Content ABI encoding: `abi.encode(uint8[] handoffPoints)`.
///
///      Post-Keystone canonical 0-based positions:
///        0 = face-to-face   (in person)
///        1 = dead-drop      (left at an agreed spot)
///        2 = parking-area   (curbside / lot)
///        3 = locker         (a parcel locker)
///
///      An order with no physical hand-off has no figaro-handoff-v1 clause in
///      its agreement; an INCLUDED clause must carry at least one point.
contract FigaroHandoffV1Validator is IClauseValidator {
    function clauseId() public pure override returns (bytes32) {
        return keccak256(abi.encode("figaro-handoff", uint64(1)));
    }

    uint8 internal constant MAX_HANDOFF_POINT = 3;

    error ClauseIdMismatch(bytes32 got, bytes32 expected);
    error HandoffEmpty();
    error InvalidHandoffPoint(uint8 got);
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
        uint8[] memory points = abi.decode(content, (uint8[]));
        if (points.length == 0) revert HandoffEmpty();
        for (uint256 i = 0; i < points.length; i++) {
            uint8 p = points[i];
            if (p > MAX_HANDOFF_POINT) revert InvalidHandoffPoint(p);
        }
    }
}
