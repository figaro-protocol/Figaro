// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Vm} from "forge-std/Vm.sol";
import {CommitmentTypes} from "src/core/kernel/CommitmentTypes.sol";

/// @notice The domain a signing test reads from the contract it signs for.
///         `FigaroCore` exposes `DOMAIN_SEPARATOR()`; the batch verifier and
///         every other OpenZeppelin `EIP712` contract expose `eip712Domain()`.
interface IEip712Domain {
    function eip712Domain()
        external
        view
        returns (
            bytes1 fields,
            string memory name,
            string memory version,
            uint256 chainId,
            address verifyingContract,
            bytes32 salt,
            uint256[] memory extensions
        );
}

interface IDomainSeparator {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

/// @notice The one home of the tests' EIP-712 signing. Every domain separator
///         is read from the contract the signature is for, never written out
///         here: a test that wrote the formula would agree with itself when
///         the contract's domain drifted. The written-out formula lives in one
///         test only, `Eip712ParityTest`, which pins it.
library SigningTestHelper {
    using CommitmentTypes for CommitmentTypes.Commitment;

    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    /// @dev The digest EIP-712 signs: `0x1901 ‖ domain ‖ structHash`.
    function typedDataHash(bytes32 domainSeparator, bytes32 structHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    /// @dev A 65-byte `r ‖ s ‖ v` signature of `digest` by `key`.
    function sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = VM.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev A commitment signed under `domainSeparator`.
    function signCommitment(bytes32 domainSeparator, CommitmentTypes.Commitment memory c, uint256 key)
        internal
        pure
        returns (bytes memory)
    {
        return sign(key, typedDataHash(domainSeparator, c.hashStruct()));
    }

    /// @dev A commitment signed under the domain `target` itself reports
    ///      through `DOMAIN_SEPARATOR()` (`FigaroCore`, the coordinator's core).
    function signCommitment(address target, CommitmentTypes.Commitment memory c, uint256 key)
        internal
        view
        returns (bytes memory)
    {
        return signCommitment(IDomainSeparator(target).DOMAIN_SEPARATOR(), c, key);
    }

    /// @dev The domain separator of an OpenZeppelin `EIP712` contract that has
    ///      no `DOMAIN_SEPARATOR()` (the batch verifier), built from the name,
    ///      version, chain id and address the contract reports in
    ///      `eip712Domain()` (ERC-5267), so every value is the contract's.
    function domainOf(address target) internal view returns (bytes32) {
        (, string memory name, string memory version, uint256 chainId, address verifyingContract,,) =
            IEip712Domain(target).eip712Domain();
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH, keccak256(bytes(name)), keccak256(bytes(version)), chainId, verifyingContract
            )
        );
    }

    /// @dev The operation stream's 252-byte commitment
    ///      (`prover/lib/src/operation_stream.rs`).
    function packCommitment(CommitmentTypes.Commitment memory c) internal pure returns (bytes memory) {
        return abi.encodePacked(
            c.processId, c.buyer, c.seller, c.token, c.payment, c.runningTotal, c.checkoutHash, c.salt, c.commitDeadline
        );
    }
}
