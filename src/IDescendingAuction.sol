// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IDescendingAuction
/// @notice The standard on-network interface for descending-price (Dutch)
///         counterparty selection — the composition target a clause names via
///         `block.composes.interface = "descending-auction"`.
///
///         It is a pure coordination protocol: it decides WHO does a job and at
///         WHAT price, never touching funds. A buyer opens an auction; the price
///         decays; the first provider to `claim` becomes the seller and bonds
///         normally through FigaroCore with `payment = clearingPrice`.
///
///         Any contract implementing this interface is composable with zero
///         bundled code on the frontend: the runtime resolves the concrete
///         instance ADDRESS (from clause data / chain / env) and the ABI (Level 1
///         standard shape, or a Level-2 `abiCID` pin) and drives it through these
///         four functions. `DutchAuction` is the reference implementation; a
///         third party can ship its own descending-auction and be selected by the
///         same clause. The composition analogue of `IRoleResolver`.
interface IDescendingAuction {
    /// @notice Open a descending-price auction for a job.
    /// @param auctionId Caller-chosen unique id (e.g. derived from the processId).
    /// @param maxPrice  Opening (maximum) price in the currency's smallest units;
    ///                  the price decays from here. This is the sole runtime input
    ///                  the buyer supplies (the clause's `block.fields` startPrice).
    /// @param processId The FigaroCore process this auction coordinates.
    /// @param currency  Token address the price is denominated in.
    function createAuction(bytes32 auctionId, uint256 maxPrice, bytes32 processId, address currency) external;

    /// @notice The current decaying price for an open auction.
    /// @param auctionId The auction to query.
    /// @return The current price in the currency's smallest units.
    function getCurrentPrice(bytes32 auctionId) external view returns (uint256);

    /// @notice Claim the job at the current price. First caller wins; the caller
    ///         becomes the provider (the seller in the resulting commitment).
    /// @param auctionId The auction to claim.
    function claim(bytes32 auctionId) external;

    /// @notice Cancel an unclaimed auction. Only the auction's creator may cancel.
    /// @param auctionId The auction to cancel.
    function cancel(bytes32 auctionId) external;
}
