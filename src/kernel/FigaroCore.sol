// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./CommitmentTypes.sol";

/// @title FigaroCore — Self-enforcing agreements between strangers
/// @custom:security-contact figarosecurity@gmail.com
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice The protocol kernel. Two external functions: commit() and
///         resolveProcess(). No owner, no fee, no escape hatches.
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any kind, express or implied. No liability is accepted for loss, damages, or bugs. Use at your own risk.
///
///         Invariants enforced on-chain:
///         - Asymmetric bonding (buyer: 2× payment, seller: 2× cumulativeValue)
///         - Monotonic cumulative-value accumulator per process
///         - Buyer identity (root buyer address in every sub-order, verified via signature)
///         - Buyer dominance (only root buyer can resolve — msg.sender enforced)
///         - Single-currency invariant per process
///         - Atomic resolution with direct transfer (no internal ledger)
///         - Fee-on-transfer token rejection (_pullExact balance check)
contract FigaroCore is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using CommitmentTypes for CommitmentTypes.Commitment;

    // ── Events ─────────────────────────────────────────────────────

    /// @notice Emitted when a commitment is bonded on-chain.
    ///         Includes salt and deadline so agents can fully reconstruct
    ///         Commitment structs from events alone (no calldata parsing).
    event OrderCommitted(
        bytes32 indexed orderHash,
        bytes32 indexed processId,
        address indexed buyer,
        address seller,
        address currency,
        uint256 payment,
        uint256 cumulativeValue,
        bytes32 agreementHash,
        uint256 salt,
        uint256 deadline
    );

    /// @notice Companion event for indexed seller lookup (EVM 3-index limit).
    event OrderSeller(bytes32 indexed orderHash, address indexed seller);

    /// @notice Companion event for indexed currency lookup (EVM 3-index limit).
    event OrderCurrency(bytes32 indexed orderHash, address indexed currency);

    /// @notice Emitted per order during resolution.
    event OrderResolved(
        bytes32 indexed orderHash, bytes32 indexed processId, uint256 sellerPayout, uint256 buyerPayout
    );

    /// @notice Emitted once per process resolution.
    event ProcessResolved(bytes32 indexed processId, address indexed buyer, uint256 orderCount);

    // ── Errors ────────────────────────────────────────────────────

    error DeadlineExpired();
    error InvalidBuyerSignature();
    error InvalidSellerSignature();
    error ZeroPayment();
    error ProcessAlreadyExists();
    error UnknownProcess();
    error CumulativeValueMismatch(uint256 expected, uint256 actual);
    error NotProcessBuyer();
    error CurrencyMismatch();
    error OrderNotCommitted(bytes32 orderHash);
    error NoActiveOrders();
    error IncompleteOrderList(uint256 required, uint256 provided);
    error DuplicateCommitment();
    error FeeOnTransferDetected();
    error InvalidRootCumulativeValue();
    error ProcessAlreadyResolved();

    // ── Process state (the minimal accumulator) ───────────────────

    struct ProcessState {
        address rootBuyer;
        IERC20 currency;
        uint256 cumulativeValue;
        uint256 activeOrderCount;
    }

    mapping(bytes32 => ProcessState) public processes;

    // ── Order nullifier (0 = unknown, 1 = committed, 2 = resolved) ─

    mapping(bytes32 => uint8) public orderStatus;

    // ── Order → process membership (zero = unknown order) ──────────

    mapping(bytes32 => bytes32) public orderProcessId;

    // ── Constructor ───────────────────────────────────────────────

    // EIP-712 version "3" reflects the third major iteration of the
    // commitment schema (V1/V2 used different struct layouts in archived
    // prototypes, V3 introduced the unified Commitment struct shipped here).
    // This is not a deployment sequence number — it is the schema version
    // baked into every EIP-712 signature and must never change post-deploy.
    constructor() EIP712("FigaroCore", "3") {}

    // ── Public views ──────────────────────────────────────────────

    /// @notice EIP-712 domain separator for this deployment.
    /// @dev Exposes the value OZ EIP712 already computes internally so that
    ///      dependent contracts (e.g. AttestationCoordinator) bind to a
    ///      single source of truth instead of reconstructing it by hand.
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ── Internal ──────────────────────────────────────────────────

    /// @dev Pull exactly `amount` from `from`. Reverts if a fee-on-transfer
    ///      token delivers less than requested.
    ///
    ///      Rebasing tokens (e.g. stETH, aTokens) are also rejected by this
    ///      check: upward rebases cause (received > amount) which fails the
    ///      strict equality check, and downward rebases cause (received < amount).
    ///      Rebasing tokens are incompatible with the bonding model — the bond
    ///      amount must remain exactly as committed for the MAD equilibrium to
    ///      hold. Use wrapped non-rebasing variants (e.g. wstETH) instead.
    function _pullExact(IERC20 token, address from, uint256 amount) internal {
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        if (token.balanceOf(address(this)) - before != amount) {
            revert FeeOnTransferDetected();
        }
    }

    // ── Unified commitment ────────────────────────────────────────

    /// @notice Commit a bonded order. Root orders create a new process;
    ///         sub-orders extend an existing one.
    ///
    /// @param c The dual-signed commitment struct.
    /// @param buyerSig EIP-712 signature from the buyer.
    /// @param sellerSig EIP-712 signature from the seller.
    /// @return processId The process this order belongs to.
    /// @return orderHash The content-addressed order identifier.
    function commit(CommitmentTypes.Commitment calldata c, bytes calldata buyerSig, bytes calldata sellerSig)
        external
        nonReentrant
        returns (bytes32 processId, bytes32 orderHash)
    {
        if (c.deadline < block.timestamp) revert DeadlineExpired();
        if (c.payment == 0) revert ZeroPayment();

        bytes32 structHash;
        {
            structHash = c.hashStruct();
            bytes32 digest = _hashTypedDataV4(structHash);

            if (ECDSA.recover(digest, buyerSig) != c.buyer) {
                revert InvalidBuyerSignature();
            }
            if (ECDSA.recover(digest, sellerSig) != c.seller) {
                revert InvalidSellerSignature();
            }

            // Root: processId IS the EIP-712 digest (already includes
            // chainId + verifyingContract via domain separator).
            processId = (c.processId == bytes32(0)) ? digest : c.processId;
        }

        if (c.processId == bytes32(0)) {
            // ── Root order: create new process ────────────────────
            if (processes[processId].rootBuyer != address(0)) {
                revert ProcessAlreadyExists();
            }
            if (c.expectedCumulativeValue != c.payment) {
                revert InvalidRootCumulativeValue();
            }

            processes[processId] = ProcessState({
                rootBuyer: c.buyer, currency: IERC20(c.currency), cumulativeValue: c.payment, activeOrderCount: 1
            });
        } else {
            // ── Sub-order: extend existing process ────────────────
            ProcessState storage ps = processes[processId];
            if (ps.rootBuyer == address(0)) revert UnknownProcess();
            if (ps.activeOrderCount == 0) revert ProcessAlreadyResolved();
            if (c.buyer != ps.rootBuyer) revert NotProcessBuyer();
            if (c.currency != address(ps.currency)) revert CurrencyMismatch();

            uint256 actualCumulative = ps.cumulativeValue + c.payment;
            if (c.expectedCumulativeValue != actualCumulative) {
                revert CumulativeValueMismatch(c.expectedCumulativeValue, actualCumulative);
            }

            ps.cumulativeValue = actualCumulative;
            ps.activeOrderCount += 1;
        }

        orderHash = keccak256(abi.encodePacked(processId, structHash));

        if (orderStatus[orderHash] != 0) revert DuplicateCommitment();
        orderStatus[orderHash] = 1;
        orderProcessId[orderHash] = processId;

        _pullExact(IERC20(c.currency), c.buyer, c.payment * 2);
        _pullExact(IERC20(c.currency), c.seller, c.expectedCumulativeValue * 2);

        _emitCommitted(orderHash, processId, c);
        emit OrderSeller(orderHash, c.seller);
        emit OrderCurrency(orderHash, c.currency);
    }

    /**
     * @dev Separated to avoid stack-too-deep in commit().
     */
    function _emitCommitted(bytes32 orderHash, bytes32 processId, CommitmentTypes.Commitment calldata c) private {
        emit OrderCommitted(
            orderHash,
            processId,
            c.buyer,
            c.seller,
            c.currency,
            c.payment,
            c.expectedCumulativeValue,
            c.agreementHash,
            c.salt,
            c.deadline
        );
    }

    // ── Resolution (buyer dominance + atomic) ─────────────────────

    /// @notice Resolve all orders in a process atomically.
    ///
    ///         If the root buyer's key is permanently lost, bonds in
    ///         this process cannot be resolved through the contract.
    ///         Use social recovery or multi-sig for the buyer role.
    ///
    ///         GAS CEILING: Each order costs ~23k gas to resolve
    ///         (struct hash, cold SLOAD, two ERC-20 transfers, SSTORE,
    ///         LOG + the order's calldata — measured all-in on real
    ///         transaction receipts). At Ethereum's 30M block gas limit,
    ///         that's a hard cap of ~1,240 orders per process (resolve
    ///         cost ~= 38,000 + 23,000*N). The cap is a property of
    ///         the kernel resolveProcess path; it cannot be enforced
    ///         on-chain at assembly registration because assembly documents
    ///         live off-chain (AssemblyRegistry only stores their
    ///         hash + URI). Publish-side clients refuse to anchor an
    ///         assembly that would exceed the cap; buyer-side clients
    ///         verify the assembly document's order count before committing.
    ///         For trees larger than the cap, compose multiple
    ///         processes: a sub-order in process A roots process B,
    ///         so the overall tree spans multiple settlements while
    ///         each individual process stays within the ceiling.
    ///
    /// @param processId The process to resolve.
    /// @param commitments The full set of active order commitments.
    function resolveProcess(bytes32 processId, CommitmentTypes.Commitment[] calldata commitments)
        external
        nonReentrant
    {
        ProcessState storage ps = processes[processId];
        if (ps.rootBuyer == address(0)) revert UnknownProcess();
        if (msg.sender != ps.rootBuyer) revert NotProcessBuyer();
        if (ps.activeOrderCount == 0) revert NoActiveOrders();
        if (commitments.length != ps.activeOrderCount) {
            revert IncompleteOrderList(ps.activeOrderCount, commitments.length);
        }

        IERC20 currency = ps.currency;
        address buyer = ps.rootBuyer;

        for (uint256 i = 0; i < commitments.length; i++) {
            CommitmentTypes.Commitment calldata c = commitments[i];

            bytes32 structHash = c.hashStruct();
            bytes32 orderHash = keccak256(abi.encodePacked(processId, structHash));

            if (orderStatus[orderHash] != 1) {
                revert OrderNotCommitted(orderHash);
            }

            // Prevent theoretical overflow (see audit L-4)
            if (c.expectedCumulativeValue > type(uint256).max / 3) {
                revert("CumulativeValueOverflow");
            }
            uint256 sellerPayout = c.expectedCumulativeValue * 2 + c.payment;
            uint256 buyerPayout = c.payment;

            currency.safeTransfer(c.seller, sellerPayout);
            currency.safeTransfer(buyer, buyerPayout);

            orderStatus[orderHash] = 2;

            emit OrderResolved(orderHash, processId, sellerPayout, buyerPayout);
        }

        ps.activeOrderCount = 0;

        emit ProcessResolved(processId, msg.sender, commitments.length);
    }
}
