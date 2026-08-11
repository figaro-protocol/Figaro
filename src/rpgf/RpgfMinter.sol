// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IFlorinMinter} from "src/florin/IFlorinMinter.sol";

/// @notice The accrual surface this minter pays from. Local-minimal binding.
interface IUsageCounter {
    function periodCount() external view returns (uint256);
    function periodClosed(uint8 period) external view returns (bool);
    function totalScoreIn(uint8 period) external view returns (uint256);
    /// @dev BOTH settlement paths, summed as SCORES — never `accrualOf`,
    ///      which sees the direct path only and would under-pay every clause
    ///      or assembly whose trade moved to batches.
    function scoreOf(bytes32 clauseOrAssembly, uint8 period) external view returns (uint256);
}

/// @notice Author of record for a clause — `ClauseRegistry.depositOf`.
interface IClauseAuthor {
    function depositOf(bytes32 idHash) external view returns (address registrar, bool withdrawn);
}

/// @notice Author of record for an assembly — `AssemblyRegistry.bindings`.
interface IAssemblyAuthor {
    function bindings(bytes32 compositionHash)
        external
        view
        returns (address author, uint64 registeredAt, bool depositWithdrawn, string memory contentURI);
}

/// @title RpgfMinter — the 600M retroactive distribution
/// @custom:security-contact figarosecurity@gmail.com
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
///
/// @notice Pays clause authors and assembly designers for the trade their work
///         actually carried, one claim per accrual period. The reference
///         schedule (ruled 2026-07-31): nine ANNUAL periods whose budgets
///         group into three RISING tranches — 15% of the reserve over years
///         1–2, 30% over years 3–5, 55% over years 6–9, each tranche split
///         equally across its years. Rising, because the largest share should
///         pay on the most-measured evidence: the early network is the
///         thinnest, most manipulable denominator, and early evidence-poor
///         funding is the DAO treasury's job, not this mechanism's. Annual,
///         because a professional author cannot price a multi-year lag in an
///         unpriced token — and shorter periods also shrink the deposit
///         recycling window. The grouping is deploy-script data; this
///         contract knows only periods and their budgets.
///
///         There is NOTHING TO POST, NOTHING TO BOND, AND NOTHING TO DISPUTE.
///         Usage is counted on chain as it happens by `UsageCounter`, so a
///         tranche is arithmetic over numbers that are already final: a wallet's
///         share is its clauses' and assemblies' score in that period over the
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
///         clauses' and assemblies' score over the period's total, paid
///         straight. Sybil
///         resistance is the two-sided LIVE ETH STAKE (author eligibility here,
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
    IClauseAuthor public immutable clauses;
    IAssemblyAuthor public immutable assemblies;

    /// @notice Florin budget per accrual period — one entry per `UsageCounter`
    ///         period, fixed at deploy and validated against the counter's own
    ///         schedule, so the two cannot drift. The reference values encode
    ///         the tranche grouping: 45M/45M · 60M/60M/60M · 82.5M×4.
    uint256[] public periodAmount;

    /// @notice Florins already minted per period — the budget backstop.
    mapping(uint8 => uint256) public minted;

    /// @notice period → wallet → claimed. One claim per wallet per period; a
    ///         wallet passes all of its clauses and assemblies in that single
    ///         call.
    mapping(uint8 => mapping(address => bool)) public claimed;

    // ── Events ──────────────────────────────────────────────────────

    event Claimed(uint8 indexed periodId, address indexed account, uint256 amount, uint256 score);

    // ── Errors ──────────────────────────────────────────────────────

    error ZeroAddress();
    error UnknownPeriod(uint8 periodId);
    error AmountsPeriodsMismatch(uint256 amounts, uint256 periods);
    error PeriodStillAccruing(uint8 periodId);
    error AlreadyClaimed(uint8 periodId, address account);
    error NoClausesOrAssemblies();
    error DuplicateClauseOrAssembly(bytes32 clauseOrAssembly);
    error NotAuthorOfRecord(bytes32 clauseOrAssembly, address caller);
    error NothingToClaim();
    error PeriodBudgetExceeded(uint8 periodId);

    // ── Constructor ─────────────────────────────────────────────────

    /// @param _florin      FlorinToken, via the minter interface it registers under.
    /// @param _counter     UsageCounter — the accrual this pays from.
    /// @param _clauses     ClauseRegistry — clause author of record.
    /// @param _assemblies  AssemblyRegistry — assembly author of record.
    /// @param _amounts     Per-period florin budgets, one per counter period.
    constructor(address _florin, address _counter, address _clauses, address _assemblies, uint256[] memory _amounts) {
        if (_florin == address(0) || _counter == address(0) || _clauses == address(0) || _assemblies == address(0)) {
            revert ZeroAddress();
        }
        uint256 periods = IUsageCounter(_counter).periodCount();
        if (_amounts.length != periods) revert AmountsPeriodsMismatch(_amounts.length, periods);
        florin = IFlorinMinter(_florin);
        counter = IUsageCounter(_counter);
        clauses = IClauseAuthor(_clauses);
        assemblies = IAssemblyAuthor(_assemblies);
        periodAmount = _amounts;
    }

    // ── Views ───────────────────────────────────────────────────────

    /// @notice Number of claimable periods — mirrors the counter's schedule.
    function periodCount() external view returns (uint256) {
        return periodAmount.length;
    }

    /// @notice What `account` could claim for `periodId` with
    ///         `clausesOrAssemblies`, without sending a transaction. Zero once
    ///         claimed.
    function claimable(uint8 periodId, address account, bytes32[] calldata clausesOrAssemblies)
        external
        view
        returns (uint256)
    {
        if (periodId >= periodAmount.length) revert UnknownPeriod(periodId);
        if (claimed[periodId][account]) return 0;
        (uint256 amount,) = _entitlement(periodId, account, clausesOrAssemblies);
        return amount;
    }

    // ── Claim ───────────────────────────────────────────────────────

    /// @notice Mint your share of a closed period. Once per wallet per period;
    ///         pass every clause and assembly you authored in one call.
    /// @param periodId  The accrual period being claimed.
    /// @param clausesOrAssemblies Clause idHashes and/or assembly
    ///                  compositionHashes the caller is author of record for.
    ///                  Each is verified against its own registry — the caller's
    ///                  list is a lookup key, never a claim of ownership.
    function claim(uint8 periodId, bytes32[] calldata clausesOrAssemblies) external {
        if (periodId >= periodAmount.length) revert UnknownPeriod(periodId);
        if (!counter.periodClosed(periodId)) revert PeriodStillAccruing(periodId);
        if (claimed[periodId][msg.sender]) revert AlreadyClaimed(periodId, msg.sender);
        if (clausesOrAssemblies.length == 0) revert NoClausesOrAssemblies();

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

    /// @dev Sum the caller's clauses' and assemblies' scores for the period and
    ///      take the pro-rata share of its budget. UNIFORM pro rata: no cap.
    ///      The reward tracks real usage directly, and the fixed 600M pool is one
    ///      a farmer DILUTES, never inflates.
    ///
    ///      THE LIST MUST BE DUPLICATE-FREE, and that is enforced here rather
    ///      than assumed. Until 2026-07-30 this loop summed each entry as given
    ///      and then CLAMPED `score` to `total` — so an author of record for any
    ///      clause or assembly with a non-zero score could repeat it until the
    ///      sum reached the period total and mint the ENTIRE tranche, leaving
    ///      every other
    ///      author to revert on `PeriodBudgetExceeded`. The clamp is what made
    ///      it maximal: it silently rounded a malformed claim UP to the whole
    ///      pool instead of letting the budget backstop reject it. Both are gone
    ///      — duplicates revert, and with a distinct list `score <= total` holds
    ///      structurally (`totalScoreIn` is the sum over ALL clauses and
    ///      assemblies, of which the caller's are a subset), so there is nothing
    ///      left to clamp.
    function _entitlement(uint8 periodId, address account, bytes32[] calldata clausesOrAssemblies)
        internal
        view
        returns (uint256 amount, uint256 score)
    {
        uint256 total = counter.totalScoreIn(periodId);
        if (total == 0) return (0, 0);

        for (uint256 i = 0; i < clausesOrAssemblies.length; ++i) {
            bytes32 clauseOrAssembly = clausesOrAssemblies[i];
            for (uint256 j = 0; j < i; ++j) {
                if (clausesOrAssemblies[j] == clauseOrAssembly) revert DuplicateClauseOrAssembly(clauseOrAssembly);
            }
            if (!_isAuthor(clauseOrAssembly, account)) revert NotAuthorOfRecord(clauseOrAssembly, account);
            score += counter.scoreOf(clauseOrAssembly, periodId);
        }
        if (score == 0) return (0, 0);

        amount = (periodAmount[periodId] * score) / total;
    }

    /// @dev Author of record with a LIVE stake — the clause registrar or the
    ///      assembly author, each only while their registration deposit is
    ///      un-withdrawn. A key is one or the other; both registries are
    ///      consulted because the families are parallel and neither knows the
    ///      other exists.
    ///
    ///      The `!withdrawn` requirement is the AUTHOR-SIDE half of the two-sided
    ///      live-ETH-stake gate (its seller-side half lives in `UsageCounter`):
    ///      you earn RPGF only while your clause's or assembly's stake stays
    ///      live. Withdraw and you de-surface AND forfeit future reward — the
    ///      stake is aligned
    ///      upside (more trade → more base-currency demand → ETH appreciates for
    ///      every registry staker), not a cost, so keeping it live is the honest
    ///      author's default.
    function _isAuthor(bytes32 clauseOrAssembly, address account) internal view returns (bool) {
        (address registrar, bool withdrawn) = clauses.depositOf(clauseOrAssembly);
        if (registrar != address(0)) return registrar == account && !withdrawn;
        (address author,, bool depositWithdrawn,) = assemblies.bindings(clauseOrAssembly);
        return author != address(0) && author == account && !depositWithdrawn;
    }
}
