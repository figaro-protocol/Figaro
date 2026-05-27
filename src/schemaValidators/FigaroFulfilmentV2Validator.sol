// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISchemaValidator} from "../ISchemaValidator.sol";

/// @title FigaroFulfilmentV2Validator
/// @notice Validates `figaro-fulfilment-v2` content — offered fulfilment options.
///         Multi-valued across three orthogonal dimensions.
///
/// @dev Content ABI encoding: `abi.encode(uint8[] modalities, uint8[] coordinations, uint8[] handoffPoints)`.
///
///      Post-Keystone canonical 0-based enum positions:
///        modalities[i]     — 0 = consume-onsite, 1 = pickup, 2 = delivery, 3 = virtual
///        coordinations[i]  — 0 = buyer-assigned, 1 = seller-assigned, 2 = dutch-auction
///                            coordinations MUST be non-empty IFF delivery is among modalities
///        handoffPoints[i]  — 0 = face-to-face, 1 = dead-drop, 2 = parking-area, 3 = locker
///
///      All positions are valid choices; an out-of-range index is rejected.
contract FigaroFulfilmentV2Validator is ISchemaValidator {
    bytes32 public constant override schemaId = keccak256("figaro-fulfilment-v2");

    uint8 internal constant MODALITY_MAX = 3;
    uint8 internal constant COORDINATION_MAX = 2;
    uint8 internal constant HANDOFF_POINT_MAX = 3;
    uint8 internal constant MODALITY_DELIVERY = 2;

    error SchemaIdMismatch(bytes32 got, bytes32 expected);
    error ModalitiesEmpty();
    error InvalidModality(uint8 value);
    error InvalidCoordination(uint8 value);
    error CoordinationsWithoutDelivery();
    error CoordinationsRequiredForDelivery();
    error InvalidHandoffPoint(uint8 value);
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
        if (id != schemaId) revert SchemaIdMismatch(id, schemaId);
        if (keccak256(sectionData) != keccak256(content)) revert SectionDataMismatch();

        (uint8[] memory modalities, uint8[] memory coordinations, uint8[] memory handoffPoints) =
            abi.decode(content, (uint8[], uint8[], uint8[]));

        if (modalities.length == 0) revert ModalitiesEmpty();

        bool hasDelivery = false;
        for (uint256 i = 0; i < modalities.length; i++) {
            uint8 m = modalities[i];
            if (m > MODALITY_MAX) revert InvalidModality(m);
            if (m == MODALITY_DELIVERY) hasDelivery = true;
        }

        for (uint256 i = 0; i < coordinations.length; i++) {
            uint8 c = coordinations[i];
            if (c > COORDINATION_MAX) revert InvalidCoordination(c);
        }

        if (coordinations.length > 0 && !hasDelivery) revert CoordinationsWithoutDelivery();
        if (hasDelivery && coordinations.length == 0) revert CoordinationsRequiredForDelivery();

        for (uint256 i = 0; i < handoffPoints.length; i++) {
            uint8 h = handoffPoints[i];
            if (h > HANDOFF_POINT_MAX) revert InvalidHandoffPoint(h);
        }
    }
}
