// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CommitmentTypes} from "src/core/kernel/CommitmentTypes.sol";

/// @notice Minimal FigaroCore surface the coordinator calls. Local-minimal
///         binding, per the coordinator exemplar (`docs/CONTRACTS.md`
///         § "Coordinators"); FigaroCore is untouched.
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
///         party's EOA, then calling `FigaroCore.commit`. Because FigaroCore
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
///      `{router, inputToken, maxInput, keccak256(swapData), commitmentHash,
///      role}`, so the owner's signature COVERS the exact route, the one
///      commitment whose bond the leg pays (its EIP-712 struct hash) and the party's
///      place in it. Substitute any of those and the recomputed witness no
///      longer matches the signed digest — Permit2's own signature check
///      reverts before a single token moves. So a leg signed for an order that
///      never committed cannot fund another commitment naming the same party,
///      whoever calls, and a leg signed as buyer cannot fund the seller's bond
///      of an order where one wallet holds both places. The bond currency and
///      bond amount are NOT re-bound in the witness: they derive from `c`,
///      whose struct hash the witness carries.
///
///      The frozen FigaroCore is untouched. The coordinator carries only the commit
///      call, so it holds no resolution-time discretion. No owner/admin/pause —
///      the no-escape-hatch discipline applies to the whole protocol surface.
///      The Uniswap pool is an off-protocol auxiliary. A coordinator with
///      another router or another MEV policy is another deployment, which
///      anyone may make and nothing in this one registers; this one fixes its
///      router at deployment.
///
///      Per-party prerequisites (identical burden to the plain FigaroCore flow plus a
///      witness signature): an `approve(FigaroCore, …)` for the bond currency
///      covering the bonds FigaroCore pulls; an `approve(Permit2, …)` for the
///      input token, one approval covering together the `maxInput`s of every
///      swap made under it, since each swap pulls its own whole `maxInput`; and
///      a per-commit Permit2 witness signature (over `swapWitness(...)`).
contract WitnessSwapAndCommitCoordinator is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IFigaroCore public immutable figaroCore;
    IPermit2WitnessTransfer public immutable permit2;
    /// @notice Fixed swap venue (e.g. Uniswap's SwapRouter02). Immutable so
    ///         the caller-supplied swap calldata cannot retarget an arbitrary
    ///         address; only the swap parameters are caller-controlled — and now
    ///         those parameters are witness-bound to the party's signature.
    address public immutable router;

    /// @notice EIP-712 type of the swap witness the party signs. Binds every
    ///         economically-meaningful parameter of the leg that the party
    ///         authorizes: the venue, the input token, the input ceiling, a
    ///         hash of the exact swap calldata (the route), the EIP-712 struct
    ///         hash of the one commitment whose bond the leg pays
    ///         (`CommitmentTypes.hashStruct`), and the party's role in it.
    /// @dev The struct hash carries no domain. Permit2's own domain pins the
    ///      chain, its `spender` pins this coordinator, and this coordinator's
    ///      immutable `figaroCore` pins the Core the commitment is sent to.
    struct SwapWitness {
        address router;
        address inputToken;
        uint256 maxInput;
        bytes32 swapDataHash;
        bytes32 commitmentHash;
        uint8 role;
    }

    /// @notice The role whose bond a leg pays: the buyer's bond (2·payment) or the
    ///         seller's (2·runningTotal).
    uint8 internal constant BUYER_ROLE = 0;
    uint8 internal constant SELLER_ROLE = 1;

    /// @dev keccak256 of the `SwapWitness` EIP-712 type.
    bytes32 internal constant SWAP_WITNESS_TYPEHASH = keccak256(
        "SwapWitness(address router,address inputToken,uint256 maxInput,bytes32 swapDataHash,bytes32 commitmentHash,uint8 role)"
    );

    /// @dev The witness type string Permit2 appends to its own
    ///      `PermitWitnessTransferFrom(...` stub to reconstruct the full typed
    ///      data. Must name the witness member (`SwapWitness witness`) then
    ///      declare the `SwapWitness` and `TokenPermissions` sub-types in
    ///      alphabetical order, per the Permit2 witness convention.
    string internal constant WITNESS_TYPE_STRING =
        "SwapWitness witness)SwapWitness(address router,address inputToken,uint256 maxInput,bytes32 swapDataHash,bytes32 commitmentHash,uint8 role)TokenPermissions(address token,uint256 amount)";

    /// @notice Per-party instruction to fund a bond from a swapped input token.
    ///         `enabled == false` skips this leg — the party self-funds the bond
    ///         currency directly, exactly as in the base FigaroCore flow.
    /// @dev `swapData` is forwarded verbatim to `router`; in production it is
    ///      SwapRouter02 `exactOutputSingle(...)` calldata, in tests the mock
    ///      venue's swap selector. Either way the venue must PULL the input by
    ///      ERC-20 allowance — `_fund` forceApproves `router` for `maxInput`
    ///      before the call. The bond amount is never supplied here — it is derived
    ///      from the commitment — so a caller cannot under-fund FigaroCore's pull.
    ///      `permitSignature` must be the party's Permit2 WITNESS signature over
    ///      `swapWitness(inputToken, maxInput, swapData, commitmentHash, role)`;
    ///      a signature over any other route, commitment or role is rejected
    ///      by Permit2.
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
    ///         commits to the exact swap route, the commitment and the role.
    ///         `_fund` recomputes the identical value on-chain from the
    ///         submitted `swapData`, the submitted commitment's struct hash and
    ///         the leg's place in the call, so any deviation flips the witness
    ///         and fails verification.
    /// @dev `router` is the contract's immutable venue, so the party's signature
    ///      is also pinned to this coordinator's venue.
    function swapWitness(
        address inputToken,
        uint256 maxInput,
        bytes calldata swapData,
        bytes32 commitmentHash,
        uint8 role
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(SWAP_WITNESS_TYPEHASH, router, inputToken, maxInput, keccak256(swapData), commitmentHash, role)
        );
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

        // The one commitment each leg's witness must name.
        bytes32 commitmentHash = CommitmentTypes.hashStruct(c);

        // Bond amounts mirror FigaroCore's pulls exactly: 2·payment from the buyer,
        // 2·runningTotal from the seller (FigaroCore.commit).
        if (buyerFunding.enabled) {
            _fund(c.buyer, c.token, c.payment * 2, commitmentHash, BUYER_ROLE, buyerFunding);
        }
        if (sellerFunding.enabled) {
            _fund(c.seller, c.token, c.runningTotal * 2, commitmentHash, SELLER_ROLE, sellerFunding);
        }

        (processId, orderHash) = figaroCore.commit(c, buyerSig, sellerSig);
    }

    function _fund(
        address party,
        address bondCurrency,
        uint256 bondAmount,
        bytes32 commitmentHash,
        uint8 role,
        SwapFunding calldata f
    ) internal {
        // 1. Pull the party's input token via their Permit2 WITNESS signature.
        //    The witness binds {router, inputToken, maxInput, keccak256(swapData),
        //    commitmentHash, role} into the digest the party signed, so a
        //    relayer cannot substitute a different route, and no caller can
        //    spend the leg on another commitment or in the other role: Permit2
        //    recomputes the digest from the witness we pass and reverts if it
        //    does not recover `party`.
        bytes32 witness = swapWitness(f.inputToken, f.maxInput, f.swapData, commitmentHash, role);
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
        //    to the party so FigaroCore pulls the bond and any slippage residual
        //    stays with the party.
        uint256 received = IERC20(bondCurrency).balanceOf(address(this)) - bondBefore;
        if (received < bondAmount) revert OutputBelowBond(received, bondAmount);
        IERC20(bondCurrency).safeTransfer(party, received);

        // 4. Refund any input the swap did not consume.
        uint256 inputResidual = IERC20(f.inputToken).balanceOf(address(this));
        if (inputResidual != 0) IERC20(f.inputToken).safeTransfer(party, inputResidual);
    }
}
