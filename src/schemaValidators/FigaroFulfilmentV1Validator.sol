// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISchemaValidator} from "../ISchemaValidator.sol";

/// @title FigaroFulfilmentV1Validator
/// @notice Validates `figaro-fulfilment-v1` content — single canonical
///         fulfilment-method enum that captures both modality and the
///         who-organizes-the-fulfiller dimension. Generic across local-commerce
///         verticals (food, retail, services).
///
/// @dev Content ABI encoding: `abi.encode(uint8 methodIndex)`.
///      Single field; index 0 = unset (section may be omitted entirely instead).
///
///      methodIndex:
///        0 = unset
///        1 = consume-onsite           (on-premise consumption, no movement)
///        2 = pickup                   (buyer organizes pickup)
///        3 = deliver:buyer-assigned   (delivery, buyer chooses courier)
///        4 = deliver:seller-assigned  (delivery, merchant arranges courier directly)
///        5 = deliver:dutch-auction    (delivery, courier selected via Dutch auction)
///
///      The prior schema had a separate `auction` dimension; the consolidated
///      enum collapses it into the method (only `deliver:dutch-auction` is an
///      auction-mediated case). Future allocator types (english-auction,
///      sealed-bid) would land as additional method values, not a separate enum.
contract FigaroFulfilmentV1Validator is ISchemaValidator {
    bytes32 public constant override schemaId = keccak256("figaro-fulfilment-v1");

    uint8 internal constant MAX_METHOD_INDEX = 5;

    error SchemaIdMismatch(bytes32 got, bytes32 expected);
    error InvalidMethod(uint8 got);
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
        uint8 method = abi.decode(content, (uint8));
        if (method > MAX_METHOD_INDEX) revert InvalidMethod(method);
    }
}
