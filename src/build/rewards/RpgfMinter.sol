// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IFlorinMinter} from "src/build/florin/IFlorinMinter.sol";

/// @notice The accrual surface this minter pays from. Local-minimal binding.
interface IUsageCounter {
    function periodCount() external view returns (uint256);
    function periodClosed(uint8 period) external view returns (bool);
    function totalScoreIn(uint8 period) external view returns (uint256);
    /// @dev The score of the one tally both routes feed — a use counts the
    ///      same whether its process resolved through `FigaroCore` or in a
    ///      proved batch.
    function scoreOf(uint8 kind, bytes32 clauseOrAssembly, uint8 period) external view returns (uint256);
}

/// @notice The one MembersRegistry field this contract reads — whether an
///         address holds a LIVE MEMBER stake. The stake is a member's; this
///         contract applies it to the CLAIMANT, the designer of record — the
///         designer-side membership gate, the arrow `UsageCounter` draws to the
///         same registry for the seller of record.
interface IMemberStake {
    function registered(address member) external view returns (bool);
}

/// @notice Designer of record for a clause — `ClauseRegistry.depositOf`.
interface IClauseAuthor {
    function depositOf(bytes32 clauseKey) external view returns (address registeredBy, bool withdrawn);
}

/// @notice Designer of record for an assembly — `AssemblyRegistry.bindings`.
interface IAssemblyAuthor {
    function bindings(bytes32 assemblyHash)
        external
        view
        returns (address registeredBy, uint64 registeredAt, bool depositWithdrawn, string memory contentURI);
}

/// @notice Designer of record for a registered agreement — `AgreementRegistry.bindings`.
interface IAgreementAuthor {
    function bindings(bytes32 agreementHash)
        external
        view
        returns (address registeredBy, uint64 registeredAt, bool depositWithdrawn, string memory contentURI);
}

/// @title RpgfMinter — the 600M retroactive distribution
/// @custom:security-contact figarosecurity@gmail.com
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
///
/// @notice Pays the designers of record of clauses, registered agreements and
///         assemblies for the trade their work actually carried, one claim per
///         accrual period. The reference
///         schedule: nine ANNUAL periods whose budgets
///         group into three RISING tranches — 15% of the reserve over years
///         1–2, 30% over years 3–5, 55% over years 6–9, each tranche split
///         equally across its years. Rising, because the largest share should
///         pay on the most-measured evidence: the early network is the
///         thinnest, most manipulable denominator, and early evidence-poor
///         funding is the DAO treasury's job, not this mechanism's. Annual,
///         because a professional designer cannot price a multi-year lag in an
///         unpriced token — and shorter periods also shrink the deposit
///         recycling window. The grouping is deploy-script data; this
///         contract knows only periods and their budgets.
///
///         There is NOTHING TO POST, NOTHING TO BOND, AND NOTHING TO DISPUTE.
///         Usage is counted on chain as it happens by `UsageCounter`, so a
///         tranche is arithmetic over numbers that are already final: a wallet's
///         share is its clauses', agreements' and assemblies' score in that period over the
///         period's total.
///         The previous design reconstructed usage after the fact, which
///         required someone to POST the answer, a BOND to make posting costly, a
///         CHALLENGE to contest it, and a FORUM to award the bonds — an entire
///         apparatus for making the chain believe a claim about the past. Record
///         the fact when it happens and every layer of that disappears.
///
/// @dev    WHY NO SNAPSHOT IS NEEDED. Pro rata over a growing denominator would
///         need one — early claimants would take more than their share. The
///         counter buckets accrual into fixed PERIODS instead, and each period's
///         budget pays for that period alone, whose counts stop moving the
///         moment it ends. `claim` therefore requires `periodClosed` and reads
///         a number no later record can change. No checkpoints, no history walk.
///
/// @dev    UNIFORM PRO RATA — no per-wallet cap. A wallet's share is its
///         clauses', agreements' and assemblies' score over the period's total, paid
///         straight. Sybil
///         resistance is the two-sided LIVE ETH STAKE (designer eligibility here,
///         seller-gated usage in `UsageCounter`), not a cap: breadth counts
///         distinct staked sellers, so every unit of the score's dominant term
///         costs one base-currency stake, and the 600M is a FIXED pool a
///         farmer DILUTES, never inflates. The old 15% cap was arbitrary and
///         left florins unminted; it is gone.
///
/// @dev    No owner, no pause, no sweep, no claim expiry. Claims never expire
///         because a closed period's arithmetic is stable forever. The budget is
///         enforced twice: `minted` here, and the outer FlorinToken minter cap
///         (600M registered at genesis before `renounceDeployerMint`, which is
///         why this contract must exist at florin genesis).
///
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any kind, express or implied. No liability is accepted for loss, damages, or bugs. Use at your own risk.
contract RpgfMinter {
    // ── Composition (immutable) ─────────────────────────────────────

    IFlorinMinter public immutable florin;
    IUsageCounter public immutable counter;
    /// @notice MembersRegistry — the claimant's live member stake, the
    ///         designer-side membership gate (`NotLiveMember`).
    IMemberStake public immutable members;
    IClauseAuthor public immutable clauses;
    IAssemblyAuthor public immutable assemblies;
    IAgreementAuthor public immutable agreements;

    /// @notice The kind of a clause entry — `UsageCounter.KIND_CLAUSE`; its key
    ///         is a `ClauseRegistry` clause key.
    uint8 public constant KIND_CLAUSE = 0;
    /// @notice The kind of an assembly entry — `UsageCounter.KIND_ASSEMBLY`; its
    ///         key is an `AssemblyRegistry` assemblyHash.
    uint8 public constant KIND_ASSEMBLY = 1;
    /// @notice The kind of an agreement entry — `UsageCounter.KIND_AGREEMENT`;
    ///         its key is an `AgreementRegistry` agreementHash.
    uint8 public constant KIND_AGREEMENT = 2;

    /// @notice One entry of a claim: the family a key belongs to and the key.
    /// @dev    The kind decides which registry names the designer of record and
    ///         which of the counter's accruals the score is read from. Each
    ///         registry takes any bytes32, so the same bytes can stand in all
    ///         three; the kind keeps a stake in one family from earning
    ///         another's.
    struct ClauseOrAssemblyKey {
        uint8 kind;
        bytes32 key;
    }

    /// @notice Florin budget per accrual period — one entry per `UsageCounter`
    ///         period, fixed at deploy and validated against the counter's own
    ///         schedule, so the two cannot drift. The reference values encode
    ///         the tranche grouping: 45M/45M · 60M/60M/60M · 82.5M×4.
    uint256[] public periodAmount;

    /// @notice Florins already minted per period — the budget backstop.
    mapping(uint8 => uint256) public minted;

    /// @notice period → wallet → claimed. One claim per wallet per period; a
    ///         wallet passes all of its clauses, agreements and assemblies in that single
    ///         call.
    mapping(uint8 => mapping(address => bool)) public claimed;

    // ── Events ──────────────────────────────────────────────────────

    event Claimed(uint8 indexed periodId, address indexed account, uint256 amount, uint256 score);

    // ── Errors ──────────────────────────────────────────────────────

    error ZeroAddress();
    /// @notice The claimant holds no live member stake: a designer is paid only
    ///         while it is a member (`MembersRegistry.registered`), the
    ///         designer-side membership gate. Membership ends at the withdrawal
    ///         request, and a wallet that registers again is paid again.
    error NotLiveMember(address account);
    error UnknownPeriod(uint8 periodId);
    error AmountsPeriodsMismatch(uint256 amounts, uint256 periods);
    error PeriodStillAccruing(uint8 periodId);
    error AlreadyClaimed(uint8 periodId, address account);
    error NoClausesOrAssemblies();
    error DuplicateClauseOrAssembly(uint8 kind, bytes32 clauseOrAssembly);
    error NotAuthorOfRecord(uint8 kind, bytes32 clauseOrAssembly, address caller);
    error UnknownKind(uint8 kind);
    error NothingToClaim();
    error PeriodBudgetExceeded(uint8 periodId);

    // ── Constructor ─────────────────────────────────────────────────

    /// @param _florin      FlorinToken, via the minter interface it registers under.
    /// @param _counter     UsageCounter — the accrual this pays from.
    /// @param _members     MembersRegistry — the claimant's live member stake (the designer-side membership gate).
    /// @param _clauses     ClauseRegistry — clause designer of record.
    /// @param _assemblies  AssemblyRegistry — assembly designer of record.
    /// @param _agreements  AgreementRegistry — registered agreement designer of record.
    /// @param _amounts     Per-period florin budgets, one per counter period.
    constructor(
        address _florin,
        address _counter,
        address _members,
        address _clauses,
        address _assemblies,
        address _agreements,
        uint256[] memory _amounts
    ) {
        if (
            _florin == address(0) || _counter == address(0) || _members == address(0) || _clauses == address(0)
                || _assemblies == address(0) || _agreements == address(0)
        ) {
            revert ZeroAddress();
        }
        uint256 periods = IUsageCounter(_counter).periodCount();
        if (_amounts.length != periods) revert AmountsPeriodsMismatch(_amounts.length, periods);
        florin = IFlorinMinter(_florin);
        counter = IUsageCounter(_counter);
        members = IMemberStake(_members);
        clauses = IClauseAuthor(_clauses);
        assemblies = IAssemblyAuthor(_assemblies);
        agreements = IAgreementAuthor(_agreements);
        periodAmount = _amounts;
    }

    // ── Views ───────────────────────────────────────────────────────

    /// @notice Number of claimable periods — mirrors the counter's schedule.
    function periodCount() external view returns (uint256) {
        return periodAmount.length;
    }

    /// @notice What `account` could claim for `periodId` with
    ///         `clausesOrAssemblies`, without sending a transaction. Zero once
    ///         claimed, and zero for a wallet that holds no live member stake.
    function claimable(uint8 periodId, address account, ClauseOrAssemblyKey[] calldata clausesOrAssemblies)
        external
        view
        returns (uint256)
    {
        if (periodId >= periodAmount.length) revert UnknownPeriod(periodId);
        if (claimed[periodId][account]) return 0;
        // The quote reads the gates the claim reads: a wallet that is not a
        // live member is quoted zero, the answer its claim would give.
        if (!members.registered(account)) return 0;
        (uint256 amount,) = _entitlement(periodId, account, clausesOrAssemblies);
        return amount;
    }

    // ── Claim ───────────────────────────────────────────────────────

    /// @notice Mint your share of a closed period. Once per wallet per period;
    ///         pass every clause, agreement and assembly you are designer of record for in one call.
    ///         The claimant holds a live member stake (`NotLiveMember` otherwise),
    ///         read before any key: the designer-side membership gate.
    /// @param periodId  The accrual period being claimed.
    /// @param clausesOrAssemblies (kind, key) pairs — clause keys under
    ///                  `KIND_CLAUSE`, assemblyHashes under
    ///                  `KIND_ASSEMBLY`, agreementHashes under `KIND_AGREEMENT` —
    ///                  the caller is designer of record for.
    ///                  Each is verified against the one registry its kind
    ///                  names — the caller's list is a lookup key, never a claim
    ///                  of ownership.
    function claim(uint8 periodId, ClauseOrAssemblyKey[] calldata clausesOrAssemblies) external {
        if (periodId >= periodAmount.length) revert UnknownPeriod(periodId);
        if (!counter.periodClosed(periodId)) revert PeriodStillAccruing(periodId);
        if (claimed[periodId][msg.sender]) revert AlreadyClaimed(periodId, msg.sender);
        if (clausesOrAssemblies.length == 0) revert NoClausesOrAssemblies();
        // The designer-side membership gate, read at the claim: the claimant
        // holds a live member stake, as the seller of record held one when its
        // usage counted. Both halves of the two-sided stake are live here —
        // this one on the wallet, `_isAuthor`'s on each key's registration.
        if (!members.registered(msg.sender)) revert NotLiveMember(msg.sender);

        (uint256 amount, uint256 score) = _entitlement(periodId, msg.sender, clausesOrAssemblies);
        if (amount == 0) revert NothingToClaim();

        uint256 spent = minted[periodId] + amount;
        if (spent > periodAmount[periodId]) revert PeriodBudgetExceeded(periodId);

        claimed[periodId][msg.sender] = true;
        minted[periodId] = spent;

        emit Claimed(periodId, msg.sender, amount, score);

        florin.mint(msg.sender, amount);
    }

    // ── Internals ───────────────────────────────────────────────────

    /// @dev Sum the caller's clauses', agreements' and assemblies' scores for the period and
    ///      take the pro-rata share of its budget. UNIFORM pro rata: no cap.
    ///      The reward tracks real usage directly, and the fixed 600M pool is one
    ///      a farmer DILUTES, never inflates.
    ///
    ///      THE LIST MUST BE DUPLICATE-FREE in (kind, key), and that is enforced here rather
    ///      than assumed. A loop that summed each entry as given
    ///      and then CLAMPED `score` to `total` would let a designer of record for any
    ///      clause, agreement or assembly with a non-zero score repeat it until the
    ///      sum reached the period total and mint the ENTIRE tranche, leaving
    ///      every other
    ///      designer to revert on `PeriodBudgetExceeded`. A clamp would make
    ///      it maximal: it silently rounds a malformed claim UP to the whole
    ///      pool instead of letting the budget backstop reject it. Neither is here
    ///      — duplicates revert, and with a distinct list `score <= total` holds
    ///      structurally (`totalScoreIn` is the sum over ALL clauses and
    ///      assemblies, of which the caller's are a subset), so there is nothing
    ///      left to clamp.
    function _entitlement(uint8 periodId, address account, ClauseOrAssemblyKey[] calldata clausesOrAssemblies)
        internal
        view
        returns (uint256 amount, uint256 score)
    {
        uint256 total = counter.totalScoreIn(periodId);
        if (total == 0) return (0, 0);

        for (uint256 i = 0; i < clausesOrAssemblies.length; ++i) {
            uint8 kind = clausesOrAssemblies[i].kind;
            bytes32 clauseOrAssembly = clausesOrAssemblies[i].key;
            for (uint256 j = 0; j < i; ++j) {
                if (clausesOrAssemblies[j].kind == kind && clausesOrAssemblies[j].key == clauseOrAssembly) {
                    revert DuplicateClauseOrAssembly(kind, clauseOrAssembly);
                }
            }
            if (!_isAuthor(kind, clauseOrAssembly, account)) revert NotAuthorOfRecord(kind, clauseOrAssembly, account);
            score += counter.scoreOf(kind, clauseOrAssembly, periodId);
        }
        if (score == 0) return (0, 0);

        amount = (periodAmount[periodId] * score) / total;
    }

    /// @dev Designer of record with a LIVE stake — the wallet the registry the
    ///      KIND names as its `registeredBy`, only while its registration
    ///      stake is un-withdrawn. No other registry is ever read: the
    ///      families are parallel, none knows another exists, and a stake in
    ///      one at the same bytes is no designer's claim on another.
    ///
    ///      The `!withdrawn` requirement is one of the two DESIGNER-SIDE checks of
    ///      the two-sided live-stake gate (its seller-side half lives in
    ///      `UsageCounter`): you earn designer rewards only while your clause's,
    ///      agreement's or assembly's registration stake stays live, AND while you
    ///      hold a live member stake (`claim`'s `NotLiveMember`, read on the
    ///      claimant before any key). A withdrawn stake de-surfaces and earns no further reward — the
    ///      stake is aligned
    ///      upside (more trade → more base-currency demand → ETH appreciates for
    ///      every registry staker), not a cost, so keeping it live is the honest
    ///      designer's default.
    function _isAuthor(uint8 kind, bytes32 clauseOrAssembly, address account) internal view returns (bool) {
        if (kind == KIND_CLAUSE) {
            (address registeredBy, bool withdrawn) = clauses.depositOf(clauseOrAssembly);
            return registeredBy != address(0) && registeredBy == account && !withdrawn;
        }
        if (kind == KIND_ASSEMBLY) {
            (address assemblyRegisteredBy,, bool depositWithdrawn,) = assemblies.bindings(clauseOrAssembly);
            return assemblyRegisteredBy != address(0) && assemblyRegisteredBy == account && !depositWithdrawn;
        }
        if (kind == KIND_AGREEMENT) {
            (address agreementRegisteredBy,, bool agreementWithdrawn,) = agreements.bindings(clauseOrAssembly);
            return agreementRegisteredBy != address(0) && agreementRegisteredBy == account && !agreementWithdrawn;
        }
        revert UnknownKind(kind);
    }
}
