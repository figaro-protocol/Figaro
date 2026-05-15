// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "./FigaroCore.sol";

/// @title ProcessOffsetReceipt
/// @notice Permissionless receipts contract that records the binding between
///         a Figaro process and an off-protocol carbon-offset retirement
///         performed at an external aggregator (Klima KlimaInfinity, Toucan
///         OffsetHelper, etc.). The retirement itself happens outside this
///         contract; the buyer calls `record` here to anchor the
///         `processId ↔ retirementTxHash` link on-chain so audit-bundle
///         consumers can recover it without IPFS.
///
///         Path A of the offset bridge: no Figaro commitment, no bonded
///         sub-order, no clause anchored in the agreement, no
///         AttestationCoordinator call. The aggregator's retirement event
///         is the source of truth for what was retired; this contract's
///         `ReceiptRecorded` event is the source of truth for which Figaro
///         process the buyer claims that retirement covers.
///
/// @dev No state, no admin, no storage. Everything lives in the event log.
///      Caller authorization: msg.sender must equal `core.processes(processId).rootBuyer`.
///      For an unknown processId, `rootBuyer` defaults to `address(0)`, which
///      can never match a real `msg.sender` — so the same guard rejects
///      both "wrong wallet" and "no such process".
///
/// @dev Separate primitive (its own anchor) per the separation-of-concerns
///      doctrine — receipts are an artifact family distinct from
///      attestations (which require a committed agreement clause and an
///      inclusion proof). This contract has neither requirement; the proof
///      that the retirement is real lives at the aggregator's event log,
///      reachable via `retirementTxHash`.
contract ProcessOffsetReceipt {
    /// @notice The kernel this receipts contract reads `rootBuyer` from.
    ///         Set once at construction; immutable.
    FigaroCore public immutable core;

    /// @notice Emitted on every successful `record` call. The three
    ///         indexed fields enable audit-bundle reconstruction by
    ///         processId, by buyer wallet, or by retirement tx hash.
    event ReceiptRecorded(
        bytes32 indexed processId,
        address indexed buyer,
        bytes32 indexed retirementTxHash,
        address aggregator,
        uint256 tonsRetired,
        address inputToken,
        uint256 inputAmount
    );

    /// @dev Caller is not the rootBuyer of the named process (or the
    ///      process is unknown — same guard).
    error NotRootBuyer();

    /// @dev Field-shape guards. The aggregator + token addresses anchor
    ///      where downstream auditors look; non-zero is required so a
    ///      malformed receipt doesn't silently degrade the audit bundle.
    error ZeroRetirementTxHash();
    error ZeroAggregator();
    error ZeroTonsRetired();
    error ZeroInputToken();
    error ZeroInputAmount();

    constructor(FigaroCore core_) {
        core = core_;
    }

    /// @notice Anchor a `processId ↔ retirement` binding on-chain.
    /// @dev Authorization: msg.sender must equal `processes[processId].rootBuyer`.
    ///      Field validation: every address non-zero, every quantity > 0,
    ///      retirementTxHash != bytes32(0). The contract does NOT verify
    ///      the retirement actually happened at `aggregator` — that's an
    ///      audit-time check (resolve `retirementTxHash` against the
    ///      aggregator's chain logs and confirm the `Retired`-style event
    ///      names this `buyer` as beneficiary).
    /// @param processId The Figaro process this retirement covers.
    /// @param retirementTxHash The aggregator-side transaction hash.
    /// @param aggregator The aggregator contract called.
    /// @param tonsRetired Tonnes retired in 1e18 fixed-point (1e18 = 1 tonne).
    /// @param inputToken ERC-20 the buyer paid the aggregator with.
    /// @param inputAmount Amount paid in `inputToken`'s smallest unit.
    function record(
        bytes32 processId,
        bytes32 retirementTxHash,
        address aggregator,
        uint256 tonsRetired,
        address inputToken,
        uint256 inputAmount
    ) external {
        (address rootBuyer,,,) = core.processes(processId);
        if (rootBuyer != msg.sender) revert NotRootBuyer();

        if (retirementTxHash == bytes32(0)) revert ZeroRetirementTxHash();
        if (aggregator == address(0)) revert ZeroAggregator();
        if (tonsRetired == 0) revert ZeroTonsRetired();
        if (inputToken == address(0)) revert ZeroInputToken();
        if (inputAmount == 0) revert ZeroInputAmount();

        emit ReceiptRecorded(processId, msg.sender, retirementTxHash, aggregator, tonsRetired, inputToken, inputAmount);
    }
}
