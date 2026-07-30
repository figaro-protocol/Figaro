// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroCore} from "src/kernel/FigaroCore.sol";
import {CommitmentTypes} from "src/kernel/CommitmentTypes.sol";
import {MembersRegistry} from "src/protocol/registries/MembersRegistry.sol";
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
    MembersRegistry members;
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

    bytes32 constant GEO_KEY = keccak256(abi.encode("figaro-geolocation", uint64(1)));
    bytes32 constant CARGO_KEY = keccak256(abi.encode("figaro-cargo", uint64(1)));

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
        members = new MembersRegistry(0, 0);

        // The seller-side live-stake gate: only a registered seller's settled
        // trades count. Both sellers stake here (zero deposit in this suite).
        vm.prank(seller1);
        members.register("ipfs://seller1");
        vm.prank(seller2);
        members.register("ipfs://seller2");

        uint64[] memory periods = new uint64[](2);
        periods[0] = P0_END;
        periods[1] = P1_END;
        counter = new UsageCounter(address(core), address(members), PROV_KEY, _excluded(), periods);

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
        counter.recordClauseUsage(c, artifact, keccak256(SECTION), new bytes32[](0));
    }

    // ── What a record proves ────────────────────────────────────────

    function test_recordsSettledUsage() public {
        CommitmentTypes.Commitment memory c = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(c, CARGO_KEY);

        (uint64 cCount, uint64 d, uint256 score) = counter.accrualOf(CARGO_KEY, 0);
        assertEq(cCount, 1);
        assertEq(d, 1);
        // Uniform score: icbrt(1 * 1 * 1e18) = 1e6 (no weight multiplier).
        assertEq(score, 1e6);
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
        counter.recordClauseUsage(c, CARGO_KEY, keccak256(hex"dead"), new bytes32[](0));
    }

    // ── Seller-side live-stake gate ──────────────────────────────────

    function test_revertsWhenSellerNotStaked() public {
        // Usage counts only if the seller-of-record holds a LIVE MembersRegistry
        // stake — the breadth Sybil defense. An unregistered seller's settled
        // trade cannot accrue, so fabricating pairs costs a stake per seller.
        uint256 strangerKey = 0x5757;
        address stranger = vm.addr(strangerKey);
        token.mint(stranger, 1_000_000 ether);
        vm.prank(stranger);
        token.approve(address(core), type(uint256).max);

        CommitmentTypes.Commitment memory c =
            _settledOrder(CARGO_KEY, buyer, BUYER_KEY, stranger, strangerKey, 1);
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.SellerNotStaked.selector, stranger));
        _record(c, CARGO_KEY);
    }

    function test_sellerLeavingTheRegistryStopsCounting() public {
        // A seller who asks to leave de-surfaces AND stops conferring reward: a
        // later trade of theirs no longer counts. The gate closes at REQUEST —
        // the ETH is still locked in the cooldown at this point, so eligibility
        // and custody are deliberately not the same moment.
        CommitmentTypes.Commitment memory a = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(a, CARGO_KEY);

        vm.prank(seller1);
        members.requestWithdrawal();

        CommitmentTypes.Commitment memory b = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 2);
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.SellerNotStaked.selector, seller1));
        _record(b, CARGO_KEY);
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

    /// Repeat trade is bounded by the SCORE, not by a cliff. The per-pair cap of
    /// 5 was deleted 2026-07-30 — it never bound for an attacker optimising score
    /// per unit cost (optimum: one trade per fabricated pair) and only ever bound
    /// honest repeat trade. What does the work is `c^(1/3)`: a pair trading many
    /// times adds volume that is discounted far more steeply than the cap's cliff.
    function test_repeatTradeIsDiscountedNotRefused() public {
        for (uint256 i = 0; i < 8; i++) {
            CommitmentTypes.Commitment memory c =
                _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, i + 1);
            _record(c, CARGO_KEY);
        }
        (uint64 cCount, uint64 d, uint256 repeatScore) = counter.accrualOf(CARGO_KEY, 0);
        assertEq(cCount, 8, "every settled process counts");
        assertEq(d, 1, "one pair is one unit of breadth, however often it trades");

        // Eight trades between ONE pair must score below eight DISTINCT pairs
        // trading once each — breadth outweighs volume, which is the whole point
        // of the exponent split.
        assertLt(repeatScore, _score(8, 8), "repeat trade must not rival real breadth");
        assertEq(repeatScore, _score(8, 1));
    }

    // ── Exclusions ──────────────────────────────────────────────────

    function test_mandatoryClausesEarnNothing() public {
        // figaro-commerce and figaro-topology are committed on EVERY order, so
        // their count is just the process count and says nothing about adoption.
        // Scoring them would pay their authors for the protocol's own floor.
        bytes32 commerceKey = keccak256(abi.encode("figaro-commerce", uint64(1)));

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

    // ── Uniform scoring (no tag / category / weight) ─────────────────

    function test_scoringIsUniformAcrossArtifacts() public {
        // Equal usage ⇒ equal score, whatever the artifact: no boosted tag, no
        // category, no weight. The 600M pays for real usage alone.
        CommitmentTypes.Commitment memory g = _settledOrder(GEO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(g, GEO_KEY);
        CommitmentTypes.Commitment memory k = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 2);
        _record(k, CARGO_KEY);

        (,, uint256 geoScore) = counter.accrualOf(GEO_KEY, 0);
        (,, uint256 cargoScore) = counter.accrualOf(CARGO_KEY, 0);
        assertEq(geoScore, cargoScore);
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

    function test_sameProcessCannotCountInASecondPeriod() public {
        // Idempotence is GLOBAL per (artifact, process): one settled trade is
        // counted once ever. A resolved order stays resolved and its struct is
        // public, so a per-period key would let the same trade be re-presented
        // in every period — paying for recording gas instead of adoption, and
        // letting one fabricated farm earn from all three tranches.
        CommitmentTypes.Commitment memory a = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(a, CARGO_KEY);
        vm.warp(P0_END + 1);

        vm.expectRevert(UsageCounter.AlreadyCounted.selector);
        _record(a, CARGO_KEY);

        (uint64 c0,,) = counter.accrualOf(CARGO_KEY, 0);
        (uint64 c1,,) = counter.accrualOf(CARGO_KEY, 1);
        assertEq(c0, 1, "counted in the period it was recorded");
        assertEq(c1, 0, "never counted again in a later period");
    }

    /// A period pays only for usage NEW to it — the property the declining
    /// 300M/200M/100M tranche schedule assumes.
    function test_laterPeriodCountsOnlyNewTrade() public {
        CommitmentTypes.Commitment memory old_ = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(old_, CARGO_KEY);
        vm.warp(P0_END + 1);

        CommitmentTypes.Commitment memory fresh = _settledOrder(CARGO_KEY, buyer2, BUYER2_KEY, seller2, SELLER2_KEY, 2);
        _record(fresh, CARGO_KEY);

        (uint64 c1, uint64 d1,) = counter.accrualOf(CARGO_KEY, 1);
        assertEq(c1, 1, "only the new trade");
        assertEq(d1, 1, "and only its pair");
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
        // The ceiling itself, and the value one past it: a wrong bound here is
        // what saturated every real score. floor(cbrt(2^256-1)).
        assertEq(counter.icbrt(type(uint256).max), 48740834812604276470692694);
    }

    /// The defining property, over the WHOLE uint256 domain the function accepts.
    /// An earlier version of this test fuzzed `uint64 n` only — inside uint64 the
    /// old (wrong) uint64-sized cube guard is coincidentally exact, so the bug it
    /// was meant to catch was invisible to it. Never bound a fuzz domain to less
    /// than the function's own.
    function testFuzz_icbrtIsFloorCubeRoot(uint256 n) public view {
        uint256 root = counter.icbrt(n);
        assertLe(root * root * root, n);
        // Only assert the upper side while (root+1)^3 is still representable.
        if (root + 1 <= 48740834812604276470692694) {
            assertGt((root + 1) * (root + 1) * (root + 1), n);
        }
    }

    // ── Gas anchor ──────────────────────────────────────────────────

    /// @notice The canonical cost of ONE `recordClauseUsage` call, all-in on a cold
    ///         first record for an artifact (the shape an attacker or an author
    ///         actually pays). Measured here because this is the only place it is
    ///         measured — it is NOT in `sdk/src/gasCeilings.ts`, which exists to
    ///         derive per-block/per-process CEILINGS and has no consumer for this
    ///         figure; an unused export there would be dead code.
    /// @dev    TWO figures exist and they are not interchangeable — say which:
    ///         ~168,678 ALL-IN (`forge --gas-report` median, includes calldata)
    ///         and ~162,642 in-test EXECUTION (what `gasleft()` sees; calldata is
    ///         charged at the tx level, outside the call). This anchor is the
    ///         all-in ceiling. ANY analysis quoting the cost of manufacturing
    ///         usage (the RPGF soundness bound's `γ`) must cite the all-in figure
    ///         plus the 21,000 tx base cost, never a re-derivation. If the band
    ///         below breaks, the accrual path changed: re-measure, update this
    ///         anchor, and revisit the bound — γ is what prices Sybil resistance.
    uint256 internal constant RECORD_USAGE_GAS = 169_000;

    function test_Gas_recordUsageStaysAtItsAnchor() public {
        CommitmentTypes.Commitment memory c =
            _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 0xA45);
        uint256 before = gasleft();
        counter.recordClauseUsage(c, CARGO_KEY, keccak256(SECTION), new bytes32[](0));
        uint256 used = before - gasleft();
        emit log_named_uint("recordUsage_exec_gas", used);

        // A wide band: this is a drift alarm, not a micro-benchmark. The in-test
        // execution figure excludes the tx base cost and calldata charges.
        assertGe(used, 60_000, "recordClauseUsage got unexpectedly cheap - did a gate get dropped?");
        assertLe(used, RECORD_USAGE_GAS, "recordClauseUsage exceeded its anchor - re-measure and reprice the bound");
    }

    /// `_score(c, d)` as the contract computes it — the scoring input, spelled out
    /// here rather than exposed as production surface for a test's convenience.
    function _score(uint64 c, uint64 d) internal view returns (uint256) {
        if (c == 0 || d == 0) return 0;
        return counter.icbrt(uint256(c) * uint256(d) * uint256(d) * 1e18);
    }

    /// Real usage must not saturate: the score has to keep separating artifacts
    /// far beyond `c * d^2 = 19`, where the old bound flattened everything to
    /// 2642245 and turned the pro-rata split into an equal split.
    function test_scoreDoesNotSaturateAtRealUsage() public view {
        assertEq(_score(4, 2), 2519842);
        assertEq(_score(5, 2), 2714417);
        assertEq(_score(100, 10), 21544346);
        assertEq(_score(1000, 50), 135720880);
        assertEq(_score(10000, 1000), 2154434690);
    }

    /// Strict separation: a thousandfold difference in real usage must show up in
    /// the score, or pro rata pays adoption and farming the same.
    function testFuzz_scoreSeparatesRealUsage(uint32 c, uint32 d) public view {
        vm.assume(c > 0 && d > 0);
        assertGe(_score(uint64(c) + 1, d), _score(c, d));
        assertGt(_score(uint64(c) * 1000 + 1, d), _score(c, d));
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
        new UsageCounter(address(0), address(members), PROV_KEY, _excluded(), p);
        vm.expectRevert(UsageCounter.ZeroAddress.selector);
        new UsageCounter(address(core), address(0), PROV_KEY, _excluded(), p);
    }

    function test_constructor_rejectsEmptyPeriods() public {
        vm.expectRevert(UsageCounter.EmptyPeriods.selector);
        new UsageCounter(address(core), address(members), PROV_KEY, _excluded(), new uint64[](0));
    }

    function test_constructor_rejectsUnorderedPeriods() public {
        uint64[] memory p = new uint64[](2);
        p[0] = P1_END;
        p[1] = P0_END;
        vm.expectRevert(UsageCounter.PeriodsNotAscending.selector);
        new UsageCounter(address(core), address(members), PROV_KEY, _excluded(), p);
    }
}
