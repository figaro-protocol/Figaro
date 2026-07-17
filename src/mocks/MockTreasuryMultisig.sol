// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title MockTreasuryMultisig — devnet/test stand-in for the DAO treasury Safe
/// @notice The ruled treasury custody is a multisig (mainnet composes a
///         canonical Safe instance — deployment config via DAO_WALLET, never
///         authored code). This mock rehearses that custody's SEMANTICS with
///         Safe's own approveHash flow: any owner proposes an arbitrary call,
///         owners approve its hash, and once the threshold is met anyone
///         executes it. No owner acts alone; the treasury never signs kernel
///         commitments (ECDSA-only kernel — the funded operator-EOA does).
///         Deployed on devnet with anvil placeholder owners so the
///         per-procurement funding flow is a rehearsable act, not prose.
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any
///      kind, express or implied. No liability is accepted for loss, damages,
///      or bugs. Use at your own risk.
contract MockTreasuryMultisig {
    error NotOwner();
    error InvalidThreshold();
    error DuplicateOwner();
    error AlreadyApproved();
    error ThresholdNotMet(uint256 approvals, uint256 threshold);
    error AlreadyExecuted();
    error ExecutionFailed();

    event TransactionProposed(bytes32 indexed txHash, address indexed to, uint256 value, bytes data, uint256 nonce);
    event TransactionApproved(bytes32 indexed txHash, address indexed owner);
    event TransactionExecuted(bytes32 indexed txHash);

    address[] public owners;
    uint256 public immutable threshold;
    uint256 public nonce;

    mapping(address => bool) public isOwner;
    mapping(bytes32 => uint256) public approvals;
    mapping(bytes32 => mapping(address => bool)) public approvedBy;
    mapping(bytes32 => bool) public executed;

    constructor(address[] memory _owners, uint256 _threshold) {
        if (_threshold == 0 || _threshold > _owners.length) revert InvalidThreshold();
        for (uint256 i = 0; i < _owners.length; i++) {
            if (isOwner[_owners[i]]) revert DuplicateOwner();
            isOwner[_owners[i]] = true;
            owners.push(_owners[i]);
        }
        threshold = _threshold;
    }

    receive() external payable {}

    /// @notice The hash owners approve — bound to this treasury and a nonce,
    ///         so an approval can never replay onto another call or chain.
    function transactionHash(address to, uint256 value, bytes calldata data, uint256 _nonce)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(address(this), block.chainid, to, value, keccak256(data), _nonce));
    }

    /// @notice Propose a call: consumes the current nonce and counts as the
    ///         proposer's own approval.
    function propose(address to, uint256 value, bytes calldata data) external returns (bytes32 txHash) {
        if (!isOwner[msg.sender]) revert NotOwner();
        txHash = transactionHash(to, value, data, nonce);
        emit TransactionProposed(txHash, to, value, data, nonce);
        nonce++;
        _approve(txHash);
    }

    /// @notice Approve a proposed call's hash (Safe's approveHash flow).
    function approveHash(bytes32 txHash) external {
        if (!isOwner[msg.sender]) revert NotOwner();
        _approve(txHash);
    }

    function _approve(bytes32 txHash) internal {
        if (approvedBy[txHash][msg.sender]) revert AlreadyApproved();
        approvedBy[txHash][msg.sender] = true;
        approvals[txHash]++;
        emit TransactionApproved(txHash, msg.sender);
    }

    /// @notice Execute once the threshold is met. Anyone may carry the
    ///         approved call to the chain — approval is the authority, not
    ///         the broadcast.
    function execute(address to, uint256 value, bytes calldata data, uint256 _nonce) external {
        bytes32 txHash = transactionHash(to, value, data, _nonce);
        if (executed[txHash]) revert AlreadyExecuted();
        if (approvals[txHash] < threshold) revert ThresholdNotMet(approvals[txHash], threshold);
        executed[txHash] = true;
        (bool ok,) = to.call{value: value}(data);
        if (!ok) revert ExecutionFailed();
        emit TransactionExecuted(txHash);
    }

    function ownerCount() external view returns (uint256) {
        return owners.length;
    }
}
