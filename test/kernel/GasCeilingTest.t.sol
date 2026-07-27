// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "src/kernel/FigaroCore.sol";
import "src/kernel/CommitmentTypes.sol";
import "src/mocks/MockPermitToken.sol";

/// @title GasCeilingTest — resolveProcess per-order gas regression guard
/// @notice The canonical per-order resolve cost (`RESOLVE_GAS_PER_ORDER`) is the
///         ALL-IN figure measured on REAL Anvil transaction receipts:
///         `resolveProcess(N)` costs `~38,000 + ~23,000·N` gas. A resolve is its
///         own transaction, so each order's distinct `orderStatus`/balance slots
///         pay COLD access, and the order's calldata is charged at the tx level.
///         This in-process test CANNOT reproduce that all-in number — it commits
///         and resolves in one execution (pre-warming storage) and calldata is
///         not charged inside the measured call. So it instead (a) guards the
///         warm EXECUTION marginal of the resolve loop via `vm.lastCallGas()`
///         against kernel regressions, and (b) verifies atomic all-or-nothing
///         resolution. The all-in receipt figures live in chainGasCeilings.ts;
///         `scripts/lint-chain-gas.sh` asserts the two constants below are
///         byte-equal to the frontend's.
contract GasCeilingTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore internal core;
    MockPermitToken internal token;

    uint256 internal constant BUYER_KEY = 0xB0B;
    address internal buyer;

    uint256 internal constant PAYMENT = 1 ether;
    uint256 internal constant INITIAL_BALANCE = 1_000_000 ether;

    // ── Per-order gas anchors (mirror frontend/lib/shared/chainGasCeilings.ts) ──
    // Measured on real Anvil transaction receipts (2026-06-25): resolveProcess(N)
    // = ~38,000 + ~23,000·N (all-in, cold per-tx); a sub-order commit is ~144k
    // (root ~235k). `scripts/lint-chain-gas.sh` asserts byte-equality with the TS
    // module — if you bump one, bump both.
    uint256 internal constant RESOLVE_GAS_PER_ORDER = 23_000;
    uint256 internal constant COMMIT_GAS_PER_ORDER = 144_000;

    function setUp() public {
        buyer = vm.addr(BUYER_KEY);
        token = new MockPermitToken();
        core = new FigaroCore();

        token.mint(buyer, INITIAL_BALANCE);
        vm.prank(buyer);
        token.approve(address(core), type(uint256).max);
    }

    // ── Helpers ───────────────────────────────────────────────────

    function _typedDataHash(bytes32 structHash) internal view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("FigaroCore"),
                keccak256("3"),
                block.chainid,
                address(core)
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _sign(CommitmentTypes.Commitment memory c, uint256 key) internal view returns (bytes memory) {
        bytes32 digest = _typedDataHash(c.hashStruct());
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Build a fresh, disjoint process of `n` orders (distinct sellers +
    ///      salts keyed off `keyBase` so processIds never collide across calls).
    function _buildProcess(uint256 n, uint256 keyBase)
        internal
        returns (bytes32 processId, CommitmentTypes.Commitment[] memory commitments)
    {
        commitments = new CommitmentTypes.Commitment[](n);

        address rootSeller = vm.addr(keyBase);
        token.mint(rootSeller, INITIAL_BALANCE);
        vm.prank(rootSeller);
        token.approve(address(core), type(uint256).max);

        CommitmentTypes.Commitment memory root = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: rootSeller,
            currency: address(token),
            payment: PAYMENT,
            expectedCumulativeValue: PAYMENT,
            agreementHash: keccak256(abi.encodePacked("g-root-", keyBase)),
            salt: keyBase,
            deadline: block.timestamp + 1 hours
        });
        (processId,) = core.commit(root, _sign(root, BUYER_KEY), _sign(root, keyBase));
        commitments[0] = root;

        uint256 cumulative = PAYMENT;
        for (uint256 i = 1; i < n; i++) {
            uint256 sk = keyBase + i;
            address ss = vm.addr(sk);
            token.mint(ss, INITIAL_BALANCE);
            vm.prank(ss);
            token.approve(address(core), type(uint256).max);
            cumulative += PAYMENT;

            CommitmentTypes.Commitment memory sub = CommitmentTypes.Commitment({
                processId: processId,
                buyer: buyer,
                seller: ss,
                currency: address(token),
                payment: PAYMENT,
                expectedCumulativeValue: cumulative,
                agreementHash: keccak256(abi.encodePacked("g-sub-", keyBase, i)),
                salt: sk,
                deadline: block.timestamp + 1 hours
            });
            core.commit(sub, _sign(sub, BUYER_KEY), _sign(sub, sk));
            commitments[i] = sub;
        }
    }

    /// @dev Build a process of `n` orders and return the EXACT execution gas of
    ///      the `resolveProcess` call (callee perspective) via `vm.lastCallGas()`.
    function _resolveExecGas(uint256 n, uint256 keyBase) internal returns (uint256) {
        (bytes32 processId, CommitmentTypes.Commitment[] memory commitments) = _buildProcess(n, keyBase);
        vm.prank(buyer);
        core.resolveProcess(processId, commitments);
        return vm.lastCallGas().gasTotalUsed;
    }

    // ── Resolve-loop regression guard (warm execution marginal) ──────

    /// @notice Catches kernel changes to the per-order resolve loop. The warm
    ///         in-test execution marginal is ~11,960/order (lower than the cold
    ///         all-in RESOLVE_GAS_PER_ORDER because storage is pre-warmed by the
    ///         commits and calldata is charged at the tx level, not in the call).
    ///         If this band breaks, the resolve loop changed — RE-MEASURE the
    ///         all-in cost on Anvil receipts and update RESOLVE_GAS_PER_ORDER +
    ///         chainGasCeilings.ts in lockstep.
    function test_Gas_resolveExecutionMarginal() public {
        uint256 g50 = _resolveExecGas(50, 0x510000);
        uint256 g100 = _resolveExecGas(100, 0x520000);
        uint256 marginal = (g100 - g50) / 50;
        emit log_named_uint("resolve_warm_exec_marginal", marginal);

        assertGe(marginal, 9_000, "resolve per-order exec dropped unexpectedly (kernel change?)");
        assertLt(marginal, RESOLVE_GAS_PER_ORDER, "warm exec marginal must stay below the cold all-in anchor");
        assertLe(marginal, 14_000, "resolve per-order exec rose unexpectedly (re-measure receipts)");
    }

    // ── Atomic enforcement: partial / empty submission always reverts ──

    function test_AtomicResolution_partialCommitmentListReverts() public {
        uint256 n = 5;
        (bytes32 processId, CommitmentTypes.Commitment[] memory commitments) = _buildProcess(n, 0x5A0000);

        CommitmentTypes.Commitment[] memory subset = new CommitmentTypes.Commitment[](3);
        subset[0] = commitments[0];
        subset[1] = commitments[1];
        subset[2] = commitments[2];

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(FigaroCore.IncompleteOrderList.selector, n, 3));
        core.resolveProcess(processId, subset);
    }

    function test_AtomicResolution_emptyCommitmentListReverts() public {
        uint256 n = 3;
        (bytes32 processId,) = _buildProcess(n, 0x5B0000);

        CommitmentTypes.Commitment[] memory empty = new CommitmentTypes.Commitment[](0);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(FigaroCore.IncompleteOrderList.selector, n, 0));
        core.resolveProcess(processId, empty);
    }
}
