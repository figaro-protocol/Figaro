// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IAssemblyValidator} from "../IAssemblyValidator.sol";

/// @title DirectSaleV1Validator
/// @notice Validates `direct-sale-v1` assembly manifests — one-node bonded
///         sales: buyer commits to merchant; the buyer consumes on-site or
///         picks up. No delivery, no courier, no sub-orders. Generic across
///         in-person commerce verticals.
///
/// @dev Content ABI encoding:
///        `abi.encode(string slug, string name, uint8 klerosCourt,
///                    uint8 klerosMinJurors, string[] fulfilmentModalities)`.
///
///      slug                  — kebab-case, 2-64 chars.
///      name                  — human-readable, 1-128 chars.
///      klerosCourt           — 1-4 (must be set per direct-sale invariants).
///      klerosMinJurors       — 1-99 (must be set).
///      fulfilmentModalities  — non-empty subset of {"consume-onsite", "pickup"}.
///                              No duplicates. No "deliver:*", no "virtual".
///
/// @dev The "one order" invariant of direct-sale is encoded structurally:
///      the manifest has no sub-order or topology fields, so a registered
///      direct-sale assembly cannot declare additional orders.
contract DirectSaleV1Validator is IAssemblyValidator {
    bytes32 public constant override assemblyClassId = keccak256("direct-sale-v1");

    uint8 internal constant KLEROS_COURT_MIN = 1;
    uint8 internal constant KLEROS_COURT_MAX = 4;
    uint8 internal constant KLEROS_MIN_JURORS_MIN = 1;
    uint8 internal constant KLEROS_MIN_JURORS_MAX = 99;
    uint256 internal constant MIN_SLUG_LEN = 2;
    uint256 internal constant MAX_SLUG_LEN = 64;
    uint256 internal constant MIN_NAME_LEN = 1;
    uint256 internal constant MAX_NAME_LEN = 128;
    uint256 internal constant MAX_MODALITIES_LEN = 2;

    bytes32 internal constant MODALITY_CONSUME_ONSITE = keccak256("consume-onsite");
    bytes32 internal constant MODALITY_PICKUP = keccak256("pickup");

    error ClassIdMismatch(bytes32 got, bytes32 expected);
    error SlugTooShort(uint256 length);
    error SlugTooLong(uint256 length);
    error NameTooShort(uint256 length);
    error NameTooLong(uint256 length);
    error InvalidKlerosCourt(uint8 value);
    error InvalidKlerosMinJurors(uint8 value);
    error EmptyModalities();
    error TooManyModalities(uint256 length);
    error InvalidModality(string modality);
    error DuplicateModality(string modality);

    function validate(bytes32 classId, bytes calldata content) external pure override {
        if (classId != assemblyClassId) revert ClassIdMismatch(classId, assemblyClassId);

        (
            string memory slug,
            string memory name,
            uint8 klerosCourt,
            uint8 klerosMinJurors,
            string[] memory fulfilmentModalities
        ) = abi.decode(content, (string, string, uint8, uint8, string[]));

        uint256 slugLen = bytes(slug).length;
        if (slugLen < MIN_SLUG_LEN) revert SlugTooShort(slugLen);
        if (slugLen > MAX_SLUG_LEN) revert SlugTooLong(slugLen);

        uint256 nameLen = bytes(name).length;
        if (nameLen < MIN_NAME_LEN) revert NameTooShort(nameLen);
        if (nameLen > MAX_NAME_LEN) revert NameTooLong(nameLen);

        if (klerosCourt < KLEROS_COURT_MIN || klerosCourt > KLEROS_COURT_MAX) {
            revert InvalidKlerosCourt(klerosCourt);
        }
        if (klerosMinJurors < KLEROS_MIN_JURORS_MIN || klerosMinJurors > KLEROS_MIN_JURORS_MAX) {
            revert InvalidKlerosMinJurors(klerosMinJurors);
        }

        uint256 modalityCount = fulfilmentModalities.length;
        if (modalityCount == 0) revert EmptyModalities();
        if (modalityCount > MAX_MODALITIES_LEN) revert TooManyModalities(modalityCount);

        // Subset check with duplicate detection. Only two allowed values; a
        // pair of bools captures membership without a dynamic set.
        bool seenConsumeOnsite = false;
        bool seenPickup = false;
        for (uint256 i = 0; i < modalityCount; i++) {
            string memory modality = fulfilmentModalities[i];
            bytes32 modalityHash = keccak256(bytes(modality));
            if (modalityHash == MODALITY_CONSUME_ONSITE) {
                if (seenConsumeOnsite) revert DuplicateModality(modality);
                seenConsumeOnsite = true;
            } else if (modalityHash == MODALITY_PICKUP) {
                if (seenPickup) revert DuplicateModality(modality);
                seenPickup = true;
            } else {
                revert InvalidModality(modality);
            }
        }
    }
}
