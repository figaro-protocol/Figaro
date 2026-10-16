// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroCore} from "src/core/kernel/FigaroCore.sol";
import {CommitmentTypes} from "src/core/kernel/CommitmentTypes.sol";
import {MembersRegistry} from "src/app/MembersRegistry.sol";
import {ClauseRegistry} from "src/build/registries/ClauseRegistry.sol";
import {AssemblyRegistry} from "src/build/registries/AssemblyRegistry.sol";
import {AgreementRegistry} from "src/build/registries/AgreementRegistry.sol";
import {UsageCounter} from "src/build/rewards/UsageCounter.sol";
import {MockERC20} from "src/mocks/MockERC20.sol";
import {AgreementTestHelper} from "test/helpers/AgreementTestHelper.sol";
import {MockClauseOrAssemblyStake} from "test/helpers/MockClauseOrAssemblyStake.sol";

/// @notice UsageCounter — the accrual that replaces reconstructing usage after
///         the fact. Every test here is a property of "count it when it
///         happens": nothing is trusted but the proof, a resolved process counts
///         exactly once, breadth counts distinct LIVE-STAKED SELLERS (so every
///         unit of it costs a stake), a clause, agreement or assembly scores
///         nothing until the minimum-support floor is met, the three kinds
///         never share a count, and a period's numbers stop moving when it
///         ends.
contract UsageCounterTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore core;
    MembersRegistry members;
    UsageCounter counter;
    MockERC20 token;
    MockClauseOrAssemblyStake stake;

    uint256 constant BUYER_KEY = 0xB0;
    uint256 constant SELLER1_KEY = 0x51;
    uint256 constant SELLER2_KEY = 0x52;
    uint256 constant SELLER3_KEY = 0x53;
    uint256 constant BUYER2_KEY = 0xB1;

    address buyer;
    address buyer2;
    address seller1;
    address seller2;
    address seller3;

    // Each clause key is keccak256 of a spec's pinned bytes.
    bytes32 constant GEO_KEY = keccak256('{"clauseId":"figaro-geolocation","version":1}');
    bytes32 constant CARGO_KEY = keccak256('{"clauseId":"figaro-cargo","version":1}');

    /// @dev An assembly key for the batch path, which takes any bytes32; the
    ///      direct path proves membership, so it uses `_asmRoot()`.
    bytes32 constant ASM_KEY = keccak256("an-assembly");

    /// @dev Two registered agreements: the canonical content hash of each one's
    ///      `{ clauses }`. Agreement 0 of the test assembly instantiates
    ///      AGR_KEY, agreement 1 instantiates AGR2_KEY after agreement 0.
    bytes32 constant AGR_KEY = keccak256("an-agreement");
    bytes32 constant AGR2_KEY = keccak256("a-second-agreement");
    /// @dev Agreement 1's own fills: the topology clause naming agreement 0.
    string constant TOPOLOGY_FILL =
        '{"0x7070000000000000000000000000000000000000000000000000000000000000":{"parentOrderHashes":["order-0"]}}';
    /// @dev The canonical JSON of the test assembly's `assemblyClauses`.
    bytes constant TERMS = '{"0xabc0000000000000000000000000000000000000000000000000000000000000":{}}';

    /// @dev The counter's three kinds — every accrual, count and score is keyed by (kind, key).
    uint8 constant KIND_CLAUSE = 0;
    uint8 constant KIND_ASSEMBLY = 1;
    uint8 constant KIND_AGREEMENT = 2;

    /// @dev The agreement format's reserved provenance leaf key — a plain-string
    ///      preimage, never the canonical JSON bytes of a spec a clause key hashes.
    bytes32 constant PROVENANCE_LEAF = keccak256("figaro-agreement-provenance");
    bytes constant SECTION = hex"c0ffee";

    uint64 constant P0_END = 1_000_000;
    uint64 constant P1_END = 2_000_000;

    /// @dev Stands in for FigaroBatchVerifier — the batch-path accrual's only
    ///      permitted writer. A plain EOA here on purpose: what the counter
    ///      enforces is `msg.sender`, and using the real verifier would drag an
    ///      SP1 proof into every test of a gate that has nothing to do with
    ///      proving. The verifier's own leg is covered in
    ///      FigaroBatchVerifierTest.
    address constant batchVerifier = address(0xBA7C);

    function setUp() public {
        buyer = vm.addr(BUYER_KEY);
        buyer2 = vm.addr(BUYER2_KEY);
        seller1 = vm.addr(SELLER1_KEY);
        seller2 = vm.addr(SELLER2_KEY);
        seller3 = vm.addr(SELLER3_KEY);

        core = new FigaroCore();
        token = new MockERC20("Test", "TST");
        members = new MembersRegistry(0, 0);
        // Clause-or-assembly-side stake gate. One permissive mock stands in for both the
        // clause and assembly registries — every clause or assembly is live by default,
        // so counting tests need no registration; the gate itself is proved in
        // its own section with `kill()`.
        stake = new MockClauseOrAssemblyStake();

        // The seller-side live-stake gate: only a registered seller's resolved
        // trades count. Both sellers stake here (zero deposit in this suite).
        vm.prank(seller1);
        members.register("ipfs://seller1");
        vm.prank(seller2);
        members.register("ipfs://seller2");
        vm.prank(seller3);
        members.register("ipfs://seller3");

        uint64[] memory periods = new uint64[](2);
        periods[0] = P0_END;
        periods[1] = P1_END;
        // minSellers = 1 here: the floor is a deploy parameter, disabled in the
        // main fixture so each test isolates its own property. The floor's own
        // properties are proved in the "Minimum-support floor" section below on
        // a counter deployed at the mainnet value of 3.
        counter = new UsageCounter(
            address(core), address(members), address(stake), address(stake), address(stake), batchVerifier, 1, periods
        );

        address[5] memory ppl = [buyer, buyer2, seller1, seller2, seller3];
        for (uint256 i = 0; i < ppl.length; i++) {
            token.mint(ppl[i], 1_000_000 ether);
            vm.prank(ppl[i]);
            token.approve(address(core), type(uint256).max);
        }

        // Start inside period 0.
        vm.warp(P0_END - 1000);
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

    /// @dev A resolved one-order process whose agreement commits `clause or assembly`.
    ///      Returns the commitment so the counter can be handed the signed
    ///      struct exactly as the parties signed it.
    function _settledOrder(bytes32 clauseOrAssembly, address b, uint256 bKey, address s, uint256 sKey, uint256 salt)
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
            agreementHash: AgreementTestHelper.singleClauseRoot(clauseOrAssembly, SECTION),
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
    function _openOrder(bytes32 clauseOrAssembly, uint256 salt) internal returns (CommitmentTypes.Commitment memory c) {
        c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller1,
            currency: address(token),
            payment: 100 ether,
            expectedCumulativeValue: 100 ether,
            agreementHash: AgreementTestHelper.singleClauseRoot(clauseOrAssembly, SECTION),
            salt: salt,
            deadline: block.timestamp + 1 hours
        });
        core.commit(c, _sign(c, BUYER_KEY), _sign(c, SELLER1_KEY));
    }

    function _record(CommitmentTypes.Commitment memory c, bytes32 clauseOrAssembly) internal {
        // The section FINGERPRINT (keccak256 of the committed bytes) — never the
        // preimage — is what the merkle leaf needs and all the calldata carries.
        counter.recordClauseUsage(c, clauseOrAssembly, keccak256(SECTION), new bytes32[](0));
    }

    /// @dev A resolved one-order process whose agreement carries a clause
    ///      section and the format's reserved PROVENANCE leaf naming
    ///      `agreementKey` (the registered agreement the order instantiates)
    ///      and `compositionHash` (the assembly it came from). The section
    ///      commits as the canonical-JSON bytes the counter reproduces from
    ///      the two keys. Returns the provenance leaf's proof under the root.
    function _settledUnderAgreement(bytes32 agreementKey, bytes32 compositionHash, uint256 salt)
        internal
        returns (CommitmentTypes.Commitment memory c, bytes32[] memory provenanceProof)
    {
        bytes32[] memory leaves = new bytes32[](2);
        leaves[0] = AgreementTestHelper.leafFor(CARGO_KEY, SECTION);
        leaves[1] = AgreementTestHelper.leafFor(
            PROVENANCE_LEAF, AgreementTestHelper.provenanceLeaf(agreementKey, compositionHash)
        );
        provenanceProof = AgreementTestHelper.proofFor(leaves, 1);
        c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller1,
            currency: address(token),
            payment: 100 ether,
            expectedCumulativeValue: 100 ether,
            agreementHash: AgreementTestHelper.rootFor(leaves),
            salt: salt,
            deadline: block.timestamp + 1 hours
        });
        (bytes32 processId,) = core.commit(c, _sign(c, BUYER_KEY), _sign(c, SELLER1_KEY));

        CommitmentTypes.Commitment[] memory all = new CommitmentTypes.Commitment[](1);
        all[0] = c;
        vm.prank(buyer);
        core.resolveProcess(processId, all);
    }

    /// @dev The test assembly's agreement bytes: agreement 0 fills nothing,
    ///      agreement 1 fills the topology clause to follow agreement 0.
    function _agreementLeafBytes(uint256 entry) internal pure returns (bytes memory) {
        return AgreementTestHelper.agreementLeafBytes(entry, entry == 0 ? "{}" : TOPOLOGY_FILL);
    }

    /// @dev The registered agreement each agreement of the test assembly instantiates.
    function _boundAgreement(uint256 entry) internal pure returns (bytes32) {
        return entry == 0 ? AGR_KEY : AGR2_KEY;
    }

    /// @dev The test assembly's tree: one leaf per agreement (key = its
    ///      agreementKey, bytes = the agreement section) and the terms leaf.
    function _assemblyLeaves() internal pure returns (bytes32[] memory leaves) {
        leaves = new bytes32[](3);
        leaves[0] = AgreementTestHelper.leafFor(AGR_KEY, _agreementLeafBytes(0));
        leaves[1] = AgreementTestHelper.leafFor(AGR2_KEY, _agreementLeafBytes(1));
        leaves[2] = AgreementTestHelper.leafFor(AgreementTestHelper.ASSEMBLY_TERMS_LEAF_KEY, TERMS);
    }

    /// @dev The test assembly's compositionHash: the root of its tree.
    function _asmRoot() internal pure returns (bytes32) {
        return AgreementTestHelper.rootFor(_assemblyLeaves());
    }

    /// @dev Credit the test assembly for an order instantiating `entry`.
    function _recordAssembly(
        UsageCounter target,
        CommitmentTypes.Commitment memory c,
        uint256 entry,
        bytes32[] memory provenanceProof
    ) internal {
        target.recordAssemblyUsage(
            c,
            _asmRoot(),
            _boundAgreement(entry),
            keccak256(_agreementLeafBytes(entry)),
            provenanceProof,
            AgreementTestHelper.proofFor(_assemblyLeaves(), entry)
        );
    }

    // ── What a record proves ────────────────────────────────────────

    function test_recordsSettledUsage() public {
        CommitmentTypes.Commitment memory c = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(c, CARGO_KEY);

        (uint64 cCount, uint64 d, uint256 score) = counter.accrualOf(KIND_CLAUSE, CARGO_KEY, 0);
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
        (uint64 cCount,,) = counter.accrualOf(KIND_CLAUSE, CARGO_KEY, 0);
        assertEq(cCount, 1);
    }

    function test_revertsWhenOrderStillOpen() public {
        // Usage is what a RESOLVED process leaves behind. An open process has not
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
            agreementHash: AgreementTestHelper.singleClauseRoot(CARGO_KEY, SECTION),
            salt: 999,
            deadline: block.timestamp + 1 hours
        });
        vm.expectRevert(UsageCounter.UnknownOrder.selector);
        _record(c, CARGO_KEY);
    }

    function test_revertsWhenClauseOrAssemblyNotInAgreement() public {
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
        // stake — and since d counts distinct STAKED sellers, this gate is what
        // makes every unit of breadth cost a live stake.
        uint256 strangerKey = 0x5757;
        address stranger = vm.addr(strangerKey);
        token.mint(stranger, 1_000_000 ether);
        vm.prank(stranger);
        token.approve(address(core), type(uint256).max);

        CommitmentTypes.Commitment memory c = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, stranger, strangerKey, 1);
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

    function test_revertsWhenClauseNotRegistered() public {
        // The CLAUSE-OR-ASSEMBLY-side twin of the seller-stake gate: a clause earns only
        // while its own registration deposit is live. Without it a self-authored
        // agreement could commit any bytes32 leaf key and accrue score to it,
        // inflating the shared denominator at gas cost (audit M-2).
        stake.kill(CARGO_KEY);
        CommitmentTypes.Commitment memory c = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.ClauseOrAssemblyNotRegistered.selector, CARGO_KEY));
        _record(c, CARGO_KEY);
    }

    function test_revertsWhenAssemblyNotRegistered() public {
        // The assembly form of the clause-or-assembly-side stake gate: a
        // composition earns only while its AssemblyRegistry binding is live.
        // The provenance leaf opens (the process DID run under this assembly);
        // what fails is the stake behind the composition being credited.
        bytes32 root = _asmRoot();
        stake.kill(root);
        (CommitmentTypes.Commitment memory c, bytes32[] memory proof) = _settledUnderAgreement(AGR2_KEY, root, 1);
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.ClauseOrAssemblyNotRegistered.selector, root));
        _recordAssembly(counter, c, 1, proof);
    }

    function test_revertsWhenAgreementNotRegistered() public {
        // The agreement form of the same gate: a registered agreement earns
        // only while its AgreementRegistry binding is live. The provenance
        // leaf opens; what fails is the stake behind the agreement credited.
        stake.kill(AGR_KEY);
        (CommitmentTypes.Commitment memory c, bytes32[] memory proof) = _settledUnderAgreement(AGR_KEY, _asmRoot(), 1);
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.ClauseOrAssemblyNotRegistered.selector, AGR_KEY));
        counter.recordAgreementUsage(c, AGR_KEY, _asmRoot(), proof);
    }

    // ── Counting properties ─────────────────────────────────────────

    function test_sameProcessCountsOnce() public {
        CommitmentTypes.Commitment memory c = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(c, CARGO_KEY);
        vm.expectRevert(UsageCounter.AlreadyCounted.selector);
        _record(c, CARGO_KEY);
    }

    function test_distinctStakedSellersRaiseBreadth() public {
        // One buyer adopting through TWO staked sellers is two units of
        // breadth: d follows the priced identity, and both stakes are live.
        CommitmentTypes.Commitment memory a = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(a, CARGO_KEY);
        CommitmentTypes.Commitment memory b = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller2, SELLER2_KEY, 2);
        _record(b, CARGO_KEY);

        (uint64 cCount, uint64 d,) = counter.accrualOf(KIND_CLAUSE, CARGO_KEY, 0);
        assertEq(cCount, 2);
        assertEq(d, 2);
    }

    function test_manyBuyersOneSellerIsVolumeNotBreadth() public {
        // Breadth counts distinct STAKED SELLERS: a single seller reached by
        // many buyers — the exact shape a farmer fabricates for free, since
        // buyer wallets cost nothing — moves c only, and d holds at one for
        // that stake however many buyers arrive; d never double-counts one
        // seller's stake across multiple buyers.
        CommitmentTypes.Commitment memory a = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(a, CARGO_KEY);
        CommitmentTypes.Commitment memory b = _settledOrder(CARGO_KEY, buyer2, BUYER2_KEY, seller1, SELLER1_KEY, 2);
        _record(b, CARGO_KEY);

        (uint64 cCount, uint64 d,) = counter.accrualOf(KIND_CLAUSE, CARGO_KEY, 0);
        assertEq(cCount, 2, "every resolved process counts");
        assertEq(d, 1, "breadth costs a stake: n buyers through one seller are one unit");
    }

    function test_repeatSellerRaisesVolumeNotBreadth() public {
        // A second process through the SAME seller moves c but not d.
        CommitmentTypes.Commitment memory a = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(a, CARGO_KEY);
        CommitmentTypes.Commitment memory b = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 2);
        _record(b, CARGO_KEY);

        (uint64 cCount, uint64 d,) = counter.accrualOf(KIND_CLAUSE, CARGO_KEY, 0);
        assertEq(cCount, 2);
        assertEq(d, 1);
    }

    /// Repeat trade is bounded by the SCORE, not by a cliff — never reintroduce
    /// a per-pair cap: it cannot bind for an attacker optimizing score per unit
    /// cost and only binds honest repeat trade. What does the work is `c^(1/3)`:
    /// one seller carrying many trades adds volume that is discounted far more
    /// steeply than any cliff would be.
    function test_repeatTradeIsDiscountedNotRefused() public {
        for (uint256 i = 0; i < 8; i++) {
            CommitmentTypes.Commitment memory c =
                _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, i + 1);
            _record(c, CARGO_KEY);
        }
        (uint64 cCount, uint64 d, uint256 repeatScore) = counter.accrualOf(KIND_CLAUSE, CARGO_KEY, 0);
        assertEq(cCount, 8, "every resolved process counts");
        assertEq(d, 1, "one seller is one unit of breadth, however often it trades");

        // Eight trades through ONE seller must score below eight DISTINCT
        // staked sellers carrying one each — breadth outweighs volume, which is
        // the whole point of the exponent split.
        assertLt(repeatScore, _score(8, 8), "repeat trade must not rival real breadth");
        assertEq(repeatScore, _score(8, 1));
    }

    // ── The provenance leaf and the mandatory clauses ───────────────

    function test_provenanceLeafIsAConstantOfTheFormat() public view {
        // The link from a resolved process to the assembly it instantiated is
        // a fact of the agreement format: one reserved leaf, keyed by a
        // constant derived from its label. Never a clause key, never a
        // constructor argument.
        assertEq(counter.provenanceLeaf(), keccak256("figaro-agreement-provenance"));
        assertEq(counter.provenanceLeaf(), 0x26dc18a2251a8f4629ada6df88b7c98553e011c08682d28ce5bb51a441227dc6);
    }

    /// @dev A counter over REAL registries, one per family.
    function _realCounter()
        internal
        returns (
            UsageCounter real,
            ClauseRegistry clauses_,
            AssemblyRegistry assemblies_,
            AgreementRegistry agreements_
        )
    {
        uint64[] memory periods = new uint64[](2);
        periods[0] = P0_END;
        periods[1] = P1_END;
        clauses_ = new ClauseRegistry(0);
        assemblies_ = new AssemblyRegistry(0);
        agreements_ = new AgreementRegistry(0);
        real = new UsageCounter(
            address(core),
            address(members),
            address(clauses_),
            address(assemblies_),
            address(agreements_),
            batchVerifier,
            1,
            periods
        );
    }

    /// The reserved leaf earns nothing as a clause: its key is a plain-string
    /// preimage, a clause key is keccak256 of a spec's canonical JSON bytes, so
    /// no honest spec lands on it. Recorded against REAL registries, the leaf
    /// opens (the agreement does commit it) and the stake gate refuses it,
    /// because the key is registered nowhere; and a stranger who stakes the key
    /// itself in the clause registry is refused by the counter's own check.
    /// An assembly at the reserved key is never provable at all: no tree has
    /// the reserved key as its root.
    function test_theProvenanceLeafCannotBeClaimedAsAClause() public {
        (UsageCounter real, ClauseRegistry clauses_, AssemblyRegistry assemblies_,) = _realCounter();

        bytes32 root = _asmRoot();
        (CommitmentTypes.Commitment memory c, bytes32[] memory proof) = _settledUnderAgreement(AGR_KEY, root, 1);
        bytes32 clauseDataHash = keccak256(AgreementTestHelper.provenanceLeaf(AGR_KEY, root));
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.ClauseOrAssemblyNotRegistered.selector, PROVENANCE_LEAF));
        real.recordClauseUsage(c, PROVENANCE_LEAF, clauseDataHash, proof);

        // The clause registry takes the key as given, so a stranger can stake a
        // CLAUSE at the reserved key too. The clause-side gate then passes, and
        // the counter's own check refuses the key.
        clauses_.registerClause(PROVENANCE_LEAF, "ipfs://a-stranger-stakes-the-reserved-key-as-a-clause");
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.ReservedKeyIsNotARegistration.selector, PROVENANCE_LEAF));
        real.recordClauseUsage(c, PROVENANCE_LEAF, clauseDataHash, proof);

        // A registry takes any bytes32, so a stranger can register an ASSEMBLY
        // at the reserved key for one stake, and an order can name it in its
        // provenance. The agreement leaf is then proved under the reserved key as a
        // root, which no tree has: the claim never reaches the stake gate.
        assemblies_.registerAssembly(PROVENANCE_LEAF, "ipfs://a-stranger-squats-the-reserved-key");
        (CommitmentTypes.Commitment memory d, bytes32[] memory dProof) =
            _settledUnderAgreement(AGR_KEY, PROVENANCE_LEAF, 2);
        vm.expectRevert(UsageCounter.InvalidMembershipProof.selector);
        real.recordAssemblyUsage(
            d,
            PROVENANCE_LEAF,
            AGR_KEY,
            keccak256(_agreementLeafBytes(0)),
            dProof,
            AgreementTestHelper.proofFor(_assemblyLeaves(), 0)
        );

        // The batch path's twin: an accrual naming the reserved key is skipped,
        // never written, and the period total stays put — with the squatted
        // registrations live.
        vm.prank(batchVerifier);
        real.applyBatchAccrual(0, PROVENANCE_LEAF, _accrual(PROVENANCE_LEAF, 9, 9), _sellers(seller1));
        (uint64 bc,, uint256 score) = real.batchAccrualOf(KIND_CLAUSE, PROVENANCE_LEAF, 0);
        assertEq(bc, 0, "the reserved key is never written");
        assertEq(score, 0, "the reserved key never scores");
        assertEq(real.totalScoreIn(0), 0, "total unchanged");
    }

    /// The two reserved keys are refused under the AGREEMENT kind too. The
    /// agreement registry refuses both as registrations, so the gate here
    /// stands in for a registry that took them: an order names a reserved key
    /// as its agreementKey, the provenance leaf opens, the gate passes, and
    /// the counter's own check refuses the key on the direct path and skips
    /// it on the batch path.
    function test_theReservedKeysAreRefusedUnderTheAgreementKind() public {
        bytes32 terms = AgreementTestHelper.ASSEMBLY_TERMS_LEAF_KEY;
        assertEq(counter.assemblyTermsLeaf(), terms);

        (CommitmentTypes.Commitment memory c, bytes32[] memory proof) =
            _settledUnderAgreement(PROVENANCE_LEAF, _asmRoot(), 1);
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.ReservedKeyIsNotARegistration.selector, PROVENANCE_LEAF));
        counter.recordAgreementUsage(c, PROVENANCE_LEAF, _asmRoot(), proof);

        (CommitmentTypes.Commitment memory d, bytes32[] memory dProof) = _settledUnderAgreement(terms, _asmRoot(), 2);
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.ReservedKeyIsNotARegistration.selector, terms));
        counter.recordAgreementUsage(d, terms, _asmRoot(), dProof);

        UsageCounter.BatchAccrual[] memory a = new UsageCounter.BatchAccrual[](2);
        a[0] = UsageCounter.BatchAccrual(PROVENANCE_LEAF, KIND_AGREEMENT, 9, 9);
        a[1] = UsageCounter.BatchAccrual(terms, KIND_AGREEMENT, 9, 9);
        vm.prank(batchVerifier);
        counter.applyBatchAccrual(0, PROVENANCE_LEAF, a, _sellers(seller1));
        (uint64 bp,,) = counter.batchAccrualOf(KIND_AGREEMENT, PROVENANCE_LEAF, 0);
        (uint64 bt,,) = counter.batchAccrualOf(KIND_AGREEMENT, terms, 0);
        assertEq(bp, 0, "the provenance key is never written under the agreement kind");
        assertEq(bt, 0, "the terms key is never written under the agreement kind");
        assertEq(counter.totalScoreIn(0), 0, "total unchanged");
    }

    /// The terms leaf shares the assembly's tree with the agreements and
    /// opens under its root, so a claim naming it as the agreement's
    /// agreementKey, with the terms bytes as the agreement content and an order
    /// whose provenance names it, would prove membership. It is refused: the
    /// terms leaf never passes as an agreement.
    function test_theTermsLeafNeverPassesAsAnAgreement() public {
        bytes32 terms = AgreementTestHelper.ASSEMBLY_TERMS_LEAF_KEY;
        bytes32 root = _asmRoot();
        (CommitmentTypes.Commitment memory c, bytes32[] memory proof) = _settledUnderAgreement(terms, root, 1);
        bytes32[] memory membership = AgreementTestHelper.proofFor(_assemblyLeaves(), 2);
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.ReservedKeyIsNotARegistration.selector, terms));
        counter.recordAssemblyUsage(c, root, terms, keccak256(TERMS), proof, membership);

        (CommitmentTypes.Commitment memory d, bytes32[] memory dProof) =
            _settledUnderAgreement(PROVENANCE_LEAF, root, 2);
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.ReservedKeyIsNotARegistration.selector, PROVENANCE_LEAF));
        counter.recordAssemblyUsage(d, root, PROVENANCE_LEAF, keccak256(TERMS), dProof, membership);
    }

    // ── The agreement kind and the assembly's membership proof ──────

    /// An order instantiating a registered agreement credits it under the
    /// AGREEMENT kind, and the same order credits the assembly under the
    /// ASSEMBLY kind through the agreement's membership proof: two counts, one
    /// process, two entries that never touch.
    function test_oneOrderCreditsItsAgreementAndItsAssembly() public {
        bytes32 root = _asmRoot();
        (CommitmentTypes.Commitment memory c, bytes32[] memory proof) = _settledUnderAgreement(AGR2_KEY, root, 1);

        counter.recordAgreementUsage(c, AGR2_KEY, root, proof);
        _recordAssembly(counter, c, 1, proof);

        (uint64 agrC, uint64 agrD, uint256 agrScore) = counter.accrualOf(KIND_AGREEMENT, AGR2_KEY, 0);
        (uint64 asmC,, uint256 asmScore) = counter.accrualOf(KIND_ASSEMBLY, root, 0);
        assertEq(agrC, 1, "the agreement's use is counted under its kind");
        assertEq(agrD, 1);
        assertEq(asmC, 1, "the assembly's use is counted under its kind");
        assertEq(agrScore, asmScore, "uniform scoring across the kinds");
        assertEq(counter.totalScoreIn(0), agrScore + asmScore);

        vm.expectRevert(UsageCounter.AlreadyCounted.selector);
        counter.recordAgreementUsage(c, AGR2_KEY, root, proof);
        vm.expectRevert(UsageCounter.AlreadyCounted.selector);
        _recordAssembly(counter, c, 1, proof);
    }

    /// The provenance bytes are rebuilt from BOTH keys claimed, so a claim
    /// naming any other agreement derives a leaf that is not in the tree, on
    /// either path.
    function test_aProvenanceLeafNamingAnotherAgreementIsNotInTheTree() public {
        bytes32 root = _asmRoot();
        (CommitmentTypes.Commitment memory c, bytes32[] memory proof) = _settledUnderAgreement(AGR_KEY, root, 1);

        vm.expectRevert(UsageCounter.InvalidInclusionProof.selector);
        counter.recordAgreementUsage(c, AGR2_KEY, root, proof);

        // The order instantiated agreement 0 (AGR_KEY); agreement 1's agreement and its
        // valid membership proof cannot be credited through it.
        vm.expectRevert(UsageCounter.InvalidInclusionProof.selector);
        _recordAssembly(counter, c, 1, proof);

        // A claim naming the right agreement under another assembly fails too.
        vm.expectRevert(UsageCounter.InvalidInclusionProof.selector);
        counter.recordAgreementUsage(c, AGR_KEY, keccak256("another-assembly"), proof);
    }

    /// An agreement leaf proves membership only under the root of the tree that
    /// holds it. The order names another assembly, whose tree holds no entry
    /// for AGR_KEY: the provenance opens under that assembly, and the agreement leaf
    /// with its proof from the test assembly's tree fails under its root.
    function test_anAgreementLeafUnderADifferentCompositionHashFails() public {
        bytes32[] memory otherLeaves = new bytes32[](1);
        otherLeaves[0] = AgreementTestHelper.leafFor(AGR2_KEY, AgreementTestHelper.agreementLeafBytes(0, "{}"));
        bytes32 otherRoot = AgreementTestHelper.rootFor(otherLeaves);

        (CommitmentTypes.Commitment memory c, bytes32[] memory proof) = _settledUnderAgreement(AGR_KEY, otherRoot, 1);
        bytes32[] memory membership = AgreementTestHelper.proofFor(_assemblyLeaves(), 0);

        vm.expectRevert(UsageCounter.InvalidMembershipProof.selector);
        counter.recordAssemblyUsage(c, otherRoot, AGR_KEY, keccak256(_agreementLeafBytes(0)), proof, membership);

        // And the test assembly cannot be credited: the order does not name it.
        vm.expectRevert(UsageCounter.InvalidInclusionProof.selector);
        counter.recordAssemblyUsage(c, _asmRoot(), AGR_KEY, keccak256(_agreementLeafBytes(0)), proof, membership);
    }

    /// The agreement leaf commits its index and its own fills: a claim with
    /// the right agreement and another agreement's bytes is not a leaf of the tree.
    function test_anAgreementLeafWithAnotherAgreementsBytesFails() public {
        bytes32 root = _asmRoot();
        (CommitmentTypes.Commitment memory c, bytes32[] memory proof) = _settledUnderAgreement(AGR_KEY, root, 1);
        bytes32[] memory membership = AgreementTestHelper.proofFor(_assemblyLeaves(), 0);
        vm.expectRevert(UsageCounter.InvalidMembershipProof.selector);
        counter.recordAssemblyUsage(c, root, AGR_KEY, keccak256(_agreementLeafBytes(1)), proof, membership);
    }

    /// The assembly terms leaf shares the tree with the entries; it is proved
    /// with the same convention and opens under the root.
    function test_theTermsLeafIsALeafOfTheAssemblyTree() public pure {
        bytes32[] memory leaves = _assemblyLeaves();
        bytes32[] memory termsProof = AgreementTestHelper.proofFor(leaves, 2);
        bytes32 root = AgreementTestHelper.rootFor(leaves);
        bytes32 computed = leaves[2];
        for (uint256 i = 0; i < termsProof.length; ++i) {
            computed = computed < termsProof[i]
                ? keccak256(abi.encodePacked(computed, termsProof[i]))
                : keccak256(abi.encodePacked(termsProof[i], computed));
        }
        assertEq(computed, root);
    }

    // ── Kind separation, three kinds ────────────────────────────────

    /// A registry takes any bytes32, so the same bytes can be staked in all
    /// three registries by three different wallets. Every accrual, count and
    /// score is keyed by (kind, key): the three uses land in three entries,
    /// each kind's gate reads its own registry only, and withdrawing one
    /// family's stake closes that kind alone, on both paths.
    function test_theThreeKindsNeverShareACount() public {
        (UsageCounter real, ClauseRegistry clauses_, AssemblyRegistry assemblies_, AgreementRegistry agreements_) =
            _realCounter();
        bytes32 k = _asmRoot();
        vm.prank(address(0xC1));
        clauses_.registerClause(k, "ipfs://the-bytes-as-a-clause");
        vm.prank(address(0xA5));
        assemblies_.registerAssembly(k, "ipfs://the-bytes-as-an-assembly");
        vm.prank(address(0xA6));
        agreements_.registerAgreement(k, "ipfs://the-bytes-as-an-agreement");

        // One use per kind, each through its own proof.
        CommitmentTypes.Commitment memory clauseOrder = _settledOrder(k, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        real.recordClauseUsage(clauseOrder, k, keccak256(SECTION), new bytes32[](0));
        (CommitmentTypes.Commitment memory asmOrder, bytes32[] memory asmProof) = _settledUnderAgreement(AGR_KEY, k, 2);
        _recordAssembly(real, asmOrder, 0, asmProof);
        (CommitmentTypes.Commitment memory agrOrder, bytes32[] memory agrProof) = _settledUnderAgreement(k, k, 3);
        real.recordAgreementUsage(agrOrder, k, k, agrProof);

        for (uint8 kind = 0; kind < 3; ++kind) {
            (uint64 c, uint64 d,) = real.accrualOf(kind, k, 0);
            assertEq(c, 1, "each kind counts its own use once");
            assertEq(d, 1);
        }
        assertEq(real.totalScoreIn(0), 3 * _score(1, 1), "three entries, three scores");
        assertFalse(real.processCounted(KIND_AGREEMENT, k, _pid(clauseOrder)), "a clause use is no agreement's");
        assertFalse(real.processCounted(KIND_CLAUSE, k, _pid(agrOrder)), "an agreement use is no clause's");
        assertFalse(real.processCounted(KIND_ASSEMBLY, k, _pid(agrOrder)), "an agreement use is no assembly's");

        // The agreement's own stake is withdrawn: its kind closes, and the
        // live clause and assembly stakes at the same bytes do not reopen it.
        vm.prank(address(0xA6));
        agreements_.withdrawDeposit(k);
        (CommitmentTypes.Commitment memory late, bytes32[] memory lateProof) = _settledUnderAgreement(k, k, 4);
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.ClauseOrAssemblyNotRegistered.selector, k));
        real.recordAgreementUsage(late, k, k, lateProof);

        UsageCounter.BatchAccrual[] memory a = new UsageCounter.BatchAccrual[](3);
        a[0] = UsageCounter.BatchAccrual(k, KIND_CLAUSE, 2, 2);
        a[1] = UsageCounter.BatchAccrual(k, KIND_ASSEMBLY, 3, 2);
        a[2] = UsageCounter.BatchAccrual(k, KIND_AGREEMENT, 4, 2);
        vm.prank(batchVerifier);
        real.applyBatchAccrual(0, PROVENANCE_LEAF, a, _sellers(seller1));
        (uint64 bClause,,) = real.batchAccrualOf(KIND_CLAUSE, k, 0);
        (uint64 bAssembly,,) = real.batchAccrualOf(KIND_ASSEMBLY, k, 0);
        (uint64 bAgreement,,) = real.batchAccrualOf(KIND_AGREEMENT, k, 0);
        assertEq(bClause, 2, "the clause kind is gated by the clause registry alone");
        assertEq(bAssembly, 3, "the assembly kind is gated by the assembly registry alone");
        assertEq(bAgreement, 0, "the agreement kind closed with its own stake");
    }

    /// @dev The processId FigaroCore assigns a first order.
    function _pid(CommitmentTypes.Commitment memory c) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", core.DOMAIN_SEPARATOR(), c.hashStruct()));
    }

    /// @dev A counter over REAL registries, an assembly at the test assembly's
    ///      root registered by `designer`, and the same bytes staked as a
    ///      CLAUSE by `stranger`.
    function _counterWithASquattedAssemblyKey(address designer, address stranger)
        internal
        returns (UsageCounter real, AssemblyRegistry assemblies_)
    {
        ClauseRegistry clauses_;
        (real, clauses_, assemblies_,) = _realCounter();
        vm.prank(designer);
        assemblies_.registerAssembly(_asmRoot(), "ipfs://asm");
        vm.prank(stranger);
        clauses_.registerClause(_asmRoot(), "ipfs://a-stranger-stakes-the-assembly-key-as-a-clause");
    }

    /// The direct path counts an assembly's use under the ASSEMBLY kind only:
    /// a clause stake at the same bytes shares no entry with it.
    function test_assemblyUsageLandsUnderTheAssemblyKindOnly() public {
        (UsageCounter real,) = _counterWithASquattedAssemblyKey(address(0xDE5), address(0x5745));
        bytes32 root = _asmRoot();

        (CommitmentTypes.Commitment memory c, bytes32[] memory proof) = _settledUnderAgreement(AGR_KEY, root, 1);
        _recordAssembly(real, c, 0, proof);

        (uint64 asmC,, uint256 asmScore) = real.accrualOf(KIND_ASSEMBLY, root, 0);
        (uint64 clauseC,, uint256 clauseScore) = real.accrualOf(KIND_CLAUSE, root, 0);
        assertEq(asmC, 1, "the assembly's use is counted under its kind");
        assertGt(asmScore, 0);
        assertEq(clauseC, 0, "the clause kind at the same bytes stands apart");
        assertEq(clauseScore, 0);
        assertEq(real.scoreOf(KIND_CLAUSE, root, 0), 0, "and scores nothing of it");
        assertEq(real.scoreOf(KIND_ASSEMBLY, root, 0), asmScore);
    }

    /// The batch path gates each accrual by its OWN kind's registry, never
    /// "any live registration": a clause stake at an assembly's bytes neither
    /// joins the assembly's accrual nor keeps it alive once the assembly's own
    /// stake is withdrawn. A kind beyond the three names no registry and is
    /// skipped.
    function test_batchAccrualGatesEachKindByItsOwnRegistry() public {
        address designer = address(0xDE5);
        (UsageCounter real, AssemblyRegistry assemblies_) = _counterWithASquattedAssemblyKey(designer, address(0x5745));
        bytes32 root = _asmRoot();

        UsageCounter.BatchAccrual[] memory a = new UsageCounter.BatchAccrual[](4);
        a[0] = UsageCounter.BatchAccrual(root, KIND_CLAUSE, 1, 1);
        a[1] = UsageCounter.BatchAccrual(root, KIND_ASSEMBLY, 5, 3);
        a[2] = UsageCounter.BatchAccrual(root, KIND_AGREEMENT, 8, 8);
        a[3] = UsageCounter.BatchAccrual(root, 3, 9, 9);
        vm.prank(batchVerifier);
        real.applyBatchAccrual(0, PROVENANCE_LEAF, a, _sellers(seller1));

        (uint64 asmC, uint64 asmD,) = real.batchAccrualOf(KIND_ASSEMBLY, root, 0);
        (uint64 clauseC, uint64 clauseD,) = real.batchAccrualOf(KIND_CLAUSE, root, 0);
        (uint64 agreementC,,) = real.batchAccrualOf(KIND_AGREEMENT, root, 0);
        (uint64 unknownC,,) = real.batchAccrualOf(3, root, 0);
        assertEq(asmC, 5);
        assertEq(asmD, 3);
        assertEq(clauseC, 1, "the stranger's clause-kind accrual is its own");
        assertEq(clauseD, 1);
        assertEq(agreementC, 0, "no agreement is registered at these bytes: skipped");
        assertEq(unknownC, 0, "a kind beyond the three is skipped");
        assertEq(real.totalScoreIn(0), _score(5, 3) + _score(1, 1));

        // The assembly's own stake is withdrawn: its kind's gate closes, and the
        // live clause stake at the same bytes does not reopen it.
        vm.prank(designer);
        assemblies_.withdrawDeposit(root);
        UsageCounter.BatchAccrual[] memory b = new UsageCounter.BatchAccrual[](1);
        b[0] = UsageCounter.BatchAccrual(root, KIND_ASSEMBLY, 6, 4);
        vm.prank(batchVerifier);
        real.applyBatchAccrual(0, PROVENANCE_LEAF, b, _sellers(seller1));
        (asmC, asmD,) = real.batchAccrualOf(KIND_ASSEMBLY, root, 0);
        assertEq(asmC, 5, "skipped: the clause registry is never read for an assembly");
        assertEq(asmD, 3);
    }

    /// The agreement kind on the batch path: written while the agreement's
    /// stake is live, skipped once it is not.
    function test_batchAccrualGatesTheAgreementKindByTheAgreementRegistry() public {
        UsageCounter.BatchAccrual[] memory a = new UsageCounter.BatchAccrual[](2);
        a[0] = UsageCounter.BatchAccrual(AGR_KEY, KIND_AGREEMENT, 4, 2);
        a[1] = UsageCounter.BatchAccrual(AGR2_KEY, KIND_AGREEMENT, 4, 2);
        stake.kill(AGR2_KEY);
        vm.prank(batchVerifier);
        counter.applyBatchAccrual(0, PROVENANCE_LEAF, a, _sellers(seller1));

        (uint64 live,, uint256 liveScore) = counter.batchAccrualOf(KIND_AGREEMENT, AGR_KEY, 0);
        (uint64 dead,,) = counter.batchAccrualOf(KIND_AGREEMENT, AGR2_KEY, 0);
        assertEq(live, 4, "a live agreement's batch accrual is written");
        assertEq(liveScore, _score(4, 2));
        assertEq(dead, 0, "an un-live agreement's is skipped");
        assertEq(counter.totalScoreIn(0), liveScore);
    }

    function test_mandatoryClausesEarnForTheirAuthor() public {
        // figaro-commerce and figaro-topology ride on EVERY order and earn like
        // any other clause: scoring them rewards their designer of record on
        // every resolved process.
        bytes32 commerceKey = keccak256('{"clauseId":"figaro-commerce","version":1}');

        CommitmentTypes.Commitment memory c = _settledOrder(commerceKey, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(c, commerceKey);

        (uint64 cCount,, uint256 score) = counter.accrualOf(KIND_CLAUSE, commerceKey, 0);
        assertEq(cCount, 1);
        assertGt(counter.totalScoreIn(0), 0);
        assertEq(score, counter.totalScoreIn(0));
    }

    // ── Uniform scoring (no tag / category / weight) ─────────────────

    function test_scoringIsUniformAcrossClausesAndAssemblies() public {
        // Equal usage ⇒ equal score, whatever the clause or assembly: no boosted tag, no
        // category, no weight. The 600M pays for real usage alone.
        CommitmentTypes.Commitment memory g = _settledOrder(GEO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(g, GEO_KEY);
        CommitmentTypes.Commitment memory k = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 2);
        _record(k, CARGO_KEY);

        (,, uint256 geoScore) = counter.accrualOf(KIND_CLAUSE, GEO_KEY, 0);
        (,, uint256 cargoScore) = counter.accrualOf(KIND_CLAUSE, CARGO_KEY, 0);
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

        (uint64 c0,,) = counter.accrualOf(KIND_CLAUSE, CARGO_KEY, 0);
        (uint64 c1,,) = counter.accrualOf(KIND_CLAUSE, CARGO_KEY, 1);
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
        // Idempotence is GLOBAL per (clause-or-assembly, process): one resolved trade is
        // counted once ever. A resolved order stays resolved and its struct is
        // public, so a per-period key would let the same trade be re-presented
        // in every period — paying for recording gas instead of adoption, and
        // letting one fabricated farm earn from every later period.
        CommitmentTypes.Commitment memory a = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(a, CARGO_KEY);
        vm.warp(P0_END + 1);

        vm.expectRevert(UsageCounter.AlreadyCounted.selector);
        _record(a, CARGO_KEY);

        (uint64 c0,,) = counter.accrualOf(KIND_CLAUSE, CARGO_KEY, 0);
        (uint64 c1,,) = counter.accrualOf(KIND_CLAUSE, CARGO_KEY, 1);
        assertEq(c0, 1, "counted in the period it was recorded");
        assertEq(c1, 0, "never counted again in a later period");
    }

    /// A period pays only for usage NEW to it — the property any fixed
    /// per-period budget schedule assumes.
    function test_laterPeriodCountsOnlyNewTrade() public {
        CommitmentTypes.Commitment memory old_ = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(old_, CARGO_KEY);
        vm.warp(P0_END + 1);

        CommitmentTypes.Commitment memory fresh = _settledOrder(CARGO_KEY, buyer2, BUYER2_KEY, seller2, SELLER2_KEY, 2);
        _record(fresh, CARGO_KEY);

        (uint64 c1, uint64 d1,) = counter.accrualOf(KIND_CLAUSE, CARGO_KEY, 1);
        assertEq(c1, 1, "only the new trade");
        assertEq(d1, 1, "and only its seller");
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
    ///         first record for a clause or assembly (the shape an attacker or an author
    ///         actually pays). Measured here because this is the only place it is
    ///         measured — it is NOT in `sdk/src/gasCeilings.ts`, which exists to
    ///         derive per-block/per-process CEILINGS and has no consumer for this
    ///         figure; an unused export there would be dead code.
    /// @dev    TWO figures exist and they are not interchangeable — say which:
    ///         the ALL-IN figure (`forge --gas-report` median, includes calldata)
    ///         and the in-test EXECUTION figure (what `gasleft()` sees; calldata
    ///         is charged at the tx level, outside the call). This anchor is the
    ///         all-in ceiling. ANY analysis quoting the cost of manufacturing
    ///         usage (the RPGF Sybil bound's `g` term — the paper's §7 cites it
    ///         as a measured deployment constant) must cite the all-in figure
    ///         plus the 21,000 tx base cost, never a re-derivation. If the band
    ///         below breaks, the accrual path changed: re-measure, update this
    ///         anchor, and revisit the bound — γ is what prices Sybil resistance.
    ///         REPRICED with the seller-statistic ruling: the seller
    ///         write replaced the pairKey derivation, measuring 169,241 all-in
    ///         under legacy codegen (less under --via-ir, which is why the
    ///         via-ir suite runs never tripped the old 169,000 ceiling).
    uint256 internal constant RECORD_USAGE_GAS = 180_000; // measured 175,250 after the clauseOrAssembly rename wave (drift predates it; anchor is a drift alarm)

    function test_Gas_recordUsageStaysAtItsAnchor() public {
        CommitmentTypes.Commitment memory c = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 0xA45);
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

    /// Real usage must not saturate: the score has to keep separating clauses and assemblies
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
    /// Sampled over the FULL field domain — `Accrual.c` / `Accrual.d` are
    /// uint64, and the saturation bug survived a fuzz that sampled a narrower
    /// width than the function's own; the ×1000 arm bounds c only for the
    /// test's multiplication, never the domain.
    function testFuzz_scoreSeparatesRealUsage(uint64 c, uint64 d) public view {
        vm.assume(d > 0);
        c = uint64(bound(c, 1, type(uint64).max - 1));
        assertGe(_score(c + 1, d), _score(c, d));
        uint64 cThousandable = uint64(bound(c, 1, (type(uint64).max - 1) / 1000));
        assertGt(_score(cThousandable * 1000 + 1, d), _score(cThousandable, d));
    }

    function test_totalScoreIsTheSumOfClauseAndAssemblyScores() public {
        CommitmentTypes.Commitment memory g = _settledOrder(GEO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(g, GEO_KEY);
        CommitmentTypes.Commitment memory k = _settledOrder(CARGO_KEY, buyer2, BUYER2_KEY, seller2, SELLER2_KEY, 2);
        _record(k, CARGO_KEY);

        (,, uint256 geoScore) = counter.accrualOf(KIND_CLAUSE, GEO_KEY, 0);
        (,, uint256 cargoScore) = counter.accrualOf(KIND_CLAUSE, CARGO_KEY, 0);
        assertEq(counter.totalScoreIn(0), geoScore + cargoScore);
    }

    // ── Minimum-support floor ───────────────────────────────────────
    //
    // Below the floor sit exactly the clauses and assemblies one actor can fabricate alone —
    // self-farms, fragmentation shards, squatted names, trivial riders. These
    // tests run a counter at the mainnet value (3): the minimum viable farm is
    // three live stakes, and honest thin adoption is deferred, never lost.

    function _flooredCounter() internal returns (UsageCounter floored) {
        uint64[] memory periods = new uint64[](2);
        periods[0] = P0_END;
        periods[1] = P1_END;
        floored = new UsageCounter(
            address(core), address(members), address(stake), address(stake), address(stake), batchVerifier, 3, periods
        );
    }

    function _recordOn(UsageCounter target, CommitmentTypes.Commitment memory c, bytes32 clauseOrAssembly) internal {
        target.recordClauseUsage(c, clauseOrAssembly, keccak256(SECTION), new bytes32[](0));
    }

    function test_floor_belowFloorAccruesButScoresZero() public {
        UsageCounter floored = _flooredCounter();
        _recordOn(floored, _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1), CARGO_KEY);
        _recordOn(floored, _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller2, SELLER2_KEY, 2), CARGO_KEY);

        (uint64 c, uint64 d, uint256 score) = floored.accrualOf(KIND_CLAUSE, CARGO_KEY, 0);
        assertEq(c, 2, "counting is never refused below the floor");
        assertEq(d, 2, "breadth accrues below the floor");
        assertEq(score, 0, "but nothing scores until the floor is met");
        assertEq(floored.totalScoreIn(0), 0, "and the period total holds nothing");
    }

    function test_floor_crossingSpringsTheFullScore() public {
        UsageCounter floored = _flooredCounter();
        _recordOn(floored, _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1), CARGO_KEY);
        _recordOn(floored, _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller2, SELLER2_KEY, 2), CARGO_KEY);
        _recordOn(floored, _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller3, SELLER3_KEY, 3), CARGO_KEY);

        (uint64 c, uint64 d, uint256 score) = floored.accrualOf(KIND_CLAUSE, CARGO_KEY, 0);
        assertEq(c, 3);
        assertEq(d, 3);
        assertEq(score, _score(3, 3), "the third staked seller springs the FULL score");
        assertEq(floored.totalScoreIn(0), score, "the period total moves by the full delta");
    }

    function test_floor_batchPathHonorsIt() public {
        UsageCounter floored = _flooredCounter();
        vm.startPrank(batchVerifier);
        floored.applyBatchAccrual(0, PROVENANCE_LEAF, _accrual(CARGO_KEY, 4, 2), _sellers(seller1));
        (,, uint256 below) = floored.batchAccrualOf(KIND_CLAUSE, CARGO_KEY, 0);
        assertEq(below, 0, "the floor is _score's, so the batch path inherits it");
        assertEq(floored.totalScoreIn(0), 0);

        floored.applyBatchAccrual(0, PROVENANCE_LEAF, _accrual(CARGO_KEY, 6, 3), _sellers(seller1));
        vm.stopPrank();
        (,, uint256 above) = floored.batchAccrualOf(KIND_CLAUSE, CARGO_KEY, 0);
        assertEq(above, _score(6, 3));
        assertEq(floored.totalScoreIn(0), above);
    }

    /// The floor is applied PER RESOLUTION PATH, deliberately: the chain holds
    /// counts, not the seller sets, so it cannot know whether the paths' d
    /// values share sellers. Summing toward the floor would let ONE seller
    /// straddle the universes and count twice; flooring each side separately
    /// can only ever UNDER-pay a boundary case — conservative, like the score
    /// merge itself.
    function test_floor_isPerPathNeverSummedAcrossUniverses() public {
        UsageCounter floored = _flooredCounter();
        _recordOn(floored, _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1), CARGO_KEY);
        _recordOn(floored, _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller2, SELLER2_KEY, 2), CARGO_KEY);
        vm.prank(batchVerifier);
        floored.applyBatchAccrual(0, PROVENANCE_LEAF, _accrual(CARGO_KEY, 2, 2), _sellers(seller1));

        // 2 direct + 2 batch is four units of d in total, but neither path
        // reached 3 on its own — so nothing scores.
        assertEq(floored.scoreOf(KIND_CLAUSE, CARGO_KEY, 0), 0);
        assertEq(floored.totalScoreIn(0), 0);
    }

    function test_floor_isADeployConstant() public {
        assertEq(counter.minSellers(), 1, "main fixture disables the floor");
        assertEq(_flooredCounter().minSellers(), 3, "mainnet value");
    }

    // ── Constructor guards ──────────────────────────────────────────

    function test_constructor_rejectsZeroAddresses() public {
        uint64[] memory p = new uint64[](1);
        p[0] = P0_END;
        vm.expectRevert(UsageCounter.ZeroAddress.selector);
        new UsageCounter(
            address(0), address(members), address(stake), address(stake), address(stake), batchVerifier, 1, p
        );
        vm.expectRevert(UsageCounter.ZeroAddress.selector);
        new UsageCounter(address(core), address(0), address(stake), address(stake), address(stake), batchVerifier, 1, p);
        vm.expectRevert(UsageCounter.ZeroAddress.selector);
        new UsageCounter(
            address(core), address(members), address(0), address(stake), address(stake), batchVerifier, 1, p
        );
        vm.expectRevert(UsageCounter.ZeroAddress.selector);
        new UsageCounter(
            address(core), address(members), address(stake), address(0), address(stake), batchVerifier, 1, p
        );
        vm.expectRevert(UsageCounter.ZeroAddress.selector);
        new UsageCounter(
            address(core), address(members), address(stake), address(stake), address(0), batchVerifier, 1, p
        );
        vm.expectRevert(UsageCounter.ZeroAddress.selector);
        new UsageCounter(
            address(core), address(members), address(stake), address(stake), address(stake), address(0), 1, p
        );
    }

    function test_constructor_rejectsTooManyPeriods() public {
        uint64[] memory p = new uint64[](257);
        for (uint256 i = 0; i < 257; ++i) {
            p[i] = uint64(P0_END + i);
        }
        vm.expectRevert(UsageCounter.TooManyPeriods.selector);
        new UsageCounter(
            address(core), address(members), address(stake), address(stake), address(stake), batchVerifier, 1, p
        );
    }

    function test_constructor_rejectsEmptyPeriods() public {
        vm.expectRevert(UsageCounter.EmptyPeriods.selector);
        new UsageCounter(
            address(core),
            address(members),
            address(stake),
            address(stake),
            address(stake),
            batchVerifier,
            1,
            new uint64[](0)
        );
    }

    function test_constructor_rejectsUnorderedPeriods() public {
        uint64[] memory p = new uint64[](2);
        p[0] = P1_END;
        p[1] = P0_END;
        vm.expectRevert(UsageCounter.PeriodsNotAscending.selector);
        new UsageCounter(
            address(core), address(members), address(stake), address(stake), address(stake), batchVerifier, 1, p
        );
    }

    function test_constructor_rejectsZeroMinSellers() public {
        // 0 would read as "no floor" but so does 1, and 1 says it honestly —
        // every scored clause or assembly needs at least one staked seller by definition.
        uint64[] memory p = new uint64[](1);
        p[0] = P0_END;
        vm.expectRevert(UsageCounter.ZeroMinSellers.selector);
        new UsageCounter(
            address(core), address(members), address(stake), address(stake), address(stake), batchVerifier, 0, p
        );
    }

    // ── The batch bridge: proof-gated accrual ───────────────────────
    //
    // A batch-resolved process never acquires FigaroCore status, so none of this
    // can travel the direct path. What the counter still owns, and enforces
    // here, is the reward's own gates: who may write, which period is open,
    // which sellers are staked, which clauses and assemblies are live.

    function _accrual(bytes32 clauseOrAssembly, uint64 c, uint64 d)
        internal
        pure
        returns (UsageCounter.BatchAccrual[] memory a)
    {
        a = new UsageCounter.BatchAccrual[](1);
        a[0] = UsageCounter.BatchAccrual(clauseOrAssembly, KIND_CLAUSE, c, d);
    }

    function _sellers(address s) internal pure returns (address[] memory list) {
        list = new address[](1);
        list[0] = s;
    }

    function test_batchAccrualIsWrittenAndScored() public {
        vm.prank(batchVerifier);
        counter.applyBatchAccrual(0, PROVENANCE_LEAF, _accrual(CARGO_KEY, 4, 2), _sellers(seller1));

        (uint64 c, uint64 d, uint256 score) = counter.batchAccrualOf(KIND_CLAUSE, CARGO_KEY, 0);
        assertEq(c, 4);
        assertEq(d, 2);
        assertEq(score, _score(4, 2));
        assertEq(counter.totalScoreIn(0), score, "the batch score joins the period total");
        // The direct entry is untouched — the two paths never share storage.
        (uint64 dc,, uint256 dScore) = counter.accrualOf(KIND_CLAUSE, CARGO_KEY, 0);
        assertEq(dc, 0);
        assertEq(dScore, 0);
    }

    function test_onlyTheBatchVerifierCanWriteBatchAccrual() public {
        vm.expectRevert(UsageCounter.NotBatchVerifier.selector);
        counter.applyBatchAccrual(0, PROVENANCE_LEAF, _accrual(CARGO_KEY, 1, 1), _sellers(seller1));

        // Not even a live-staked seller writing for their own trade.
        vm.prank(seller1);
        vm.expectRevert(UsageCounter.NotBatchVerifier.selector);
        counter.applyBatchAccrual(0, PROVENANCE_LEAF, _accrual(CARGO_KEY, 1, 1), _sellers(seller1));
    }

    /// THE MERGE RULE — `scoreOf` sums the two paths' SCORES, never their
    /// components. The chain holds counts, not the seller SETS, so it cannot
    /// union them; adding `d` to `d` would pay for breadth an attacker never
    /// had, simply for splitting one seller's trade across the two universes.
    function test_theTwoPathsSumAsScoresNeverAsComponents() public {
        CommitmentTypes.Commitment memory c = _settledOrder(CARGO_KEY, buyer, BUYER_KEY, seller1, SELLER1_KEY, 1);
        _record(c, CARGO_KEY); // direct: c=1, d=1

        vm.prank(batchVerifier);
        counter.applyBatchAccrual(0, PROVENANCE_LEAF, _accrual(CARGO_KEY, 1, 1), _sellers(seller1)); // batch: c=1, d=1

        assertEq(counter.scoreOf(KIND_CLAUSE, CARGO_KEY, 0), _score(1, 1) * 2, "scores add");
        assertEq(counter.totalScoreIn(0), counter.scoreOf(KIND_CLAUSE, CARGO_KEY, 0), "the total tracks the sum");
    }

    /// The score is homogeneous of degree 1 and concave, so the component
    /// merge is SUPERADDITIVE: summing scores can never exceed it, and the two
    /// coincide EXACTLY when the split is proportional. Both halves are
    /// asserted because both are load-bearing — the inequality is what closes
    /// the split-across-universes farm, and the equality is why closing it
    /// costs an honest clause or assembly nothing when its trade divides evenly.
    function test_summingScoresNeverExceedsTheComponentMerge() public view {
        // Lopsided: depth on one path, breadth on the other.
        assertLt(_score(4, 1) + _score(1, 4), _score(5, 5), "non-proportional split loses a little");
        // Proportional: exactly equal, no shortfall at all.
        assertEq(_score(1, 1) + _score(1, 1), _score(2, 2), "proportional split loses nothing");
        assertEq(_score(2, 4) + _score(1, 2), _score(3, 6), "and again at another ratio");
    }

    function test_batchAccrualRequiresTheOpenPeriod() public {
        vm.prank(batchVerifier);
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.PeriodMismatch.selector, 0, 1));
        counter.applyBatchAccrual(1, PROVENANCE_LEAF, _accrual(CARGO_KEY, 1, 1), _sellers(seller1));
    }

    function test_batchAccrualRequiresALiveSellerStake() public {
        vm.prank(seller1);
        members.requestWithdrawal(); // de-surfaces immediately

        vm.prank(batchVerifier);
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.SellerNotStaked.selector, seller1));
        counter.applyBatchAccrual(0, PROVENANCE_LEAF, _accrual(CARGO_KEY, 1, 1), _sellers(seller1));
    }

    function test_batchAccrualSkipsAnUnregisteredClauseOrAssembly() public {
        // Same skip semantics for a clause or assembly with no live registration —
        // the batch-path twin of the direct path's ClauseOrAssemblyNotRegistered revert.
        stake.kill(CARGO_KEY);
        uint256 totalBefore = counter.totalScoreIn(0);
        vm.prank(batchVerifier);
        counter.applyBatchAccrual(0, PROVENANCE_LEAF, _accrual(CARGO_KEY, 9, 9), _sellers(seller1));
        (uint64 c,, uint256 score) = counter.batchAccrualOf(KIND_CLAUSE, CARGO_KEY, 0);
        assertEq(c, 0, "unregistered clause or assembly not written");
        assertEq(score, 0, "unregistered clause or assembly not scored");
        assertEq(counter.totalScoreIn(0), totalBefore, "total unchanged");
    }

    function test_batchAccrualRejectsAForeignProvenanceLeaf() public {
        // A clause key cannot stand in for the format's reserved leaf.
        bytes32 impostor = keccak256('{"clauseId":"figaro-commerce","version":1}');
        vm.prank(batchVerifier);
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.ProvenanceLeafMismatch.selector, PROVENANCE_LEAF, impostor));
        counter.applyBatchAccrual(0, impostor, _accrual(CARGO_KEY, 1, 1), _sellers(seller1));
    }

    /// Cumulative counts are monotone. The state-root check upstream already
    /// guarantees it; the assertion here means a guest regression surfaces as
    /// a revert instead of silently destroying accrual (and, via the running
    /// total, everyone else's share).
    function test_batchAccrualCannotGoBackwards() public {
        vm.startPrank(batchVerifier);
        counter.applyBatchAccrual(0, PROVENANCE_LEAF, _accrual(CARGO_KEY, 5, 3), _sellers(seller1));
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.AccrualWentBackwards.selector, CARGO_KEY));
        counter.applyBatchAccrual(0, PROVENANCE_LEAF, _accrual(CARGO_KEY, 4, 3), _sellers(seller1));
        vm.stopPrank();
    }

    /// Writes are OVERWRITES of a cumulative total, not additions — so a
    /// second batch reporting (6,4) leaves the clause or assembly at (6,4), and the
    /// period total moves by the DELTA of the scores, never by the new score.
    function test_batchAccrualOverwritesRatherThanAccumulates() public {
        vm.startPrank(batchVerifier);
        counter.applyBatchAccrual(0, PROVENANCE_LEAF, _accrual(CARGO_KEY, 5, 3), _sellers(seller1));
        counter.applyBatchAccrual(0, PROVENANCE_LEAF, _accrual(CARGO_KEY, 6, 4), _sellers(seller1));
        vm.stopPrank();

        (uint64 c, uint64 d, uint256 score) = counter.batchAccrualOf(KIND_CLAUSE, CARGO_KEY, 0);
        assertEq(c, 6);
        assertEq(d, 4);
        assertEq(score, _score(6, 4));
        assertEq(counter.totalScoreIn(0), _score(6, 4), "total holds the latest score, not the sum of writes");
    }

    /// LIVENESS: trade must keep resolving after the reward stops. An empty
    /// accrual returns before `currentPeriod()` is consulted — otherwise every
    /// batch would revert `AccrualClosed` forever once the last period ended,
    /// and the scaling path would be bricked by the reward path.
    function test_emptyBatchAccrualStillSettlesAfterAccrualCloses() public {
        vm.warp(P1_END + 1);
        vm.expectRevert(UsageCounter.AccrualClosed.selector);
        counter.currentPeriod();

        vm.prank(batchVerifier);
        counter.applyBatchAccrual(0, bytes32(0), new UsageCounter.BatchAccrual[](0), new address[](0));
        // No revert, nothing written.
        (uint64 c,,) = counter.batchAccrualOf(KIND_CLAUSE, CARGO_KEY, 0);
        assertEq(c, 0);
    }

    function test_batchAccrualRevertsOnceAccrualClosesIfItCarriesClaims() public {
        vm.warp(P1_END + 1);
        vm.prank(batchVerifier);
        vm.expectRevert(UsageCounter.AccrualClosed.selector);
        counter.applyBatchAccrual(1, PROVENANCE_LEAF, _accrual(CARGO_KEY, 1, 1), _sellers(seller1));
    }
}
