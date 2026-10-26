// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {FigaroBatchVerifierTest} from "test/core/verifier/FigaroBatchVerifierTest.t.sol";
import "src/core/verifier/FigaroBatchVerifier.sol";
import {IUsageCounter} from "src/core/verifier/FigaroBatchVerifier.sol";

/// @title Batch gas ceiling anchors — the empirical per-item cost of `settleBatch`
/// @notice What a batch costs the chain is what it PUBLISHES — the net positions
///         it transfers, the attestation events it re-emits, the spec bindings it
///         anchors and the usage accruals it writes — not the number of
///         operations it proves. The relay bounds a batch by this cost against the
///         live block gas limit (`prover/sequencer/src/gas.rs`); the constants
///         below are the execution marginals it carries, measured here with the
///         callee's own gas (`vm.lastCallGas`), so calldata and the transaction's
///         base cost are excluded — the relay computes those exactly from the
///         calldata it encodes — and so is the proof's verification, which the
///         mock verifier does not perform: that figure is read from live receipts
///         of real proofs (the Rust module's `SETTLE_PROOF_VERIFY_GAS`).
///
///         `scripts/lint-chain-gas.sh` asserts the Rust copy matches these.
contract BatchGasCeilingTest is FigaroBatchVerifierTest {
    // ── Anchor constants (mirror prover/sequencer/src/gas.rs) ─────────
    // Each is a CEILING on the cold execution marginal measured below on
    // this pre-fork EVM (`foundry.toml`, cancun; the default profile, whose
    // figures stand a little above the via-IR profile's): a payout position
    // 26,335, a deposit position 10,901, an attestation event 3,925, a spec
    // binding 2,841, an accrual 91,982, a usage seller 3,055, the fixed
    // execution 52,089. The live chain is past Glamsterdam, which reprices
    // state creation (EIP-8037) and refunds (EIP-7778): FigaroCore's
    // resolve measured 29,800 an order on post-fork receipts against 11,960
    // here. So each constant carries an allowance over its measurement —
    // at least twice for the items that write state (the position, the
    // accrual, the fixed execution), at least half again for the event and
    // the two registry reads — and the relay's estimate is a ceiling until
    // a wide batch lands on the live chain and the items are re-measured
    // from its receipt, as the direct path's constants were. The allowance
    // is a judgment, not a measurement: the five Sepolia receipts carry too
    // few items to measure it (see SETTLE_PROOF_VERIFY_GAS). One position
    // constant covers both kinds: a payout to a fresh balance is the dearer,
    // and it assumes a plain ERC-20 — a token whose transfer costs more is
    // the parties' choice, and a batch it over-runs fails at the send.
    uint256 internal constant SETTLE_GAS_PER_POSITION = 60_000;
    uint256 internal constant SETTLE_GAS_PER_ATTESTATION = 6_000;
    uint256 internal constant SETTLE_GAS_PER_SPEC_BINDING = 4_500;
    uint256 internal constant SETTLE_GAS_PER_ACCRUAL = 190_000;
    uint256 internal constant SETTLE_GAS_PER_USAGE_SELLER = 12_000;
    uint256 internal constant SETTLE_FIXED_EXEC_GAS = 105_000;
    /// @dev The operation stream's execution: the calldata copy, the keccak
    ///      over it and the memory it expands into. Linear in the stream's
    ///      32-byte words plus a quadratic memory term — measured 22 a word
    ///      at 256 words, 33 at 1,024, 54 at 2,048 — so the model is
    ///      `words * SETTLE_GAS_PER_STREAM_WORD + words² / SETTLE_STREAM_QUADRATIC_DIVISOR`,
    ///      each part a ceiling over its measurement (17.4 linear, 1/56
    ///      quadratic, fitted). The calldata's own per-byte charge is
    ///      intrinsic and planned apart.
    uint256 internal constant SETTLE_GAS_PER_STREAM_WORD = 24;
    uint256 internal constant SETTLE_STREAM_QUADRATIC_DIVISOR = 48;
    /// @dev The proof's verification, which the mock verifier does not
    ///      perform: read from the five Groth16 batches settled on Sepolia.
    ///      Receipt gas less the calldata's intrinsic cost and the items
    ///      above at their pre-fork measured means leaves a residual between
    ///      156,102 and 270,244 on every batch but a verifier's first, whose
    ///      one-time cold writes add about 200,000 more; the residual holds
    ///      the verification AND the items' post-fork premium, which the
    ///      receipts cannot separate. The ceiling covers the residual; the
    ///      block's headroom covers the first batch.
    uint256 internal constant SETTLE_PROOF_VERIFY_GAS = 300_000;

    bytes32 internal nextRoot = keccak256("gas-root-0");

    function _advanceRoot() internal returns (bytes32 prev, bytes32 next) {
        prev = verifier.stateRoot();
        nextRoot = keccak256(abi.encode(nextRoot));
        next = nextRoot;
    }

    /// @dev Settle a batch of exactly these items and return the callee's execution gas.
    function _settleExecGas(
        FigaroBatchVerifier.NetPosition[] memory positions,
        FigaroBatchVerifier.BatchEventData memory events,
        FigaroBatchVerifier.BatchUsageData memory usage,
        bytes memory stream
    ) internal returns (uint256) {
        (bytes32 prev, bytes32 next) = _advanceRoot();
        bytes memory pv = abi.encode(
            prev,
            next,
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            _hashUsage(usage),
            uint64(block.timestamp),
            keccak256(stream)
        );
        // On chain a settle is its own transaction: every entry it touches is
        // cold. The test's setup and item construction warmed them.
        vm.cool(address(verifier));
        vm.cool(address(sp1));
        vm.cool(address(token));
        vm.cool(address(registry));
        vm.cool(address(counter));
        vm.cool(address(members));
        verifier.settleBatch(hex"", pv, positions, events, usage, stream);
        return vm.lastCallGas().gasTotalUsed;
    }

    function _settleExecGas(
        FigaroBatchVerifier.NetPosition[] memory positions,
        FigaroBatchVerifier.BatchEventData memory events,
        FigaroBatchVerifier.BatchUsageData memory usage
    ) internal returns (uint256) {
        return _settleExecGas(positions, events, usage, hex"");
    }

    function _noEvents() internal pure returns (FigaroBatchVerifier.BatchEventData memory) {
        return FigaroBatchVerifier.BatchEventData(
            new FigaroBatchVerifier.AttestationData[](0), new FigaroBatchVerifier.SpecBinding[](0)
        );
    }

    function _payouts(uint256 n, uint256 seed) internal view returns (FigaroBatchVerifier.NetPosition[] memory ps) {
        ps = new FigaroBatchVerifier.NetPosition[](n);
        for (uint256 i = 0; i < n; i++) {
            ps[i] = FigaroBatchVerifier.NetPosition(address(token), address(uint160(seed + i)), 0, 1 ether);
        }
    }

    function _deposits(uint256 n, uint256 seed) internal returns (FigaroBatchVerifier.NetPosition[] memory ps) {
        ps = new FigaroBatchVerifier.NetPosition[](n);
        for (uint256 i = 0; i < n; i++) {
            address user = address(uint160(seed + i));
            token.mint(user, 10 ether);
            vm.prank(user);
            token.approve(address(verifier), type(uint256).max);
            ps[i] = FigaroBatchVerifier.NetPosition(address(token), user, 1 ether, 0);
        }
    }

    function _attestations(uint256 n, uint256 seed)
        internal
        view
        returns (FigaroBatchVerifier.BatchEventData memory ev)
    {
        ev.attestations = new FigaroBatchVerifier.AttestationData[](n);
        ev.specBindings = new FigaroBatchVerifier.SpecBinding[](0);
        for (uint256 i = 0; i < n; i++) {
            ev.attestations[i] = FigaroBatchVerifier.AttestationData(
                keccak256(abi.encode("order", seed, i)),
                keccak256(abi.encode("process", seed, i)),
                seller,
                clauseKey,
                0,
                keccak256(abi.encode("content", seed, i))
            );
        }
    }

    /// @dev `n` bindings of `n` DISTINCT registered clauses — each a cold registry read.
    function _bindings(uint256 n, uint256 seed) internal returns (FigaroBatchVerifier.BatchEventData memory ev) {
        ev.attestations = new FigaroBatchVerifier.AttestationData[](0);
        ev.specBindings = new FigaroBatchVerifier.SpecBinding[](n);
        vm.deal(address(this), n * DEPOSIT);
        for (uint256 i = 0; i < n; i++) {
            // The key is keccak256 of the spec's bytes, so a binding carries it twice.
            bytes32 clauseKey = keccak256(abi.encodePacked("gas-clause-spec-", vm.toString(seed + i)));
            registry.registerClause{value: DEPOSIT}(clauseKey, "ipfs://gas");
            ev.specBindings[i] = FigaroBatchVerifier.SpecBinding(clauseKey, clauseKey);
        }
    }

    /// @dev `n` accruals of `n` DISTINCT keys the counter accepts and writes.
    function _accruals(uint256 n, uint256 seed) internal view returns (FigaroBatchVerifier.BatchUsageData memory u) {
        u.period = counter.currentPeriod();
        u.provenanceLeaf = PROVENANCE_LEAF;
        u.accruals = new IUsageCounter.BatchAccrual[](n);
        for (uint256 i = 0; i < n; i++) {
            u.accruals[i] = IUsageCounter.BatchAccrual(
                keccak256(abi.encode("accrual-key", seed, i)), 0, uint64(i + 1), uint64(i + 1)
            );
        }
        u.sellers = new address[](1);
        u.sellers[0] = seller;
    }

    /// @dev One accrual naming `n` DISTINCT registered sellers — each a call
    ///      into the members registry.
    function _sellers(uint256 n, uint256 seed) internal returns (FigaroBatchVerifier.BatchUsageData memory u) {
        u.period = counter.currentPeriod();
        u.provenanceLeaf = PROVENANCE_LEAF;
        u.accruals = new IUsageCounter.BatchAccrual[](1);
        u.accruals[0] = IUsageCounter.BatchAccrual(keccak256(abi.encode("sellers-key", seed)), 0, 1, 1);
        u.sellers = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            address who = address(uint160(seed + i));
            vm.prank(who);
            members.register("ipfs://gas-seller");
            u.sellers[i] = who;
        }
    }

    // ── The measurements ──────────────────────────────────────────────

    /// @dev The settle call's calldata for an empty batch publishing `stream`.
    function _emptyBatchCalldata(bytes memory stream) internal returns (bytes memory) {
        (bytes32 prev, bytes32 next) = _advanceRoot();
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](0);
        FigaroBatchVerifier.BatchEventData memory events = _noEvents();
        bytes memory pv = abi.encode(
            prev,
            next,
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            _hashUsage(_emptyUsage()),
            uint64(block.timestamp),
            keccak256(stream)
        );
        return abi.encodeCall(verifier.settleBatch, (hex"", pv, positions, events, _emptyUsage(), stream));
    }

    /// @dev The stream's execution, measured around a low-level call with the
    ///      calldata built beforehand: the callee's copy, keccak and memory
    ///      for the stream, and nothing of the caller's encoding.
    function _settleCallGas(bytes memory stream) internal returns (uint256) {
        bytes memory data = _emptyBatchCalldata(stream);
        vm.cool(address(verifier));
        vm.cool(address(sp1));
        vm.cool(address(token));
        vm.cool(address(registry));
        vm.cool(address(counter));
        vm.cool(address(members));
        uint256 before = gasleft();
        (bool ok,) = address(verifier).call(data);
        uint256 used = before - gasleft();
        require(ok, "settle reverted");
        return used;
    }

    function _streamOf(uint256 words) internal pure returns (bytes memory stream) {
        stream = new bytes(words * 32);
        for (uint256 i = 0; i < stream.length; i++) {
            stream[i] = 0x01;
        }
    }

    function test_Gas_settleStreamWord() public {
        // The verifier's first settle writes `batchCount` from zero (a dearer
        // store); it is not the stream's cost, so one settle is spent first.
        _settleCallGas(hex"");
        uint256 g0 = _settleCallGas(hex"");
        uint256 g256 = _settleCallGas(_streamOf(256));
        uint256 g1024 = _settleCallGas(_streamOf(1024));
        uint256 g2048 = _settleCallGas(_streamOf(2048));
        emit log_named_uint("settle_call_gas_empty_stream", g0);
        emit log_named_uint("stream_marginal_256_words", (g256 - g0) / 256);
        emit log_named_uint("stream_marginal_1024_words", (g1024 - g0) / 1024);
        emit log_named_uint("stream_marginal_2048_words", (g2048 - g0) / 2048);
        // The linear part, read where the quadratic memory term is still small.
        uint256 marginal = (g256 - g0) / 256;
        emit log_named_uint("settle_gas_per_stream_word", marginal);
        assertGe(marginal, 4, "a stream word dropped unexpectedly (verifier change?)");
        assertLe(marginal, SETTLE_GAS_PER_STREAM_WORD, "a stream word rose past its anchor (re-measure)");
        // The whole model holds where the quadratic term matters.
        for (uint256 k = 0; k < 2; k++) {
            uint256 words = k == 0 ? 1024 : 2048;
            uint256 measured = (k == 0 ? g1024 : g2048) - g0;
            uint256 modeled = words * SETTLE_GAS_PER_STREAM_WORD + words * words / SETTLE_STREAM_QUADRATIC_DIVISOR;
            assertLe(measured, modeled, "the stream's execution rose past the model (re-measure)");
        }
    }

    function test_Gas_settleFixedExecution() public {
        uint256 g = _settleExecGas(new FigaroBatchVerifier.NetPosition[](0), _noEvents(), _emptyUsage());
        emit log_named_uint("settle_fixed_exec_gas", g);
        assertLe(g, SETTLE_FIXED_EXEC_GAS, "the fixed execution cost rose past its anchor (re-measure)");
    }

    function test_Gas_settlePayoutPositionMarginal() public {
        uint256 g20 = _settleExecGas(_payouts(20, 0x10000), _noEvents(), _emptyUsage());
        uint256 g70 = _settleExecGas(_payouts(70, 0x20000), _noEvents(), _emptyUsage());
        uint256 marginal = (g70 - g20) / 50;
        emit log_named_uint("settle_payout_position_marginal", marginal);
        assertGe(marginal, 10_000, "a payout position dropped unexpectedly (verifier change?)");
        assertLe(marginal, SETTLE_GAS_PER_POSITION, "a payout position rose past its anchor (re-measure)");
    }

    function test_Gas_settleDepositPositionMarginal() public {
        uint256 g20 = _settleExecGas(_deposits(20, 0x30000), _noEvents(), _emptyUsage());
        uint256 g70 = _settleExecGas(_deposits(70, 0x40000), _noEvents(), _emptyUsage());
        uint256 marginal = (g70 - g20) / 50;
        emit log_named_uint("settle_deposit_position_marginal", marginal);
        assertGe(marginal, 5_000, "a deposit position dropped unexpectedly (verifier change?)");
        assertLe(marginal, SETTLE_GAS_PER_POSITION, "a deposit position rose past its anchor (re-measure)");
    }

    function test_Gas_settleAttestationMarginal() public {
        uint256 g20 = _settleExecGas(new FigaroBatchVerifier.NetPosition[](0), _attestations(20, 1), _emptyUsage());
        uint256 g70 = _settleExecGas(new FigaroBatchVerifier.NetPosition[](0), _attestations(70, 2), _emptyUsage());
        uint256 marginal = (g70 - g20) / 50;
        emit log_named_uint("settle_attestation_marginal", marginal);
        assertGe(marginal, 1_000, "an attestation event dropped unexpectedly (verifier change?)");
        assertLe(marginal, SETTLE_GAS_PER_ATTESTATION, "an attestation event rose past its anchor (re-measure)");
    }

    function test_Gas_settleSpecBindingMarginal() public {
        uint256 g20 = _settleExecGas(new FigaroBatchVerifier.NetPosition[](0), _bindings(20, 100), _emptyUsage());
        uint256 g70 = _settleExecGas(new FigaroBatchVerifier.NetPosition[](0), _bindings(70, 200), _emptyUsage());
        uint256 marginal = (g70 - g20) / 50;
        emit log_named_uint("settle_spec_binding_marginal", marginal);
        assertGe(marginal, 1_000, "a spec binding dropped unexpectedly (verifier change?)");
        assertLe(marginal, SETTLE_GAS_PER_SPEC_BINDING, "a spec binding rose past its anchor (re-measure)");
    }

    function test_Gas_settleUsageSellerMarginal() public {
        uint256 g20 = _settleExecGas(new FigaroBatchVerifier.NetPosition[](0), _noEvents(), _sellers(20, 0x50000));
        uint256 g70 = _settleExecGas(new FigaroBatchVerifier.NetPosition[](0), _noEvents(), _sellers(70, 0x60000));
        uint256 marginal = (g70 - g20) / 50;
        emit log_named_uint("settle_usage_seller_marginal", marginal);
        assertGe(marginal, 1_000, "a usage seller check dropped unexpectedly (counter change?)");
        assertLe(marginal, SETTLE_GAS_PER_USAGE_SELLER, "a usage seller check rose past its anchor (re-measure)");
    }

    function test_Gas_settleAccrualMarginal() public {
        uint256 g20 = _settleExecGas(new FigaroBatchVerifier.NetPosition[](0), _noEvents(), _accruals(20, 1));
        uint256 g70 = _settleExecGas(new FigaroBatchVerifier.NetPosition[](0), _noEvents(), _accruals(70, 2));
        uint256 marginal = (g70 - g20) / 50;
        emit log_named_uint("settle_accrual_marginal", marginal);
        assertGe(marginal, 10_000, "an accrual dropped unexpectedly (counter change?)");
        assertLe(marginal, SETTLE_GAS_PER_ACCRUAL, "an accrual rose past its anchor (re-measure)");
    }
}
