// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IClauseValidator} from "../IClauseValidator.sol";

/// @title FigaroCommerceV1Validator
/// @notice Validates `figaro-commerce-v1` content — currency, payment,
///         and itemized line items.
///
/// @dev Content ABI encoding:
///        abi.encode(address currency, uint256 payment, LineItem[] items)
///      where LineItem is:
///        struct LineItem { string itemId; string name; uint256 quantity; uint256 unitPrice; }
///
///      Invariants:
///        - currency != address(0)
///        - payment > 0
///        - per item: itemId.length > 0, name.length > 0, quantity > 0
///        - unitPrice may be 0 (e.g. promotional / bonus items)
///        - lineItems may be empty (non-itemized order)
contract FigaroCommerceV1Validator is IClauseValidator {
    bytes32 public constant override clauseId = keccak256("figaro-commerce-v1");

    struct LineItem {
        string itemId;
        string name;
        uint256 quantity;
        uint256 unitPrice;
    }

    error ClauseIdMismatch(bytes32 got, bytes32 expected);
    error ZeroCurrency();
    error ZeroPayment();
    error EmptyItemId(uint256 index);
    error EmptyItemName(uint256 index);
    error ZeroQuantity(uint256 index);
    /// @dev Runtime `content` must byte-equal the committed clause `sectionData`.
    ///      Parties who signed specific currency / payment / lineItems cannot
    ///      later attest different commerce terms under the same clause.
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
        if (id != clauseId) revert ClauseIdMismatch(id, clauseId);
        if (keccak256(sectionData) != keccak256(content)) revert SectionDataMismatch();
        (address currency, uint256 payment, LineItem[] memory items) =
            abi.decode(content, (address, uint256, LineItem[]));

        if (currency == address(0)) revert ZeroCurrency();
        if (payment == 0) revert ZeroPayment();

        for (uint256 i = 0; i < items.length; i++) {
            if (bytes(items[i].itemId).length == 0) revert EmptyItemId(i);
            if (bytes(items[i].name).length == 0) revert EmptyItemName(i);
            if (items[i].quantity == 0) revert ZeroQuantity(i);
        }
    }
}
