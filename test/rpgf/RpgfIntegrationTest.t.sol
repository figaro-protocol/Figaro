// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroCore} from "src/kernel/FigaroCore.sol";
import {CommitmentTypes} from "src/kernel/CommitmentTypes.sol";
import {ClauseRegistry} from "src/protocol/registries/ClauseRegistry.sol";
import {AssemblyRegistry} from "src/protocol/registries/AssemblyRegistry.sol";
import {MembersRegistry} from "src/protocol/registries/MembersRegistry.sol";
import {UsageCounter} from "src/protocol/usage/UsageCounter.sol";
import {RpgfMinter} from "src/rpgf/RpgfMinter.sol";
import {FlorinToken} from "src/florin/FlorinToken.sol";
import {MockERC20} from "src/mocks/MockERC20.sol";
import {AgreementTestHelper} from "test/helpers/AgreementTestHelper.sol";

/// @notice End to end with NO stubs: a real bonded process settles, its usage is
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

    string constant GEO_ID = "figaro-geolocation";
    bytes32 constant GEO_KEY = keccak256(abi.encode("figaro-geolocation", uint64(1)));
    bytes32 constant ASM = keccak256("reference-assembly");
    bytes32 constant PROV_KEY = keccak256(abi.encode("figaro-assembly-provenance", uint64(1)));
    bytes constant SECTION = hex"5eed";

    uint64 constant P0_END = 1_000_000;

    /// @dev Stands in for FigaroBatchVerifier — see UsageCounterTest.
    address constant batchVerifier = address(0xBA7C);
    // Reference per-year slices (ruled 2026-07-31); the tranche grouping is
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
        members = new MembersRegistry(0, 0);
        florin = new FlorinToken();

        vm.prank(author);
        clauses.registerClause(GEO_ID, 1, keccak256("geo-spec"), "ipfs://geo");
        vm.prank(designer);
        assemblies.registerAssembly(ASM, "ipfs://asm");
        // The seller-side live-stake gate: the seller-of-record must be staked
        // for its settled trades to count toward the reward.
        vm.prank(seller);
        members.register("ipfs://seller");

        uint64[] memory periods = new uint64[](3);
        periods[0] = P0_END;
        periods[1] = P0_END * 2;
        periods[2] = P0_END * 3;
        counter = new UsageCounter(address(core), address(members), batchVerifier, PROV_KEY, _excluded(), 1, periods);

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = T0;
        amounts[1] = T1;
        amounts[2] = T2;
        minter = new RpgfMinter(address(florin), address(counter), address(clauses), address(assemblies), amounts);
        florin.registerMinter(address(minter), 600_000_000 ether);

        token.mint(buyer, 1_000_000 ether);
        token.mint(seller, 1_000_000 ether);
        vm.prank(buyer);
        token.approve(address(core), type(uint256).max);
        vm.prank(seller);
        token.approve(address(core), type(uint256).max);

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

    /// @dev One real bonded process, settled, committing `artifact`.
    function _settle(bytes32 artifact, uint256 salt) internal returns (CommitmentTypes.Commitment memory c) {
        c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            currency: address(token),
            payment: 100 ether,
            expectedCumulativeValue: 100 ether,
            agreementHash: AgreementTestHelper.singleSectionRoot(artifact, SECTION),
            salt: salt,
            deadline: block.timestamp + 1 hours
        });
        (bytes32 processId,) = core.commit(c, _sign(c, BUYER_KEY), _sign(c, SELLER_KEY));
        CommitmentTypes.Commitment[] memory all = new CommitmentTypes.Commitment[](1);
        all[0] = c;
        vm.prank(buyer);
        core.resolveProcess(processId, all);
    }

    /// @dev A settled process whose agreement carries the PROVENANCE section —
    ///      the only way an assembly is ever provable, because agreement leaves
    ///      are keyed by clause and a compositionHash is never a leaf key.
    function _settleUnderAssembly(bytes32 compositionHash, uint256 salt)
        internal
        returns (CommitmentTypes.Commitment memory c, bytes memory sectionData)
    {
        // Sections commit as CANONICAL JSON bytes — the same convention the
        // runtime's agreements use (the merkle leaf hashes exactly these).
        sectionData = _provJson(compositionHash);
        c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            currency: address(token),
            payment: 100 ether,
            expectedCumulativeValue: 100 ether,
            agreementHash: AgreementTestHelper.singleSectionRoot(PROV_KEY, sectionData),
            salt: salt,
            deadline: block.timestamp + 1 hours
        });
        (bytes32 processId,) = core.commit(c, _sign(c, BUYER_KEY), _sign(c, SELLER_KEY));
        CommitmentTypes.Commitment[] memory all = new CommitmentTypes.Commitment[](1);
        all[0] = c;
        vm.prank(buyer);
        core.resolveProcess(processId, all);
    }

    function _one(bytes32 k) internal pure returns (bytes32[] memory a) {
        a = new bytes32[](1);
        a[0] = k;
    }

    // ── The whole path ──────────────────────────────────────────────

    function test_settledTradeBecomesAFlorinPayout() public {
        // Two settled processes use the clause; one uses the assembly.
        CommitmentTypes.Commitment memory p1 = _settle(GEO_KEY, 1);
        counter.recordClauseUsage(p1, GEO_KEY, keccak256(SECTION), new bytes32[](0));
        (CommitmentTypes.Commitment memory p2,) = _settleUnderAssembly(ASM, 2);
        counter.recordAssemblyUsage(p2, ASM, new bytes32[](0));

        // Nothing is claimable while the period can still move.
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.PeriodStillAccruing.selector, uint8(0)));
        minter.claim(0, _one(GEO_KEY));

        vm.warp(P0_END + 1);

        (,, uint256 clauseScore) = counter.accrualOf(GEO_KEY, 0);
        (,, uint256 asmScore) = counter.accrualOf(ASM, 0);
        uint256 total = counter.totalScoreIn(0);
        assertEq(total, clauseScore + asmScore);
        // Uniform scoring: equal usage ⇒ equal score, clause or assembly.
        assertEq(clauseScore, asmScore);

        vm.prank(author);
        minter.claim(0, _one(GEO_KEY));
        vm.prank(designer);
        minter.claim(0, _one(ASM));

        // No cap: each takes its pro-rata share. Equal scores ⇒ half the period
        // budget each, and the whole budget is minted (nothing stranded by a cap).
        assertEq(florin.balanceOf(author), T0 / 2);
        assertEq(florin.balanceOf(designer), T0 / 2);
        assertEq(minter.minted(0), T0);
        assertLe(minter.minted(0), T0);
    }

    function test_unrecordedUsageEarnsNothing() public {
        // Recording is opt-in: a settled process nobody records simply does not
        // count. The florins stay unminted rather than accruing to anyone.
        _settle(GEO_KEY, 1);
        vm.warp(P0_END + 1);

        assertEq(counter.totalScoreIn(0), 0);
        vm.prank(author);
        vm.expectRevert(RpgfMinter.NothingToClaim.selector);
        minter.claim(0, _one(GEO_KEY));
    }

    function test_usageInALaterPeriodPaysTheLaterBudget() public {
        CommitmentTypes.Commitment memory p1 = _settle(GEO_KEY, 1);
        counter.recordClauseUsage(p1, GEO_KEY, keccak256(SECTION), new bytes32[](0));

        vm.warp(P0_END + 1);
        CommitmentTypes.Commitment memory p2 = _settle(GEO_KEY, 2);
        counter.recordClauseUsage(p2, GEO_KEY, keccak256(SECTION), new bytes32[](0));

        vm.warp(P0_END * 2 + 1);
        vm.startPrank(author);
        minter.claim(0, _one(GEO_KEY));
        uint256 afterFirst = florin.balanceOf(author);
        minter.claim(1, _one(GEO_KEY));
        vm.stopPrank();

        // Sole recipient in both periods → takes each period's WHOLE budget
        // (no cap), each period paying only the usage NEW to it.
        assertEq(afterFirst, T0);
        assertEq(florin.balanceOf(author) - afterFirst, T1);
    }

    /// @dev The provenance section's canonical-JSON bytes for a composition.
    function _provJson(bytes32 compositionHash) internal pure returns (bytes memory) {
        return abi.encodePacked('{"compositionHash":"', vm.toString(compositionHash), '"}');
    }

    function test_assemblyCannotBeCreditedWithoutItsProvenanceSection() public {
        // An agreement that never committed the provenance clause cannot credit
        // an assembly — there is no leaf to open. This is the path that looked
        // like it worked when the artifact key was passed directly.
        CommitmentTypes.Commitment memory p = _settle(GEO_KEY, 1);
        vm.expectRevert(UsageCounter.InvalidInclusionProof.selector);
        counter.recordAssemblyUsage(p, ASM, new bytes32[](0));
    }

    function test_provenanceSectionMustNameTheAssemblyClaimed() public {
        (CommitmentTypes.Commitment memory p,) = _settleUnderAssembly(ASM, 1);
        // The section content is DERIVED from the claimed compositionHash, so a
        // different composition derives a different section hash whose leaf is
        // simply not in the tree — the old ProvenanceMismatch content-check now
        // collapses into the one inclusion gate (a stronger, structural check).
        vm.expectRevert(UsageCounter.InvalidInclusionProof.selector);
        counter.recordAssemblyUsage(p, keccak256("other-assembly"), new bytes32[](0));
    }

    function test_nonAuthorCannotClaimSomeoneElsesArtifact() public {
        CommitmentTypes.Commitment memory p1 = _settle(GEO_KEY, 1);
        counter.recordClauseUsage(p1, GEO_KEY, keccak256(SECTION), new bytes32[](0));
        vm.warp(P0_END + 1);

        vm.prank(designer);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, GEO_KEY, designer));
        minter.claim(0, _one(GEO_KEY));
    }
}
