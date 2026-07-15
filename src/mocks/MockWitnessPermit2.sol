// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title MockWitnessPermit2 — devnet/test mock of Uniswap Permit2's
///        `permitWitnessTransferFrom`, WITH signature verification.
/// @notice Mirrors the MockERC20 mock pattern, but verifies the witness
///         signature — the property the witness coordinator exists for. It
///         reconstructs the exact EIP-712 digest real Permit2 builds for a
///         witness transfer (name-only domain, `PermitWitnessTransferFrom`
///         stub + caller type string, `TokenPermissions` sub-hash,
///         `spender = msg.sender`, witness), recovers the signer, and reverts
///         `InvalidSigner` on mismatch. This is what makes a substituted
///         `swapData` provably impossible: change the route, the witness
///         changes, the recovered signer is not the owner. Token pull is
///         gated on the owner having approved this contract (the standard
///         one-time Permit2 approval). Digest parity with the canonical
///         Permit2 deployment is proven by the mainnet-fork round-trip test,
///         not assumed from this mock.
contract MockWitnessPermit2 {
    error PermitExpired();
    error AmountExceedsPermitted();
    error InvalidSigner();

    bytes32 public immutable DOMAIN_SEPARATOR;

    // Real Permit2's domain has NO version field.
    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
                keccak256("Permit2"),
                block.chainid,
                address(this)
            )
        );
    }

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

    bytes32 internal constant TOKEN_PERMISSIONS_TYPEHASH = keccak256("TokenPermissions(address token,uint256 amount)");
    string internal constant PERMIT_WITNESS_STUB =
        "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,";

    function permitWitnessTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes32 witness,
        string calldata witnessTypeString,
        bytes calldata signature
    ) external {
        if (block.timestamp > permit.deadline) revert PermitExpired();
        if (transferDetails.requestedAmount > permit.permitted.amount) revert AmountExceedsPermitted();

        bytes32 typeHash = keccak256(abi.encodePacked(PERMIT_WITNESS_STUB, witnessTypeString));
        bytes32 tokenPermissionsHash =
            keccak256(abi.encode(TOKEN_PERMISSIONS_TYPEHASH, permit.permitted.token, permit.permitted.amount));
        bytes32 structHash =
            keccak256(abi.encode(typeHash, tokenPermissionsHash, msg.sender, permit.nonce, permit.deadline, witness));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));

        if (ECDSA.recover(digest, signature) != owner) revert InvalidSigner();

        IERC20(permit.permitted.token).transferFrom(owner, transferDetails.to, transferDetails.requestedAmount);
    }
}
