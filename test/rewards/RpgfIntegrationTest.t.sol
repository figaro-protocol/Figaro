// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroCore} from "src/core/kernel/FigaroCore.sol";
import {CommitmentTypes} from "src/core/kernel/CommitmentTypes.sol";
import {ClauseRegistry} from "src/registries/ClauseRegistry.sol";
import {ProcessRegistry} from "src/registries/ProcessRegistry.sol";
import {AgreementRegistry} from "src/registries/AgreementRegistry.sol";
import {MembersRegistry} from "src/registries/MembersRegistry.sol";
import {UsageCounter} from "src/rewards/UsageCounter.sol";
import {RpgfMinter} from "src/rewards/RpgfMinter.sol";
import {FlorinToken} from "src/rewards/FlorinToken.sol";
import {MockERC20} from "src/mocks/MockERC20.sol";
import {AgreementTestHelper} from "test/helpers/AgreementTestHelper.sol";

/// @notice Stands in for the DAO's treasury wallet, a contract wallet: its
///         owner sends a list of calls, and the wallet makes them in order in
///         one transaction, as a Safe does through a multi-send. A failed call
///         reverts the whole list with that call's own revert data.
contract TreasuryWalletStandIn {
    struct Call {
        address to;
        uint256 value;
        bytes data;
    }

    error NotOwner();

    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    /// @dev Takes the members registry stake back after the cooldown.
    receive() external payable {}

    function execute(Call[] calldata calls) external {
        if (msg.sender != owner) revert NotOwner();
        for (uint256 i = 0; i < calls.length; ++i) {
            (bool ok, bytes memory ret) = calls[i].to.call{value: calls[i].value}(calls[i].data);
            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
    }
}

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
    ProcessRegistry assemblies;
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
    /// @dev The registered agreement the reference assembly's one agreement
    ///      instantiates.
    bytes32 constant AGR = keccak256("reference-agreement");
    bytes32 constant PROVENANCE_LEAF = keccak256("figaro-agreement-provenance");
    /// @dev The reference assembly's processDesignHash: the root of a one-leaf
    ///      tree, which is its agreement's leaf (set in setUp).
    bytes32 ASM;
    bytes constant CLAUSE_DATA = hex"5eed";

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
        assemblies = new ProcessRegistry(0);
        agreements = new AgreementRegistry(0);
        ASM = AgreementTestHelper.assemblyLeafFor(AGR, AgreementTestHelper.agreementLeafBytes(0, "{}", "[]"));
        members = new MembersRegistry(0, 0);

        vm.prank(author);
        clauses.registerClause(GEO_KEY, "ipfs://geo");
        vm.prank(designer);
        assemblies.registerProcess(ASM, "ipfs://asm");
        vm.prank(agreementDesigner);
        agreements.registerAgreement(AGR, "ipfs://agr");
        // The seller-side live-stake gate: the seller-of-record must be staked
        // for its resolved trades to count toward the reward.
        vm.prank(seller);
        members.register("ipfs://seller");
        // The designer-side membership gate: a designer of record is paid only
        // while it is a live member. The three designers here are.
        vm.prank(author);
        members.register("ipfs://author");
        vm.prank(designer);
        members.register("ipfs://designer");
        vm.prank(agreementDesigner);
        members.register("ipfs://agreement-designer");

        _deployTheRewards();

        token.mint(buyer, 1_000_000 ether);
        token.mint(seller, 1_000_000 ether);
        vm.prank(buyer);
        token.approve(address(core), type(uint256).max);
        vm.prank(seller);
        token.approve(address(core), type(uint256).max);

        vm.warp(P0_END - 1000);
    }

    /// @dev The counter, the token and the minter, over the `members` registry
    ///      the test stands up.
    function _deployTheRewards() internal {
        florin = new FlorinToken();
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
            address(florin),
            address(counter),
            address(members),
            address(clauses),
            address(assemblies),
            address(agreements),
            amounts
        );
        florin.registerMinter(address(minter), 600_000_000 ether);
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
    function _settle(bytes32 clauseOrProcess, uint256 salt) internal returns (CommitmentTypes.Commitment memory c) {
        c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            token: address(token),
            payment: 100 ether,
            runningTotal: 100 ether,
            checkoutHash: AgreementTestHelper.singleClauseRoot(clauseOrProcess, CLAUSE_DATA),
            salt: salt,
            commitDeadline: block.timestamp + 1 hours
        });
        (bytes32 processId,) = core.commit(c, _sign(c, BUYER_KEY), _sign(c, SELLER_KEY));
        CommitmentTypes.Commitment[] memory all = new CommitmentTypes.Commitment[](1);
        all[0] = c;
        vm.prank(buyer);
        core.resolveProcess(processId, all);
    }

    /// @dev A resolved process whose agreement carries the PROVENANCE leaf
    ///      naming the reference agreement and `processDesignHash` — the only way
    ///      an agreement or an assembly is ever provable, because agreement
    ///      leaves are keyed by clause and neither key is ever a leaf key.
    function _settleUnderAssembly(bytes32 processDesignHash, uint256 salt)
        internal
        returns (CommitmentTypes.Commitment memory c, bytes memory clauseData)
    {
        // Clauses commit as CANONICAL JSON bytes — the same convention the
        // runtime's agreements use (the merkle leaf hashes exactly these).
        clauseData = AgreementTestHelper.provenanceLeaf(AGR, processDesignHash);
        c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            token: address(token),
            payment: 100 ether,
            runningTotal: 100 ether,
            checkoutHash: AgreementTestHelper.singleClauseRoot(PROVENANCE_LEAF, clauseData),
            salt: salt,
            commitDeadline: block.timestamp + 1 hours
        });
        (bytes32 processId,) = core.commit(c, _sign(c, BUYER_KEY), _sign(c, SELLER_KEY));
        CommitmentTypes.Commitment[] memory all = new CommitmentTypes.Commitment[](1);
        all[0] = c;
        vm.prank(buyer);
        core.resolveProcess(processId, all);
    }

    uint8 constant KIND_CLAUSE = 0;
    uint8 constant KIND_PROCESS = 1;
    uint8 constant KIND_AGREEMENT = 2;

    /// @dev Credit `processDesignHash` for an order instantiating the reference
    ///      assembly's one agreement (a one-leaf tree: the proof is empty).
    function _recordAssembly(CommitmentTypes.Commitment memory p, bytes32 processDesignHash) internal {
        counter.recordProcessDesignUsage(
            p,
            processDesignHash,
            AGR,
            keccak256(AgreementTestHelper.agreementLeafBytes(0, "{}", "[]")),
            new bytes32[](0),
            new bytes32[](0)
        );
    }

    function _clause(bytes32 k) internal pure returns (RpgfMinter.ClauseOrProcessKey[] memory a) {
        a = new RpgfMinter.ClauseOrProcessKey[](1);
        a[0] = RpgfMinter.ClauseOrProcessKey(KIND_CLAUSE, k);
    }

    function _assembly(bytes32 k) internal pure returns (RpgfMinter.ClauseOrProcessKey[] memory a) {
        a = new RpgfMinter.ClauseOrProcessKey[](1);
        a[0] = RpgfMinter.ClauseOrProcessKey(KIND_PROCESS, k);
    }

    // ── The whole path ──────────────────────────────────────────────

    function test_settledTradeBecomesAFlorinPayout() public {
        // Two resolved processes use the clause; one uses the assembly.
        CommitmentTypes.Commitment memory p1 = _settle(GEO_KEY, 1);
        counter.recordClauseUsage(p1, GEO_KEY, keccak256(CLAUSE_DATA), new bytes32[](0));
        (CommitmentTypes.Commitment memory p2,) = _settleUnderAssembly(ASM, 2);
        _recordAssembly(p2, ASM);

        // Nothing is claimable while the period can still move.
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.PeriodStillAccruing.selector, uint8(0)));
        minter.claim(0, _clause(GEO_KEY));

        vm.warp(P0_END + 1);

        (,, uint256 clauseScore) = counter.accrualOf(KIND_CLAUSE, GEO_KEY, 0);
        (,, uint256 asmScore) = counter.accrualOf(KIND_PROCESS, ASM, 0);
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
        counter.recordClauseUsage(p1, GEO_KEY, keccak256(CLAUSE_DATA), new bytes32[](0));

        vm.warp(P0_END + 1);
        CommitmentTypes.Commitment memory p2 = _settle(GEO_KEY, 2);
        counter.recordClauseUsage(p2, GEO_KEY, keccak256(CLAUSE_DATA), new bytes32[](0));

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

    function test_assemblyCannotBeCreditedWithoutItsProvenanceLeaf() public {
        // An agreement that never committed the provenance leaf cannot credit
        // an assembly — there is no leaf to open. This is the path that looked
        // like it worked when the clause or assembly key was passed directly.
        CommitmentTypes.Commitment memory p = _settle(GEO_KEY, 1);
        vm.expectRevert(UsageCounter.InvalidInclusionProof.selector);
        _recordAssembly(p, ASM);
    }

    function test_provenanceLeafMustNameTheAssemblyClaimed() public {
        (CommitmentTypes.Commitment memory p,) = _settleUnderAssembly(ASM, 1);
        // The clause content is DERIVED from the claimed processDesignHash, so a
        // different composition derives a different clause data hash whose leaf is
        // simply not in the tree — the old ProvenanceMismatch content-check now
        // collapses into the one inclusion gate (a stronger, structural check).
        vm.expectRevert(UsageCounter.InvalidInclusionProof.selector);
        _recordAssembly(p, keccak256("other-assembly"));
    }

    function test_nonAuthorCannotClaimSomeoneElsesClauseOrAssembly() public {
        CommitmentTypes.Commitment memory p1 = _settle(GEO_KEY, 1);
        counter.recordClauseUsage(p1, GEO_KEY, keccak256(CLAUSE_DATA), new bytes32[](0));
        vm.warp(P0_END + 1);

        vm.prank(designer);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, KIND_CLAUSE, GEO_KEY, designer));
        minter.claim(0, _clause(GEO_KEY));
    }

    /// A registry takes any bytes32, so a stranger can stake an assembly's
    /// assembly hash as a CLAUSE key. The reward keeps the two families
    /// apart: the assembly's accrual pays the assembly's registrant, and the
    /// stranger's clause-kind standing on that key earns nothing of it.
    function test_aStrangerWhoStakesAnAssemblysKeyAsAClauseTakesNothingOfIt() public {
        address stranger = address(0x5745);
        // A member, so the claim reaches the kind gate this test is about.
        vm.prank(stranger);
        members.register("ipfs://stranger");
        vm.prank(stranger);
        clauses.registerClause(ASM, "ipfs://a-stranger-stakes-an-assembly-key-as-a-clause");

        (CommitmentTypes.Commitment memory p,) = _settleUnderAssembly(ASM, 1);
        _recordAssembly(p, ASM);
        vm.warp(P0_END + 1);

        vm.prank(stranger);
        vm.expectRevert(RpgfMinter.NothingToClaim.selector);
        minter.claim(0, _clause(ASM));

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, KIND_PROCESS, ASM, stranger));
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
        (,, uint256 asmScore) = counter.accrualOf(KIND_PROCESS, ASM, 0);
        assertEq(agrScore, asmScore, "uniform scoring across the kinds");
        assertEq(counter.totalScoreIn(0), agrScore + asmScore);

        RpgfMinter.ClauseOrProcessKey[] memory a = new RpgfMinter.ClauseOrProcessKey[](1);
        a[0] = RpgfMinter.ClauseOrProcessKey(KIND_AGREEMENT, AGR);
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

    /// The reverse squat: a stranger stakes a clause's key as an ASSEMBLY.
    /// The clause's accrual pays the clause's designer of record; the
    /// stranger's assembly-kind standing on that key earns nothing of it.
    function test_aStrangerWhoStakesAClausesKeyAsAnAssemblyTakesNothingOfIt() public {
        address stranger = address(0x5745);
        // A member, so the claim reaches the kind gate this test is about.
        vm.prank(stranger);
        members.register("ipfs://stranger");
        vm.prank(stranger);
        assemblies.registerProcess(GEO_KEY, "ipfs://a-stranger-stakes-a-clause-key-as-an-assembly");

        CommitmentTypes.Commitment memory p = _settle(GEO_KEY, 1);
        counter.recordClauseUsage(p, GEO_KEY, keccak256(CLAUSE_DATA), new bytes32[](0));
        vm.warp(P0_END + 1);

        (,, uint256 assemblyKindScore) = counter.accrualOf(KIND_PROCESS, GEO_KEY, 0);
        assertEq(assemblyKindScore, 0, "nothing accrues under the assembly kind at the clause's key");

        vm.prank(stranger);
        vm.expectRevert(RpgfMinter.NothingToClaim.selector);
        minter.claim(0, _assembly(GEO_KEY));

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, KIND_CLAUSE, GEO_KEY, stranger));
        minter.claim(0, _clause(GEO_KEY));

        vm.prank(author);
        minter.claim(0, _clause(GEO_KEY));
        assertEq(florin.balanceOf(author), T0, "the clause's designer of record takes the clause's accrual");
        assertEq(florin.balanceOf(stranger), 0, "the stranger takes nothing of it");
    }

    /// `claimable` quotes what `claim` would pay under a crossed kind: zero
    /// for a stranger's standing in the other family at the same key, a
    /// refusal for the kind the stranger is not designer of record in, and
    /// the whole share for each family's own designer of record.
    function test_claimableQuotesNothingUnderACrossedKind() public {
        address stranger = address(0x5745);
        // A member, so the claim reaches the kind gate this test is about.
        vm.prank(stranger);
        members.register("ipfs://stranger");
        vm.startPrank(stranger);
        clauses.registerClause(ASM, "ipfs://a-stranger-stakes-an-assembly-key-as-a-clause");
        assemblies.registerProcess(GEO_KEY, "ipfs://a-stranger-stakes-a-clause-key-as-an-assembly");
        vm.stopPrank();

        CommitmentTypes.Commitment memory p1 = _settle(GEO_KEY, 1);
        counter.recordClauseUsage(p1, GEO_KEY, keccak256(CLAUSE_DATA), new bytes32[](0));
        (CommitmentTypes.Commitment memory p2,) = _settleUnderAssembly(ASM, 2);
        _recordAssembly(p2, ASM);
        vm.warp(P0_END + 1);

        assertEq(minter.claimable(0, stranger, _clause(ASM)), 0, "the assembly's key quotes nothing as a clause");
        assertEq(minter.claimable(0, stranger, _assembly(GEO_KEY)), 0, "the clause's key quotes nothing as an assembly");

        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, KIND_PROCESS, ASM, stranger));
        minter.claimable(0, stranger, _assembly(ASM));
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, KIND_CLAUSE, GEO_KEY, stranger));
        minter.claimable(0, stranger, _clause(GEO_KEY));

        assertEq(
            minter.claimable(0, designer, _assembly(ASM)),
            T0 / 2,
            "the assembly's designer of record is quoted its share"
        );
        assertEq(
            minter.claimable(0, author, _clause(GEO_KEY)), T0 / 2, "the clause's designer of record is quoted its share"
        );
    }

    // ── The treasury wallet's claim ─────────────────────────────────
    //
    // The DAO's treasury wallet registers `figaro-commerce` and holds no
    // member stake between claims; the DAO's member profile is its operator
    // account's. The claim reads a live member stake on the claimant in the
    // claim's block only (DESIGN_DECISIONS.md § 20a), so the treasury wallet
    // registers a stake, claims and requests withdrawal in one transaction,
    // and takes the stake back after the cooldown.

    /// @dev The public networks' stake and cooldown (§ 20a).
    uint256 constant STAKE = 0.05 ether;
    uint256 constant COOLDOWN = 28 days;
    bytes32 constant COMMERCE_KEY = keccak256('{"clauseId":"figaro-commerce","version":1}');
    address constant TREASURY_OWNER = address(0x7E5);
    address constant OPERATOR = address(0x0EA0);

    /// @dev A members registry with a stake and a cooldown, read by a fresh
    ///      counter and minter; the seller and the operator account are
    ///      members. The treasury wallet registers the clause, one resolved
    ///      process uses it, its use is counted, and the period closes.
    function _treasuryClauseUsedInAClosedPeriod() internal returns (TreasuryWalletStandIn treasury) {
        members = new MembersRegistry(STAKE, COOLDOWN);
        vm.deal(seller, STAKE);
        vm.prank(seller);
        members.register{value: STAKE}("ipfs://seller");
        vm.deal(OPERATOR, STAKE);
        vm.prank(OPERATOR);
        members.register{value: STAKE}("ipfs://dao-operator");
        _deployTheRewards();

        treasury = new TreasuryWalletStandIn(TREASURY_OWNER);
        _execute(
            treasury,
            _one(address(clauses), 0, abi.encodeCall(ClauseRegistry.registerClause, (COMMERCE_KEY, "ipfs://commerce")))
        );
        (address registeredBy,) = clauses.depositOf(COMMERCE_KEY);
        assertEq(registeredBy, address(treasury), "the treasury wallet registered the clause");

        CommitmentTypes.Commitment memory p = _settle(COMMERCE_KEY, 1);
        counter.recordClauseUsage(p, COMMERCE_KEY, keccak256(CLAUSE_DATA), new bytes32[](0));
        vm.warp(P0_END + 1);
    }

    function _one(address to, uint256 value, bytes memory data)
        internal
        pure
        returns (TreasuryWalletStandIn.Call[] memory calls)
    {
        calls = new TreasuryWalletStandIn.Call[](1);
        calls[0] = TreasuryWalletStandIn.Call(to, value, data);
    }

    function _execute(TreasuryWalletStandIn treasury, TreasuryWalletStandIn.Call[] memory calls) internal {
        vm.prank(TREASURY_OWNER);
        treasury.execute(calls);
    }

    function _claimCommerce() internal view returns (TreasuryWalletStandIn.Call memory) {
        return TreasuryWalletStandIn.Call(
            address(minter), 0, abi.encodeCall(RpgfMinter.claim, (uint8(0), _clause(COMMERCE_KEY)))
        );
    }

    /// (a) The registrant with no member stake is refused at the claim, and
    /// quoted zero.
    function test_theTreasuryWalletWithNoMemberStakeIsRefusedAtTheClaim() public {
        TreasuryWalletStandIn treasury = _treasuryClauseUsedInAClosedPeriod();
        assertFalse(members.registered(address(treasury)));
        assertEq(minter.claimable(0, address(treasury), _clause(COMMERCE_KEY)), 0);

        TreasuryWalletStandIn.Call[] memory claimOnly = new TreasuryWalletStandIn.Call[](1);
        claimOnly[0] = _claimCommerce();
        vm.prank(TREASURY_OWNER);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotLiveMember.selector, address(treasury)));
        treasury.execute(claimOnly);
        assertEq(florin.balanceOf(address(treasury)), 0);
    }

    /// (b) In one transaction the treasury wallet registers a member stake
    /// with no profile document, claims and requests withdrawal, and holds the
    /// florins and no live membership at its end. (c) The stake stays locked
    /// for the cooldown and comes back after it.
    function test_theTreasuryWalletRegistersClaimsAndRequestsWithdrawalInOneTransaction() public {
        TreasuryWalletStandIn treasury = _treasuryClauseUsedInAClosedPeriod();
        vm.deal(address(treasury), STAKE);

        TreasuryWalletStandIn.Call[] memory calls = new TreasuryWalletStandIn.Call[](3);
        calls[0] = TreasuryWalletStandIn.Call(address(members), STAKE, abi.encodeCall(MembersRegistry.register, ("")));
        calls[1] = _claimCommerce();
        calls[2] =
            TreasuryWalletStandIn.Call(address(members), 0, abi.encodeCall(MembersRegistry.requestWithdrawal, ()));
        _execute(treasury, calls);

        assertEq(florin.balanceOf(address(treasury)), T0, "the sole scorer takes the period's budget");
        assertEq(minter.minted(0), T0);
        assertFalse(members.registered(address(treasury)), "no live membership after the transaction");
        assertEq(members.pendingDeposit(address(treasury)), STAKE);
        uint256 releaseAt = block.timestamp + COOLDOWN;
        assertEq(members.releaseAt(address(treasury)), releaseAt);
        assertEq(address(treasury).balance, 0, "the stake is locked");

        TreasuryWalletStandIn.Call[] memory withdrawCall =
            _one(address(members), 0, abi.encodeCall(MembersRegistry.withdraw, ()));
        vm.prank(TREASURY_OWNER);
        vm.expectRevert(abi.encodeWithSelector(MembersRegistry.CooldownActive.selector, releaseAt));
        treasury.execute(withdrawCall);

        vm.warp(releaseAt);
        _execute(treasury, withdrawCall);
        assertEq(address(treasury).balance, STAKE, "the stake comes back after the cooldown");
        assertEq(members.pendingDeposit(address(treasury)), 0);
        assertEq(florin.balanceOf(address(treasury)), T0);
    }

    /// (d) The operator account holds the DAO's member profile and a live
    /// stake, and is not the clause's registrant: its claim is refused on the key.
    function test_theOperatorAccountCannotClaimTheTreasuryWalletsClause() public {
        _treasuryClauseUsedInAClosedPeriod();
        assertTrue(members.registered(OPERATOR));

        vm.prank(OPERATOR);
        vm.expectRevert(
            abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, KIND_CLAUSE, COMMERCE_KEY, OPERATOR)
        );
        minter.claim(0, _clause(COMMERCE_KEY));
        assertEq(florin.balanceOf(OPERATOR), 0);
    }
}
