// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CommitmentTypes} from "src/kernel/CommitmentTypes.sol";

/// @notice Minimal FigaroCore surface the coordinator calls. Local-minimal
///         binding, per the coordinator exemplar (ARCHITECTURE.md § "Composing
///         the kernel"); the kernel is untouched.
interface IFigaroCore {
    function commit(CommitmentTypes.Commitment calldata c, bytes calldata buyerSig, bytes calldata sellerSig)
        external
        returns (bytes32 processId, bytes32 orderHash);
}

/// @notice Uniswap Permit2 SignatureTransfer surface, witness variant. Unlike
///         the plain `permitTransferFrom`, `permitWitnessTransferFrom` folds a
///         caller-computed `witness` (and its EIP-712 type string) into the
///         digest the owner signed, so the owner's signature covers arbitrary
///         extra data — here, the authorized swap route.
interface IPermit2WitnessTransfer {
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

    function permitWitnessTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes32 witness,
        string calldata witnessTypeString,
        bytes calldata signature
    ) external;
}

/// @title WitnessSwapAndCommitCoordinator — swap-route-bound pay-in-any-token executor
/// @custom:security-contact figarosecurity@gmail.com
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice Off-protocol executor that lets a buyer and/or seller post their
///         FigaroCore bond in a token other than the process bond currency, by
///         pulling the party's input token via Permit2, swapping it to the bond
///         currency through an immutable router, forwarding the proceeds to the
///         party's EOA, then calling `FigaroCore.commit`. Because the kernel
///         pulls each bond from the named party (`c.buyer`/`c.seller`) and never
///         checks `msg.sender`, the coordinator funds the party in-place rather
///         than substituting itself — the EIP-712 commitment stays bilaterally
///         signed and the coordinator never becomes a counterparty.
/// @dev WHY THE WITNESS: a predecessor coordinator (`SwapAndCommitCoordinator`,
///      deleted before any deployment — git history) forwarded the per-leg
///      `swapData` — the exact swap route — verbatim to the router while it sat
///      OUTSIDE every signature. The party's Permit2 signature (via plain
///      `permitTransferFrom`) committed only to
///      {token, amount, nonce, deadline, spender}; it did NOT commit to the
///      route. A relayer or front-runner submitting the transaction could
///      substitute its own `swapData` — routing the swap through a pool it
///      sandwiches, or a route that yields only just above the bond floor — and
///      capture the slippage residual that would otherwise be refunded to the
///      party. MED-severity: bounded by the party's `maxInput`, but real value
///      leaks to whoever relays.
///
///      THE FIX: this coordinator calls `permitWitnessTransferFrom`, binding the
///      swap route into a Permit2 witness. The witness commits to
///      `{router, inputToken, maxInput, keccak256(swapData)}`, so the owner's
///      signature COVERS the exact route. Substitute any of those and the
///      recomputed witness no longer matches the signed digest — Permit2's own
///      signature check reverts before a single token moves. The bond currency
///      and bond amount are NOT re-bound in the witness: they derive from `c`,
///      which is already bilaterally EIP-712-signed and enforced by the kernel.
///
///      The frozen kernel is untouched. The coordinator carries only the commit
///      call, so it holds no resolution-time discretion. No owner/admin/pause —
///      the no-escape-hatch discipline applies to the whole protocol surface.
///      The Uniswap pool is an off-protocol auxiliary. Permissionless
///      first-write-wins binding means alternative coordinators with different
///      routers or MEV policies are valid compositions; this one fixes its
///      router at deployment.
///
///      Per-party prerequisites (identical burden to the plain FigaroCore flow plus a
///      witness signature): a one-time `approve(FigaroCore, …)` for the bond
///      currency, a one-time `approve(Permit2, …)` for the input token, and a
///      per-commit Permit2 witness signature (over `swapWitness(...)`) alongside
///      the usual commitment signature.
contract WitnessSwapAndCommitCoordinator is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IFigaroCore public immutable figaroCore;
    IPermit2WitnessTransfer public immutable permit2;
    /// @notice Fixed swap venue (e.g. the Uniswap Universal Router). Immutable so
    ///         the caller-supplied swap calldata cannot retarget an arbitrary
    ///         address; only the swap parameters are caller-controlled — and now
    ///         those parameters are witness-bound to the party's signature.
    address public immutable router;

    /// @notice EIP-712 type of the swap witness the party signs. Binds every
    ///         economically-meaningful parameter of the leg that the party
    ///         authorizes: the venue, the input token, the input ceiling, and a
    ///         hash of the exact swap calldata (the route).
    struct SwapWitness {
        address router;
        address inputToken;
        uint256 maxInput;
        bytes32 swapDataHash;
    }

    /// @dev keccak256 of the `SwapWitness` EIP-712 type.
    bytes32 internal constant SWAP_WITNESS_TYPEHASH =
        keccak256("SwapWitness(address router,address inputToken,uint256 maxInput,bytes32 swapDataHash)");

    /// @dev The witness type string Permit2 appends to its own
    ///      `PermitWitnessTransferFrom(...` stub to reconstruct the full typed
    ///      data. Must name the witness member (`SwapWitness witness`) then
    ///      declare the `SwapWitness` and `TokenPermissions` sub-types in
    ///      alphabetical order, per the Permit2 witness convention.
    string internal constant WITNESS_TYPE_STRING =
        "SwapWitness witness)SwapWitness(address router,address inputToken,uint256 maxInput,bytes32 swapDataHash)TokenPermissions(address token,uint256 amount)";

    /// @notice Per-party instruction to fund a bond from a swapped input token.
    ///         `enabled == false` skips this leg — the party self-funds the bond
    ///         currency directly, exactly as in the base FigaroCore flow.
    /// @dev `swapData` is forwarded verbatim to `router`; in production it is the
    ///      Universal Router `execute(...)` calldata, in tests the mock router's
    ///      swap selector. The bond amount is never supplied here — it is derived
    ///      from the commitment — so a caller cannot under-fund the kernel pull.
    ///      `permitSignature` must be the party's Permit2 WITNESS signature over
    ///      `swapWitness(inputToken, maxInput, swapData)`; a signature over any
    ///      other route is rejected by Permit2.
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
        permit2 = IPermit2WitnessTransfer(permit2_);
        router = router_;
    }

    /// @notice Recompute the Permit2 witness a party must sign for a given leg.
    ///         Off-chain signers call this (or replicate it) so their signature
    ///         commits to the exact swap route. `_fund` recomputes the identical
    ///         value on-chain, so any deviation between the signed route and the
    ///         submitted `swapData` flips the witness and fails verification.
    /// @dev `router` is the contract's immutable venue, so the party's signature
    ///      is also pinned to this coordinator's venue.
    function swapWitness(address inputToken, uint256 maxInput, bytes calldata swapData) public view returns (bytes32) {
        return keccak256(abi.encode(SWAP_WITNESS_TYPEHASH, router, inputToken, maxInput, keccak256(swapData)));
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
        // 1. Pull the party's input token via their Permit2 WITNESS signature.
        //    The witness binds {router, inputToken, maxInput, keccak256(swapData)}
        //    into the digest the party signed, so a relayer cannot substitute a
        //    different route: Permit2 recomputes the digest from the witness we
        //    pass and reverts if it does not recover `party`.
        bytes32 witness = swapWitness(f.inputToken, f.maxInput, f.swapData);
        permit2.permitWitnessTransferFrom(
            IPermit2WitnessTransfer.PermitTransferFrom({
                permitted: IPermit2WitnessTransfer.TokenPermissions({token: f.inputToken, amount: f.maxInput}),
                nonce: f.permitNonce,
                deadline: f.permitDeadline
            }),
            IPermit2WitnessTransfer.SignatureTransferDetails({to: address(this), requestedAmount: f.maxInput}),
            party,
            witness,
            WITNESS_TYPE_STRING,
            f.permitSignature
        );

        // 2. Forward the (now signature-covered) swap calldata to the immutable router.
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
