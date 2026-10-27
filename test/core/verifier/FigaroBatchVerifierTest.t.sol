// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {VmSafe} from "forge-std/Vm.sol";
import "src/core/verifier/FigaroBatchVerifier.sol";
import "src/build/registries/ClauseRegistry.sol";
import {MockClauseOrAssemblyStake} from "test/helpers/MockClauseOrAssemblyStake.sol";
import "src/mocks/MockSP1Verifier.sol";
import "src/mocks/MockERC20.sol";
import {MockERC20FeeOnTransfer} from "src/mocks/MockERC20FeeOnTransfer.sol";
import {UsageCounter} from "src/build/rewards/UsageCounter.sol";
import {MembersRegistry} from "src/app/MembersRegistry.sol";
import {FigaroCore} from "src/core/kernel/FigaroCore.sol";
import {MockERC20NoReturn} from "src/mocks/MockERC20NoReturn.sol";
import {MockERC20Blocklist} from "src/mocks/MockERC20Blocklist.sol";
import {AssemblyRegistry} from "src/build/registries/AssemblyRegistry.sol";
import {AgreementRegistry} from "src/build/registries/AgreementRegistry.sol";
import {RpgfMinter} from "src/build/rewards/RpgfMinter.sol";
import {FlorinToken} from "src/build/florin/FlorinToken.sol";

/// @dev Unit tests for the realigned batch verifier: 8-word public values,
///      the spec-binding anchor check against the live ClauseRegistry,
///      net-position reconciliation, and the RPGF usage bridge. Hash packing here mirrors the
///      `figaro-kernel` crate's compute_*_hash functions; the byte-exact cross-language
///      lock is the sequencer batch e2e (a real apply_batch output resolved
///      through this contract).
contract FigaroBatchVerifierTest is Test {
    FigaroBatchVerifier verifier;
    ClauseRegistry registry;
    MockSP1Verifier sp1;
    MockERC20 token;
    /// @dev A REAL counter, not a mock: the verifier→counter call is the
    ///      seam the bridge exists for, and a stub would prove only that the
    ///      verifier can call something.
    UsageCounter counter;
    MembersRegistry members;
    FigaroCore core;

    bytes32 constant PROVENANCE_LEAF = keccak256("figaro-agreement-provenance");
    uint64 constant PERIOD_END = 1_000_000;

    bytes32 constant VKEY = bytes32(uint256(0xF16A20));
    /// @dev The verifier's own genesis root, read after construction: the
    ///      empty state's, never a value handed in.
    bytes32 GENESIS;
    uint256 constant DEPOSIT = 0.001 ether;

    address buyer = address(0xB0B);
    address seller = address(0x5E11);

    // The anchored clause: a spec's pinned bytes, and its key — keccak256 of
    // exactly those bytes. The key IS the spec hash, so a binding the guest
    // commits carries the same word twice.
    bytes constant SPEC_BYTES = bytes('{"clauseId":"figaro-modalities","version":1}');
    bytes32 constant SPEC_HASH = keccak256(SPEC_BYTES);
    bytes32 clauseKey;

    function setUp() public {
        sp1 = new MockSP1Verifier();
        registry = new ClauseRegistry(DEPOSIT);
        core = new FigaroCore();
        members = new MembersRegistry(0, 0);
        vm.prank(seller);
        members.register("ipfs://seller");

        // The counter and verifier reference each other, so the verifier's
        // address is predicted and asserted — the same shape the deploy
        // scripts use, exercised here so a change to that dance breaks a test
        // rather than a deployment.
        uint64[] memory periods = new uint64[](1);
        periods[0] = PERIOD_END;
        MockClauseOrAssemblyStake stakeGate = new MockClauseOrAssemblyStake();
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        counter = new UsageCounter(
            address(core),
            address(members),
            address(stakeGate),
            address(stakeGate),
            address(stakeGate),
            predicted,
            1,
            periods
        );
        verifier = new FigaroBatchVerifier(address(sp1), VKEY, address(registry), address(counter));
        assertEq(address(verifier), predicted, "verifier address prediction");
        GENESIS = verifier.genesisRoot();
        vm.warp(PERIOD_END - 1000);
        token = new MockERC20("Mock", "MOCK");

        clauseKey = SPEC_HASH;
        vm.deal(address(this), 1 ether);
        registry.registerClause{value: DEPOSIT}(clauseKey, "ipfs://spec");

        token.mint(buyer, 1_000 ether);
        token.mint(address(verifier), 1_000 ether); // resolution liquidity for payout legs
        vm.prank(buyer);
        token.approve(address(verifier), type(uint256).max);
    }

    // ── Hash mirrors (Rust compute_*_hash parity packing) ──────────

    function _hashPositions(FigaroBatchVerifier.NetPosition[] memory ps) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint256 i = 0; i < ps.length; i++) {
            packed = bytes.concat(packed, abi.encodePacked(ps[i].token, ps[i].user, ps[i].deposit, ps[i].payout));
        }
        return keccak256(packed);
    }

    function _hashAttestations(FigaroBatchVerifier.AttestationData[] memory atts) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint256 i = 0; i < atts.length; i++) {
            packed = bytes.concat(
                packed,
                abi.encodePacked(
                    atts[i].orderHash,
                    atts[i].processId,
                    atts[i].attester,
                    atts[i].clauseId,
                    atts[i].stage,
                    atts[i].contentRef
                )
            );
        }
        return keccak256(packed);
    }

    function _hashBindings(FigaroBatchVerifier.SpecBinding[] memory bs) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint256 i = 0; i < bs.length; i++) {
            packed = bytes.concat(packed, abi.encodePacked(bs[i].clauseId, bs[i].specHash));
        }
        return keccak256(packed);
    }

    /// @dev Independent re-implementation of the packing — deliberately built
    ///      from `abi.encodePacked` rather than the contract's assembly, so a
    ///      slip in the hand-rolled version (a wrong offset, a missing length
    ///      prefix) shows up as a mismatch instead of being mirrored.
    function _hashUsage(FigaroBatchVerifier.BatchUsageData memory u) internal pure returns (bytes32) {
        bytes memory packed = abi.encodePacked(u.period, u.provenanceLeaf, uint64(u.accruals.length));
        for (uint256 i = 0; i < u.accruals.length; i++) {
            packed = bytes.concat(
                packed,
                abi.encodePacked(u.accruals[i].clauseOrAssembly, u.accruals[i].kind, u.accruals[i].c, u.accruals[i].d)
            );
        }
        packed = bytes.concat(packed, abi.encodePacked(uint64(u.sellers.length)));
        for (uint256 i = 0; i < u.sellers.length; i++) {
            packed = bytes.concat(packed, abi.encodePacked(u.sellers[i]));
        }
        return keccak256(packed);
    }

    function _emptyUsage() internal pure returns (FigaroBatchVerifier.BatchUsageData memory u) {
        u.accruals = new IUsageCounter.BatchAccrual[](0);
        u.sellers = new address[](0);
    }

    function _hashUsageEmpty() internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(uint8(0), bytes32(0), uint64(0), uint64(0)));
    }

    /// @dev A one-clause, one-seller accrual for the open period.
    function _usageFor(bytes32 clauseOrAssembly, uint64 c, uint64 d)
        internal
        view
        returns (FigaroBatchVerifier.BatchUsageData memory u)
    {
        u.period = counter.currentPeriod();
        u.provenanceLeaf = PROVENANCE_LEAF;
        u.accruals = new IUsageCounter.BatchAccrual[](1);
        u.accruals[0] = IUsageCounter.BatchAccrual(clauseOrAssembly, counter.KIND_CLAUSE(), c, d);
        u.sellers = new address[](1);
        u.sellers[0] = seller;
    }

    // ── Batch construction ──────────────────────────────────────────

    function _canonicalBatch()
        internal
        view
        returns (
            bytes memory publicValues,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
            bytes32 newRoot
        )
    {
        positions = new FigaroBatchVerifier.NetPosition[](2);
        // Buyer nets a deposit (owes 200); seller nets a payout (receives 300).
        positions[0] = FigaroBatchVerifier.NetPosition(address(token), buyer, 200 ether, 0);
        positions[1] = FigaroBatchVerifier.NetPosition(address(token), seller, 0, 300 ether);

        FigaroBatchVerifier.AttestationData[] memory atts = new FigaroBatchVerifier.AttestationData[](1);
        atts[0] = FigaroBatchVerifier.AttestationData(
            keccak256("order"), keccak256("process"), seller, clauseKey, 0, keccak256("content")
        );

        FigaroBatchVerifier.SpecBinding[] memory bindings = new FigaroBatchVerifier.SpecBinding[](1);
        bindings[0] = FigaroBatchVerifier.SpecBinding(clauseKey, SPEC_HASH);

        events = FigaroBatchVerifier.BatchEventData(atts, bindings);
        newRoot = keccak256("next-root");

        publicValues = abi.encode(
            GENESIS,
            newRoot,
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            _hashAttestations(atts),
            _hashBindings(bindings),
            _hashUsageEmpty(),
            uint64(block.timestamp),
            keccak256(hex"")
        );
    }

    // ── Happy path ──────────────────────────────────────────────────

    function test_settleBatch_advancesRoot_reconciles_and_emits() public {
        (
            bytes memory pv,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
            bytes32 newRoot
        ) = _canonicalBatch();

        uint256 buyerBefore = token.balanceOf(buyer);
        uint256 sellerBefore = token.balanceOf(seller);

        vm.expectEmit(true, true, true, true, address(verifier));
        emit FigaroBatchVerifier.Attestation(
            keccak256("order"), keccak256("process"), seller, clauseKey, 0, keccak256("content")
        );
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");

        assertEq(verifier.stateRoot(), newRoot, "root advances");
        assertEq(verifier.batchCount(), 1);
        // Value legs from the chain: buyer pulled 200, seller pushed 300.
        assertEq(buyerBefore - token.balanceOf(buyer), 200 ether, "buyer net deposit");
        assertEq(token.balanceOf(seller) - sellerBefore, 300 ether, "seller net payout");
    }

    function test_settleBatch_rejectsABlockTimestampOutOfRange() public {
        (
            ,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
            bytes32 newRoot
        ) = _canonicalBatch();

        // A future clock: the guest could otherwise claim any time, and the
        // deadline gate it runs against that clock would be a fiction.
        uint64 future = uint64(block.timestamp + 1);
        bytes memory pvFuture = abi.encode(
            GENESIS,
            newRoot,
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            _hashUsageEmpty(),
            future,
            keccak256(hex"")
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                FigaroBatchVerifier.BatchTimestampOutOfRange.selector, future, uint64(block.timestamp)
            )
        );
        verifier.settleBatch(hex"", pvFuture, positions, events, _emptyUsage(), hex"");

        // A stale clock older than MAX_BATCH_STALENESS: this is the attack — a
        // caller of the permissionless settleBatch picking an arbitrary past
        // time to bond a signed commitment whose deadline has long expired.
        uint64 stale = uint64(block.timestamp) - verifier.MAX_BATCH_STALENESS() - 1;
        bytes memory pvStale = abi.encode(
            GENESIS,
            newRoot,
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            _hashUsageEmpty(),
            stale,
            keccak256(hex"")
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                FigaroBatchVerifier.BatchTimestampOutOfRange.selector, stale, uint64(block.timestamp)
            )
        );
        verifier.settleBatch(hex"", pvStale, positions, events, _emptyUsage(), hex"");
    }

    // ── The open-world anchor gate ──────────────────────────────────

    function test_settleBatch_revertsOnSpecBindingMismatch() public {
        (
            ,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
            bytes32 newRoot
        ) = _canonicalBatch();

        // The proof validated content against some other document's bytes
        // while naming the registered key: the binding's two words differ.
        bytes32 wrongSpecHash = keccak256("a permissive substitute spec");
        events.specBindings[0] = FigaroBatchVerifier.SpecBinding(clauseKey, wrongSpecHash);
        bytes memory pv = abi.encode(
            GENESIS,
            newRoot,
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            _hashUsageEmpty(),
            uint64(block.timestamp),
            keccak256(hex"")
        );

        vm.expectRevert(
            abi.encodeWithSelector(FigaroBatchVerifier.SpecBindingMismatch.selector, clauseKey, wrongSpecHash)
        );
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");
    }

    function test_settleBatch_revertsOnUnregisteredClauseBinding() public {
        (
            ,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
            bytes32 newRoot
        ) = _canonicalBatch();

        // A spec whose key the registry never registered: the binding is
        // well-formed (specHash == clauseId) and still refused, because
        // nothing anchors those bytes.
        bytes32 strangerKey = keccak256(bytes('{"clauseId":"figaro-never-registered","version":1}'));
        events.specBindings[0] = FigaroBatchVerifier.SpecBinding(strangerKey, strangerKey);
        bytes memory pv = abi.encode(
            GENESIS,
            newRoot,
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            _hashUsageEmpty(),
            uint64(block.timestamp),
            keccak256(hex"")
        );

        vm.expectRevert(abi.encodeWithSelector(FigaroBatchVerifier.ClauseNotRegistered.selector, strangerKey));
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");
    }

    function test_permissionless_newClause_settlesWithZeroVerifierChanges() public {
        // Open-world by construction: anchor a never-seen clause on the
        // registry and a batch validated against it resolves — no verifier
        // redeploy, no code change anywhere.
        bytes32 novelKey = keccak256(bytes('{"clauseId":"acme-cold-brew-terms","version":1}'));
        registry.registerClause{value: DEPOSIT}(novelKey, "ipfs://acme");

        (
            ,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
            bytes32 newRoot
        ) = _canonicalBatch();
        events.specBindings[0] = FigaroBatchVerifier.SpecBinding(novelKey, novelKey);
        events.attestations[0].clauseId = novelKey;
        bytes memory pv = abi.encode(
            GENESIS,
            newRoot,
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            _hashUsageEmpty(),
            uint64(block.timestamp),
            keccak256(hex"")
        );

        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");
        assertEq(verifier.stateRoot(), newRoot);
    }

    /// A hash-only batched attestation commits no spec binding: the batch
    /// carries the attestation and an empty binding list, and the verifier
    /// settles it and re-emits the event, as the coordinator accepts an
    /// attestation without consulting ClauseRegistry. The clause key here is
    /// one nobody registered.
    function test_settleBatch_settlesAnAttestationWithNoSpecBinding() public {
        bytes32 unregisteredKey = keccak256(bytes('{"clauseId":"nobody-registered-this","version":1}'));
        assertFalse(registry.registered(unregisteredKey));

        (
            ,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
            bytes32 newRoot
        ) = _canonicalBatch();
        events.attestations[0].clauseId = unregisteredKey;
        events.specBindings = new FigaroBatchVerifier.SpecBinding[](0);
        bytes memory pv = abi.encode(
            GENESIS,
            newRoot,
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            _hashUsageEmpty(),
            uint64(block.timestamp),
            keccak256(hex"")
        );

        vm.expectEmit(true, true, true, true, address(verifier));
        emit FigaroBatchVerifier.Attestation(
            keccak256("order"), keccak256("process"), seller, unregisteredKey, 0, keccak256("content")
        );
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");
        assertEq(verifier.stateRoot(), newRoot);
    }

    // ── Continuity + binding-integrity reverts ──────────────────────

    function test_settleBatch_revertsOnStaleRoot() public {
        (
            bytes memory pv,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
        ) = _canonicalBatch();
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");

        // Replaying the same batch: prevRoot no longer matches.
        vm.expectRevert(
            abi.encodeWithSelector(FigaroBatchVerifier.StateRootMismatch.selector, verifier.stateRoot(), GENESIS)
        );
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");
    }

    function test_settleBatch_revertsOnChainIdMismatch() public {
        (
            ,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
            bytes32 newRoot
        ) = _canonicalBatch();
        bytes memory pv = abi.encode(
            GENESIS,
            newRoot,
            uint64(999),
            address(verifier),
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            _hashUsageEmpty(),
            uint64(block.timestamp),
            keccak256(hex"")
        );
        vm.expectRevert(
            abi.encodeWithSelector(FigaroBatchVerifier.ChainIdMismatch.selector, uint64(block.chainid), uint64(999))
        );
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");
    }

    function test_settleBatch_revertsOnTamperedPositions() public {
        (
            bytes memory pv,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
        ) = _canonicalBatch();
        positions[1].payout = 999 ether; // calldata no longer matches the proven hash
        vm.expectRevert(FigaroBatchVerifier.PositionHashMismatch.selector);
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");
    }

    function test_settleBatch_revertsOnTamperedAttestations() public {
        (
            bytes memory pv,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
        ) = _canonicalBatch();
        events.attestations[0].contentRef = keccak256("forged");
        vm.expectRevert(FigaroBatchVerifier.AttestationHashMismatch.selector);
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");
    }

    function test_settleBatch_revertsOnTamperedBindings() public {
        (
            bytes memory pv,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
        ) = _canonicalBatch();
        // Same clause key, different spec hash than the proof committed —
        // dies at the hash check BEFORE the registry anchor check.
        events.specBindings[0].specHash = keccak256("not what the proof said");
        vm.expectRevert(FigaroBatchVerifier.SpecBindingsHashMismatch.selector);
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");
    }

    // ── Construction guards ─────────────────────────────────────────

    function test_constructor_guards() public {
        vm.expectRevert(FigaroBatchVerifier.ZeroVerifier.selector);
        new FigaroBatchVerifier(address(0), VKEY, address(registry), address(counter));

        vm.expectRevert(FigaroBatchVerifier.VerifierNotContract.selector);
        new FigaroBatchVerifier(address(0xDEAD), VKEY, address(registry), address(counter));

        vm.expectRevert(FigaroBatchVerifier.ZeroClauseRegistry.selector);
        new FigaroBatchVerifier(address(sp1), VKEY, address(0), address(counter));

        vm.expectRevert(FigaroBatchVerifier.ZeroUsageCounter.selector);
        new FigaroBatchVerifier(address(sp1), VKEY, address(registry), address(0));
    }

    function test_constructor_setsImmutablesAndGenesis() public view {
        assertEq(address(verifier.verifier()), address(sp1));
        assertEq(verifier.programVKey(), VKEY);
        assertEq(address(verifier.clauseRegistry()), address(registry));
        assertEq(verifier.stateRoot(), verifier.genesisRoot(), "the root starts at the empty state's");
        assertEq(verifier.verifierHash(), keccak256("MockSP1Verifier"), "the bound verifier's circuit is named");
        assertEq(verifier.batchCount(), 0);
    }

    // ── Empty batch: keccak("") channels + BatchSettled emission ────

    function test_settleBatch_emptyBatch_emitsBatchSettled() public {
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](0);
        FigaroBatchVerifier.BatchEventData memory events = FigaroBatchVerifier.BatchEventData(
            new FigaroBatchVerifier.AttestationData[](0), new FigaroBatchVerifier.SpecBinding[](0)
        );
        bytes32 newRoot = keccak256("empty-batch-root");
        // Empty arrays must hash to keccak256("") on all three channels.
        bytes memory pv = abi.encode(
            GENESIS,
            newRoot,
            uint64(block.chainid),
            address(verifier),
            keccak256(""),
            keccak256(""),
            keccak256(""),
            _hashUsageEmpty(),
            uint64(block.timestamp),
            keccak256(hex"")
        );

        vm.expectEmit(true, true, true, true, address(verifier));
        emit FigaroBatchVerifier.BatchSettled(1, GENESIS, newRoot, 0);
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");

        assertEq(verifier.stateRoot(), newRoot, "root advances on empty batch");
        assertEq(verifier.batchCount(), 1);
    }

    // ── Net-zero position: deposit == payout moves nothing ──────────

    function test_settleBatch_netZeroPosition_movesNoTokens() public {
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](1);
        positions[0] = FigaroBatchVerifier.NetPosition(address(token), buyer, 700 ether, 700 ether);
        FigaroBatchVerifier.BatchEventData memory events = FigaroBatchVerifier.BatchEventData(
            new FigaroBatchVerifier.AttestationData[](0), new FigaroBatchVerifier.SpecBinding[](0)
        );
        bytes memory pv = abi.encode(
            GENESIS,
            keccak256("net-zero-root"),
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            keccak256(""),
            keccak256(""),
            _hashUsageEmpty(),
            uint64(block.timestamp),
            keccak256(hex"")
        );

        uint256 buyerBefore = token.balanceOf(buyer);
        uint256 contractBefore = token.balanceOf(address(verifier));
        vm.recordLogs();
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");
        assertEq(token.balanceOf(buyer), buyerBefore, "deposit == payout must move nothing");
        assertEq(token.balanceOf(address(verifier)), contractBefore, "contract balance untouched");
        // Nothing at all crosses the token — not even a zero-value transfer (a mutant that
        // takes the payout branch on an even position emits one).
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; i++) {
            assertTrue(logs[i].emitter != address(token), "even position must not touch the token");
        }
    }

    // ── The proof check is load-bearing: a rejected proof settles nothing ──

    function test_settleBatch_revertsWhenProofRejected() public {
        (
            bytes memory pv,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
        ) = _canonicalBatch();
        uint256 buyerBefore = token.balanceOf(buyer);

        sp1.setRejectProofs(true);
        vm.expectRevert(MockSP1Verifier.InvalidProof.selector);
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");

        assertEq(verifier.stateRoot(), GENESIS, "root must not advance on a rejected proof");
        assertEq(verifier.batchCount(), 0, "no batch counted");
        assertEq(token.balanceOf(buyer), buyerBefore, "no value leg on a rejected proof");
    }

    // ── The public values are nine words, no more and no fewer ─────

    function test_settleBatch_revertsOnPublicValuesOfAnotherLength() public {
        (
            bytes memory pv,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
        ) = _canonicalBatch();
        assertEq(pv.length, verifier.PUBLIC_VALUES_LENGTH(), "the canonical batch carries ten words");
        uint256 buyerBefore = token.balanceOf(buyer);

        // Nine words — the stream as it was before the operations joined it.
        bytes memory nine = new bytes(288);
        for (uint256 i = 0; i < 288; i++) {
            nine[i] = pv[i];
        }
        bytes memory eleven = bytes.concat(pv, bytes32(uint256(1)));
        bytes memory oneShort = new bytes(319);
        bytes memory oneOver = bytes.concat(pv, bytes1(0));
        bytes[5] memory wrong = [nine, eleven, oneShort, oneOver, bytes("")];

        for (uint256 i = 0; i < wrong.length; i++) {
            vm.expectRevert(
                abi.encodeWithSelector(
                    FigaroBatchVerifier.PublicValuesLengthMismatch.selector, uint256(320), wrong[i].length
                )
            );
            verifier.settleBatch(hex"", wrong[i], positions, events, _emptyUsage(), hex"");
        }

        assertEq(verifier.stateRoot(), GENESIS, "root must not advance");
        assertEq(verifier.batchCount(), 0, "no batch counted");
        assertEq(token.balanceOf(buyer), buyerBefore, "no value leg");
    }

    function test_settleBatch_refusesALengthBeforeItAsksTheVerifier() public {
        // The length is the contract's own check: a verifier that would
        // reject the proof is never reached.
        (, FigaroBatchVerifier.NetPosition[] memory positions, FigaroBatchVerifier.BatchEventData memory events,) =
            _canonicalBatch();
        sp1.setRejectProofs(true);
        vm.expectRevert(
            abi.encodeWithSelector(FigaroBatchVerifier.PublicValuesLengthMismatch.selector, uint256(320), uint256(288))
        );
        verifier.settleBatch(hex"", new bytes(288), positions, events, _emptyUsage(), hex"");
    }

    // ── The operation stream: a batch publishes what it applied ──────────

    /// The public values a batch of `positions` and `events` commits when its
    /// operation stream is `operations`: `_canonicalBatch`'s words with the
    /// tenth the stream's hash.
    function _pvWithOperations(
        FigaroBatchVerifier.NetPosition[] memory positions,
        FigaroBatchVerifier.BatchEventData memory events,
        bytes32 newRoot,
        bytes memory operations
    ) internal view returns (bytes memory) {
        return abi.encode(
            GENESIS,
            newRoot,
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            _hashUsageEmpty(),
            uint64(block.timestamp),
            keccak256(operations)
        );
    }

    function test_settleBatch_refusesOperationsWhoseHashIsNotCommitted() public {
        (
            bytes memory pv,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
        ) = _canonicalBatch();
        // The proof committed the empty stream; the submitter sends another.
        bytes memory other = hex"01deadbeef";
        vm.expectRevert(FigaroBatchVerifier.OperationsHashMismatch.selector);
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), other);
        // And a stream the proof committed cannot be withheld.
        bytes memory committed =
            vm.parseJsonBytes(vm.readFile("test/fixtures/operation-stream-vectors.json"), ".streams[0].stream");
        bytes memory pvCommitted = _pvWithOperations(positions, events, keccak256("next-root"), committed);
        vm.expectRevert(FigaroBatchVerifier.OperationsHashMismatch.selector);
        verifier.settleBatch(hex"", pvCommitted, positions, events, _emptyUsage(), hex"");
        assertEq(verifier.stateRoot(), GENESIS, "root must not advance");
        assertEq(verifier.batchCount(), 0, "no batch counted");
    }

    function test_settleBatch_acceptsTheOperationsTheProofCommitted() public {
        (, FigaroBatchVerifier.NetPosition[] memory positions, FigaroBatchVerifier.BatchEventData memory events,) =
            _canonicalBatch();
        // A stream the guest encoded (the committed vector's first), bound
        // and read for its events; the fixture-driven test checks the events,
        // this one the binding.
        bytes memory operations =
            vm.parseJsonBytes(vm.readFile("test/fixtures/operation-stream-vectors.json"), ".streams[0].stream");
        bytes32 newRoot = keccak256("next-root");
        bytes memory pv = _pvWithOperations(positions, events, newRoot, operations);
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), operations);
        assertEq(verifier.stateRoot(), newRoot, "root advances with the stream published");
        assertEq(verifier.batchCount(), 1);
    }

    // ── Sequential batches: root chains, counter increments, and the
    //    stage-255 boundary packs identically to abi.encodePacked ────

    function test_settleBatch_rootChainsAcrossBatches_andStageBoundaryPacks() public {
        (
            bytes memory pv1,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
            bytes32 root2
        ) = _canonicalBatch();
        verifier.settleBatch(hex"", pv1, positions, events, _emptyUsage(), hex"");

        // Batch 2 chains root2 → root3 and carries a stage-255 attestation:
        // the contract's assembly packing (mstore8 for the uint8) must match
        // this mirror's abi.encodePacked at the boundary or the hash check reverts.
        FigaroBatchVerifier.NetPosition[] memory none = new FigaroBatchVerifier.NetPosition[](0);
        FigaroBatchVerifier.AttestationData[] memory atts = new FigaroBatchVerifier.AttestationData[](1);
        atts[0] = FigaroBatchVerifier.AttestationData(
            keccak256("order-2"), keccak256("process-2"), buyer, clauseKey, 255, keccak256("content-2")
        );
        FigaroBatchVerifier.BatchEventData memory events2 =
            FigaroBatchVerifier.BatchEventData(atts, new FigaroBatchVerifier.SpecBinding[](0));
        bytes32 root3 = keccak256("root-3");
        bytes memory pv2 = abi.encode(
            root2,
            root3,
            uint64(block.chainid),
            address(verifier),
            keccak256(""),
            _hashAttestations(atts),
            keccak256(""),
            _hashUsageEmpty(),
            uint64(block.timestamp),
            keccak256(hex"")
        );

        vm.expectEmit(true, true, true, true, address(verifier));
        emit FigaroBatchVerifier.Attestation(
            keccak256("order-2"), keccak256("process-2"), buyer, clauseKey, 255, keccak256("content-2")
        );
        verifier.settleBatch(hex"", pv2, none, events2, _emptyUsage(), hex"");

        assertEq(verifier.stateRoot(), root3, "root chains across batches");
        assertEq(verifier.batchCount(), 2, "batch counter increments per batch");
    }

    // ── Verifying-contract binding revert ───────────────────────────

    function test_settleBatch_revertsOnVerifyingContractMismatch() public {
        (
            ,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
            bytes32 newRoot
        ) = _canonicalBatch();
        address impostor = address(0xBEEF);
        bytes memory pv = abi.encode(
            GENESIS,
            newRoot,
            uint64(block.chainid),
            impostor,
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            _hashUsageEmpty(),
            uint64(block.timestamp),
            keccak256(hex"")
        );
        vm.expectRevert(
            abi.encodeWithSelector(FigaroBatchVerifier.VerifyingContractMismatch.selector, address(verifier), impostor)
        );
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");
    }

    // ── Fee-on-transfer deposit revert ──────────────────────────────

    function test_settleBatch_revertsOnFeeOnTransferDeposit() public {
        MockERC20FeeOnTransfer feeToken = new MockERC20FeeOnTransfer("Fee Token", "FEE");
        feeToken.mint(buyer, 1_000 ether);
        vm.prank(buyer);
        feeToken.approve(address(verifier), type(uint256).max);

        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](1);
        positions[0] = FigaroBatchVerifier.NetPosition(address(feeToken), buyer, 100 ether, 0);
        FigaroBatchVerifier.BatchEventData memory events = FigaroBatchVerifier.BatchEventData(
            new FigaroBatchVerifier.AttestationData[](0), new FigaroBatchVerifier.SpecBinding[](0)
        );
        bytes memory pv = abi.encode(
            GENESIS,
            keccak256("fee-root"),
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            keccak256(""),
            keccak256(""),
            _hashUsageEmpty(),
            uint64(block.timestamp),
            keccak256(hex"")
        );

        vm.expectRevert(FigaroBatchVerifier.FeeOnTransferDetected.selector);
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");
    }

    // ── Atomicity: a failed pull reverts the WHOLE batch ────────────
    //
    // The sequencer-DoS scenario in the contract NatSpec: approval verified
    // pre-submission, revoked (or balance drained) before the batch lands.
    // The batch must revert atomically — no partial payout leg, no root
    // advance, no counter bump.

    function test_settleBatch_atomicRevert_onRevokedApproval() public {
        (
            bytes memory pv,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
        ) = _canonicalBatch();
        uint256 sellerBefore = token.balanceOf(seller);

        vm.prank(buyer);
        token.approve(address(verifier), 0);

        vm.expectRevert();
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");

        assertEq(verifier.stateRoot(), GENESIS, "root must not advance on failed resolve");
        assertEq(verifier.batchCount(), 0, "counter must not bump on failed resolve");
        assertEq(token.balanceOf(seller), sellerBefore, "no partial payout leg");
    }

    function test_settleBatch_atomicRevert_onInsufficientBalance() public {
        address pauper = makeAddr("pauper");
        token.mint(pauper, 1 ether); // far below the 50-ether deposit
        vm.prank(pauper);
        token.approve(address(verifier), type(uint256).max);

        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](1);
        positions[0] = FigaroBatchVerifier.NetPosition(address(token), pauper, 50 ether, 0);
        FigaroBatchVerifier.BatchEventData memory events = FigaroBatchVerifier.BatchEventData(
            new FigaroBatchVerifier.AttestationData[](0), new FigaroBatchVerifier.SpecBinding[](0)
        );
        bytes memory pv = abi.encode(
            GENESIS,
            keccak256("pauper-root"),
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            keccak256(""),
            keccak256(""),
            _hashUsageEmpty(),
            uint64(block.timestamp),
            keccak256(hex"")
        );

        vm.expectRevert();
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");
        assertEq(verifier.stateRoot(), GENESIS, "root must not advance on failed resolve");
        assertEq(verifier.batchCount(), 0, "counter must not bump on failed resolve");
    }

    // ── Capacity guard: a wide batch fits the L1 block budget ───────

    function test_Gas_settleBatch_100Payouts_underBlockGasBudget() public {
        uint256 n = 100;
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](n);
        for (uint256 i = 0; i < n; i++) {
            positions[i] = FigaroBatchVerifier.NetPosition(address(token), address(uint160(0x1000 + i)), 0, 1 ether);
        }
        FigaroBatchVerifier.BatchEventData memory events = FigaroBatchVerifier.BatchEventData(
            new FigaroBatchVerifier.AttestationData[](0), new FigaroBatchVerifier.SpecBinding[](0)
        );
        bytes memory pv = abi.encode(
            GENESIS,
            keccak256("wide-root"),
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            keccak256(""),
            keccak256(""),
            _hashUsageEmpty(),
            uint64(block.timestamp),
            keccak256(hex"")
        );

        uint256 gasBefore = gasleft();
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");
        uint256 gasUsed = gasBefore - gasleft();
        emit log_named_uint("settleBatch_100_payouts_gas", gasUsed);
        assertLt(gasUsed, 30_000_000, "100-position batch must fit the 30M block budget");
    }

    // ── The RPGF usage bridge ───────────────────────────────────────

    /// @dev A batch whose public values commit `usage`. Everything else is
    ///      the canonical batch, so only the usage leg varies.
    function _batchWithUsage(FigaroBatchVerifier.BatchUsageData memory usage)
        internal
        view
        returns (
            bytes memory pv,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
            bytes32 newRoot
        )
    {
        (, positions, events, newRoot) = _canonicalBatch();
        pv = abi.encode(
            GENESIS,
            newRoot,
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            _hashUsage(usage),
            uint64(block.timestamp),
            keccak256(hex"")
        );
    }

    /// THE BRIDGE, end to end: resolving a batch must leave the accrual on the
    /// COUNTER. Read back from the counter's own storage, never from the
    /// verifier's return or its events — the whole failure class this exists
    /// for is a call that is never made, or made and reverted.
    function test_settleBatch_writesTheAccrualToTheCounter() public {
        FigaroBatchVerifier.BatchUsageData memory usage = _usageFor(clauseKey, 3, 2);
        (
            bytes memory pv,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
        ) = _batchWithUsage(usage);

        verifier.settleBatch(hex"", pv, positions, events, usage, hex"");

        (uint64 c, uint64 d, uint256 score) = counter.batchAccrualOf(counter.KIND_CLAUSE(), clauseKey, 0);
        assertEq(c, 3, "distinct resolved processes");
        assertEq(d, 2, "distinct pairs");
        assertGt(score, 0, "and it is scored");
        assertEq(counter.scoreOf(counter.KIND_CLAUSE(), clauseKey, 0), score, "which is what the reward reads");
        assertEq(counter.totalScoreIn(0), score, "and what the period total counts");
    }

    /// The accrual is calldata; the hash is the proof's. Tampering with the
    /// numbers after proving must not resolve.
    function test_settleBatch_rejectsATamperedAccrual() public {
        FigaroBatchVerifier.BatchUsageData memory usage = _usageFor(clauseKey, 3, 2);
        (
            bytes memory pv,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
        ) = _batchWithUsage(usage);

        usage.accruals[0].c = 3000; // the proof committed 3

        vm.expectRevert(FigaroBatchVerifier.UsageAccrualHashMismatch.selector);
        verifier.settleBatch(hex"", pv, positions, events, usage, hex"");
    }

    /// WHY BOTH ARRAY LENGTHS ARE IN THE PREIMAGE. An accrual record is 49
    /// bytes and a seller 20, so twenty accruals span exactly forty-nine
    /// sellers' worth of bytes. Without the length prefixes the same byte string could
    /// be re-split — presenting accruals whose sellers were never stake-checked
    /// while the hash still matched. Moving the boundary must change the hash.
    function test_usageHash_isNotReSplittableBetweenTheTwoArrays() public view {
        FigaroBatchVerifier.BatchUsageData memory twenty;
        twenty.accruals = new IUsageCounter.BatchAccrual[](20);
        twenty.sellers = new address[](0);

        FigaroBatchVerifier.BatchUsageData memory fortyNine;
        fortyNine.accruals = new IUsageCounter.BatchAccrual[](0);
        fortyNine.sellers = new address[](49);

        // Same total span (20 × 49 == 49 × 20 == 980 bytes), all-zero contents.
        assertTrue(_hashUsage(twenty) != _hashUsage(fortyNine), "the split must be pinned by the hash");
    }

    /// THE CROSS-LANGUAGE LOCK. Both sides pack this hash by hand — assembly
    /// in the contract, `compute_usage_accrual_hash` in the guest — and each
    /// has an independent mirror in its own suite, which proves each side is
    /// self-consistent but NOT that the two agree. This vector is generated by
    /// the Rust implementation and asserted verbatim in both places
    /// (`prover/lib/tests/usage.rs::the_usage_hash_matches_the_solidity_vector`).
    /// A byte of drift in either layout fails exactly one of the two.
    ///
    /// It is asserted against the CONTRACT's own `_hashUsage` — reached through
    /// a settleBatch that must accept these exact public values — so the
    /// assembly is what is under test, not the test's `abi.encodePacked` mirror.
    function test_usageHash_matchesTheRustVector() public {
        FigaroBatchVerifier.BatchUsageData memory u;
        u.period = 3;
        u.provenanceLeaf = keccak256("prov");
        u.accruals = new IUsageCounter.BatchAccrual[](2);
        // The two seed strings are OPAQUE FIXTURE BYTES, not a name for the
        // concept: they are keccak preimages the Rust vector was generated from
        // (`prover/lib/tests/usage.rs`). Changing either side alone breaks the
        // lock — rename both together and regenerate the vector from Rust.
        // One accrual of each kind, so the kind byte is under the lock.
        u.accruals[0] = IUsageCounter.BatchAccrual(keccak256("artifact-a"), 0, 4, 2);
        u.accruals[1] = IUsageCounter.BatchAccrual(keccak256("artifact-b"), 1, 1, 1);
        u.sellers = new address[](2);
        u.sellers[0] = address(1);
        u.sellers[1] = address(2);

        bytes32 expected = 0x9d3344f07a7c4ab3dc7eb5a6719feae8ae1462cb029ea2c781c6b0619261acd4;
        assertEq(_hashUsage(u), expected, "the test mirror matches the Rust vector");

        // And so does the contract's assembly: a batch committing `expected`
        // gets past the usage-hash check into the counter, which rejects period
        // 3 as not open. Resolution is decoupled from that rejection (Fix 1a),
        // so the batch RESOLVES and the accrual is dropped — which is itself
        // proof the hash matched (a mismatch would revert UsageAccrualHashMismatch
        // before the counter is ever reached).
        (
            ,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
            bytes32 newRoot
        ) = _canonicalBatch();
        bytes memory pv = abi.encode(
            GENESIS,
            newRoot,
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            expected,
            uint64(block.timestamp),
            keccak256(hex"")
        );
        vm.expectEmit(true, false, false, false, address(verifier));
        emit FigaroBatchVerifier.BatchAccrualSkipped(1, hex"");
        verifier.settleBatch(hex"", pv, positions, events, u, hex"");
        assertEq(verifier.stateRoot(), newRoot, "resolves despite the rejected accrual");
    }

    /// The one-accrual twin of the vector above, harvested from the same Rust
    /// implementation: the preimage is 118 bytes (49 + 49 + 20), the kind byte
    /// 0x01 sits right after the 32-byte key. Pinned against the test mirror and
    /// the raw preimage both, so the layout is stated byte for byte here.
    function test_usageHash_matchesTheOneAccrualRustVector() public pure {
        FigaroBatchVerifier.BatchUsageData memory u;
        u.period = 3;
        u.provenanceLeaf = keccak256("prov");
        u.accruals = new IUsageCounter.BatchAccrual[](1);
        u.accruals[0] = IUsageCounter.BatchAccrual(keccak256("artifact-a"), 1, 4, 2);
        u.sellers = new address[](1);
        u.sellers[0] = address(1);

        bytes memory preimage =
            hex"03802d6204bf932870ff4b907951cbb0070a81deba751c5267793b986e642924da0000000000000001f90fbed58b3c3cd29401a81f6bc369392ef4bb88a8410888f3c879567f9ce00e010000000000000004000000000000000200000000000000010000000000000000000000000000000000000001";
        bytes32 expected = 0xa8f200441f17c90bdb286e38e33656d6cac7f0b7b6d4b0f1f011d76a4ba4cf3e;
        assertEq(preimage.length, 118, "span 49 + 49n + 20m at n = m = 1");
        assertEq(keccak256(preimage), expected, "the preimage hashes to the Rust vector");
        assertEq(_hashUsage(u), expected, "the test mirror matches the Rust vector");
    }

    /// The counter's gates are the COUNTER's, and resolution is DECOUPLED from
    /// them (audit Fix 1a): a batch that trips a reward-tier gate still resolves
    /// its token positions and advances state — the accrual is dropped, never
    /// the trade. A reward gate must not unwind another party's resolution.
    function test_settleBatch_settlesEvenWhenTheCounterRejectsTheAccrual() public {
        FigaroBatchVerifier.BatchUsageData memory usage = _usageFor(clauseKey, 1, 1);
        (
            bytes memory pv,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
            bytes32 newRoot
        ) = _batchWithUsage(usage);

        vm.prank(seller);
        members.requestWithdrawal(); // the seller de-surfaces between prove and submit

        uint256 sellerBefore = token.balanceOf(seller);

        // The accrual is dropped (topic1 = batch id 1); reason bytes not asserted.
        vm.expectEmit(true, false, false, false, address(verifier));
        emit FigaroBatchVerifier.BatchAccrualSkipped(1, hex"");
        verifier.settleBatch(hex"", pv, positions, events, usage, hex"");

        assertEq(verifier.stateRoot(), newRoot, "resolution advances despite the dropped accrual");
        assertEq(token.balanceOf(seller) - sellerBefore, 300 ether, "the seller is still paid");
        (,, uint256 score) = counter.batchAccrualOf(counter.KIND_CLAUSE(), clauseKey, usage.period);
        assertEq(score, 0, "the accrual was dropped, not applied");
    }

    /// Trade outlives the reward: once accrual closes, batches carrying no
    /// claims must still resolve. This is the liveness leg of the bridge.
    function test_settleBatch_stillSettlesAfterAccrualCloses() public {
        vm.warp(PERIOD_END + 1);
        (
            bytes memory pv,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
            bytes32 newRoot
        ) = _canonicalBatch();

        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");
        assertEq(verifier.stateRoot(), newRoot, "resolution is not hostage to the reward schedule");
    }

    /// The kind separation on the batch path, end to end: a batch credits an
    /// ASSEMBLY, and a stranger has staked that assembly's assembly hash as
    /// a CLAUSE in the live ClauseRegistry. Through `settleBatch`, the counter
    /// and `claim`, the assembly's registrant takes the period's budget and the
    /// stranger takes nothing under either kind. The counter, the minter and
    /// the registries are the real contracts; only SP1 is the mock.
    function test_settleBatch_anAssemblyAccrualPaysNoStrangerWhoStakedItsKeyAsAClause() public {
        address designer = address(0xDE519);
        // A member: a designer is paid only while it holds a live member stake.
        vm.prank(designer);
        members.register("ipfs://designer");
        address stranger = address(0x5745);
        // A member, so the claim reaches the kind gate this test is about.
        vm.prank(stranger);
        members.register("ipfs://stranger");
        bytes32 asmKey = keccak256("an-assembly-credited-on-the-batch-path");

        AssemblyRegistry assemblies = new AssemblyRegistry(0);
        vm.prank(designer);
        assemblies.registerAssembly(asmKey, "ipfs://asm");
        vm.deal(stranger, DEPOSIT);
        vm.prank(stranger);
        registry.registerClause{value: DEPOSIT}(asmKey, "ipfs://a-stranger-stakes-an-assembly-key-as-a-clause");

        (RpgfMinter minter, FlorinToken florin) = _rewireOnRealRegistries(assemblies);
        uint8 kindClause = counter.KIND_CLAUSE();
        uint8 kindAssembly = counter.KIND_ASSEMBLY();

        FigaroBatchVerifier.BatchUsageData memory usage = _usageFor(asmKey, 3, 2);
        usage.accruals[0].kind = kindAssembly;
        _settleWithUsage(usage);

        (,, uint256 assemblyScore) = counter.batchAccrualOf(kindAssembly, asmKey, 0);
        assertGt(assemblyScore, 0, "the batch credits the assembly kind");
        assertEq(counter.scoreOf(kindClause, asmKey, 0), 0, "and nothing under the clause kind");

        vm.warp(PERIOD_END + 1);
        RpgfMinter.ClauseOrAssemblyKey[] memory entry = new RpgfMinter.ClauseOrAssemblyKey[](1);
        entry[0] = RpgfMinter.ClauseOrAssemblyKey(kindClause, asmKey);
        vm.prank(stranger);
        vm.expectRevert(RpgfMinter.NothingToClaim.selector);
        minter.claim(0, entry);

        entry[0] = RpgfMinter.ClauseOrAssemblyKey(kindAssembly, asmKey);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, kindAssembly, asmKey, stranger));
        minter.claim(0, entry);

        vm.prank(designer);
        minter.claim(0, entry);
        assertEq(
            florin.balanceOf(designer), minter.periodAmount(0), "the assembly's registrant takes the period's budget"
        );
        assertEq(florin.balanceOf(stranger), 0, "the stranger takes nothing of it");
    }

    /// @dev Replaces the `counter` and `verifier` fields with a pair over the
    ///      live `registry`, `assemblies` and a fresh AgreementRegistry, wired
    ///      as setUp wires its pair, funds the new verifier's payout legs, and
    ///      deploys a minter and florin over that counter for one period.
    function _rewireOnRealRegistries(AssemblyRegistry assemblies)
        internal
        returns (RpgfMinter minter, FlorinToken florin)
    {
        AgreementRegistry agreements = new AgreementRegistry(0);
        uint64[] memory periods = new uint64[](1);
        periods[0] = PERIOD_END;
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        counter = new UsageCounter(
            address(core),
            address(members),
            address(registry),
            address(assemblies),
            address(agreements),
            predicted,
            1,
            periods
        );
        verifier = new FigaroBatchVerifier(address(sp1), VKEY, address(registry), address(counter));
        assertEq(address(verifier), predicted, "verifier address prediction");
        token.mint(address(verifier), 1_000 ether);
        vm.prank(buyer);
        token.approve(address(verifier), type(uint256).max);

        florin = new FlorinToken();
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 45_000_000 ether;
        minter = new RpgfMinter(
            address(florin),
            address(counter),
            address(members),
            address(registry),
            address(assemblies),
            address(agreements),
            amounts
        );
        florin.registerMinter(address(minter), amounts[0]);
    }

    /// @dev Resolves the canonical batch carrying `usage` through `settleBatch`.
    function _settleWithUsage(FigaroBatchVerifier.BatchUsageData memory usage) internal {
        (
            bytes memory pv,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
        ) = _batchWithUsage(usage);
        verifier.settleBatch(hex"", pv, positions, events, usage, hex"");
    }

    // ── Differential fuzz: the assembly packers against the mirrors ──

    /// @dev A full-width pseudo-random word from the fuzzer's seed, so every
    ///      packed field — including the high bits a misplaced `mstore` offset
    ///      would clip or overlap — is exercised at arbitrary array lengths.
    function _word(bytes32 seed, string memory tag, uint256 i) internal pure returns (bytes32) {
        return keccak256(abi.encode(seed, tag, i));
    }

    function _fuzzPositions(bytes32 seed, FigaroBatchVerifier.NetPosition memory p0, uint256 n)
        internal
        pure
        returns (FigaroBatchVerifier.NetPosition[] memory ps)
    {
        ps = new FigaroBatchVerifier.NetPosition[](n);
        for (uint256 i = 0; i < n; i++) {
            ps[i] = i == 0
                ? p0
                : FigaroBatchVerifier.NetPosition(
                    address(uint160(uint256(_word(seed, "token", i)))),
                    address(uint160(uint256(_word(seed, "user", i)))),
                    uint256(_word(seed, "deposit", i)),
                    uint256(_word(seed, "payout", i))
                );
        }
    }

    function _fuzzAttestations(bytes32 seed, FigaroBatchVerifier.AttestationData memory a0, uint256 n)
        internal
        pure
        returns (FigaroBatchVerifier.AttestationData[] memory atts)
    {
        atts = new FigaroBatchVerifier.AttestationData[](n);
        for (uint256 i = 0; i < n; i++) {
            atts[i] = i == 0
                ? a0
                : FigaroBatchVerifier.AttestationData(
                    _word(seed, "orderHash", i),
                    _word(seed, "processId", i),
                    address(uint160(uint256(_word(seed, "attester", i)))),
                    _word(seed, "clauseId", i),
                    uint8(uint256(_word(seed, "stage", i))),
                    _word(seed, "contentRef", i)
                );
        }
    }

    function _fuzzBindings(bytes32 seed, FigaroBatchVerifier.SpecBinding memory b0, uint256 n)
        internal
        pure
        returns (FigaroBatchVerifier.SpecBinding[] memory bs)
    {
        bs = new FigaroBatchVerifier.SpecBinding[](n);
        for (uint256 i = 0; i < n; i++) {
            bs[i] =
                i == 0 ? b0 : FigaroBatchVerifier.SpecBinding(_word(seed, "bindClause", i), _word(seed, "specHash", i));
        }
    }

    function _fuzzUsage(
        bytes32 seed,
        IUsageCounter.BatchAccrual memory acc0,
        address s0,
        uint8 period,
        uint256 nAcc,
        uint256 nSell
    ) internal pure returns (FigaroBatchVerifier.BatchUsageData memory u) {
        u.period = period;
        u.provenanceLeaf = _word(seed, "provenance", 0);
        u.accruals = new IUsageCounter.BatchAccrual[](nAcc);
        for (uint256 i = 0; i < nAcc; i++) {
            u.accruals[i] = i == 0
                ? acc0
                : IUsageCounter.BatchAccrual(
                    _word(seed, "accrual", i),
                    uint8(uint256(_word(seed, "kind", i))),
                    uint64(uint256(_word(seed, "c", i))),
                    uint64(uint256(_word(seed, "d", i)))
                );
        }
        u.sellers = new address[](nSell);
        for (uint256 i = 0; i < nSell; i++) {
            u.sellers[i] = i == 0 ? s0 : address(uint160(uint256(_word(seed, "seller", i))));
        }
    }

    /// THE DIFFERENTIAL LOCK ON THE FOUR PACKERS. The contract's `_hashPositions`,
    /// `_hashAttestations`, `_hashSpecBindings` and `_hashUsage` are internal and
    /// hand-rolled in assembly; the mirrors above are `abi.encodePacked`. The one
    /// public route to the four is `settleBatch`, which compares each to its
    /// public value IN ORDER, reverting with that hash's own error on the first
    /// disagreement — and only after all four agree does it anchor the spec
    /// bindings. So: hand it random inputs with the MIRROR hashes as the public
    /// values, make the first binding one whose spec hash is not its clause
    /// key, and require exactly that LATER revert. Reaching `SpecBindingMismatch` proves
    /// every assembly hash equaled its mirror on this input; a packing slip in
    /// any of the four surfaces instead as the corresponding `*HashMismatch`.
    ///
    /// Slot 0 of every array carries the fuzzer's own values (its edge cases —
    /// zero, all-ones — land there); derived full-width words fill the rest, at
    /// lengths 0..3 (bindings 1..4: the sentinel needs one).
    /// @dev One struct so the fuzzer's eight inputs cost one stack slot on the
    ///      default (non-IR) profile the pre-commit build uses.
    struct PackerFuzz {
        bytes32 seed;
        FigaroBatchVerifier.NetPosition p0;
        FigaroBatchVerifier.AttestationData a0;
        FigaroBatchVerifier.SpecBinding b0;
        IUsageCounter.BatchAccrual acc0;
        address s0;
        uint8 period;
        uint8 lengths;
    }

    function _packerPv(
        FigaroBatchVerifier.NetPosition[] memory positions,
        FigaroBatchVerifier.BatchEventData memory events,
        FigaroBatchVerifier.BatchUsageData memory usage
    ) internal view returns (bytes memory) {
        return abi.encode(
            GENESIS,
            keccak256("next-root"),
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            _hashUsage(usage),
            uint64(block.timestamp),
            keccak256(hex"")
        );
    }

    function testFuzz_assemblyPackersMatchTheMirrors(PackerFuzz memory f) public {
        // The sentinel: a binding whose spec hash is not its clause key
        // mismatches before any registry read.
        vm.assume(f.b0.clauseId != f.b0.specHash);

        FigaroBatchVerifier.NetPosition[] memory positions = _fuzzPositions(f.seed, f.p0, f.lengths & 3);
        FigaroBatchVerifier.BatchEventData memory events = FigaroBatchVerifier.BatchEventData(
            _fuzzAttestations(f.seed, f.a0, (f.lengths >> 2) & 3),
            _fuzzBindings(f.seed, f.b0, 1 + ((f.lengths >> 4) & 3))
        );
        FigaroBatchVerifier.BatchUsageData memory usage =
            _fuzzUsage(f.seed, f.acc0, f.s0, f.period, (f.lengths >> 6) & 3, uint256(f.seed) & 3);

        vm.expectRevert(
            abi.encodeWithSelector(FigaroBatchVerifier.SpecBindingMismatch.selector, f.b0.clauseId, f.b0.specHash)
        );
        verifier.settleBatch(hex"", _packerPv(positions, events, usage), positions, events, usage, hex"");
    }

    /// THE CROSS-LANGUAGE LOCK for the three sibling packers. Positions,
    /// attestations and spec bindings are each packed by hand — assembly in
    /// the contract, `compute_*_hash` in the guest — and each side has an
    /// independent mirror in its own suite, which proves each side is
    /// self-consistent but NOT that the two agree. These three vectors are
    /// generated by the Rust implementation (`prover/lib/tests/packers.rs`) and
    /// asserted verbatim here; the fourth packer's lock is
    /// `test_usageHash_matchesTheRustVector`. A byte of drift in either layout
    /// fails exactly one of the two.
    ///
    /// The string literals are OPAQUE PREIMAGE BYTES pinned to the Rust side;
    /// rename both together and regenerate the vectors from Rust.
    ///
    /// The vectors are asserted against the test mirrors AND the contract's
    /// own assembly: a batch committing exactly these three hashes gets past
    /// every hash check (each mismatch reverts with its own error, in order)
    /// and is stopped only by the spec-binding anchor — the fixture's spec
    /// hash is not its clause key. That `SpecBindingMismatch` is the proof all
    /// three packers agreed.
    function test_packerHashes_matchTheRustVectors() public {
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](2);
        positions[0] = FigaroBatchVerifier.NetPosition(address(1), address(2), 200 ether, 0);
        positions[1] = FigaroBatchVerifier.NetPosition(address(1), address(3), 100 ether, 350 ether);

        FigaroBatchVerifier.AttestationData[] memory atts = new FigaroBatchVerifier.AttestationData[](2);
        atts[0] = FigaroBatchVerifier.AttestationData(
            keccak256("order-a"), keccak256("process-a"), address(4), keccak256("clause-a"), 1, keccak256("content-a")
        );
        atts[1] = FigaroBatchVerifier.AttestationData(
            keccak256("order-b"), keccak256("process-a"), address(5), keccak256("clause-b"), 0, keccak256("content-b")
        );

        FigaroBatchVerifier.SpecBinding[] memory bindings = new FigaroBatchVerifier.SpecBinding[](2);
        bindings[0] = FigaroBatchVerifier.SpecBinding(keccak256("clause-a"), keccak256("spec-a"));
        bindings[1] = FigaroBatchVerifier.SpecBinding(keccak256("clause-b"), keccak256("spec-b"));

        bytes32 positionsVector = 0x9bd2d9af56189ba485fc2e232edeafb4bccd8fd1fdc286064ada3f97b522766d;
        bytes32 attestationsVector = 0x8d905f5a099cb2530f0912090a34135967c19e660b79a2ba7275489145a74dfc;
        bytes32 bindingsVector = 0x46470c7694c808e183fefa90a173f9398346f792cf859f22e49b42e598da3704;

        assertEq(_hashPositions(positions), positionsVector, "positions mirror matches the Rust vector");
        assertEq(_hashAttestations(atts), attestationsVector, "attestations mirror matches the Rust vector");
        assertEq(_hashBindings(bindings), bindingsVector, "bindings mirror matches the Rust vector");

        bytes memory pv = abi.encode(
            GENESIS,
            keccak256("next-root"),
            uint64(block.chainid),
            address(verifier),
            positionsVector,
            attestationsVector,
            bindingsVector,
            _hashUsageEmpty(),
            uint64(block.timestamp),
            keccak256(hex"")
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                FigaroBatchVerifier.SpecBindingMismatch.selector, bindings[0].clauseId, bindings[0].specHash
            )
        );
        verifier.settleBatch(
            hex"", pv, positions, FigaroBatchVerifier.BatchEventData(atts, bindings), _emptyUsage(), hex""
        );
    }

    // ── The ERC-20 shapes beyond fee-on-transfer, on the batch path ──

    /// A token whose transfers return nothing settles: the verifier moves
    /// value through SafeERC20, both the deposit and the payout leg.
    function test_settleBatch_noReturnTokenSettles() public {
        MockERC20NoReturn nrt = new MockERC20NoReturn();
        nrt.mint(buyer, 1_000 ether);
        nrt.mint(address(verifier), 1_000 ether);
        vm.prank(buyer);
        nrt.approve(address(verifier), type(uint256).max);

        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](2);
        positions[0] = FigaroBatchVerifier.NetPosition(address(nrt), buyer, 100 ether, 0);
        positions[1] = FigaroBatchVerifier.NetPosition(address(nrt), seller, 0, 50 ether);
        FigaroBatchVerifier.BatchEventData memory events = FigaroBatchVerifier.BatchEventData(
            new FigaroBatchVerifier.AttestationData[](0), new FigaroBatchVerifier.SpecBinding[](0)
        );
        bytes32 newRoot = keccak256("no-return-root");
        bytes memory pv = abi.encode(
            GENESIS,
            newRoot,
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            keccak256(""),
            keccak256(""),
            _hashUsageEmpty(),
            uint64(block.timestamp),
            keccak256(hex"")
        );
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");

        assertEq(nrt.balanceOf(buyer), 900 ether, "deposit pulled");
        assertEq(nrt.balanceOf(seller), 50 ether, "payout paid");
        assertEq(verifier.stateRoot(), newRoot, "root advanced");
    }

    /// A blocked payee's leg reverts and the batch is atomic: nothing moves,
    /// the root stays, and the same batch settles once the issuer relents.
    function test_settleBatch_atomicRevert_onBlocklistedPayee() public {
        MockERC20Blocklist blk = new MockERC20Blocklist("Blocklist", "BLK");
        blk.mint(address(verifier), 1_000 ether);

        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](1);
        positions[0] = FigaroBatchVerifier.NetPosition(address(blk), seller, 0, 50 ether);
        FigaroBatchVerifier.BatchEventData memory events = FigaroBatchVerifier.BatchEventData(
            new FigaroBatchVerifier.AttestationData[](0), new FigaroBatchVerifier.SpecBinding[](0)
        );
        bytes32 newRoot = keccak256("blocklist-root");
        bytes memory pv = abi.encode(
            GENESIS,
            newRoot,
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            keccak256(""),
            keccak256(""),
            _hashUsageEmpty(),
            uint64(block.timestamp),
            keccak256(hex"")
        );

        blk.setBlocked(seller, true);
        vm.expectRevert(abi.encodeWithSelector(MockERC20Blocklist.Blocked.selector, seller));
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");
        assertEq(verifier.stateRoot(), GENESIS, "root must not advance");
        assertEq(blk.balanceOf(seller), 0, "no payout leg");

        blk.setBlocked(seller, false);
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage(), hex"");
        assertEq(verifier.stateRoot(), newRoot, "settles once the issuer relents");
    }

    // ── Completeness of the public values ─────────────────────────

    /// Each effect settleBatch applies is bound to a public value — positions
    /// to tokenOpsHash, attestations to attEventsHash, spec bindings to
    /// specBindingsHash, the accrual to usageAccrualHash, the state advance
    /// to newRoot — and the tampered-hash tests show each binding bites. This
    /// closes the other direction: nothing ELSE is written. The state diff of
    /// a settling batch is recorded and every storage write is accounted for
    /// — the verifier writes its state root and batch count (a slot that
    /// returns to its resting value within the call, the reentrancy latch, is
    /// no effect), the token writes balances (the positions), the counter
    /// writes its accrual (the usage leg); no other account is written, no
    /// ether moves, nothing is created or destroyed. An effect added to
    /// settleBatch without a public value to bind it surfaces here as an
    /// unaccounted write.
    function test_settleBatch_writesNothingThePublicValuesDoNotBind() public {
        FigaroBatchVerifier.BatchUsageData memory usage = _usageFor(clauseKey, 3, 2);
        (
            bytes memory pv,
            FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,
        ) = _batchWithUsage(usage);

        vm.startStateDiffRecording();
        verifier.settleBatch(hex"", pv, positions, events, usage, hex"");
        VmSafe.AccountAccess[] memory accesses = vm.stopAndReturnStateDiff();

        bool verifierWrote;
        bool tokenWrote;
        bool counterWrote;
        for (uint256 i = 0; i < accesses.length; i++) {
            VmSafe.AccountAccess memory a = accesses[i];
            assertTrue(
                a.kind != VmSafe.AccountAccessKind.Create && a.kind != VmSafe.AccountAccessKind.SelfDestruct,
                "nothing created or destroyed"
            );
            assertEq(a.value, 0, "no ether moves");
            for (uint256 j = 0; j < a.storageAccesses.length; j++) {
                VmSafe.StorageAccess memory w = a.storageAccesses[j];
                if (!w.isWrite || w.reverted) continue;
                if (w.account == address(verifier)) {
                    verifierWrote = true;
                    // The two words the public values bind, found by what they
                    // now hold rather than by slot number (the EIP-712 base
                    // reserves slots before them).
                    bool bound = w.newValue == verifier.stateRoot() || uint256(w.newValue) == verifier.batchCount();
                    assertTrue(
                        bound || _returnsToRest(accesses, w.account, w.slot),
                        "the verifier writes only the state root and the batch count"
                    );
                } else if (w.account == address(token)) {
                    tokenWrote = true;
                } else if (w.account == address(counter)) {
                    counterWrote = true;
                } else {
                    fail(string.concat("a write the public values do not bind, in ", vm.toString(w.account)));
                }
            }
        }
        assertTrue(verifierWrote, "the state root was written");
        assertTrue(tokenWrote, "the positions were written");
        assertTrue(counterWrote, "the accrual was written");
    }

    /// True when the slot's first previous value equals its last new value
    /// across the recorded call — written, but no effect survives it.
    function _returnsToRest(VmSafe.AccountAccess[] memory accesses, address account, bytes32 slot)
        internal
        pure
        returns (bool)
    {
        bytes32 first;
        bytes32 last;
        bool seen;
        for (uint256 i = 0; i < accesses.length; i++) {
            for (uint256 j = 0; j < accesses[i].storageAccesses.length; j++) {
                VmSafe.StorageAccess memory w = accesses[i].storageAccesses[j];
                if (w.account != account || w.slot != slot || !w.isWrite || w.reverted) continue;
                if (!seen) {
                    first = w.previousValue;
                    seen = true;
                }
                last = w.newValue;
            }
        }
        return seen && first == last;
    }
}
