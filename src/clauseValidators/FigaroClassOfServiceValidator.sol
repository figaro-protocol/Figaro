// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IClauseValidator} from "../IClauseValidator.sol";

/// @title FigaroClassOfServiceValidator
/// @notice Validates `figaro-class-of-service` content — the handling class of a
///         shipment. Split out of figaro-geo so logistics handling is an
///         elective, never-default-on clause: most relationships need none.
///
/// @dev Content ABI encoding: `abi.encode(uint8 classOfService)` — the enum
///      ordinal (0-based): 0 = Standard (S), 1 = Express (E), 2 = Fragile (F),
///      3 = Cold Chain (C). > 3 is rejected.
contract FigaroClassOfServiceValidator is IClauseValidator {
    function clauseId() public pure override returns (bytes32) {
        return keccak256(abi.encode("figaro-class-of-service", uint64(1)));
    }

    uint8 internal constant CLASS_MAX = 3;

    error ClauseIdMismatch(bytes32 got, bytes32 expected);
    error InvalidClassOfService(uint8 value);
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
        uint8 classOfService = abi.decode(content, (uint8));
        if (classOfService > CLASS_MAX) revert InvalidClassOfService(classOfService);
    }
}
