// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CommitmentTypes} from "./CommitmentTypes.sol";

/// @notice Minimal FigaroCore surface the coordinator calls.
interface IFigaroCore {
    function commit(CommitmentTypes.Commitment calldata c, bytes calldata buyerSig, bytes calldata sellerSig)
        external
        returns (bytes32 processId, bytes32 orderHash);
}

/// @notice Uniswap Permit2 SignatureTransfer surface.
interface IPermit2SignatureTransfer {
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }

    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;
}

/// @title SwapAndCommitCoordinator — pay a Figaro bond in a different token
/// @custom:security-contact security@figaro.org
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice Off-protocol executor that lets a buyer and/or a seller post their
///         FigaroCore bond in a token other than the process bond currency. For
///         each enabled party it pulls the party's input token via a Permit2
///         signature, swaps it to the bond currency through an immutable router,
///         forwards the proceeds to the party's EOA, then calls
///         `FigaroCore.commit`. Because the kernel pulls each bond from the named
///         party (`c.buyer` / `c.seller`) and never checks `msg.sender`, the
///         coordinator funds the party in-place rather than substituting itself
///         as a counterparty: the EIP-712 commitment stays bilaterally signed.
/// @dev The frozen kernel is untouched. The coordinator carries only the commit
///      call, so it holds no resolution-time discretion. The Uniswap pool is an
///      off-protocol auxiliary. Permissionless first-write-wins binding means
///      alternative coordinators with different routers or MEV policies are valid
///      compositions; this one fixes its router at deployment.
///
///      Per-party prerequisites (identical burden to the base flow plus Permit2):
///      a one-time `approve(FigaroCore, …)` for the bond currency, a one-time
///      `approve(Permit2, …)` for the input token, and a per-commit Permit2
///      signature alongside the usual commitment signature.
contract SwapAndCommitCoordinator is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IFigaroCore public immutable figaroCore;
    IPermit2SignatureTransfer public immutable permit2;
    /// @notice Fixed swap venue (e.g. the Uniswap Universal Router). Immutable so
    ///         the caller-supplied swap calldata cannot retarget an arbitrary
    ///         address; only the swap parameters are caller-controlled.
    address public immutable router;

    /// @notice Per-party instruction to fund a bond from a swapped input token.
    ///         `enabled == false` skips this leg — the party self-funds the bond
    ///         currency directly, exactly as in the base FigaroCore flow.
    /// @dev `swapData` is forwarded verbatim to `router`; in production it is the
    ///      Universal Router `execute(...)` calldata, in tests the mock router's
    ///      swap selector. The bond amount is never supplied here — it is derived
    ///      from the commitment — so a caller cannot under-fund the kernel pull.
    struct SwapFunding {
        bool enabled;
        address inputToken;
        uint256 maxInput;
        uint256 permitNonce;
        uint256 permitDeadline;
        bytes permitSignature;
        bytes swapData;
    }

    error NothingToFund();
    error SwapCallFailed();
    error OutputBelowBond(uint256 received, uint256 required);

    constructor(address figaroCore_, address permit2_, address router_) {
        figaroCore = IFigaroCore(figaroCore_);
        permit2 = IPermit2SignatureTransfer(permit2_);
        router = router_;
    }

    /// @notice Fund the enabled bond legs from swapped input tokens, then commit.
    /// @param c The bilaterally-signed commitment (unchanged by this contract).
    /// @param buyerSig EIP-712 signature recovering to `c.buyer`.
    /// @param sellerSig EIP-712 signature recovering to `c.seller`.
    /// @param buyerFunding Buyer-side swap-funding leg (or `enabled = false`).
    /// @param sellerFunding Seller-side swap-funding leg (or `enabled = false`).
    function swapAndCommit(
        CommitmentTypes.Commitment calldata c,
        bytes calldata buyerSig,
        bytes calldata sellerSig,
        SwapFunding calldata buyerFunding,
        SwapFunding calldata sellerFunding
    ) external nonReentrant returns (bytes32 processId, bytes32 orderHash) {
        if (!buyerFunding.enabled && !sellerFunding.enabled) revert NothingToFund();

        // Bond amounts mirror the kernel pulls exactly: 2·payment from the buyer,
        // 2·expectedCumulativeValue from the seller (FigaroCore.commit).
        if (buyerFunding.enabled) {
            _fund(c.buyer, c.currency, c.payment * 2, buyerFunding);
        }
        if (sellerFunding.enabled) {
            _fund(c.seller, c.currency, c.expectedCumulativeValue * 2, sellerFunding);
        }

        (processId, orderHash) = figaroCore.commit(c, buyerSig, sellerSig);
    }

    function _fund(address party, address bondCurrency, uint256 bondAmount, SwapFunding calldata f) internal {
        // 1. Pull the party's input token into this contract via their Permit2 signature.
        permit2.permitTransferFrom(
            IPermit2SignatureTransfer.PermitTransferFrom({
                permitted: IPermit2SignatureTransfer.TokenPermissions({token: f.inputToken, amount: f.maxInput}),
                nonce: f.permitNonce,
                deadline: f.permitDeadline
            }),
            IPermit2SignatureTransfer.SignatureTransferDetails({to: address(this), requestedAmount: f.maxInput}),
            party,
            f.permitSignature
        );

        // 2. Forward the caller-supplied swap calldata to the immutable router.
        IERC20(f.inputToken).forceApprove(router, f.maxInput);
        uint256 bondBefore = IERC20(bondCurrency).balanceOf(address(this));
        (bool ok,) = router.call(f.swapData);
        if (!ok) revert SwapCallFailed();
        IERC20(f.inputToken).forceApprove(router, 0);

        // 3. Require the swap produced at least the bond; forward the full output
        //    to the party so the kernel pulls the bond and any slippage residual
        //    stays with the party.
        uint256 received = IERC20(bondCurrency).balanceOf(address(this)) - bondBefore;
        if (received < bondAmount) revert OutputBelowBond(received, bondAmount);
        IERC20(bondCurrency).safeTransfer(party, received);

        // 4. Refund any input the swap did not consume.
        uint256 inputResidual = IERC20(f.inputToken).balanceOf(address(this));
        if (inputResidual != 0) IERC20(f.inputToken).safeTransfer(party, inputResidual);
    }
}
