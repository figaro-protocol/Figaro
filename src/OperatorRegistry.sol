// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title OperatorRegistry — Operator self-declaration with reclaimable deposit
/// @custom:security-contact security@figaro.org
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice Operators register with a role, metadata URI, and an ETH deposit.
///         The deposit creates Sybil resistance. After a lock period (immutable,
///         set at deploy), deactivated operators may withdraw their deposit,
///         which deletes all on-chain state and allows future re-registration.
///         No owner, no admin, no fee extraction.
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any kind, express or implied. No liability is accepted for loss, damages, or bugs. Use at your own risk.
///
///         This contract validates and emits — it does not aggregate. All
///         profile data is derived off-chain from event logs. On-chain storage
///         is limited to the double-registration guard, active/deactivated
///         status, and registration timestamp (needed for deposit lock).
///
///         The metadataURI JSON document is the seller's composability surface:
///         it declares which schemas from SchemaRegistry the seller operates
///         under (e.g. delivery lifecycle, GHG disclosure, proximity handoff).
///         This replaces the V3 TemplateRegistry — sellers compose their own
///         capability set rather than matching against protocol-defined templates.
contract OperatorRegistry {
    enum OperatorRole {
        None,
        Merchant,
        Driver,
        Both
    }

    /// @notice Deposit amount in ETH. Immutable at deploy.
    uint256 public immutable registrationDeposit;

    /// @notice Minimum lock duration before deposit can be withdrawn (seconds).
    uint256 public immutable depositLockPeriod;

    /// @dev Minimal on-chain state for write-gating only.
    mapping(address => OperatorRole) internal _role;
    mapping(address => bool) internal _active;
    mapping(address => uint256) internal _registeredAt;

    // ── Events ──────────────────────────────────────────────────────────
    event OperatorRegistered(address indexed operator, OperatorRole role, string metadataURI);
    event OperatorUpdated(address indexed operator, OperatorRole role, string metadataURI);
    event OperatorDeactivated(address indexed operator);
    event OperatorReactivated(address indexed operator);
    event OperatorWithdrawn(address indexed operator, uint256 deposit);

    // ── Errors ──────────────────────────────────────────────────────────
    error AlreadyRegistered();
    error NotRegistered();
    error InvalidRole();
    error NotActive();
    error AlreadyDeactivated();
    error AlreadyActive();
    error InsufficientDeposit();
    error DepositLocked();
    error StillActive();
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
    /// @param role      The operator role (Merchant, Driver, or Both).
    /// @param metadataURI  IPFS or HTTPS URI pointing to the operator's metadata JSON.
    function register(OperatorRole role, string calldata metadataURI) external payable {
        if (role == OperatorRole.None) revert InvalidRole();
        if (_role[msg.sender] != OperatorRole.None) revert AlreadyRegistered();
        if (msg.value != registrationDeposit) revert InsufficientDeposit();

        _role[msg.sender] = role;
        _active[msg.sender] = true;
        _registeredAt[msg.sender] = block.timestamp;

        emit OperatorRegistered(msg.sender, role, metadataURI);
    }

    // ── Profile Management ──────────────────────────────────────────────

    /// @notice Update role and metadata. Only active operators can update.
    /// @param role        The new operator role.
    /// @param metadataURI The updated metadata URI.
    function updateProfile(OperatorRole role, string calldata metadataURI) external {
        if (_role[msg.sender] == OperatorRole.None) revert NotRegistered();
        if (!_active[msg.sender]) revert NotActive();
        if (role == OperatorRole.None) revert InvalidRole();

        _role[msg.sender] = role;

        emit OperatorUpdated(msg.sender, role, metadataURI);
    }

    /// @notice Deactivate. Reverts if already deactivated (prevents event spam).
    function deactivate() external {
        if (_role[msg.sender] == OperatorRole.None) revert NotRegistered();
        if (!_active[msg.sender]) revert AlreadyDeactivated();
        _active[msg.sender] = false;
        emit OperatorDeactivated(msg.sender);
    }

    /// @notice Reactivate. Reverts if already active (prevents event spam).
    function reactivate() external {
        if (_role[msg.sender] == OperatorRole.None) revert NotRegistered();
        if (_active[msg.sender]) revert AlreadyActive();
        _active[msg.sender] = true;
        emit OperatorReactivated(msg.sender);
    }

    // ── Deposit Withdrawal ──────────────────────────────────────────────

    /// @notice Withdraw registration deposit after lock period expires.
    ///         Operator must be deactivated first. Deletes all on-chain state,
    ///         allowing future re-registration (which costs a fresh deposit).
    function withdraw() external {
        if (_role[msg.sender] == OperatorRole.None) revert NotRegistered();
        if (_active[msg.sender]) revert StillActive();
        if (block.timestamp < _registeredAt[msg.sender] + depositLockPeriod) {
            revert DepositLocked();
        }

        // Clear all state — enables clean re-registration
        delete _role[msg.sender];
        delete _active[msg.sender];
        delete _registeredAt[msg.sender];

        uint256 amount = registrationDeposit;
        emit OperatorWithdrawn(msg.sender, amount);

        if (amount > 0) {
            (bool ok,) = msg.sender.call{value: amount}("");
            if (!ok) revert TransferFailed();
        }
    }
}
