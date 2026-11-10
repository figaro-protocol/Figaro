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
///         from one asked after them. A test may also make the validation
///         cost a fixed amount of gas before it answers (`setValidationGas`),
///         and change the answer's shape (`setAnswerShape`): a short answer
///         of four bytes, the magic word followed by 64 KiB, or code that
///         burns every unit of gas it is given. NEVER deploy this on a real
///         network: anyone can approve.
contract MockERC1271Wallet {
    /// @dev ERC-1271's magic value, `isValidSignature.selector`.
    bytes4 internal constant MAGIC_VALUE = 0x1626ba7e;

    /// @notice digest => keccak256(signature bytes) => validated.
    mapping(bytes32 => mapping(bytes32 => bool)) public approved;

    /// @notice The token whose balance the answer depends on; zero for none.
    address public ceilingToken;
    /// @notice The most of `ceilingToken` this account may hold and still answer yes.
    uint256 public balanceCeiling;

    /// @notice Gas the validation spends before it answers.
    uint256 public validationGas;

    /// @notice The answer's shape: 0 one word, 1 four bytes, 2 the word and
    ///         64 KiB after it, 3 no answer (every unit of gas burned).
    uint8 public answerShape;

    /// @notice Validate `signature` for `digest` from now on.
    function approve(bytes32 digest, bytes calldata signature) external {
        approved[digest][keccak256(signature)] = true;
    }

    /// @notice Answer yes only while this account holds at most `ceiling` of `token`.
    function setBalanceCeiling(address token, uint256 ceiling) external {
        ceilingToken = token;
        balanceCeiling = ceiling;
    }

    /// @notice Spend `gasUnits` gas in every validation before answering.
    function setValidationGas(uint256 gasUnits) external {
        validationGas = gasUnits;
    }

    /// @notice Answer in `shape` from now on (see `answerShape`).
    function setAnswerShape(uint8 shape) external {
        answerShape = shape;
    }

    /// @notice ERC-1271: the magic value for an approved pair within the
    ///         balance ceiling, `0xffffffff` for any other, in the set shape.
    function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4) {
        uint256 shape = answerShape;
        if (shape == 3) {
            // Burn every unit: an infinite loop runs out of gas.
            while (true) {
                digest = keccak256(abi.encode(digest));
            }
        }
        uint256 spend = validationGas;
        if (spend != 0) {
            // Given less than it spends, it runs out of gas, as a real
            // validation does; it never answers early.
            uint256 floor = gasleft() > spend ? gasleft() - spend : 0;
            bytes32 h = digest;
            while (gasleft() > floor) {
                h = keccak256(abi.encode(h));
            }
        }
        bytes4 answer = approved[digest][keccak256(signature)] ? MAGIC_VALUE : bytes4(0xffffffff);
        if (ceilingToken != address(0) && IBalanceOf(ceilingToken).balanceOf(address(this)) > balanceCeiling) {
            answer = bytes4(0xffffffff);
        }
        if (shape == 1) {
            assembly {
                mstore(0, answer)
                return(0, 4)
            }
        }
        if (shape == 2) {
            assembly {
                let p := mload(0x40)
                mstore(p, answer)
                return(p, add(32, 65536))
            }
        }
        return answer;
    }
}
