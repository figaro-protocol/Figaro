// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "src/core/kernel/FigaroCore.sol";
import "src/core/kernel/CommitmentTypes.sol";
import {MockERC20} from "src/mocks/MockERC20.sol";
import {SigningTestHelper} from "test/helpers/SigningTestHelper.sol";

/// @title Eip712ParityTest — the SDK↔FigaroCore EIP-712 lock, UNCONDITIONAL
/// @notice Reads `test/fixtures/eip712-vectors.json` (frozen by the SDK's
///         `eip712Parity.test.ts`) and asserts FigaroCore reproduces
///         every EIP-712 hash the SDK computed. If the SDK and FigaroCore ever
///         disagree by a byte, every signature fails on-chain — this test makes
///         that agreement a CI gate with no chain, no skipIf, no round-trip.
///
///         The closure of the cross-language loop:
///           - `hashStruct` is FigaroCore's OWN pure struct-hash — asserted
///             directly against the SDK's `hashCommitmentStruct` vector.
///           - the process id and order hash are what a real FigaroCore,
///             deployed at the fixture's chain id and address, RETURNS from
///             `commit` for the SDK's commitment signed by its parties.
///           - the domain separator is checked BOTH ways: the SDK's pinned
///             vector matches the EIP-712 formula in Solidity, AND a live
///             FigaroCore's `DOMAIN_SEPARATOR()` matches that same formula for
///             its own (chainid, address) — so SDK == formula == FigaroCore.
contract Eip712ParityTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;
    using stdStorage for StdStorage;

    string internal json;
    uint64 internal fixtureChainId;
    address internal fixtureVerifyingContract;

    function setUp() public {
        json = vm.readFile("test/fixtures/eip712-vectors.json");
        fixtureChainId = uint64(vm.parseJsonUint(json, ".chainId"));
        fixtureVerifyingContract = vm.parseJsonAddress(json, ".verifyingContract");
    }

    /// @dev The EIP-712 domain separator the way FigaroCore's OZ `EIP712`
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
        c.token = vm.parseJsonAddress(json, string.concat(base, ".token"));
        c.payment = vm.parseJsonUint(json, string.concat(base, ".payment"));
        c.runningTotal = vm.parseJsonUint(json, string.concat(base, ".runningTotal"));
        c.checkoutHash = vm.parseJsonBytes32(json, string.concat(base, ".checkoutHash"));
        c.salt = vm.parseJsonUint(json, string.concat(base, ".salt"));
        c.commitDeadline = vm.parseJsonUint(json, string.concat(base, ".commitDeadline"));
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
        // same formula the SDK vector was built from, for FigaroCore's own
        // (chainid, address). Transitively, SDK == FigaroCore.
        vm.chainId(fixtureChainId);
        FigaroCore core = new FigaroCore();
        assertEq(
            core.DOMAIN_SEPARATOR(),
            _domainSeparator(fixtureChainId, address(core)),
            "FigaroCore DOMAIN_SEPARATOR() diverges from the EIP-712 formula"
        );
    }

    // ── Per-vector: the ids a real FigaroCore returns for the SDK's commitment ──

    /// @dev The keys behind the SDK vector's parties. The fixture carries the
    ///      addresses only; the keys are the ones those addresses derive from,
    ///      and `_commitVector` checks each derivation before it signs.
    uint256 internal constant BUYER_KEY = 0xB0B;
    uint256 internal constant ROOT_SELLER_KEY = 0x5E11;
    uint256 internal constant SUB_SELLER_KEY = 0x5E12;

    /// A FigaroCore deployed at the fixture's chain id and address, so its
    /// domain is the one the SDK signed under, and the vector's token at its
    /// address. The constructor runs there (`deployCodeTo`), so the Core's
    /// domain is its own.
    function _coreAtTheFixture(address tokenAt) internal returns (FigaroCore core, MockERC20 token) {
        vm.chainId(fixtureChainId);
        deployCodeTo("FigaroCore.sol:FigaroCore", fixtureVerifyingContract);
        core = FigaroCore(fixtureVerifyingContract);
        deployCodeTo("MockERC20.sol:MockERC20", abi.encode("Vector", "VEC"), tokenAt);
        token = MockERC20(tokenAt);
        assertEq(
            core.DOMAIN_SEPARATOR(),
            vm.parseJsonBytes32(json, ".domainSeparator"),
            "the Core at the fixture's address reports the SDK's domain"
        );
    }

    /// Signs the vector's commitment with its parties' keys, commits it through
    /// the real Core, and compares what `commit` RETURNS with the SDK's ids.
    /// Nothing here derives an id: the struct hash is the shipped
    /// `CommitmentTypes.hashStruct`, and the process id and order hash are the
    /// Core's own return values.
    function _commitVector(FigaroCore core, MockERC20 token, string memory base, uint256 sellerKey) internal {
        CommitmentTypes.Commitment memory c = _commitmentAt(string.concat(base, ".commitment"));
        assertEq(vm.addr(BUYER_KEY), c.buyer, "the buyer key derives the vector's buyer");
        assertEq(vm.addr(sellerKey), c.seller, "the seller key derives the vector's seller");

        // The shipped struct hash reproduces the SDK's.
        assertEq(c.hashStruct(), vm.parseJsonBytes32(json, string.concat(base, ".structHash")), "structHash");

        token.mint(c.buyer, 2 * c.payment);
        token.mint(c.seller, 2 * c.runningTotal);
        vm.prank(c.buyer);
        token.approve(address(core), type(uint256).max);
        vm.prank(c.seller);
        token.approve(address(core), type(uint256).max);
        vm.warp(c.commitDeadline);

        (bytes32 processId, bytes32 orderHash) = core.commit(
            c,
            SigningTestHelper.signCommitment(address(core), c, BUYER_KEY),
            SigningTestHelper.signCommitment(address(core), c, sellerKey)
        );
        assertEq(processId, vm.parseJsonBytes32(json, string.concat(base, ".processId")), "processId");
        assertEq(orderHash, vm.parseJsonBytes32(json, string.concat(base, ".orderHash")), "orderHash");
        assertEq(core.orderStatus(orderHash), 1, "the Core holds the order as committed");
    }

    function test_rootVector_parity() public {
        address tokenAt = vm.parseJsonAddress(json, ".vectors[0].commitment.token");
        (FigaroCore core, MockERC20 token) = _coreAtTheFixture(tokenAt);
        _commitVector(core, token, ".vectors[0]", ROOT_SELLER_KEY);
    }

    /// The SDK's sub vector names a process (`0x218b…`) that no root vector
    /// opens: the SDK picked it as a target, not as a digest. A sub-order
    /// commits only onto an open process, so the test seeds that one process
    /// in the Core's `processes` mapping (its root buyer, its token, a running
    /// total of the sub's total less its payment, one open order) and then
    /// commits the sub through the real Core. The seeded slots are the
    /// fixture's premise; the ids are the Core's.
    function test_subVector_parity() public {
        string memory base = ".vectors[1]";
        CommitmentTypes.Commitment memory c = _commitmentAt(string.concat(base, ".commitment"));
        (FigaroCore core, MockERC20 token) = _coreAtTheFixture(c.token);

        stdstore.target(address(core)).sig(core.processes.selector).with_key(c.processId).depth(0)
            .checked_write(c.buyer);
        stdstore.target(address(core)).sig(core.processes.selector).with_key(c.processId).depth(1)
            .checked_write(c.token);
        stdstore.target(address(core)).sig(core.processes.selector).with_key(c.processId).depth(2)
            .checked_write(c.runningTotal - c.payment);
        stdstore.target(address(core)).sig(core.processes.selector).with_key(c.processId).depth(3)
            .checked_write(uint256(1));

        _commitVector(core, token, base, SUB_SELLER_KEY);
        (,, uint256 runningTotal, uint256 active) = core.processes(c.processId);
        assertEq(runningTotal, c.runningTotal, "the Core extended the process to the sub's total");
        assertEq(active, 2, "the process holds two orders");
    }
}
