// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroCore} from "src/kernel/FigaroCore.sol";
import {CommitmentTypes} from "src/kernel/CommitmentTypes.sol";
import {ClauseRegistry} from "src/protocol/registries/ClauseRegistry.sol";
import {UsageCounter} from "src/protocol/usage/UsageCounter.sol";
import {MockERC20} from "src/mocks/MockERC20.sol";
import {AgreementTestHelper} from "test/helpers/AgreementTestHelper.sol";

/// @notice UsageCounter — the accrual that replaces reconstructing usage after
///         the fact. Every test here is a property of "count it when it
///         happens": nothing is trusted but the proof, a settled process counts
///         exactly once, breadth is capped so repeat trade cannot farm an
///         artifact, and a period's numbers stop moving when it ends.
contract UsageCounterTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore core;
    ClauseRegistry clauses;
    UsageCounter counter;
    MockERC20 token;

    uint256 constant BUYER_KEY = 0xB0;
    uint256 constant SELLER1_KEY = 0x51;
    uint256 constant SELLER2_KEY = 0x52;
    uint256 constant BUYER2_KEY = 0xB1;

    address buyer;
    address buyer2;
    address seller1;
    address seller2;

    string constant GEO_ID = "figaro-geolocation";
    bytes32 constant GEO_KEY = keccak256(abi.encode("figaro-geolocation", uint64(1)));
    string constant CARGO_ID = "figaro-cargo";
    bytes32 constant CARGO_KEY = keccak256(abi.encode("figaro-cargo", uint64(1)));

    bytes32 constant GEO_TAG = keccak256("geo");
    bytes32 constant PROV_KEY = keccak256(abi.encode("figaro-assembly-provenance", uint64(1)));
    bytes constant SECTION = hex"c0ffee";

    uint64 constant P0_END = 1_000_000;
    uint64 constant P1_END = 2_000_000;

    function setUp() public {
        buyer = vm.addr(BUYER_KEY);
        buyer2 = vm.addr(BUYER2_KEY);
        seller1 = vm.addr(SELLER1_KEY);
        seller2 = vm.addr(SELLER2_KEY);

        core = new FigaroCore();
        token = new MockERC20("Test", "TST");
        clauses = new ClauseRegistry(0);

        // figaro-geolocation carries the boosted tag; figaro-cargo is untagged.
        clauses.registerClause(GEO_ID, 1, keccak256("geo-spec"), "ipfs://geo", GEO_TAG);
        clauses.registerClause(CARGO_ID, 1, keccak256("cargo-spec"), "ipfs://cargo", bytes32(0));

        uint64[] memory periods = new uint64[](2);
        periods[0] = P0_END;
        periods[1] = P1_END;
        counter = new UsageCounter(address(core), address(clauses), GEO_TAG, PROV_KEY, _excluded(), periods);

        address[4] memory ppl = [buyer, buyer2, seller1, seller2];
        for (uint256 i = 0; i < ppl.length; i++) {
            token.mint(ppl[i], 1_000_000 ether);
            vm.prank(ppl[i]);
            token.approve(address(core), type(uint256).max);
        }

        // Start inside period 0.
        vm.warp(P0_END - 1000);
    }

    /// @dev The protocol-floor clauses excluded from scoring on every deployment:
    ///      the two order-mandatory clauses plus assembly-provenance.
    function _excluded() internal pure returns (bytes32[] memory e) {
        e = new bytes32[](3);
        e[0] = keccak256(abi.encode("figaro-commerce", uint64(1)));
        e[1] = keccak256(abi.encode("figaro-topology", uint64(1)));
        e[2] = keccak256(abi.encode("figaro-assembly-provenance", uint64(1)));
    }

    // ── Helpers ─────────────────────────────────────────────────────

    function _sign(CommitmentTypes.Commitment memory c, uint256 key) internal view returns (bytes memory) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("FigaroCore"),
                keccak256("3"),
                block.chainid,
                address(core)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, c.hashStruct()));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev A settled one-order process whose agreement commits `artifact`.
    ///      Returns the commitment so the counter can be handed the signed
    ///      struct exactly as the parties signed it.
    function _settledOrder(bytes32 artifact, address b, uint256 bKey, address s, uint256 sKey, uint256 salt)
        internal
        returns (CommitmentTypes.Commitment memory c)
    {
        c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: b,
            seller: s,
            currency: address(token),
            payment: 100 ether,
            expectedCumulativeValue: 100 ether,
            agreementHash: AgreementTestHelper.singleSectionRoot(artifact, SECTION),
            salt: salt,
            deadline: block.timestamp + 1 hours
        });
        (bytes32 processId,) = core.commit(c, _sign(c, bKey), _sign(c, sKey));

        CommitmentTypes.Commitment[] memory all = new CommitmentTypes.Commitment[](1);
        all[0] = c;
        vm.prank(b);
        core.resolveProcess(processId, all);
    }

    /// @dev A committed-but-open process — nothing resolved.
    function _openOrder(bytes32 artifact, uint256 salt) internal returns (CommitmentTypes.Commitment memory c) {
        c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller1,
            currency: address(token),
            payment: 100 ether,
            expectedCumulativeValue: 100 ether,
            agreementHash: AgreementTestHelper.singleSectionRoot(artifact, SECTION),
            salt: salt,
            deadline: block.timestamp + 1 hours
        });
        core.commit(c, _sign(c, BUYER_KEY), _sign(c, SELLER1_KEY));
    }

    function _record(CommitmentTypes.Commitment memory c, bytes32 artifact) internal {
        // The section FINGERPRINT (keccak256 of the committed bytes) — never the
        // preimage — is what the merkle leaf needs and all the calldata carries.
        counter.recordUsage(c, artifact, keccak256(SECTION), new bytes32[](0));
    }

    // ── What a record proves ────────────────────────────────────────

    function test_recordsSettledUsage() public {
        CommitmentTypes.Commitment memory c = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(c, CARGO_KEY);

        (uint64 cCount, uint64 d, uint256 score) = counter.accrualOf(CARGO_KEY, 0);
        assertEq(cCount, 1);
        assertEq(d, 1);
        // BASE_WEIGHT * icbrt(1 * 1 * 1e18) = 1000 * 1e6
        assertEq(score, 1000 * 1e6);
        assertEq(counter.totalScoreIn(0), score);
    }

    function test_recordIsPermissionless() public {
        CommitmentTypes.Commitment memory c = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        // A stranger records it — the proof is what is trusted, never the caller.
        vm.prank(address(0xDEAD));
        _record(c, CARGO_KEY);
        (uint64 cCount,,) = counter.accrualOf(CARGO_KEY, 0);
        assertEq(cCount, 1);
    }

    function test_revertsWhenOrderStillOpen() public {
        // Usage is what a SETTLED process leaves behind. An open process has not
        // yet added the value being counted — this is the inverse of the
        // attestation gate, which wants the process open.
        CommitmentTypes.Commitment memory c = _openOrder(CARGO_KEY, 7);
        vm.expectRevert(UsageCounter.OrderNotResolved.selector);
        _record(c, CARGO_KEY);
    }

    function test_revertsOnUnknownOrder() public {
        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller1,
            currency: address(token),
            payment: 1 ether,
            expectedCumulativeValue: 1 ether,
            agreementHash: AgreementTestHelper.singleSectionRoot(CARGO_KEY, SECTION),
            salt: 999,
            deadline: block.timestamp + 1 hours
        });
        vm.expectRevert(UsageCounter.UnknownOrder.selector);
        _record(c, CARGO_KEY);
    }

    function test_revertsWhenArtifactNotInAgreement() public {
        // The agreement commits CARGO; claiming GEO was used must not open.
        CommitmentTypes.Commitment memory c = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        vm.expectRevert(UsageCounter.InvalidInclusionProof.selector);
        _record(c, GEO_KEY);
    }

    function test_revertsOnWrongSectionHash() public {
        CommitmentTypes.Commitment memory c = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        vm.expectRevert(UsageCounter.InvalidInclusionProof.selector);
        counter.recordUsage(c, CARGO_KEY, keccak256(hex"dead"), new bytes32[](0));
    }

    // ── Counting properties ─────────────────────────────────────────

    function test_sameProcessCountsOnce() public {
        CommitmentTypes.Commitment memory c = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(c, CARGO_KEY);
        vm.expectRevert(UsageCounter.AlreadyCounted.selector);
        _record(c, CARGO_KEY);
    }

    function test_distinctPairsRaiseDiversity() public {
        CommitmentTypes.Commitment memory a = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(a, CARGO_KEY);
        CommitmentTypes.Commitment memory b = _settledOrder(CARGO_KEY, buyer2, BUYER2_KEY, seller2, SELLER2_KEY, 2);
        _record(b, CARGO_KEY);

        (uint64 cCount, uint64 d,) = counter.accrualOf(CARGO_KEY, 0);
        assertEq(cCount, 2);
        assertEq(d, 2);
    }

    function test_repeatPairRaisesVolumeNotDiversity() public {
        // Breadth is the signal: a second process between the SAME two wallets
        // moves c but not d.
        CommitmentTypes.Commitment memory a = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(a, CARGO_KEY);
        CommitmentTypes.Commitment memory b = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 2);
        _record(b, CARGO_KEY);

        (uint64 cCount, uint64 d,) = counter.accrualOf(CARGO_KEY, 0);
        assertEq(cCount, 2);
        assertEq(d, 1);
    }

    function test_pairCapStopsFarming() public {
        // Five processes from one pair count; the sixth is refused outright, so
        // repeat trade between two wallets cannot inflate an artifact.
        for (uint256 i = 0; i < 5; i++) {
            CommitmentTypes.Commitment memory c =
                _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, i + 1);
            _record(c, CARGO_KEY);
        }
        (uint64 cCount,,) = counter.accrualOf(CARGO_KEY, 0);
        assertEq(cCount, 5);

        CommitmentTypes.Commitment memory sixth =
            _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 6);
        vm.expectRevert(UsageCounter.PairCapReached.selector);
        _record(sixth, CARGO_KEY);
    }

    // ── Exclusions ──────────────────────────────────────────────────

    function test_mandatoryClausesEarnNothing() public {
        // figaro-commerce and figaro-topology are committed on EVERY order, so
        // their count is just the process count and says nothing about adoption.
        // Scoring them would pay their authors for the protocol's own floor.
        string memory commerceId = "figaro-commerce";
        bytes32 commerceKey = keccak256(abi.encode("figaro-commerce", uint64(1)));
        clauses.registerClause(commerceId, 1, keccak256("commerce-spec"), "ipfs://commerce", bytes32(0));

        CommitmentTypes.Commitment memory c =
            _settledOrder(commerceKey, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.ArtifactExcluded.selector, commerceKey));
        _record(c, commerceKey);

        (uint64 cCount,, uint256 score) = counter.accrualOf(commerceKey, 0);
        assertEq(cCount, 0);
        assertEq(score, 0);
        assertEq(counter.totalScoreIn(0), 0);
    }

    function test_exclusionIsDeployFrozenNotSelfDeclared() public view {
        // A registrar cannot opt their own clause out or in — the set is fixed
        // at deploy, because a self-declared exclusion would never be declared.
        assertTrue(counter.excludedArtifact(keccak256(abi.encode("figaro-commerce", uint64(1)))));
        assertTrue(counter.excludedArtifact(keccak256(abi.encode("figaro-topology", uint64(1)))));
        assertTrue(counter.excludedArtifact(PROV_KEY));
        assertFalse(counter.excludedArtifact(CARGO_KEY));
        assertFalse(counter.excludedArtifact(GEO_KEY));
    }

    // ── Weighting ───────────────────────────────────────────────────

    function test_taggedArtifactEarnsBoostedWeight() public {
        assertEq(counter.weightOf(GEO_KEY), counter.BOOSTED_WEIGHT());
        assertEq(counter.weightOf(CARGO_KEY), counter.BASE_WEIGHT());

        CommitmentTypes.Commitment memory g = _settledOrder(GEO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(g, GEO_KEY);
        CommitmentTypes.Commitment memory k = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 2);
        _record(k, CARGO_KEY);

        (,, uint256 geoScore) = counter.accrualOf(GEO_KEY, 0);
        (,, uint256 cargoScore) = counter.accrualOf(CARGO_KEY, 0);
        assertEq(geoScore, cargoScore * 3);
    }

    function test_unregisteredArtifactEarnsBaseWeight() public view {
        // An assembly compositionHash is not in ClauseRegistry — it must not
        // revert, and it must not earn the clause boost.
        assertEq(counter.weightOf(keccak256("some-assembly")), counter.BASE_WEIGHT());
    }

    // ── Periods ─────────────────────────────────────────────────────

    function test_usageBucketsIntoTheOpenPeriod() public {
        assertEq(counter.currentPeriod(), 0);
        CommitmentTypes.Commitment memory a = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(a, CARGO_KEY);

        vm.warp(P0_END + 1);
        assertEq(counter.currentPeriod(), 1);
        CommitmentTypes.Commitment memory b = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 2);
        _record(b, CARGO_KEY);

        (uint64 c0,,) = counter.accrualOf(CARGO_KEY, 0);
        (uint64 c1,,) = counter.accrualOf(CARGO_KEY, 1);
        assertEq(c0, 1);
        assertEq(c1, 1);
    }

    function test_closedPeriodStopsMoving() public {
        CommitmentTypes.Commitment memory a = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(a, CARGO_KEY);
        uint256 frozen = counter.totalScoreIn(0);

        assertFalse(counter.periodClosed(0));
        vm.warp(P0_END + 1);
        assertTrue(counter.periodClosed(0));

        // Later usage lands in period 1 and cannot disturb period 0 — which is
        // what lets a consumer pay out pro rata with no snapshot.
        CommitmentTypes.Commitment memory b = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 2);
        _record(b, CARGO_KEY);
        assertEq(counter.totalScoreIn(0), frozen);
    }

    function test_accrualClosesAfterFinalPeriod() public {
        vm.warp(P1_END + 1);
        vm.expectRevert(UsageCounter.AccrualClosed.selector);
        counter.currentPeriod();
    }

    function test_sameProcessMayCountInASecondPeriod() public {
        // Idempotence is per (artifact, period): a process settled in period 0
        // is not double-counted there, and periods are independent ledgers.
        CommitmentTypes.Commitment memory a = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(a, CARGO_KEY);
        vm.warp(P0_END + 1);
        _record(a, CARGO_KEY);

        (uint64 c0,,) = counter.accrualOf(CARGO_KEY, 0);
        (uint64 c1,,) = counter.accrualOf(CARGO_KEY, 1);
        assertEq(c0, 1);
        assertEq(c1, 1);
    }

    // ── Scoring maths ───────────────────────────────────────────────

    function test_icbrtMatchesCubes() public view {
        assertEq(counter.icbrt(0), 0);
        assertEq(counter.icbrt(1), 1);
        assertEq(counter.icbrt(7), 1);
        assertEq(counter.icbrt(8), 2);
        assertEq(counter.icbrt(26), 2);
        assertEq(counter.icbrt(27), 3);
        assertEq(counter.icbrt(1e18), 1e6);
    }

    function testFuzz_icbrtIsFloorCubeRoot(uint64 n) public view {
        uint256 root = counter.icbrt(n);
        assertLe(root * root * root, uint256(n));
        assertGt((root + 1) * (root + 1) * (root + 1), uint256(n));
    }

    function test_totalScoreIsTheSumOfArtifactScores() public {
        CommitmentTypes.Commitment memory g = _settledOrder(GEO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(g, GEO_KEY);
        CommitmentTypes.Commitment memory k = _settledOrder(CARGO_KEY, buyer2, BUYER2_KEY, seller2, SELLER2_KEY, 2);
        _record(k, CARGO_KEY);

        (,, uint256 geoScore) = counter.accrualOf(GEO_KEY, 0);
        (,, uint256 cargoScore) = counter.accrualOf(CARGO_KEY, 0);
        assertEq(counter.totalScoreIn(0), geoScore + cargoScore);
    }

    // ── Constructor guards ──────────────────────────────────────────

    function test_constructor_rejectsZeroAddresses() public {
        uint64[] memory p = new uint64[](1);
        p[0] = P0_END;
        vm.expectRevert(UsageCounter.ZeroAddress.selector);
        new UsageCounter(address(0), address(clauses), GEO_TAG, PROV_KEY, _excluded(), p);
        vm.expectRevert(UsageCounter.ZeroAddress.selector);
        new UsageCounter(address(core), address(0), GEO_TAG, PROV_KEY, _excluded(), p);
    }

    function test_constructor_rejectsEmptyPeriods() public {
        vm.expectRevert(UsageCounter.EmptyPeriods.selector);
        new UsageCounter(address(core), address(clauses), GEO_TAG, PROV_KEY, _excluded(), new uint64[](0));
    }

    function test_constructor_rejectsUnorderedPeriods() public {
        uint64[] memory p = new uint64[](2);
        p[0] = P1_END;
        p[1] = P0_END;
        vm.expectRevert(UsageCounter.PeriodsNotAscending.selector);
        new UsageCounter(address(core), address(clauses), GEO_TAG, PROV_KEY, _excluded(), p);
    }
}
