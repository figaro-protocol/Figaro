// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IClauseValidator} from "../IClauseValidator.sol";

/// @title FigaroMerchantProcessV1Validator
/// @notice Validates `figaro-merchant-process-v1` content — event-stream clause
///         for a merchant seller's role in an order lifecycle. Generic across
///         local-commerce verticals (restaurants, retail, service merchants);
///         the event vocabulary maps to the merchant's order-fulfillment flow.
///
/// @dev Sovereignty primitive: the merchant attests their own internal events
///      under this clause as the SSoT for "what the merchant has done." The
///      buyer reads the on-chain log; downstream forums treat each event as
///      tamper-proof evidence of the merchant's claimed state at the
///      timestamped block. See Paper E (settlement on-chain by nature,
///      adjudication off-chain by nature) for the broader framing.
///
/// @dev Off-chain sellers (merchants, couriers, locker sellers, etc.) need
///      a per-role process clause because their state transitions happen in
///      physical reality — not as kernel ops. Kernel-participant roles (the
///      buyer, who acts via `commit` / `resolveProcess`) do NOT need a
///      process clause; their evidence IS the kernel event log. See
///      `CLAUDE.md` "Adding a new clause" checklist for the discipline.
///
/// @dev Content ABI encoding: `abi.encode(uint8 eventTypeIndex, string evidenceUri)`.
///
///      eventTypeIndex (order-received + accepted are core-owned — the commit IS
///      arrival + acceptance — so the merchant ladder begins at prep-started):
///        0 = prep-started
///        1 = ready-for-pickup
///        2 = handed-off
///
///      evidenceUri is optional (max 512 bytes when present).
contract FigaroMerchantProcessV1Validator is IClauseValidator {
    bytes32 public constant override clauseId = keccak256("figaro-merchant-process-v1");

    uint8 internal constant MAX_EVENT_INDEX = 2;
    uint256 internal constant MAX_URI_LEN = 512;

    error ClauseIdMismatch(bytes32 got, bytes32 expected);
    error InvalidEventType(uint8 got);
    error EvidenceUriTooLong(uint256 length);

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
        if (id != clauseId) revert ClauseIdMismatch(id, clauseId);
        (uint8 eventType, string memory evidenceUri) = abi.decode(content, (uint8, string));
        if (eventType > MAX_EVENT_INDEX) revert InvalidEventType(eventType);
        uint256 len = bytes(evidenceUri).length;
        if (len > MAX_URI_LEN) revert EvidenceUriTooLong(len);
    }
}
