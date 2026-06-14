// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IClauseValidator} from "../IClauseValidator.sol";

/// @title FigaroOffsetPolicyV1Validator
/// @notice Validates `figaro-offset-policy-v1` content — carbon-offset
///         providers an assembly accepts for emissions compensation.
///         Multi-valued: the seller declares (or the buyer commits to)
///         the set of providers on offer. The actual offset purchase is a
///         separate sub-order against the chosen provider; this clause
///         anchors the policy, not the purchase.
///
/// @dev Content ABI encoding: `abi.encode(uint8[] providers)`.
///
///      Post-Keystone canonical 0-based positions:
///        0 = klima   (Klima DAO)
///        1 = toucan  (Toucan Protocol — BCT / NCT)
///        2 = moss    (Moss.Earth — MCO2)
///        3 = custom  (self-declared seller registered against the assembly)
///
///      An order without offset-policy has no offset path; an INCLUDED
///      clause must carry at least one provider.
contract FigaroOffsetPolicyV1Validator is IClauseValidator {
    function clauseId() public pure override returns (bytes32) {
        return keccak256(abi.encode("figaro-offset-policy", uint64(1)));
    }

    uint8 internal constant MAX_PROVIDER = 3;

    error ClauseIdMismatch(bytes32 got, bytes32 expected);
    error ProvidersEmpty();
    error InvalidProvider(uint8 got);
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
        uint8[] memory providers = abi.decode(content, (uint8[]));
        if (providers.length == 0) revert ProvidersEmpty();
        for (uint256 i = 0; i < providers.length; i++) {
            uint8 p = providers[i];
            if (p > MAX_PROVIDER) revert InvalidProvider(p);
        }
    }
}
