// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISchemaValidator} from "../ISchemaValidator.sol";

/// @title FigaroFulfilmentV2Validator
/// @notice Validates `figaro-fulfilment-v2` content — modality, coordination, handoffPoint.
///
/// @dev Content ABI encoding: `abi.encode(uint8 modality, uint8 coordination, uint8 handoffPoint)`.
///        modality        — 0 = unset (rejected), 1 = consume-onsite, 2 = pickup, 3 = delivery
///        coordination    — 0 = unset, 1 = buyer-assigned, 2 = seller-assigned, 3 = dutch-auction
///                          coordination MUST be 0 unless modality == 3 (delivery)
///        handoffPoint    — 0 = unset, 1 = face-to-face, 2 = dead-drop, 3 = parking-area, 4 = locker
///
///       Replaces figaro-fulfilment-v1 + figaro-handoff-v1, which previously
///       split this conceptual space across two single-enum schemas with
///       overlapping values.
contract FigaroFulfilmentV2Validator is ISchemaValidator {
    bytes32 public constant override schemaId = keccak256("figaro-fulfilment-v2");

    uint8 internal constant MODALITY_MAX = 3;
    uint8 internal constant COORDINATION_MAX = 3;
    uint8 internal constant HANDOFF_POINT_MAX = 4;
    uint8 internal constant MODALITY_DELIVERY = 3;

    error SchemaIdMismatch(bytes32 got, bytes32 expected);
    error ModalityUnset();
    error InvalidModality(uint8 value);
    error InvalidCoordination(uint8 value);
    error CoordinationRequiresDelivery(uint8 modality);
    error InvalidHandoffPoint(uint8 value);
    /// @dev Runtime `content` must byte-equal the committed clause `sectionData`.
    ///      Parties who signed a specific fulfilment composition at commit
    ///      cannot later attest a different composition under the same schema.
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

        (uint8 modality, uint8 coordination, uint8 handoffPoint) = abi.decode(content, (uint8, uint8, uint8));

        if (modality == 0) revert ModalityUnset();
        if (modality > MODALITY_MAX) revert InvalidModality(modality);
        if (coordination > COORDINATION_MAX) revert InvalidCoordination(coordination);
        if (coordination != 0 && modality != MODALITY_DELIVERY) {
            revert CoordinationRequiresDelivery(modality);
        }
        if (handoffPoint > HANDOFF_POINT_MAX) revert InvalidHandoffPoint(handoffPoint);
    }
}
