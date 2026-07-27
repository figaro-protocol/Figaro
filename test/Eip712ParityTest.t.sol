// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/kernel/FigaroCore.sol";
import "../src/kernel/CommitmentTypes.sol";

/// @title Eip712ParityTest — the SDK↔kernel EIP-712 lock, UNCONDITIONAL
/// @notice Reads `test/fixtures/eip712-vectors.json` (frozen by the SDK's
///         `eip712Parity.test.ts`) and asserts the Solidity kernel reproduces
///         every EIP-712 hash the SDK computed. If the SDK and the kernel ever
///         disagree by a byte, every signature fails on-chain — this test makes
///         that agreement a CI gate with no chain, no skipIf, no round-trip.
///
///         The closure of the cross-language loop:
///           - `hashStruct` is the kernel's OWN pure struct-hash — asserted
///             directly against the SDK's `hashCommitmentStruct` vector.
///           - the order-hash derivation mirrors `FigaroCore.sol` exactly.
///           - the domain separator is checked BOTH ways: the SDK's pinned
///             vector matches the EIP-712 formula in Solidity, AND a live
///             FigaroCore's `DOMAIN_SEPARATOR()` matches that same formula for
///             its own (chainid, address) — so SDK == formula == kernel.
contract Eip712ParityTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    string internal json;
    uint64 internal fixtureChainId;
    address internal fixtureVerifyingContract;

    function setUp() public {
        json = vm.readFile("test/fixtures/eip712-vectors.json");
        fixtureChainId = uint64(vm.parseJsonUint(json, ".chainId"));
        fixtureVerifyingContract = vm.parseJsonAddress(json, ".verifyingContract");
    }

    /// @dev The EIP-712 domain separator the way the kernel's OZ `EIP712`
    ///      base computes it: EIP712("FigaroCore", "3").
    function _domainSeparator(uint256 chainId, address verifyingContract) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("FigaroCore"),
                keccak256("3"),
                chainId,
                verifyingContract
            )
        );
    }

    function _commitmentAt(string memory base) internal view returns (CommitmentTypes.Commitment memory c) {
        c.processId = vm.parseJsonBytes32(json, string.concat(base, ".processId"));
        c.buyer = vm.parseJsonAddress(json, string.concat(base, ".buyer"));
        c.seller = vm.parseJsonAddress(json, string.concat(base, ".seller"));
        c.currency = vm.parseJsonAddress(json, string.concat(base, ".currency"));
        c.payment = vm.parseJsonUint(json, string.concat(base, ".payment"));
        c.expectedCumulativeValue = vm.parseJsonUint(json, string.concat(base, ".expectedCumulativeValue"));
        c.agreementHash = vm.parseJsonBytes32(json, string.concat(base, ".agreementHash"));
        c.salt = vm.parseJsonUint(json, string.concat(base, ".salt"));
        c.deadline = vm.parseJsonUint(json, string.concat(base, ".deadline"));
    }

    // ── Domain separator ────────────────────────────────────────────

    function test_domainSeparator_matchesSdkVector() public view {
        bytes32 expected = vm.parseJsonBytes32(json, ".domainSeparator");
        assertEq(
            _domainSeparator(fixtureChainId, fixtureVerifyingContract),
            expected,
            "SDK domain separator diverges from the EIP-712 formula in Solidity"
        );
    }

    function test_kernelDomainSeparator_matchesTheFormula() public {
        // Closes the loop: a live FigaroCore's DOMAIN_SEPARATOR() must equal the
        // same formula the SDK vector was built from, for the kernel's own
        // (chainid, address). Transitively, SDK == kernel.
        vm.chainId(fixtureChainId);
        FigaroCore core = new FigaroCore();
        assertEq(
            core.DOMAIN_SEPARATOR(),
            _domainSeparator(fixtureChainId, address(core)),
            "kernel DOMAIN_SEPARATOR() diverges from the EIP-712 formula"
        );
    }

    // ── Per-vector: struct hash, digest/processId, order hash ────────

    function _assertVector(string memory base) internal view {
        CommitmentTypes.Commitment memory c = _commitmentAt(string.concat(base, ".commitment"));

        // 1. The kernel's OWN pure struct hash reproduces the SDK's.
        bytes32 structHash = c.hashStruct();
        assertEq(structHash, vm.parseJsonBytes32(json, string.concat(base, ".structHash")), "structHash");

        // 2. processId: for a root order it's the EIP-712 digest; for a
        //    sub-order it's the target processId, verbatim — exactly the
        //    kernel's `processId = (c.processId == 0) ? digest : c.processId`.
        bytes32 domainSep = _domainSeparator(fixtureChainId, fixtureVerifyingContract);
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));
        bytes32 processId = c.processId == bytes32(0) ? digest : c.processId;
        assertEq(processId, vm.parseJsonBytes32(json, string.concat(base, ".processId")), "processId");

        // 3. Order hash — mirrors FigaroCore.sol keccak256(processId || structHash).
        bytes32 orderHash = keccak256(abi.encodePacked(processId, structHash));
        assertEq(orderHash, vm.parseJsonBytes32(json, string.concat(base, ".orderHash")), "orderHash");
    }

    function test_rootVector_parity() public view {
        _assertVector(".vectors[0]");
    }

    function test_subVector_parity() public view {
        _assertVector(".vectors[1]");
    }
}
