// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroCore} from "src/core/kernel/FigaroCore.sol";
import {CommitmentTypes} from "src/core/kernel/CommitmentTypes.sol";
import {ClauseRegistry} from "src/build/registries/ClauseRegistry.sol";
import {AssemblyRegistry} from "src/build/registries/AssemblyRegistry.sol";
import {AgreementRegistry} from "src/build/registries/AgreementRegistry.sol";
import {MembersRegistry} from "src/app/MembersRegistry.sol";
import {UsageCounter} from "src/build/rewards/UsageCounter.sol";
import {RpgfMinter} from "src/build/rewards/RpgfMinter.sol";
import {FlorinToken} from "src/build/florin/FlorinToken.sol";
import {MockERC20} from "src/mocks/MockERC20.sol";
import {AgreementTestHelper} from "test/helpers/AgreementTestHelper.sol";

/// @notice End to end with NO stubs: a real bonded process resolves, its usage is
///         recorded against the real counter, the period closes, and the real
///         minter pays real florins. RpgfMinterTest exercises payout maths
///         against a stub; this proves the two contracts actually compose — that
///         the counter's `accrualOf`/`totalScoreIn`/`periodClosed` are exactly
///         what the minter reads, and that a florin arrives at the end of it.
contract RpgfIntegrationTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore core;
    ClauseRegistry clauses;
    AssemblyRegistry assemblies;
    AgreementRegistry agreements;
    MembersRegistry members;
    UsageCounter counter;
    RpgfMinter minter;
    FlorinToken florin;
    MockERC20 token;

    uint256 constant BUYER_KEY = 0xB0;
    uint256 constant SELLER_KEY = 0x51;
    address buyer;
    address seller;
    address author = address(0xA47403);
    address designer = address(0xDE519);
    address agreementDesigner = address(0xA62EE);

    // The clause key is keccak256 of the spec's pinned bytes.
    bytes32 constant GEO_KEY = keccak256('{"clauseId":"figaro-geolocation","version":1}');
    /// @dev The registered agreement the reference assembly's one order slot
    ///      instantiates.
    bytes32 constant AGR = keccak256("reference-agreement");
    bytes32 constant PROVENANCE_LEAF = keccak256("figaro-agreement-provenance");
    /// @dev The reference assembly's compositionHash: the root of a one-leaf
    ///      tree, which is its order slot's leaf (set in setUp).
    bytes32 ASM;
    bytes constant SECTION = hex"5eed";

    uint64 constant P0_END = 1_000_000;

    /// @dev Stands in for FigaroBatchVerifier — see UsageCounterTest.
    address constant batchVerifier = address(0xBA7C);
    // Reference per-year slices; the tranche grouping is
    // deploy-script data, the minter sees only per-period budgets.
    uint256 constant T0 = 45_000_000 ether;
    uint256 constant T1 = 60_000_000 ether;
    uint256 constant T2 = 82_500_000 ether;

    function setUp() public {
        buyer = vm.addr(BUYER_KEY);
        seller = vm.addr(SELLER_KEY);

        core = new FigaroCore();
        token = new MockERC20("Test", "TST");
        clauses = new ClauseRegistry(0);
        assemblies = new AssemblyRegistry(0);
        agreements = new AgreementRegistry(0);
        ASM = AgreementTestHelper.leafFor(AGR, AgreementTestHelper.slotSection(0, "{}"));
        members = new MembersRegistry(0, 0);
        florin = new FlorinToken();

        vm.prank(author);
        clauses.registerClause(GEO_KEY, "ipfs://geo");
        vm.prank(designer);
        assemblies.registerAssembly(ASM, "ipfs://asm");
        vm.prank(agreementDesigner);
        agreements.registerAgreement(AGR, "ipfs://agr");
        // The seller-side live-stake gate: the seller-of-record must be staked
        // for its resolved trades to count toward the reward.
        vm.prank(seller);
        members.register("ipfs://seller");

        uint64[] memory periods = new uint64[](3);
        periods[0] = P0_END;
        periods[1] = P0_END * 2;
        periods[2] = P0_END * 3;
        counter = new UsageCounter(
            address(core),
            address(members),
            address(clauses),
            address(assemblies),
            address(agreements),
            batchVerifier,
            1,
            periods
        );

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = T0;
        amounts[1] = T1;
        amounts[2] = T2;
        minter = new RpgfMinter(
            address(florin), address(counter), address(clauses), address(assemblies), address(agreements), amounts
        );
        florin.registerMinter(address(minter), 600_000_000 ether);

        token.mint(buyer, 1_000_000 ether);
        token.mint(seller, 1_000_000 ether);
        vm.prank(buyer);
        token.approve(address(core), type(uint256).max);
        vm.prank(seller);
        token.approve(address(core), type(uint256).max);

        vm.warp(P0_END - 1000);
    }

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

    /// @dev One real bonded process, resolved, committing `clause or assembly`.
    function _settle(bytes32 clauseOrAssembly, uint256 salt) internal returns (CommitmentTypes.Commitment memory c) {
        c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            currency: address(token),
            payment: 100 ether,
            expectedCumulativeValue: 100 ether,
            agreementHash: AgreementTestHelper.singleSectionRoot(clauseOrAssembly, SECTION),
            salt: salt,
            deadline: block.timestamp + 1 hours
        });
        (bytes32 processId,) = core.commit(c, _sign(c, BUYER_KEY), _sign(c, SELLER_KEY));
        CommitmentTypes.Commitment[] memory all = new CommitmentTypes.Commitment[](1);
        all[0] = c;
        vm.prank(buyer);
        core.resolveProcess(processId, all);
    }

    /// @dev A resolved process whose agreement carries the PROVENANCE section
    ///      naming the reference agreement and `compositionHash` — the only way
    ///      an agreement or an assembly is ever provable, because agreement
    ///      leaves are keyed by clause and neither key is ever a leaf key.
    function _settleUnderAssembly(bytes32 compositionHash, uint256 salt)
        internal
        returns (CommitmentTypes.Commitment memory c, bytes memory sectionData)
    {
        // Sections commit as CANONICAL JSON bytes — the same convention the
        // runtime's agreements use (the merkle leaf hashes exactly these).
        sectionData = AgreementTestHelper.provenanceSection(AGR, compositionHash);
        c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            currency: address(token),
            payment: 100 ether,
            expectedCumulativeValue: 100 ether,
            agreementHash: AgreementTestHelper.singleSectionRoot(PROVENANCE_LEAF, sectionData),
            salt: salt,
            deadline: block.timestamp + 1 hours
        });
        (bytes32 processId,) = core.commit(c, _sign(c, BUYER_KEY), _sign(c, SELLER_KEY));
        CommitmentTypes.Commitment[] memory all = new CommitmentTypes.Commitment[](1);
        all[0] = c;
        vm.prank(buyer);
        core.resolveProcess(processId, all);
    }

    uint8 constant KIND_CLAUSE = 0;
    uint8 constant KIND_ASSEMBLY = 1;
    uint8 constant KIND_AGREEMENT = 2;

    /// @dev Credit `compositionHash` for an order instantiating the reference
    ///      assembly's one order slot (a one-leaf tree: the proof is empty).
    function _recordAssembly(CommitmentTypes.Commitment memory p, bytes32 compositionHash) internal {
        counter.recordAssemblyUsage(
            p,
            compositionHash,
            AGR,
            keccak256(AgreementTestHelper.slotSection(0, "{}")),
            new bytes32[](0),
            new bytes32[](0)
        );
    }

    function _clause(bytes32 k) internal pure returns (RpgfMinter.ClauseOrAssemblyKey[] memory a) {
        a = new RpgfMinter.ClauseOrAssemblyKey[](1);
        a[0] = RpgfMinter.ClauseOrAssemblyKey(KIND_CLAUSE, k);
    }

    function _assembly(bytes32 k) internal pure returns (RpgfMinter.ClauseOrAssemblyKey[] memory a) {
        a = new RpgfMinter.ClauseOrAssemblyKey[](1);
        a[0] = RpgfMinter.ClauseOrAssemblyKey(KIND_ASSEMBLY, k);
    }

    // ── The whole path ──────────────────────────────────────────────

    function test_settledTradeBecomesAFlorinPayout() public {
        // Two resolved processes use the clause; one uses the assembly.
        CommitmentTypes.Commitment memory p1 = _settle(GEO_KEY, 1);
        counter.recordClauseUsage(p1, GEO_KEY, keccak256(SECTION), new bytes32[](0));
        (CommitmentTypes.Commitment memory p2,) = _settleUnderAssembly(ASM, 2);
        _recordAssembly(p2, ASM);

        // Nothing is claimable while the period can still move.
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.PeriodStillAccruing.selector, uint8(0)));
        minter.claim(0, _clause(GEO_KEY));

        vm.warp(P0_END + 1);

        (,, uint256 clauseScore) = counter.accrualOf(KIND_CLAUSE, GEO_KEY, 0);
        (,, uint256 asmScore) = counter.accrualOf(KIND_ASSEMBLY, ASM, 0);
        uint256 total = counter.totalScoreIn(0);
        assertEq(total, clauseScore + asmScore);
        // Uniform scoring: equal usage ⇒ equal score, clause or assembly.
        assertEq(clauseScore, asmScore);

        vm.prank(author);
        minter.claim(0, _clause(GEO_KEY));
        vm.prank(designer);
        minter.claim(0, _assembly(ASM));

        // No cap: each takes its pro-rata share. Equal scores ⇒ half the period
        // budget each, and the whole budget is minted (nothing stranded by a cap).
        assertEq(florin.balanceOf(author), T0 / 2);
        assertEq(florin.balanceOf(designer), T0 / 2);
        assertEq(minter.minted(0), T0);
        assertLe(minter.minted(0), T0);
    }

    function test_unrecordedUsageEarnsNothing() public {
        // Recording is opt-in: a resolved process nobody records simply does not
        // count. The florins stay unminted rather than accruing to anyone.
        _settle(GEO_KEY, 1);
        vm.warp(P0_END + 1);

        assertEq(counter.totalScoreIn(0), 0);
        vm.prank(author);
        vm.expectRevert(RpgfMinter.NothingToClaim.selector);
        minter.claim(0, _clause(GEO_KEY));
    }

    function test_usageInALaterPeriodPaysTheLaterBudget() public {
        CommitmentTypes.Commitment memory p1 = _settle(GEO_KEY, 1);
        counter.recordClauseUsage(p1, GEO_KEY, keccak256(SECTION), new bytes32[](0));

        vm.warp(P0_END + 1);
        CommitmentTypes.Commitment memory p2 = _settle(GEO_KEY, 2);
        counter.recordClauseUsage(p2, GEO_KEY, keccak256(SECTION), new bytes32[](0));

        vm.warp(P0_END * 2 + 1);
        vm.startPrank(author);
        minter.claim(0, _clause(GEO_KEY));
        uint256 afterFirst = florin.balanceOf(author);
        minter.claim(1, _clause(GEO_KEY));
        vm.stopPrank();

        // Sole recipient in both periods → takes each period's WHOLE budget
        // (no cap), each period paying only the usage NEW to it.
        assertEq(afterFirst, T0);
        assertEq(florin.balanceOf(author) - afterFirst, T1);
    }

    function test_assemblyCannotBeCreditedWithoutItsProvenanceSection() public {
        // An agreement that never committed the provenance leaf cannot credit
        // an assembly — there is no leaf to open. This is the path that looked
        // like it worked when the clause or assembly key was passed directly.
        CommitmentTypes.Commitment memory p = _settle(GEO_KEY, 1);
        vm.expectRevert(UsageCounter.InvalidInclusionProof.selector);
        _recordAssembly(p, ASM);
    }

    function test_provenanceSectionMustNameTheAssemblyClaimed() public {
        (CommitmentTypes.Commitment memory p,) = _settleUnderAssembly(ASM, 1);
        // The section content is DERIVED from the claimed compositionHash, so a
        // different composition derives a different section hash whose leaf is
        // simply not in the tree — the old ProvenanceMismatch content-check now
        // collapses into the one inclusion gate (a stronger, structural check).
        vm.expectRevert(UsageCounter.InvalidInclusionProof.selector);
        _recordAssembly(p, keccak256("other-assembly"));
    }

    function test_nonAuthorCannotClaimSomeoneElsesClauseOrAssembly() public {
        CommitmentTypes.Commitment memory p1 = _settle(GEO_KEY, 1);
        counter.recordClauseUsage(p1, GEO_KEY, keccak256(SECTION), new bytes32[](0));
        vm.warp(P0_END + 1);

        vm.prank(designer);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, KIND_CLAUSE, GEO_KEY, designer));
        minter.claim(0, _clause(GEO_KEY));
    }

    /// A registry takes any bytes32, so a stranger can stake an assembly's
    /// composition hash as a CLAUSE key. The reward keeps the two families
    /// apart: the assembly's accrual pays the assembly's registrant, and the
    /// stranger's clause-kind standing on that key earns nothing of it.
    function test_aStrangerWhoStakesAnAssemblysKeyAsAClauseTakesNothingOfIt() public {
        address stranger = address(0x5745);
        vm.prank(stranger);
        clauses.registerClause(ASM, "ipfs://a-stranger-stakes-an-assembly-key-as-a-clause");

        (CommitmentTypes.Commitment memory p,) = _settleUnderAssembly(ASM, 1);
        _recordAssembly(p, ASM);
        vm.warp(P0_END + 1);

        vm.prank(stranger);
        vm.expectRevert(RpgfMinter.NothingToClaim.selector);
        minter.claim(0, _clause(ASM));

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, KIND_ASSEMBLY, ASM, stranger));
        minter.claim(0, _assembly(ASM));

        vm.prank(designer);
        minter.claim(0, _assembly(ASM));
        assertEq(florin.balanceOf(designer), T0, "the assembly's registrant takes the assembly's accrual");
        assertEq(florin.balanceOf(stranger), 0, "the stranger takes nothing of it");
    }

    /// The agreement kind end to end: one resolved order credits its
    /// registered agreement and its assembly, each under its own kind, and
    /// each designer of record is paid from its own score while its stake is
    /// live.
    function test_aRegisteredAgreementsDesignerIsPaidForItsUse() public {
        (CommitmentTypes.Commitment memory p,) = _settleUnderAssembly(ASM, 1);
        counter.recordAgreementUsage(p, AGR, ASM, new bytes32[](0));
        _recordAssembly(p, ASM);
        vm.warp(P0_END + 1);

        (,, uint256 agrScore) = counter.accrualOf(KIND_AGREEMENT, AGR, 0);
        (,, uint256 asmScore) = counter.accrualOf(KIND_ASSEMBLY, ASM, 0);
        assertEq(agrScore, asmScore, "uniform scoring across the kinds");
        assertEq(counter.totalScoreIn(0), agrScore + asmScore);

        RpgfMinter.ClauseOrAssemblyKey[] memory a = new RpgfMinter.ClauseOrAssemblyKey[](1);
        a[0] = RpgfMinter.ClauseOrAssemblyKey(KIND_AGREEMENT, AGR);
        vm.prank(designer);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, KIND_AGREEMENT, AGR, designer));
        minter.claim(0, a);

        vm.prank(agreementDesigner);
        minter.claim(0, a);
        vm.prank(designer);
        minter.claim(0, _assembly(ASM));
        assertEq(florin.balanceOf(agreementDesigner), T0 / 2);
        assertEq(florin.balanceOf(designer), T0 / 2);
    }
}
