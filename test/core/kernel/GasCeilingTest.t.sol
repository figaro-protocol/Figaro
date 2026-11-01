// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "src/core/kernel/FigaroCore.sol";
import "src/core/kernel/CommitmentTypes.sol";
import "src/mocks/MockPermitToken.sol";

/// @title GasCeilingTest — resolveProcess per-order gas regression guard
/// @notice The canonical per-order resolve cost (`RESOLVE_GAS_PER_ORDER`) is the
///         ALL-IN figure measured on REAL post-fork Sepolia receipts:
///         `resolveProcess(N)` costs `~73,000 + ~29,800·N` gas. A resolve is its
///         own transaction, so each order's distinct `orderStatus`/balance entries
///         pay COLD access, and the order's calldata is charged at the tx level.
///         This in-process test CANNOT reproduce that all-in number — it commits
///         and resolves in one execution (pre-warming storage) and calldata is
///         not charged inside the measured call. So it instead (a) guards the
///         warm EXECUTION marginal of the resolve loop via `vm.lastCallGas()`
///         against FigaroCore regressions, (b) resolves a process filled to the
///         SDK's published cap and holds it under EIP-7825's 2^24, the memory
///         the loop expands into included, and (c) verifies atomic
///         all-or-nothing resolution. The all-in receipt figures live in chainGasCeilings.ts;
///         `scripts/lint-chain-gas.sh` asserts the constants below are
///         byte-equal to the SDK's.
contract GasCeilingTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore internal core;
    MockPermitToken internal token;

    uint256 internal constant BUYER_KEY = 0xB0B;
    address internal buyer;

    uint256 internal constant PAYMENT = 1 ether;
    uint256 internal constant INITIAL_BALANCE = 1_000_000 ether;

    // ── Per-order gas anchors (mirror frontend/lib/shared/chainGasCeilings.ts) ──
    // Measured on real transaction receipts: resolveProcess(N)
    // = ~73,000 + ~29,800·N (all-in, cold per-tx, measured on live
    // post-Glamsterdam Sepolia receipts — a pre-fork local EVM prices lower);
    // a sub-order commit is ~382k (root ~794k). `scripts/lint-chain-gas.sh`
    // asserts byte-equality with the TS module — if you bump one, bump both.
    uint256 internal constant RESOLVE_GAS_PER_ORDER = 30_000;
    uint256 internal constant COMMIT_GAS_PER_ORDER = 383_000;
    uint256 internal constant RESOLVE_FIXED_OVERHEAD = 73_000;
    // Memory: each order's struct copy (9 words), its abi.encode buffer
    // (11) and its order-hash buffer (3) are never reused, and the EVM
    // charges memory as words²/512, so the resolve's cost carries
    // (23·N)²/512 on top of the receipt line — about 319k at 556 orders,
    // nothing at the N = 1 and N = 2 receipts the line was read from.
    // Measured by test_Gas_resolveAtPublishedCapFitsTransactionCap.
    uint256 internal constant RESOLVE_MEMORY_WORDS_PER_ORDER = 23;
    uint256 internal constant RESOLVE_MEMORY_QUADRATIC_DIVISOR = 512;
    // The chain's cap on one transaction's gas (EIP-7825's 2^24): a
    // resolve is one transaction, so the ceiling is this or the block's
    // budget, whichever is smaller — 546 orders under the cap.
    uint256 internal constant TRANSACTION_GAS_CAP = 16_777_216;

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
            checkoutHash: keccak256(abi.encodePacked("g-root-", keyBase)),
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
                checkoutHash: keccak256(abi.encodePacked("g-sub-", keyBase, i)),
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

    /// @notice Catches FigaroCore changes to the per-order resolve loop. The warm
    ///         in-test execution marginal is ~11,960/order (lower than the cold
    ///         all-in RESOLVE_GAS_PER_ORDER because storage is pre-warmed by the
    ///         commits and calldata is charged at the tx level, not in the call).
    ///         If this band breaks, the resolve loop changed — RE-MEASURE the
    ///         all-in cost on live post-fork receipts and update
    ///         RESOLVE_GAS_PER_ORDER + chainGasCeilings.ts in lockstep.
    function test_Gas_resolveExecutionMarginal() public {
        uint256 g50 = _resolveExecGas(50, 0x510000);
        uint256 g100 = _resolveExecGas(100, 0x520000);
        uint256 marginal = (g100 - g50) / 50;
        emit log_named_uint("resolve_warm_exec_marginal", marginal);

        assertGe(marginal, 9_000, "resolve per-order exec dropped unexpectedly (FigaroCore change?)");
        assertLt(marginal, RESOLVE_GAS_PER_ORDER, "warm exec marginal must stay below the cold all-in anchor");
        assertLe(marginal, 14_000, "resolve per-order exec rose unexpectedly (re-measure receipts)");
    }

    // ── The published cap resolves under the transaction cap ─────────

    /// @dev The SDK's `resolveGasForOrders`: the receipt line plus the
    ///      memory the resolve expands into.
    function _resolveModelGas(uint256 n) internal pure returns (uint256) {
        uint256 words = RESOLVE_MEMORY_WORDS_PER_ORDER * n;
        return RESOLVE_FIXED_OVERHEAD + RESOLVE_GAS_PER_ORDER * n + (words * words) / RESOLVE_MEMORY_QUADRATIC_DIVISOR;
    }

    /// @dev The SDK's `maxOrdersResolvableForGasLimit` under a block large
    ///      enough that the transaction cap binds (the block budget is the
    ///      SDK's own branch and never the binding one at 2^24).
    function _maxOrdersResolvable(uint256 budget) internal pure returns (uint256) {
        if (budget <= RESOLVE_FIXED_OVERHEAD) return 0;
        uint256 n = (budget - RESOLVE_FIXED_OVERHEAD) / RESOLVE_GAS_PER_ORDER;
        while (n > 0 && _resolveModelGas(n) > budget) n--;
        return n;
    }

    /// @dev The transaction's own charge for its calldata: the 21,000 base and
    ///      the greater of the standard token price and EIP-7623's floor.
    function _intrinsicGas(bytes memory data, uint256 execution) internal pure returns (uint256) {
        uint256 zeros;
        for (uint256 i = 0; i < data.length; i++) {
            if (data[i] == 0) zeros++;
        }
        uint256 tokens = zeros + (data.length - zeros) * 4;
        uint256 standard = 21_000 + tokens * 4 + execution;
        uint256 floor = 21_000 + tokens * 10;
        return (standard > floor ? standard : floor) - execution;
    }

    /// @dev Build a process of `n` orders, cool the Core's and the token's
    ///      storage so the resolve pays cold access as its own transaction
    ///      does, resolve it, and return the execution gas plus the
    ///      transaction's intrinsic charge for its calldata.
    function _resolveAllInGas(uint256 n, uint256 keyBase) internal returns (uint256) {
        (bytes32 processId, CommitmentTypes.Commitment[] memory commitments) = _buildProcess(n, keyBase);
        bytes memory data = abi.encodeCall(FigaroCore.resolveProcess, (processId, commitments));
        vm.cool(address(core));
        vm.cool(address(token));
        vm.prank(buyer);
        core.resolveProcess(processId, commitments);
        uint256 execution = vm.lastCallGas().gasTotalUsed;
        return execution + _intrinsicGas(data, execution);
    }

    /// @notice A process filled to the SDK's published cap under EIP-7825's 2^24
    ///         resolves under it. Two readings: (a) the resolve run here, cold,
    ///         with its calldata charged, is under the cap on this EVM; (b) the
    ///         receipt model the SDK publishes, plus the part of the measured
    ///         cost that grows faster than linearly in N (memory expansion: each
    ///         order's struct copy and hashing buffer are never reused, and
    ///         memory gas is quadratic in the words touched), is under the cap
    ///         too. The faster-than-linear part is the excess of the cost at N
    ///         over the line through N = 1 and N = 2, the two points the receipt
    ///         anchors were read from.
    function test_Gas_resolveAtPublishedCapFitsTransactionCap() public {
        uint256 n = _maxOrdersResolvable(TRANSACTION_GAS_CAP);
        uint256 g1 = _resolveAllInGas(1, 0x610000);
        uint256 g2 = _resolveAllInGas(2, 0x620000);
        uint256 gn = _resolveAllInGas(n, 0x630000);
        uint256 line = g1 + (g2 - g1) * (n - 1);
        uint256 superlinear = gn > line ? gn - line : 0;
        uint256 modeled = RESOLVE_FIXED_OVERHEAD + RESOLVE_GAS_PER_ORDER * n + superlinear;

        emit log_named_uint("resolve_cap_orders", n);
        emit log_named_uint("resolve_all_in_gas_at_cap_local", gn);
        emit log_named_uint("resolve_local_marginal_1_to_2", g2 - g1);
        emit log_named_uint("resolve_superlinear_gas_at_cap", superlinear);
        emit log_named_uint("resolve_modeled_receipt_gas_at_cap", modeled);

        assertLe(gn, TRANSACTION_GAS_CAP, "a process at the published cap does not resolve under 2^24 here");
        assertLe(modeled, TRANSACTION_GAS_CAP, "the receipt model plus the measured memory growth exceeds 2^24");
        // The SDK's model bounds the receipt line plus the measured growth,
        // so the cap it publishes is the cap this run resolves.
        assertGe(_resolveModelGas(n), modeled, "the SDK's resolve model is under the measured cost at its own cap");
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
