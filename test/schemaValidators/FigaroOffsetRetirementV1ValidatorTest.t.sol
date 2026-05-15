// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroOffsetRetirementV1Validator} from
    "../../src/schemaValidators/FigaroOffsetRetirementV1Validator.sol";

contract FigaroOffsetRetirementV1ValidatorTest is Test {
    FigaroOffsetRetirementV1Validator validator;
    bytes32 constant ID = keccak256("figaro-offset-retirement-v1");

    address constant AGG = address(0xA11);
    address constant INPUT_TOKEN = address(0xB22);
    address constant BENEFICIARY = address(0xC33);
    bytes32 constant TX_HASH = keccak256("retirement-tx-1");

    function setUp() public {
        validator = new FigaroOffsetRetirementV1Validator();
    }

    function _encode(
        uint8 provider,
        address aggregator,
        address inputToken,
        uint256 inputAmount,
        address beneficiary,
        bytes32 txHash,
        uint256 tonsRetired
    ) internal pure returns (bytes memory) {
        return abi.encode(provider, aggregator, inputToken, inputAmount, beneficiary, txHash, tonsRetired);
    }

    function _valid(uint8 provider) internal pure returns (bytes memory) {
        // tonsRetired is 1e18 fixed-point (1e18 = 1 tonne, ERC-20 carbon-token
        // convention). 1.5 ether == 1.5e18 == 1.5 tonnes.
        return _encode(provider, AGG, INPUT_TOKEN, 100 ether, BENEFICIARY, TX_HASH, 1.5 ether);
    }

    // ── Identity ────────────────────────────────────────────────────────────

    function test_schemaIdMatches() public view {
        assertEq(validator.schemaId(), ID);
    }

    function test_rejectsMismatchedSchemaId() public {
        bytes32 other = keccak256("not-offset-retirement");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroOffsetRetirementV1Validator.SchemaIdMismatch.selector, other, ID)
        );
        validator.validate(other, 0, "", _valid(1));
    }

    // ── Provider enum bounds ────────────────────────────────────────────────

    function test_acceptsEachProvider() public view {
        for (uint8 p = 1; p <= 3; p++) {
            validator.validate(ID, 0, "", _valid(p));
        }
    }

    function test_rejectsZeroProvider() public {
        vm.expectRevert(
            abi.encodeWithSelector(FigaroOffsetRetirementV1Validator.InvalidProvider.selector, uint8(0))
        );
        validator.validate(ID, 0, "", _valid(0));
    }

    function test_rejectsProviderAboveThree() public {
        vm.expectRevert(
            abi.encodeWithSelector(FigaroOffsetRetirementV1Validator.InvalidProvider.selector, uint8(4))
        );
        validator.validate(ID, 0, "", _valid(4));
    }

    function test_rejectsProviderAtMaxUint8() public {
        vm.expectRevert(
            abi.encodeWithSelector(FigaroOffsetRetirementV1Validator.InvalidProvider.selector, type(uint8).max)
        );
        validator.validate(ID, 0, "", _valid(type(uint8).max));
    }

    // ── Address fields non-zero ─────────────────────────────────────────────

    function test_rejectsZeroAggregator() public {
        bytes memory c = _encode(1, address(0), INPUT_TOKEN, 100 ether, BENEFICIARY, TX_HASH, 1.5 ether);
        vm.expectRevert(FigaroOffsetRetirementV1Validator.ZeroAggregatorAddress.selector);
        validator.validate(ID, 0, "", c);
    }

    function test_rejectsZeroInputToken() public {
        bytes memory c = _encode(1, AGG, address(0), 100 ether, BENEFICIARY, TX_HASH, 1.5 ether);
        vm.expectRevert(FigaroOffsetRetirementV1Validator.ZeroInputToken.selector);
        validator.validate(ID, 0, "", c);
    }

    function test_rejectsZeroBeneficiary() public {
        bytes memory c = _encode(1, AGG, INPUT_TOKEN, 100 ether, address(0), TX_HASH, 1.5 ether);
        vm.expectRevert(FigaroOffsetRetirementV1Validator.ZeroBeneficiary.selector);
        validator.validate(ID, 0, "", c);
    }

    function test_rejectsZeroTxHash() public {
        bytes memory c = _encode(1, AGG, INPUT_TOKEN, 100 ether, BENEFICIARY, bytes32(0), 1.5 ether);
        vm.expectRevert(FigaroOffsetRetirementV1Validator.ZeroRetirementTxHash.selector);
        validator.validate(ID, 0, "", c);
    }

    // ── uint256 quantity fields > 0 ─────────────────────────────────────────

    function test_rejectsZeroInputAmount() public {
        bytes memory c = _encode(1, AGG, INPUT_TOKEN, 0, BENEFICIARY, TX_HASH, 1.5 ether);
        vm.expectRevert(FigaroOffsetRetirementV1Validator.ZeroInputAmount.selector);
        validator.validate(ID, 0, "", c);
    }

    function test_rejectsZeroTonsRetired() public {
        bytes memory c = _encode(1, AGG, INPUT_TOKEN, 100 ether, BENEFICIARY, TX_HASH, 0);
        vm.expectRevert(FigaroOffsetRetirementV1Validator.ZeroTonsRetired.selector);
        validator.validate(ID, 0, "", c);
    }

    // ── Boundary acceptance ─────────────────────────────────────────────────

    function test_acceptsMinPositiveAmounts() public view {
        // tonsRetired = 1 is far below 1 tonne (1 / 1e18 of a tonne) but the
        // validator only checks `> 0`. Pinning that the unit semantics live in
        // the schema description, not in on-chain enforcement.
        bytes memory c = _encode(1, AGG, INPUT_TOKEN, 1, BENEFICIARY, TX_HASH, 1);
        validator.validate(ID, 0, "", c);
    }

    function test_acceptsMaxUint256Amounts() public view {
        bytes memory c =
            _encode(3, AGG, INPUT_TOKEN, type(uint256).max, BENEFICIARY, TX_HASH, type(uint256).max);
        validator.validate(ID, 0, "", c);
    }

    // ── sectionData independence (Category-1, no byte-equality check) ───────

    function test_ignoresSectionData() public view {
        // sectionData carrying a different shape (e.g., the offset-policy
        // sectionData) must not affect validation — Category-1 schemas do
        // not cross-check sectionData against content.
        bytes memory unrelatedSection = abi.encode("anything");
        validator.validate(ID, 0, unrelatedSection, _valid(2));
    }

    function test_ignoresStage() public view {
        // No stage-dispatch logic; any stage byte must validate identically.
        validator.validate(ID, 0, "", _valid(1));
        validator.validate(ID, 7, "", _valid(1));
        validator.validate(ID, type(uint8).max, "", _valid(1));
    }

    // ── Malformed content ───────────────────────────────────────────────────

    function test_rejectsMalformedContent_revertsOnDecode() public {
        // Garbage bytes that don't ABI-decode into the 7-tuple shape.
        bytes memory garbage = hex"deadbeef";
        vm.expectRevert();
        validator.validate(ID, 0, "", garbage);
    }
}
