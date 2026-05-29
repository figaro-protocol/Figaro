// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroCommerceV1Validator} from "../../src/clauseValidators/FigaroCommerceV1Validator.sol";

contract FigaroCommerceV1ValidatorTest is Test {
    FigaroCommerceV1Validator validator;
    bytes32 constant ID = keccak256("figaro-commerce-v1");
    address constant CURRENCY = address(0x5FbDB2315678afecb367f032d93F642f64180aa3);

    function setUp() public {
        validator = new FigaroCommerceV1Validator();
    }

    function _call(address currency, uint256 payment, FigaroCommerceV1Validator.LineItem[] memory items)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(currency, payment, items);
    }

    function test_clauseIdMatches() public view {
        assertEq(validator.clauseId(), ID);
    }

    function test_acceptsValidOrderWithLineItems() public view {
        FigaroCommerceV1Validator.LineItem[] memory items = new FigaroCommerceV1Validator.LineItem[](2);
        items[0] =
            FigaroCommerceV1Validator.LineItem({itemId: "burger-001", name: "Cheeseburger", quantity: 2, unitPrice: 5e17});
        items[1] =
            FigaroCommerceV1Validator.LineItem({itemId: "fries-001", name: "Fries", quantity: 1, unitPrice: 2e17});
        bytes memory c = _call(CURRENCY, 1.2e18, items);
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsEmptyLineItems() public view {
        FigaroCommerceV1Validator.LineItem[] memory items = new FigaroCommerceV1Validator.LineItem[](0);
        bytes memory c = _call(CURRENCY, 1e18, items);
        validator.validate(ID, 0, c, c);
    }

    function test_acceptsZeroUnitPrice() public view {
        FigaroCommerceV1Validator.LineItem[] memory items = new FigaroCommerceV1Validator.LineItem[](1);
        items[0] =
            FigaroCommerceV1Validator.LineItem({itemId: "free-001", name: "Free Sample", quantity: 1, unitPrice: 0});
        bytes memory c = _call(CURRENCY, 1e18, items);
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsZeroCurrency() public {
        FigaroCommerceV1Validator.LineItem[] memory items = new FigaroCommerceV1Validator.LineItem[](0);
        bytes memory c = _call(address(0), 1e18, items);
        vm.expectRevert(FigaroCommerceV1Validator.ZeroCurrency.selector);
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsZeroPayment() public {
        FigaroCommerceV1Validator.LineItem[] memory items = new FigaroCommerceV1Validator.LineItem[](0);
        bytes memory c = _call(CURRENCY, 0, items);
        vm.expectRevert(FigaroCommerceV1Validator.ZeroPayment.selector);
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsEmptyItemId() public {
        FigaroCommerceV1Validator.LineItem[] memory items = new FigaroCommerceV1Validator.LineItem[](1);
        items[0] = FigaroCommerceV1Validator.LineItem({itemId: "", name: "Item", quantity: 1, unitPrice: 1e18});
        bytes memory c = _call(CURRENCY, 1e18, items);
        vm.expectRevert(abi.encodeWithSelector(FigaroCommerceV1Validator.EmptyItemId.selector, uint256(0)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsEmptyItemName() public {
        FigaroCommerceV1Validator.LineItem[] memory items = new FigaroCommerceV1Validator.LineItem[](1);
        items[0] = FigaroCommerceV1Validator.LineItem({itemId: "x-001", name: "", quantity: 1, unitPrice: 1e18});
        bytes memory c = _call(CURRENCY, 1e18, items);
        vm.expectRevert(abi.encodeWithSelector(FigaroCommerceV1Validator.EmptyItemName.selector, uint256(0)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsZeroQuantity() public {
        FigaroCommerceV1Validator.LineItem[] memory items = new FigaroCommerceV1Validator.LineItem[](1);
        items[0] = FigaroCommerceV1Validator.LineItem({itemId: "x-001", name: "Item", quantity: 0, unitPrice: 1e18});
        bytes memory c = _call(CURRENCY, 1e18, items);
        vm.expectRevert(abi.encodeWithSelector(FigaroCommerceV1Validator.ZeroQuantity.selector, uint256(0)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsMismatchedClauseId() public {
        bytes32 other = keccak256("not-commerce");
        FigaroCommerceV1Validator.LineItem[] memory items = new FigaroCommerceV1Validator.LineItem[](0);
        bytes memory c = _call(CURRENCY, 1e18, items);
        vm.expectRevert(abi.encodeWithSelector(FigaroCommerceV1Validator.ClauseIdMismatch.selector, other, ID));
        validator.validate(other, 0, c, c);
    }

    function test_reportsCorrectIndexForBadItem() public {
        FigaroCommerceV1Validator.LineItem[] memory items = new FigaroCommerceV1Validator.LineItem[](2);
        items[0] =
            FigaroCommerceV1Validator.LineItem({itemId: "ok-1", name: "Good Item", quantity: 1, unitPrice: 1e18});
        items[1] =
            FigaroCommerceV1Validator.LineItem({itemId: "ok-2", name: "", quantity: 1, unitPrice: 1e18});
        bytes memory c = _call(CURRENCY, 2e18, items);
        vm.expectRevert(abi.encodeWithSelector(FigaroCommerceV1Validator.EmptyItemName.selector, uint256(1)));
        validator.validate(ID, 0, c, c);
    }

    function test_rejectsSectionDataMismatch() public {
        FigaroCommerceV1Validator.LineItem[] memory items = new FigaroCommerceV1Validator.LineItem[](0);
        bytes memory section = _call(CURRENCY, 1e18, items);
        bytes memory content = _call(CURRENCY, 2e18, items); // different payment — drift
        vm.expectRevert(FigaroCommerceV1Validator.SectionDataMismatch.selector);
        validator.validate(ID, 0, section, content);
    }
}
