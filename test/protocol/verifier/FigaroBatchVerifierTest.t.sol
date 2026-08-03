// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import "src/protocol/verifier/FigaroBatchVerifier.sol";
import "src/protocol/registries/ClauseRegistry.sol";
import {MockArtifactStake} from "test/helpers/MockArtifactStake.sol";
import "src/mocks/MockSP1Verifier.sol";
import "src/mocks/MockERC20.sol";
import {MockERC20FeeOnTransfer} from "src/mocks/MockERC20FeeOnTransfer.sol";
import {UsageCounter} from "src/protocol/usage/UsageCounter.sol";
import {MembersRegistry} from "src/protocol/registries/MembersRegistry.sol";
import {FigaroCore} from "src/kernel/FigaroCore.sol";

/// @dev Unit tests for the realigned batch verifier: 8-word public values,
///      the spec-binding anchor check against the live ClauseRegistry,
///      net-position reconciliation, and the RPGF usage bridge. Hash packing here mirrors the Rust
///      kernel's compute_*_hash functions; the byte-exact cross-language
///      lock is the sequencer batch e2e (a real apply_batch output settled
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

    bytes32 constant PROV_KEY = keccak256(abi.encode("figaro-assembly-provenance", uint64(1)));
    uint64 constant PERIOD_END = 1_000_000;

    bytes32 constant VKEY = bytes32(uint256(0xF16A20));
    bytes32 constant GENESIS = bytes32(uint256(0x6E0));
    uint256 constant DEPOSIT = 0.001 ether;

    address buyer = address(0xB0B);
    address seller = address(0x5E11);

    // The anchored clause: figaro-modalities v1 with a known spec hash.
    string constant CLAUSE_ID = "figaro-modalities";
    bytes32 constant SPEC_HASH = keccak256("the canonical spec bytes");
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
        bytes32[] memory excluded = new bytes32[](1);
        excluded[0] = keccak256(abi.encode("figaro-commerce", uint64(1)));
        MockArtifactStake stakeGate = new MockArtifactStake();
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        counter = new UsageCounter(
            address(core), address(members), address(stakeGate), address(stakeGate), predicted, PROV_KEY, excluded, 1, periods
        );
        verifier =
            new FigaroBatchVerifier(address(sp1), VKEY, address(registry), address(counter), GENESIS);
        assertEq(address(verifier), predicted, "verifier address prediction");
        vm.warp(PERIOD_END - 1000);
        token = new MockERC20("Mock", "MOCK");

        clauseKey = keccak256(abi.encode(CLAUSE_ID, uint64(1)));
        vm.deal(address(this), 1 ether);
        registry.registerClause{value: DEPOSIT}(CLAUSE_ID, 1, SPEC_HASH, "ipfs://spec");

        token.mint(buyer, 1_000 ether);
        token.mint(address(verifier), 1_000 ether); // settlement liquidity for payout legs
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
                    atts[i].orderHash, atts[i].processId, atts[i].attester, atts[i].clauseId, atts[i].stage, atts[i].contentRef
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
        bytes memory packed = abi.encodePacked(u.period, u.provenanceClause, uint64(u.accruals.length));
        for (uint256 i = 0; i < u.accruals.length; i++) {
            packed = bytes.concat(packed, abi.encodePacked(u.accruals[i].artifact, u.accruals[i].c, u.accruals[i].d));
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

    /// @dev A one-artifact, one-seller accrual for the open period.
    function _usageFor(bytes32 artifact, uint64 c, uint64 d)
        internal
        view
        returns (FigaroBatchVerifier.BatchUsageData memory u)
    {
        u.period = counter.currentPeriod();
        u.provenanceClause = PROV_KEY;
        u.accruals = new IUsageCounter.BatchAccrual[](1);
        u.accruals[0] = IUsageCounter.BatchAccrual(artifact, c, d);
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
            _hashUsageEmpty()
        );
    }

    // ── Happy path ──────────────────────────────────────────────────

    function test_settleBatch_advancesRoot_reconciles_and_emits() public {
        (bytes memory pv, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events, bytes32 newRoot) = _canonicalBatch();

        uint256 buyerBefore = token.balanceOf(buyer);
        uint256 sellerBefore = token.balanceOf(seller);

        vm.expectEmit(true, true, true, true, address(verifier));
        emit FigaroBatchVerifier.Attestation(
            keccak256("order"), keccak256("process"), seller, clauseKey, 0, keccak256("content")
        );
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage());

        assertEq(verifier.stateRoot(), newRoot, "root advances");
        assertEq(verifier.batchCount(), 1);
        // Value legs from the chain: buyer pulled 200, seller pushed 300.
        assertEq(buyerBefore - token.balanceOf(buyer), 200 ether, "buyer net deposit");
        assertEq(token.balanceOf(seller) - sellerBefore, 300 ether, "seller net payout");
    }

    // ── The open-world anchor gate ──────────────────────────────────

    function test_settleBatch_revertsOnSpecBindingMismatch() public {
        (, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events, bytes32 newRoot) = _canonicalBatch();

        // The proof validated against a spec the registry does not anchor.
        bytes32 wrongSpecHash = keccak256("a permissive substitute spec");
        events.specBindings[0] = FigaroBatchVerifier.SpecBinding(clauseKey, wrongSpecHash);
        bytes memory pv = abi.encode(
            GENESIS, newRoot, uint64(block.chainid), address(verifier),
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            _hashUsageEmpty()
        );

        vm.expectRevert(
            abi.encodeWithSelector(FigaroBatchVerifier.SpecBindingMismatch.selector, clauseKey, SPEC_HASH, wrongSpecHash)
        );
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage());
    }

    function test_settleBatch_revertsOnUnregisteredClauseBinding() public {
        (, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events, bytes32 newRoot) = _canonicalBatch();

        // A clause key the registry never anchored: contentHashOf == 0,
        // which can never equal a real witness spec's hash.
        bytes32 strangerKey = keccak256(abi.encode("figaro-never-registered", uint64(1)));
        events.specBindings[0] = FigaroBatchVerifier.SpecBinding(strangerKey, SPEC_HASH);
        bytes memory pv = abi.encode(
            GENESIS, newRoot, uint64(block.chainid), address(verifier),
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            _hashUsageEmpty()
        );

        vm.expectRevert(
            abi.encodeWithSelector(FigaroBatchVerifier.SpecBindingMismatch.selector, strangerKey, bytes32(0), SPEC_HASH)
        );
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage());
    }

    function test_permissionless_newClause_settlesWithZeroVerifierChanges() public {
        // Open-world by construction: anchor a never-seen clause on the
        // registry and a batch validated against it settles — no verifier
        // redeploy, no code change anywhere.
        string memory novelId = "acme-cold-brew-terms";
        bytes32 novelSpecHash = keccak256("acme spec bytes");
        registry.registerClause{value: DEPOSIT}(novelId, 1, novelSpecHash, "ipfs://acme");
        bytes32 novelKey = keccak256(abi.encode(novelId, uint64(1)));

        (, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events, bytes32 newRoot) = _canonicalBatch();
        events.specBindings[0] = FigaroBatchVerifier.SpecBinding(novelKey, novelSpecHash);
        events.attestations[0].clauseId = novelKey;
        bytes memory pv = abi.encode(
            GENESIS, newRoot, uint64(block.chainid), address(verifier),
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            _hashUsageEmpty()
        );

        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage());
        assertEq(verifier.stateRoot(), newRoot);
    }

    // ── Continuity + binding-integrity reverts ──────────────────────

    function test_settleBatch_revertsOnStaleRoot() public {
        (bytes memory pv, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,) = _canonicalBatch();
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage());

        // Replaying the same batch: prevRoot no longer matches.
        vm.expectRevert(
            abi.encodeWithSelector(FigaroBatchVerifier.StateRootMismatch.selector, verifier.stateRoot(), GENESIS)
        );
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage());
    }

    function test_settleBatch_revertsOnChainIdMismatch() public {
        (, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events, bytes32 newRoot) = _canonicalBatch();
        bytes memory pv = abi.encode(
            GENESIS, newRoot, uint64(999), address(verifier),
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            _hashUsageEmpty()
        );
        vm.expectRevert(
            abi.encodeWithSelector(FigaroBatchVerifier.ChainIdMismatch.selector, uint64(block.chainid), uint64(999))
        );
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage());
    }

    function test_settleBatch_revertsOnTamperedPositions() public {
        (bytes memory pv, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,) = _canonicalBatch();
        positions[1].payout = 999 ether; // calldata no longer matches the proven hash
        vm.expectRevert(FigaroBatchVerifier.PositionHashMismatch.selector);
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage());
    }

    function test_settleBatch_revertsOnTamperedAttestations() public {
        (bytes memory pv, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,) = _canonicalBatch();
        events.attestations[0].contentRef = keccak256("forged");
        vm.expectRevert(FigaroBatchVerifier.AttestationHashMismatch.selector);
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage());
    }

    function test_settleBatch_revertsOnTamperedBindings() public {
        (bytes memory pv, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,) = _canonicalBatch();
        // Same clause key, different spec hash than the proof committed —
        // dies at the hash check BEFORE the registry anchor check.
        events.specBindings[0].specHash = keccak256("not what the proof said");
        vm.expectRevert(FigaroBatchVerifier.SpecBindingsHashMismatch.selector);
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage());
    }

    // ── Construction guards ─────────────────────────────────────────

    function test_constructor_guards() public {
        vm.expectRevert(FigaroBatchVerifier.ZeroVerifier.selector);
        new FigaroBatchVerifier(address(0), VKEY, address(registry), address(counter), GENESIS);

        vm.expectRevert(FigaroBatchVerifier.VerifierNotContract.selector);
        new FigaroBatchVerifier(address(0xDEAD), VKEY, address(registry), address(counter), GENESIS);

        vm.expectRevert(FigaroBatchVerifier.ZeroClauseRegistry.selector);
        new FigaroBatchVerifier(address(sp1), VKEY, address(0), address(counter), GENESIS);

        vm.expectRevert(FigaroBatchVerifier.ZeroUsageCounter.selector);
        new FigaroBatchVerifier(address(sp1), VKEY, address(registry), address(0), GENESIS);
    }

    function test_constructor_setsImmutablesAndGenesis() public view {
        assertEq(address(verifier.verifier()), address(sp1));
        assertEq(verifier.programVKey(), VKEY);
        assertEq(address(verifier.clauseRegistry()), address(registry));
        assertEq(verifier.stateRoot(), GENESIS);
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
            _hashUsageEmpty()
        );

        vm.expectEmit(true, true, true, true, address(verifier));
        emit FigaroBatchVerifier.BatchSettled(1, GENESIS, newRoot, 0);
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage());

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
            _hashUsageEmpty()
        );

        uint256 buyerBefore = token.balanceOf(buyer);
        uint256 contractBefore = token.balanceOf(address(verifier));
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage());
        assertEq(token.balanceOf(buyer), buyerBefore, "deposit == payout must move nothing");
        assertEq(token.balanceOf(address(verifier)), contractBefore, "contract balance untouched");
    }

    // ── Sequential batches: root chains, counter increments, and the
    //    stage-255 boundary packs identically to abi.encodePacked ────

    function test_settleBatch_rootChainsAcrossBatches_andStageBoundaryPacks() public {
        (bytes memory pv1, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events, bytes32 root2) = _canonicalBatch();
        verifier.settleBatch(hex"", pv1, positions, events, _emptyUsage());

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
            _hashUsageEmpty()
        );

        vm.expectEmit(true, true, true, true, address(verifier));
        emit FigaroBatchVerifier.Attestation(
            keccak256("order-2"), keccak256("process-2"), buyer, clauseKey, 255, keccak256("content-2")
        );
        verifier.settleBatch(hex"", pv2, none, events2, _emptyUsage());

        assertEq(verifier.stateRoot(), root3, "root chains across batches");
        assertEq(verifier.batchCount(), 2, "batch counter increments per batch");
    }

    // ── Verifying-contract binding revert ───────────────────────────

    function test_settleBatch_revertsOnVerifyingContractMismatch() public {
        (, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events, bytes32 newRoot) = _canonicalBatch();
        address impostor = address(0xBEEF);
        bytes memory pv = abi.encode(
            GENESIS, newRoot, uint64(block.chainid), impostor,
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            _hashUsageEmpty()
        );
        vm.expectRevert(
            abi.encodeWithSelector(FigaroBatchVerifier.VerifyingContractMismatch.selector, address(verifier), impostor)
        );
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage());
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
            _hashUsageEmpty()
        );

        vm.expectRevert(FigaroBatchVerifier.FeeOnTransferDetected.selector);
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage());
    }

    // ── Atomicity: a failed pull reverts the WHOLE batch ────────────
    //
    // The sequencer-DoS scenario in the contract NatSpec: approval verified
    // pre-submission, revoked (or balance drained) before the batch lands.
    // The batch must revert atomically — no partial payout leg, no root
    // advance, no counter bump.

    function test_settleBatch_atomicRevert_onRevokedApproval() public {
        (bytes memory pv, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,) = _canonicalBatch();
        uint256 sellerBefore = token.balanceOf(seller);

        vm.prank(buyer);
        token.approve(address(verifier), 0);

        vm.expectRevert();
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage());

        assertEq(verifier.stateRoot(), GENESIS, "root must not advance on failed settle");
        assertEq(verifier.batchCount(), 0, "counter must not bump on failed settle");
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
            _hashUsageEmpty()
        );

        vm.expectRevert();
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage());
        assertEq(verifier.stateRoot(), GENESIS, "root must not advance on failed settle");
        assertEq(verifier.batchCount(), 0, "counter must not bump on failed settle");
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
            _hashUsageEmpty()
        );

        uint256 gasBefore = gasleft();
        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage());
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
            _hashUsage(usage)
        );
    }

    /// THE BRIDGE, end to end: settling a batch must leave the accrual on the
    /// COUNTER. Read back from the counter's own storage, never from the
    /// verifier's return or its events — the whole failure class this exists
    /// for is a call that is never made, or made and reverted.
    function test_settleBatch_writesTheAccrualToTheCounter() public {
        FigaroBatchVerifier.BatchUsageData memory usage = _usageFor(clauseKey, 3, 2);
        (bytes memory pv, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,) = _batchWithUsage(usage);

        verifier.settleBatch(hex"", pv, positions, events, usage);

        (uint64 c, uint64 d, uint256 score) = counter.batchAccrualOf(clauseKey, 0);
        assertEq(c, 3, "distinct settled processes");
        assertEq(d, 2, "distinct pairs");
        assertGt(score, 0, "and it is scored");
        assertEq(counter.scoreOf(clauseKey, 0), score, "which is what the reward reads");
        assertEq(counter.totalScoreIn(0), score, "and what the period total counts");
    }

    /// The accrual is calldata; the hash is the proof's. Tampering with the
    /// numbers after proving must not settle.
    function test_settleBatch_rejectsATamperedAccrual() public {
        FigaroBatchVerifier.BatchUsageData memory usage = _usageFor(clauseKey, 3, 2);
        (bytes memory pv, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,) = _batchWithUsage(usage);

        usage.accruals[0].c = 3000; // the proof committed 3

        vm.expectRevert(FigaroBatchVerifier.UsageAccrualHashMismatch.selector);
        verifier.settleBatch(hex"", pv, positions, events, usage);
    }

    /// WHY BOTH ARRAY LENGTHS ARE IN THE PREIMAGE. An accrual record is 48
    /// bytes and a seller 20, so five accruals span exactly twelve sellers'
    /// worth of bytes. Without the length prefixes the same byte string could
    /// be re-split — presenting accruals whose sellers were never stake-checked
    /// while the hash still matched. Moving the boundary must change the hash.
    function test_usageHash_isNotReSplittableBetweenTheTwoArrays() public view {
        FigaroBatchVerifier.BatchUsageData memory five;
        five.accruals = new IUsageCounter.BatchAccrual[](5);
        five.sellers = new address[](0);

        FigaroBatchVerifier.BatchUsageData memory twelve;
        twelve.accruals = new IUsageCounter.BatchAccrual[](0);
        twelve.sellers = new address[](12);

        // Same total span (5 × 48 == 12 × 20 == 240 bytes), all-zero contents.
        assertTrue(_hashUsage(five) != _hashUsage(twelve), "the split must be pinned by the hash");
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
        u.provenanceClause = keccak256("prov");
        u.accruals = new IUsageCounter.BatchAccrual[](2);
        u.accruals[0] = IUsageCounter.BatchAccrual(keccak256("artifact-a"), 4, 2);
        u.accruals[1] = IUsageCounter.BatchAccrual(keccak256("artifact-b"), 1, 1);
        u.sellers = new address[](2);
        u.sellers[0] = address(1);
        u.sellers[1] = address(2);

        bytes32 expected = 0xbeca15eaa93af04e1ce0b2a64c02685cc52912dab5037baf19efc8f082931ecc;
        assertEq(_hashUsage(u), expected, "the test mirror matches the Rust vector");

        // And so does the contract's assembly: a batch committing `expected`
        // gets past the usage-hash check into the counter, which rejects period
        // 3 as not open. Settlement is decoupled from that rejection (Fix 1a),
        // so the batch SETTLES and the accrual is dropped — which is itself
        // proof the hash matched (a mismatch would revert UsageAccrualHashMismatch
        // before the counter is ever reached).
        (, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events, bytes32 newRoot) = _canonicalBatch();
        bytes memory pv = abi.encode(
            GENESIS,
            newRoot,
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            _hashAttestations(events.attestations),
            _hashBindings(events.specBindings),
            expected
        );
        vm.expectEmit(true, false, false, false, address(verifier));
        emit FigaroBatchVerifier.BatchAccrualSkipped(1, hex"");
        verifier.settleBatch(hex"", pv, positions, events, u);
        assertEq(verifier.stateRoot(), newRoot, "settles despite the rejected accrual");
    }

    /// The counter's gates are the COUNTER's, and settlement is DECOUPLED from
    /// them (audit Fix 1a): a batch that trips a reward-tier gate still settles
    /// its token positions and advances state — the accrual is dropped, never
    /// the trade. A reward gate must not unwind another party's settlement.
    function test_settleBatch_settlesEvenWhenTheCounterRejectsTheAccrual() public {
        FigaroBatchVerifier.BatchUsageData memory usage = _usageFor(clauseKey, 1, 1);
        (bytes memory pv, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events, bytes32 newRoot) = _batchWithUsage(usage);

        vm.prank(seller);
        members.requestWithdrawal(); // the seller de-surfaces between prove and submit

        uint256 sellerBefore = token.balanceOf(seller);

        // The accrual is dropped (topic1 = batch id 1); reason bytes not asserted.
        vm.expectEmit(true, false, false, false, address(verifier));
        emit FigaroBatchVerifier.BatchAccrualSkipped(1, hex"");
        verifier.settleBatch(hex"", pv, positions, events, usage);

        assertEq(verifier.stateRoot(), newRoot, "settlement advances despite the dropped accrual");
        assertEq(token.balanceOf(seller) - sellerBefore, 300 ether, "the seller is still paid");
        (,, uint256 score) = counter.batchAccrualOf(clauseKey, usage.period);
        assertEq(score, 0, "the accrual was dropped, not applied");
    }

    /// Trade outlives the reward: once accrual closes, batches carrying no
    /// claims must still settle. This is the liveness leg of the bridge.
    function test_settleBatch_stillSettlesAfterAccrualCloses() public {
        vm.warp(PERIOD_END + 1);
        (bytes memory pv, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events, bytes32 newRoot) = _canonicalBatch();

        verifier.settleBatch(hex"", pv, positions, events, _emptyUsage());
        assertEq(verifier.stateRoot(), newRoot, "settlement is not hostage to the reward schedule");
    }
}
