// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IBalanceOf {
    function balanceOf(address who) external view returns (uint256);
}

/// @title MockERC1271Wallet — account code that validates the digests it was told to (Foundry tests only)
/// @notice Stands in for code a buyer's EOA carries through an EIP-7702
///         delegation installed while it held its key, carrying the wallet's
///         own guardian authorization, whose `isValidSignature` (ERC-1271)
///         answers for the account after the key is lost. A test etches this
///         code at a buyer's address and approves the (digest, bytes) pairs
///         the account's arrangement would validate; every other pair is
///         refused with a value that is not the magic value. A test may also
///         make the answer depend on the account's own balance of one token
///         (`setBalanceCeiling`): yes only while the balance is at most the
///         ceiling, which tells a question asked before the batch's payouts
///         from one asked after them. NEVER deploy this on a real network:
///         anyone can approve.
contract MockERC1271Wallet {
    /// @dev ERC-1271's magic value, `isValidSignature.selector`.
    bytes4 internal constant MAGIC_VALUE = 0x1626ba7e;

    /// @notice digest => keccak256(signature bytes) => validated.
    mapping(bytes32 => mapping(bytes32 => bool)) public approved;

    /// @notice The token whose balance the answer depends on; zero for none.
    address public ceilingToken;
    /// @notice The most of `ceilingToken` this account may hold and still answer yes.
    uint256 public balanceCeiling;

    /// @notice Validate `signature` for `digest` from now on.
    function approve(bytes32 digest, bytes calldata signature) external {
        approved[digest][keccak256(signature)] = true;
    }

    /// @notice Answer yes only while this account holds at most `ceiling` of `token`.
    function setBalanceCeiling(address token, uint256 ceiling) external {
        ceilingToken = token;
        balanceCeiling = ceiling;
    }

    /// @notice ERC-1271: the magic value for an approved pair within the
    ///         balance ceiling, `0xffffffff` for any other.
    function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4) {
        if (ceilingToken != address(0) && IBalanceOf(ceilingToken).balanceOf(address(this)) > balanceCeiling) {
            return bytes4(0xffffffff);
        }
        return approved[digest][keccak256(signature)] ? MAGIC_VALUE : bytes4(0xffffffff);
    }
}
