// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title MockOffsetAggregator
/// @notice Devnet-only stand-in for the Klima / Toucan / etc. retirement
///         aggregator contracts. Lets the offset-bridge frontend exercise
///         the four-step flow (approve → retire → attest → resolve) without
///         a Polygon connection. Mirrors the surface the bridge calls:
///
///           - quote(uint256 tonsToRetire) view returns (uint256 amountIn)
///           - retire(uint256 tonsToRetire, address beneficiary, uint256 maxAmountIn)
///                 → bytes32 retirementId
///           - event Retired(...)
///
///         Pricing is a fixed `pricePerTon` set at construction; the mock
///         pulls `inputToken` from msg.sender via `transferFrom` to make
///         the buyer's prior-approval step real. No swap, no liquidity
///         math — just a minimal skeleton good enough for e2e + manual
///         exercise on Anvil.
///
/// @dev Not for testnet or mainnet. Real aggregators (KlimaInfinity diamond,
///      Toucan OffsetHelper) are external contracts; the bridge looks them
///      up by chainId in `lib/mechanisms/offsetAggregators.ts`. The mock is
///      registered under chainId 31337 (Anvil) only.
contract MockOffsetAggregator {
    /// @notice Token the mock accepts as payment (e.g. devnet MockToken
    ///         standing in for USDC.e on Polygon).
    IERC20 public immutable inputToken;

    /// @notice Price per tonne CO2 in `inputToken` smallest units. Fixed
    ///         at construction; no quote oracle.
    uint256 public immutable pricePerTon;

    /// @notice Monotonically increasing counter mixed into the retirement
    ///         id so two retirements in the same block by the same caller
    ///         get distinct ids.
    uint256 public retirementCount;

    error ZeroTons();
    error ZeroBeneficiary();
    error PriceExceedsMax(uint256 amountIn, uint256 maxAmountIn);
    error TransferFailed();

    /// @notice Emitted on every successful retirement. Mirrors the
    ///         beneficiary semantics of the real aggregators (Klima's
    ///         CarbonRetired indexes `beneficiaryAddress`; Toucan's
    ///         Redeemed indexes `sender`). The bridge attests against
    ///         the tx hash that emitted this event.
    event Retired(
        bytes32 indexed retirementId,
        address indexed retiringAddress,
        address indexed beneficiary,
        uint256 tonsRetired,
        address inputToken,
        uint256 inputAmount
    );

    constructor(IERC20 inputToken_, uint256 pricePerTon_) {
        inputToken = inputToken_;
        pricePerTon = pricePerTon_;
    }

    /// @notice Quote the input-token cost for retiring `tonsToRetire` tonnes.
    ///         Pure function of the constant `pricePerTon`. Caller approves
    ///         this amount before calling `retire`.
    function quote(uint256 tonsToRetire) external view returns (uint256 amountIn) {
        return tonsToRetire * pricePerTon;
    }

    /// @notice Retire `tonsToRetire` tonnes on behalf of `beneficiary`.
    ///         Pulls `quote(tonsToRetire)` of `inputToken` from msg.sender
    ///         (must be approved first). Reverts if the cost exceeds
    ///         `maxAmountIn` (slippage guard the buyer set at quote time).
    ///         Returns a unique retirement id derived from block number,
    ///         caller, beneficiary, tons, and an incrementing counter.
    function retire(uint256 tonsToRetire, address beneficiary, uint256 maxAmountIn)
        external
        returns (bytes32 retirementId)
    {
        if (tonsToRetire == 0) revert ZeroTons();
        if (beneficiary == address(0)) revert ZeroBeneficiary();

        uint256 amountIn = tonsToRetire * pricePerTon;
        if (amountIn > maxAmountIn) revert PriceExceedsMax(amountIn, maxAmountIn);

        bool ok = inputToken.transferFrom(msg.sender, address(this), amountIn);
        if (!ok) revert TransferFailed();

        unchecked {
            retirementCount++;
        }
        retirementId = keccak256(abi.encode(block.number, msg.sender, beneficiary, tonsToRetire, retirementCount));

        emit Retired(retirementId, msg.sender, beneficiary, tonsToRetire, address(inputToken), amountIn);
    }
}
