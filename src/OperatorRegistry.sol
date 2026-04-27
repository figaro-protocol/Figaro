// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title OperatorRegistry — Operator self-declaration with reclaimable deposit
/// @custom:security-contact security@figaro.org
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice Operators register with a role, metadata URI, and an ETH deposit.
///         The deposit creates Sybil resistance. After a lock period (immutable,
///         set at deploy), operators may withdraw their deposit, which clears
///         the registered guard and allows fresh re-registration.
///         No owner, no admin, no fee extraction. No lifecycle flags — operator
///         availability is signal-by-availability (off-chain), not registry state.
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any kind, express or implied. No liability is accepted for loss, damages, or bugs. Use at your own risk.
///
///         This contract validates and emits — it does not aggregate. Profile
///         data, current role, and operator availability are derived off-chain
///         from event logs (`OperatorRegistered`, `OperatorWithdrawn`). On-chain
///         storage is limited to the dedup guard (`registered`) and registration
///         timestamp (needed for the deposit lock).
///
///         Role is event-only data — it travels with `OperatorRegistered` for
///         off-chain consumers but is not stored. To switch role, withdraw
///         and re-register; this preserves the Sybil cost on each fresh role
///         assertion. The same pattern applies to metadata changes: there is
///         no `updateProfile` — supersede an old metadataURI by withdrawing
///         and re-registering with the new one.
///
///         The metadataURI JSON document is the seller's composability surface:
///         it declares which schemas from SchemaRegistry the seller operates
///         under (e.g. delivery lifecycle, GHG disclosure, proximity proof).
///         Sellers compose their own capability set rather than matching against
///         protocol-defined templates.
contract OperatorRegistry {
    /// @notice Operator role declared at registration.
    /// @dev Event-only data — emitted in `OperatorRegistered`, never stored.
    ///      The enum exists for indexer convenience (frontends can group by
    ///      role without parsing metadataURI JSON). It is NOT a curation
    ///      surface: the contract enforces only `role != None` at register
    ///      time, and any third party who wants a different role taxonomy
    ///      can deploy their own registry contract or carry richer role
    ///      semantics in `metadataURI`. Widening this enum is non-breaking;
    ///      removing it would require changing the event signature, so it
    ///      stays for as long as the {Merchant, Courier, Both} taxonomy is
    ///      still load-bearing for any indexer.
    enum OperatorRole {
        None,
        Merchant,
        Courier,
        Both
    }

    /// @notice Deposit amount in ETH. Immutable at deploy.
    /// @dev Sybil-resistance mechanism, not a fee. The protocol does not
    ///      redistribute it; no party has authority to seize it. See
    ///      `withdraw()` for the reclaim path.
    uint256 public immutable registrationDeposit;

    /// @notice Minimum lock duration before deposit can be withdrawn (seconds).
    /// @dev Together with `registrationDeposit`, this is the Sybil-resistance
    ///      knob. Without the lock, an attacker could register, withdraw,
    ///      re-register with the same ETH to maintain N identities at the
    ///      cost of 1 deposit + N transactions. The lock makes
    ///      "1 ETH = N identities over time" expensive in TIME as well as
    ///      capital — bonded participation, time-extended.
    ///
    ///      Deploy-time choice (no derivation from a theorem). Devnet uses
    ///      365 days as a placeholder; mainnet duration should be set with
    ///      explicit reasoning recorded in deployment notes:
    ///      - lower bound: long enough that recycling deposits across
    ///        identities is uneconomic relative to honest participation;
    ///      - upper bound: short enough that exit is practical for an
    ///        operator who wants to move on or change role/metadata
    ///        (every role/metadata change goes through withdraw +
    ///        re-register after web2-strip 2026-04-26).
    uint256 public immutable depositLockPeriod;

    /// @dev Dedup guard — prevents double-registration for the same address.
    ///      Cleared on withdraw to allow fresh re-registration.
    mapping(address => bool) internal _registered;

    /// @dev Registration timestamp per address — backs the deposit-lock gate.
    mapping(address => uint256) internal _registeredAt;

    // ── Events ──────────────────────────────────────────────────────────
    event OperatorRegistered(address indexed operator, OperatorRole role, string metadataURI);
    event OperatorWithdrawn(address indexed operator, uint256 deposit);

    // ── Errors ──────────────────────────────────────────────────────────
    error AlreadyRegistered();
    error NotRegistered();
    error InvalidRole();
    error InsufficientDeposit();
    error DepositLocked();
    error TransferFailed();

    // ── Constructor ─────────────────────────────────────────────────────

    /// @param _registrationDeposit Minimum ETH required to register (wei).
    /// @param _depositLockPeriod Lock duration in seconds before withdrawal.
    constructor(uint256 _registrationDeposit, uint256 _depositLockPeriod) {
        registrationDeposit = _registrationDeposit;
        depositLockPeriod = _depositLockPeriod;
    }

    // ── Registration ────────────────────────────────────────────────────

    /// @notice Register as an operator. Requires msg.value == registrationDeposit.
    ///         Exact match prevents excess ETH from being trapped in the contract
    ///         (no sweep function, no owner). Deposit is reclaimable after lock
    ///         period via withdraw().
    /// @param role         The operator role (Merchant, Courier, or Both). Event-only.
    /// @param metadataURI  IPFS or HTTPS URI pointing to the operator's metadata JSON.
    function register(OperatorRole role, string calldata metadataURI) external payable {
        if (role == OperatorRole.None) revert InvalidRole();
        if (_registered[msg.sender]) revert AlreadyRegistered();
        if (msg.value != registrationDeposit) revert InsufficientDeposit();

        _registered[msg.sender] = true;
        _registeredAt[msg.sender] = block.timestamp;

        emit OperatorRegistered(msg.sender, role, metadataURI);
    }

    // ── Deposit Withdrawal ──────────────────────────────────────────────

    /// @notice Withdraw registration deposit after lock period expires.
    ///         Clears the dedup guard so the address can re-register; lock
    ///         period restarts on each fresh registration.
    function withdraw() external {
        if (!_registered[msg.sender]) revert NotRegistered();
        if (block.timestamp < _registeredAt[msg.sender] + depositLockPeriod) {
            revert DepositLocked();
        }

        // Clear state — enables clean re-registration
        delete _registered[msg.sender];
        delete _registeredAt[msg.sender];

        uint256 amount = registrationDeposit;
        emit OperatorWithdrawn(msg.sender, amount);

        if (amount > 0) {
            (bool ok,) = msg.sender.call{value: amount}("");
            if (!ok) revert TransferFailed();
        }
    }
}
