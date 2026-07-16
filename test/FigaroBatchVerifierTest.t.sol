// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import "../src/FigaroBatchVerifier.sol";
import "../src/ClauseRegistry.sol";
import "../src/mocks/MockSP1Verifier.sol";
import "../src/mocks/MockERC20.sol";

/// @dev Unit tests for the realigned batch verifier: 7-word public values,
///      the spec-binding anchor check against the live ClauseRegistry, and
///      net-position reconciliation. Hash packing here mirrors the Rust
///      kernel's compute_*_hash functions; the byte-exact cross-language
///      lock is the sequencer batch e2e (a real apply_batch output settled
///      through this contract).
contract FigaroBatchVerifierTest is Test {
    FigaroBatchVerifier verifier;
    ClauseRegistry registry;
    MockSP1Verifier sp1;
    MockERC20 token;

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
        verifier = new FigaroBatchVerifier(address(sp1), VKEY, address(registry), GENESIS);
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
            _hashBindings(bindings)
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
        verifier.settleBatch(hex"", pv, positions, events);

        assertEq(verifier.stateRoot(), newRoot, "root advances");
        assertEq(verifier.batchCount(), 1);
        // Money legs from the chain: buyer pulled 200, seller pushed 300.
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
            _hashPositions(positions), _hashAttestations(events.attestations), _hashBindings(events.specBindings)
        );

        vm.expectRevert(
            abi.encodeWithSelector(FigaroBatchVerifier.SpecBindingMismatch.selector, clauseKey, SPEC_HASH, wrongSpecHash)
        );
        verifier.settleBatch(hex"", pv, positions, events);
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
            _hashPositions(positions), _hashAttestations(events.attestations), _hashBindings(events.specBindings)
        );

        vm.expectRevert(
            abi.encodeWithSelector(FigaroBatchVerifier.SpecBindingMismatch.selector, strangerKey, bytes32(0), SPEC_HASH)
        );
        verifier.settleBatch(hex"", pv, positions, events);
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
            _hashPositions(positions), _hashAttestations(events.attestations), _hashBindings(events.specBindings)
        );

        verifier.settleBatch(hex"", pv, positions, events);
        assertEq(verifier.stateRoot(), newRoot);
    }

    // ── Continuity + binding-integrity reverts ──────────────────────

    function test_settleBatch_revertsOnStaleRoot() public {
        (bytes memory pv, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,) = _canonicalBatch();
        verifier.settleBatch(hex"", pv, positions, events);

        // Replaying the same batch: prevRoot no longer matches.
        vm.expectRevert(
            abi.encodeWithSelector(FigaroBatchVerifier.StateRootMismatch.selector, verifier.stateRoot(), GENESIS)
        );
        verifier.settleBatch(hex"", pv, positions, events);
    }

    function test_settleBatch_revertsOnChainIdMismatch() public {
        (, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events, bytes32 newRoot) = _canonicalBatch();
        bytes memory pv = abi.encode(
            GENESIS, newRoot, uint64(999), address(verifier),
            _hashPositions(positions), _hashAttestations(events.attestations), _hashBindings(events.specBindings)
        );
        vm.expectRevert(
            abi.encodeWithSelector(FigaroBatchVerifier.ChainIdMismatch.selector, uint64(block.chainid), uint64(999))
        );
        verifier.settleBatch(hex"", pv, positions, events);
    }

    function test_settleBatch_revertsOnTamperedPositions() public {
        (bytes memory pv, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,) = _canonicalBatch();
        positions[1].payout = 999 ether; // calldata no longer matches the proven hash
        vm.expectRevert(FigaroBatchVerifier.PositionHashMismatch.selector);
        verifier.settleBatch(hex"", pv, positions, events);
    }

    function test_settleBatch_revertsOnTamperedAttestations() public {
        (bytes memory pv, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,) = _canonicalBatch();
        events.attestations[0].contentRef = keccak256("forged");
        vm.expectRevert(FigaroBatchVerifier.AttestationHashMismatch.selector);
        verifier.settleBatch(hex"", pv, positions, events);
    }

    function test_settleBatch_revertsOnTamperedBindings() public {
        (bytes memory pv, FigaroBatchVerifier.NetPosition[] memory positions,
            FigaroBatchVerifier.BatchEventData memory events,) = _canonicalBatch();
        // Same clause key, different spec hash than the proof committed —
        // dies at the hash check BEFORE the registry anchor check.
        events.specBindings[0].specHash = keccak256("not what the proof said");
        vm.expectRevert(FigaroBatchVerifier.SpecBindingsHashMismatch.selector);
        verifier.settleBatch(hex"", pv, positions, events);
    }

    // ── Construction guards ─────────────────────────────────────────

    function test_constructor_guards() public {
        vm.expectRevert(FigaroBatchVerifier.ZeroVerifier.selector);
        new FigaroBatchVerifier(address(0), VKEY, address(registry), GENESIS);

        vm.expectRevert(FigaroBatchVerifier.VerifierNotContract.selector);
        new FigaroBatchVerifier(address(0xDEAD), VKEY, address(registry), GENESIS);

        vm.expectRevert(FigaroBatchVerifier.ZeroClauseRegistry.selector);
        new FigaroBatchVerifier(address(sp1), VKEY, address(0), GENESIS);
    }
}
