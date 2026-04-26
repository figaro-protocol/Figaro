// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISchemaValidator} from "../ISchemaValidator.sol";

/// @title FigaroHandoffV1Validator
/// @notice Validates `figaro-handoff-v1` content — physical-exchange mode.
///
/// @dev Content ABI encoding: `abi.encode(uint8 modeIndex)` where:
///        0 = face-to-face
///        1 = dead-drop
///        2 = parking-area
///        3 = locker
///        4 = courier-relay
///
///      Mode index MUST match the off-chain JSON spec's enum order — clients
///      and validators agree on this mapping out-of-band.
contract FigaroHandoffV1Validator is ISchemaValidator {
    bytes32 public constant override schemaId = keccak256("figaro-handoff-v1");

    uint8 internal constant MAX_MODE_INDEX = 4; // 0..4 inclusive (5 modes)

    error SchemaIdMismatch(bytes32 got, bytes32 expected);
    error InvalidMode(uint8 got);
    /// @dev Runtime `content` must byte-equal the committed clause `sectionData`.
    ///      This enforces that a seller who agreed to handoff mode X at commit
    ///      time cannot later attest under the same schema with a different mode.
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
        uint8 mode = abi.decode(content, (uint8));
        if (mode > MAX_MODE_INDEX) revert InvalidMode(mode);
    }
}
