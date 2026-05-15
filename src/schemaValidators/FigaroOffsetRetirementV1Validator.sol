// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISchemaValidator} from "../ISchemaValidator.sol";

/// @title FigaroOffsetRetirementV1Validator
/// @notice Validates `figaro-offset-retirement-v1` content — a runtime
///         attestation anchoring an off-protocol carbon-offset retirement
///         performed by the buyer against a process before resolveProcess.
///
/// @dev Sister schema: `figaro-offset-policy-v1` (Category-2, committed) ↔
///      `figaro-offset-retirement-v1` (this, Category-1, runtime). Mirrors the
///      `figaro-proximity-policy-v1` ↔ `figaro-proximity-proof-v1` and
///      `figaro-ghg-<standard>-v1` ↔ `figaro-ghg-measurement-v1` precedents.
///      The retirement happens on-chain at an aggregator outside the Figaro
///      kernel; this attestation records the receipt fields downstream
///      auditors need to verify the buyer compensated the process's measured
///      emissions.
///
/// @dev Category-1: runtime-only, NO byte-equality cross-check between
///      `content` and `sectionData`. The committed policy clause declares the
///      set of providers on offer; the retirement receipt declares which
///      provider was actually used and what was retired. Off-chain consumers
///      should cross-check `provider ∈ policy.providers` (the validator does
///      not enforce this — schema-cross-check is downstream).
///
/// @dev Content ABI encoding:
///        abi.encode(
///            uint8   provider,           // 1=klima, 2=toucan, 3=custom
///            address aggregatorAddress,
///            address inputToken,
///            uint256 inputAmount,
///            address beneficiary,
///            bytes32 retirementTxHash,
///            uint256 tonsRetired
///        )
///
/// @dev `tonsRetired` is expressed as 1e18 fixed-point (1e18 = 1 tonne),
///      matching the ERC-20 carbon-token convention (decimals=18) used by
///      every aggregator the schema integrates with — Klima KlimaInfinity,
///      Toucan OffsetHelper, and the BCT/NCT/MCO2/TCO2 fragments themselves.
///      The validator only checks `> 0`; downstream consumers interpret the
///      value as tonnes-in-1e18-units and convert to/from grams via the
///      1e6 ratio when comparing to `figaro-ghg-measurement-v1`.
///
/// @dev Provider indices intentionally overlap `figaro-offset-policy-v1`
///      where the aggregator pattern matches (klima=1, toucan=2). `custom`
///      sits at index 3 in this schema (vs index 4 in offset-policy) because
///      moss is omitted here — Moss.Earth retires via MCO2 burns rather than
///      an on-chain aggregator with this receipt shape. Off-chain consumers
///      that cross-check `provider` between the two schemas must remap
///      accordingly.
contract FigaroOffsetRetirementV1Validator is ISchemaValidator {
    bytes32 public constant override schemaId = keccak256("figaro-offset-retirement-v1");

    uint8 internal constant MAX_PROVIDER = 3;

    error SchemaIdMismatch(bytes32 got, bytes32 expected);
    error InvalidProvider(uint8 got);
    error ZeroAggregatorAddress();
    error ZeroInputToken();
    error ZeroBeneficiary();
    error ZeroRetirementTxHash();
    error ZeroInputAmount();
    error ZeroTonsRetired();

    function validate(
        bytes32 id,
        uint8,
        /* stage */
        bytes calldata,
        /* sectionData */
        bytes calldata content
    )
        external
        pure
        override
    {
        if (id != schemaId) revert SchemaIdMismatch(id, schemaId);

        (
            uint8 provider,
            address aggregatorAddress,
            address inputToken,
            uint256 inputAmount,
            address beneficiary,
            bytes32 retirementTxHash,
            uint256 tonsRetired
        ) = abi.decode(content, (uint8, address, address, uint256, address, bytes32, uint256));

        if (provider == 0 || provider > MAX_PROVIDER) revert InvalidProvider(provider);
        if (aggregatorAddress == address(0)) revert ZeroAggregatorAddress();
        if (inputToken == address(0)) revert ZeroInputToken();
        if (beneficiary == address(0)) revert ZeroBeneficiary();
        if (retirementTxHash == bytes32(0)) revert ZeroRetirementTxHash();
        if (inputAmount == 0) revert ZeroInputAmount();
        if (tonsRetired == 0) revert ZeroTonsRetired();
    }
}
