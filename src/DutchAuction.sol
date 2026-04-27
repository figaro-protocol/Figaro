// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title DutchAuction — Permissionless descending-price job allocation
/// @custom:security-contact security@figaro.org
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice Pure coordination primitive for time-decaying price discovery.
///         No token handling, no FigaroCore dependency, no owner, no pause.
///
///         The auction determines WHO does a job and at WHAT PRICE. The
///         bonded commitment happens separately through FigaroCore — the
///         provider (the address that called claim) becomes the seller in the
///         V5 kernel commitment and receives payment directly at resolution.
///         No financial intermediation. The auction is generic: the provider
///         could be a courier, a merchant in pickup mode, or any other
///         service-providing actor — the contract has no opinion.
///
/// @dev V3 DutchAuctionDriverMarketV3 had:
///      - 7 per-order mappings (High finding)
///      - Multi-step settlement: payProvider → reclaimAndRepay → refundSurplus (Medium)
///      - Ownable, Pausable, ReentrancyGuard, IRoleResolver
///      - Tight coupling to FigaroCoreV3 (acceptOffer, withdraw, getOrderCore, etc.)
///      - Vault integration for seller bond float
///
///      All of that complexity existed because the auction acted as a financial
///      intermediary for FigaroCoreV3's internal ledger. The live V5 kernel's direct transfer at
///      resolution eliminates the intermediation entirely.
///
///      V5 DutchAuction:
///      - 1 struct per auction (4 slots vs 7 mappings)
///      - No token handling (no ReentrancyGuard needed)
///      - No FigaroCore import (decoupled)
///      - No owner, no pause (immutable config at deploy)
///      - processId + currency in events only (not stored)
///
/// @dev Flow:
///      1. Creator calls createAuction(auctionId, maxPrice, processId, currency)
///      2. Price decays linearly from maxPrice to floor over `duration`
///      3. Provider calls claim(auctionId) — locks provider + clearingPrice
///      4. Off-chain: buyer + provider sign a commitment with payment = clearingPrice
///      5. commit on FigaroCore — provider is the seller, bonds directly
///      6. resolveProcess — FigaroCore pays provider directly. No auction settlement.
contract DutchAuction {
    struct Auction {
        address creator; // slot 0: who started the auction (20 bytes)
        uint64 startTime; // slot 0: when the clock started (+8 = 28 bytes)
        uint256 maxPrice; // slot 1: starting price
        address provider; // slot 2: claimed by (address(0) = open)
        uint256 clearingPrice; // slot 3: price locked at claim time
    }

    /// @notice Auction duration in seconds. Immutable at deploy.
    uint64 public immutable duration;

    /// @notice Floor price as basis points of maxPrice. Immutable at deploy.
    uint16 public immutable floorBps;

    /// @notice Active auctions keyed by creator-chosen ID.
    mapping(bytes32 => Auction) public auctions;

    // ── Events ──────────────────────────────────────────────────────

    /// @notice Emitted when an auction is created. processId and currency
    ///         are event-only (coordination data, not enforcement state).
    event AuctionCreated(
        bytes32 indexed auctionId,
        address indexed creator,
        uint256 maxPrice,
        bytes32 indexed processId,
        address currency
    );

    /// @notice Emitted when a provider claims at the current price.
    event AuctionClaimed(bytes32 indexed auctionId, address indexed provider, uint256 clearingPrice);

    /// @notice Emitted when the creator cancels an unclaimed auction.
    event AuctionCancelled(bytes32 indexed auctionId);

    /// @notice Emitted when an expired unclaimed auction is cleaned up.
    event AuctionExpired(bytes32 indexed auctionId);

    // ── Errors ──────────────────────────────────────────────────────

    error AlreadyExists();
    error NotStarted();
    error AlreadyClaimed();
    error NotCreator();
    error NotExpired();
    error ZeroPrice();
    error ZeroFloorBps();

    // ── Constructor ─────────────────────────────────────────────────

    constructor(uint64 _duration, uint16 _floorBps) {
        require(_duration > 0, "ZeroDuration");
        require(_floorBps <= 10_000, "InvalidFloorBps");
        if (_floorBps == 0) revert ZeroFloorBps();
        duration = _duration;
        floorBps = _floorBps;
    }

    // ── Auction lifecycle ───────────────────────────────────────────

    /// @notice Start a descending-price auction for a job.
    /// @param auctionId   Caller-chosen unique ID (e.g. keccak256 of params).
    /// @param maxPrice    Starting (maximum) price in token smallest units.
    /// @param processId   CoreV4 processId this auction coordinates (event-only).
    /// @param currency    Token address for price denomination (event-only).
    function createAuction(bytes32 auctionId, uint256 maxPrice, bytes32 processId, address currency) external {
        if (auctions[auctionId].creator != address(0)) revert AlreadyExists();
        if (maxPrice == 0) revert ZeroPrice();
        // Prevent overflow in getCurrentPrice floor calculation
        if (maxPrice > type(uint256).max / 10_000) revert("MaxPriceOverflow");

        auctions[auctionId] = Auction({
            creator: msg.sender,
            startTime: uint64(block.timestamp),
            maxPrice: maxPrice,
            provider: address(0),
            clearingPrice: 0
        });

        emit AuctionCreated(auctionId, msg.sender, maxPrice, processId, currency);
    }

    /// @notice Get the current decaying price for an auction.
    /// @dev Linear decay from maxPrice to floor over `duration`.
    ///      Returns floor price after duration elapses.
    /// @param auctionId The auction to query.
    /// @return The current price in token smallest units.
    /// @notice Returns the current auction price (may overflow if maxPrice > type(uint256).max / 10_000).
    /// @dev For very large maxPrice, createAuction will revert. For very small maxPrice, floor truncates to 0.
    /// @custom:audit-info
    /// @dev This function is not MEV-resistant. Front-running is possible: the first caller to claim() wins the job and must bond capital. No funds are at risk, but the winner is determined by transaction ordering.
    function getCurrentPrice(bytes32 auctionId) public view returns (uint256) {
        Auction storage a = auctions[auctionId];
        if (a.creator == address(0)) revert NotStarted();

        uint256 maxPrice = a.maxPrice;
        uint256 floor = (maxPrice * floorBps) / 10_000;

        uint256 elapsed = block.timestamp - a.startTime;
        if (elapsed >= duration) return floor;

        uint256 drop = ((maxPrice - floor) * elapsed) / duration;
        return maxPrice - drop;
    }

    /// @notice Claim the job at the current price. First caller wins.
    /// @param auctionId The auction to claim.
    function claim(bytes32 auctionId) external {
        Auction storage a = auctions[auctionId];
        if (a.creator == address(0)) revert NotStarted();
        if (a.provider != address(0)) revert AlreadyClaimed();

        uint256 price = getCurrentPrice(auctionId);
        a.provider = msg.sender;
        a.clearingPrice = price;

        emit AuctionClaimed(auctionId, msg.sender, price);
    }

    /// @notice Cancel an unclaimed auction. Only the creator can cancel.
    /// @param auctionId The auction to cancel.
    function cancel(bytes32 auctionId) external {
        Auction storage a = auctions[auctionId];
        if (a.creator != msg.sender) revert NotCreator();
        if (a.provider != address(0)) revert AlreadyClaimed();

        delete auctions[auctionId];
        emit AuctionCancelled(auctionId);
    }

    /// @notice Clean up an expired, unclaimed auction. Permissionless.
    /// @dev After duration elapses with no claim, anyone can clear the slot.
    /// @param auctionId The auction to expire.
    function expire(bytes32 auctionId) external {
        Auction storage a = auctions[auctionId];
        if (a.creator == address(0)) revert NotStarted();
        if (a.provider != address(0)) revert AlreadyClaimed();
        if (block.timestamp - a.startTime < duration) revert NotExpired();

        delete auctions[auctionId];
        emit AuctionExpired(auctionId);
    }
}
