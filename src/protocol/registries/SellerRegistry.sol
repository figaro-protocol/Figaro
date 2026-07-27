// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title SellerRegistry — Seller self-declaration with reclaimable deposit
/// @custom:security-contact figarosecurity@gmail.com
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice Sellers register with a metadata URI and an ETH deposit — staked
///         intent to generate transactions. Surfacing derives from the live
///         stake: withdrawing clears the registered guard, de-surfaces the
///         seller (discovery readers fold `SellerWithdrawn`), and allows
///         fresh re-registration. Pollution costs deposit × time-surfaced;
///         there is no time lock.
///         No owner, no admin, no fee extraction. No lifecycle flags — seller
///         availability is signal-by-availability (off-chain), not registry state.
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any kind, express or implied. No liability is accepted for loss, damages, or bugs. Use at your own risk.
///
///         This contract validates and emits — it does not aggregate. Profile
///         data and seller availability are derived off-chain from event logs
///         (`SellerRegistered`, `SellerProfileUpdated`, `SellerWithdrawn`).
///         On-chain storage is limited to the dedup guard (`registered`).
///
///         The metadataURI JSON document is the seller's composability surface:
///         it declares which clauses from ClauseRegistry the seller operates
///         under and the seller's catalogue. Role is not an on-chain field —
///         and not a stored field at all: a seller's role is DERIVED from the
///         orders it holds and the clauses they carry. Sellers compose their
///         own capability set rather than matching protocol-defined templates.
///
///         The deposit exists for spam protection only — it does not gate
///         metadata edits. `updateProfile` lets a registered seller publish
///         a new metadataURI without disturbing the deposit. Discovery
///         indexers key off the most recent `SellerRegistered` or
///         `SellerProfileUpdated` event for an address.
contract SellerRegistry {
    /// @notice Deposit amount in ETH. Immutable at deploy.
    /// @dev Sybil-resistance stake, not a fee. The protocol does not
    ///      redistribute it; no party has authority to seize it. See
    ///      `withdraw()` for the reclaim path. Recycling one deposit across
    ///      identities over time is priced by de-surfacing, not a lock: a
    ///      withdrawn seller vanishes from discovery, so each identity
    ///      costs deposit × time-surfaced.
    uint256 public immutable registrationDeposit;

    /// @dev Dedup guard — prevents double-registration for the same address.
    ///      Cleared on withdraw to allow fresh re-registration.
    mapping(address => bool) internal _registered;

    // ── Events ──────────────────────────────────────────────────────────
    event SellerRegistered(address indexed seller, string metadataURI);
    event SellerProfileUpdated(address indexed seller, string metadataURI);
    event SellerWithdrawn(address indexed seller, uint256 deposit);

    // ── Errors ──────────────────────────────────────────────────────────
    error AlreadyRegistered();
    error NotRegistered();
    error InsufficientDeposit();
    error TransferFailed();

    // ── Constructor ─────────────────────────────────────────────────────

    /// @param _registrationDeposit Minimum ETH required to register (wei).
    constructor(uint256 _registrationDeposit) {
        registrationDeposit = _registrationDeposit;
    }

    // ── Registration ────────────────────────────────────────────────────

    /// @notice Register as a seller. Requires msg.value == registrationDeposit.
    ///         Exact match prevents excess ETH from being trapped in the contract
    ///         (no sweep function, no owner). Deposit is reclaimable via withdraw().
    /// @param metadataURI  IPFS or HTTPS URI pointing to the seller's metadata JSON.
    function register(string calldata metadataURI) external payable {
        if (_registered[msg.sender]) revert AlreadyRegistered();
        if (msg.value != registrationDeposit) revert InsufficientDeposit();

        _registered[msg.sender] = true;

        emit SellerRegistered(msg.sender, metadataURI);
    }

    // ── Profile Update ──────────────────────────────────────────────────

    /// @notice Update the metadata URI of a registered seller. Caller-only:
    ///         only the registered address can update its own profile. No
    ///         deposit change — the deposit is a spam-protection knob, not a
    ///         metadata-binding knob; there is no time lock anywhere.
    /// @dev Emits a distinct `SellerProfileUpdated` event so off-chain
    ///      indexers can distinguish registrations from profile updates
    ///      (analytics) while still computing "current metadataURI" as the
    ///      most-recent event of either type for an address.
    /// @param metadataURI  New IPFS or HTTPS URI pointing to the seller's metadata JSON.
    function updateProfile(string calldata metadataURI) external {
        if (!_registered[msg.sender]) revert NotRegistered();
        emit SellerProfileUpdated(msg.sender, metadataURI);
    }

    // ── Deposit Withdrawal ──────────────────────────────────────────────

    /// @notice Withdraw the registration deposit. Clears the dedup guard so
    ///         the address can re-register. Withdrawing de-surfaces the
    ///         seller — discovery folds `SellerWithdrawn` as invalidation.
    function withdraw() external {
        if (!_registered[msg.sender]) revert NotRegistered();

        // Clear state — enables clean re-registration
        delete _registered[msg.sender];

        uint256 amount = registrationDeposit;
        emit SellerWithdrawn(msg.sender, amount);

        if (amount > 0) {
            (bool ok,) = msg.sender.call{value: amount}("");
            if (!ok) revert TransferFailed();
        }
    }
}
