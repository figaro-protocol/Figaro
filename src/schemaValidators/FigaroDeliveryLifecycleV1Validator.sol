// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISchemaValidator} from "../ISchemaValidator.sol";

/// @title FigaroDeliveryLifecycleV1Validator
/// @notice Validates `figaro-delivery-lifecycle-v1` content — stage progression
///         marker for a delivery order.
///
/// @dev Lifecycle stages (uint8 envelope):
///        0 = preparationStarted
///        1 = readyForPickup
///        2 = courierEnRoute
///        3 = pickedUp
///        4 = delivered
///
///      Content ABI encoding: `abi.encode(string evidenceUri)`.
///      evidenceUri is optional (may be empty); max 512 bytes when present.
contract FigaroDeliveryLifecycleV1Validator is ISchemaValidator {
    bytes32 public constant override schemaId = keccak256("figaro-delivery-lifecycle-v1");

    uint8 internal constant MAX_STAGE = 4;
    uint256 internal constant MAX_URI_LEN = 512;

    error SchemaIdMismatch(bytes32 got, bytes32 expected);
    error InvalidStage(uint8 got);
    error EvidenceUriTooLong(uint256 length);

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
        if (id != schemaId) revert SchemaIdMismatch(id, schemaId);
        if (stage > MAX_STAGE) revert InvalidStage(stage);
        string memory evidenceUri = abi.decode(content, (string));
        uint256 len = bytes(evidenceUri).length;
        if (len > MAX_URI_LEN) revert EvidenceUriTooLong(len);
    }
}
