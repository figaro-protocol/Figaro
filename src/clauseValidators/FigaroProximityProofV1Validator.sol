// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IClauseValidator} from "../IClauseValidator.sol";

/// @title FigaroProximityProofV1Validator
/// @notice Validates `figaro-proximity-proof-v1` content — the runtime
///         proximity proof emitted at handoff time. Captures band + per-handoff
///         nonce + signed witness payload from a paired device.
///
/// @dev Sister-clause split (2026-04-26): the prior `figaro-proximity-v1`
///      conflated commit-time policy declaration with runtime handoff proof.
///      The committed-policy half lives in `figaro-proximity-policy-v1`
///      (Category-2); this clause is the runtime-proof half. Mirrors the
///      `figaro-ghg-<standard>-v1` (committed) + `figaro-ghg-measurement-v1`
///      (runtime) precedent.
///
/// @dev Category-1: runtime-only, NO byte-equality cross-check. The runtime
///      content (band, nonce, signature) is fresh per attestation; the
///      committed agreement may have placeholder sectionData. Off-chain
///      consumers should cross-check `proof.band == policy.band` (the
///      validator does not enforce this — clause-cross-check is downstream).
///
/// @dev Content ABI encoding: `abi.encode(uint8 band, bytes32 nonce, bytes deviceSig)`.
///
///      Post-Keystone canonical 0-based positions:
///        band: 0 = zone-wifi, 1 = nearby-ble, 2 = contact-nfc
///      nonce: per-handoff bytes32, must be non-zero
///      deviceSig: signed witness payload from a paired device.
///                 Length range 65–512 bytes (raw 65 = ECDSA r,s,v;
///                 longer = EIP-1271 contract sig or EIP-2098 compact + ext)
contract FigaroProximityProofV1Validator is IClauseValidator {
    function clauseId() public pure override returns (bytes32) {
        return keccak256(abi.encode("figaro-proximity-proof", uint64(1)));
    }

    uint8 internal constant MAX_BAND = 2;
    uint256 internal constant MIN_SIG_LEN = 65;
    uint256 internal constant MAX_SIG_LEN = 512;

    error ClauseIdMismatch(bytes32 got, bytes32 expected);
    error InvalidBand(uint8 got);
    error ZeroNonce();
    error DeviceSigTooShort(uint256 length);
    error DeviceSigTooLong(uint256 length);

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
        if (id != clauseId()) revert ClauseIdMismatch(id, clauseId());
        (uint8 band, bytes32 nonce, bytes memory deviceSig) = abi.decode(content, (uint8, bytes32, bytes));
        if (band > MAX_BAND) revert InvalidBand(band);
        if (nonce == bytes32(0)) revert ZeroNonce();
        if (deviceSig.length < MIN_SIG_LEN) revert DeviceSigTooShort(deviceSig.length);
        if (deviceSig.length > MAX_SIG_LEN) revert DeviceSigTooLong(deviceSig.length);
    }
}
