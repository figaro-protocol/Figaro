// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPermit2SignatureTransfer} from "../SwapAndCommitCoordinator.sol";

/// @title MockPermit2 — devnet/test mock of Uniswap Permit2 SignatureTransfer
/// @notice Mirrors the MockERC20 / MockSP1Verifier mock pattern. Performs the
///         token pull that real Permit2 performs, gated on the owner having
///         approved this contract (the standard one-time Permit2 approval). It
///         does NOT verify the signature — out of scope for exercising the
///         coordinator's flow — but enforces the deadline and the permitted
///         amount so the coordinator is driven faithfully.
contract MockPermit2 is IPermit2SignatureTransfer {
    error PermitExpired();
    error AmountExceedsPermitted();

    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata /* signature */
    ) external override {
        if (block.timestamp > permit.deadline) revert PermitExpired();
        if (transferDetails.requestedAmount > permit.permitted.amount) revert AmountExceedsPermitted();
        IERC20(permit.permitted.token).transferFrom(owner, transferDetails.to, transferDetails.requestedAmount);
    }
}
