// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title MembersRegistry — Participant self-declaration with reclaimable deposit
/// @custom:security-contact figarosecurity@gmail.com
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice Members register with a metadata URI and an ETH deposit — staked
///         intent to generate transactions. Surfacing derives from the live
///         stake: requesting withdrawal clears the registered guard, de-surfaces
///         the member (discovery readers fold `MemberWithdrawalRequested`), and
///         allows fresh re-registration. Pollution costs deposit × time-surfaced.
///         No owner, no admin, no fee extraction. No lifecycle flags — member
///         availability is signal-by-availability (off-chain), not registry state.
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any kind, express or implied. No liability is accepted for loss, damages, or bugs. Use at your own risk.
///
///         MEMBER, not seller. The kernel is actor-neutral — any wallet can hold
///         any role — but a registry that only admitted sellers gave a pure buyer
///         nowhere to publish a price, a whitelist, or a calendar. "Member" is
///         registry-tier vocabulary for "a wallet that publishes a declaration",
///         NOT a sixth protocol noun and NOT a role: role stays DERIVED from the
///         orders a wallet holds and the clauses they carry. Registering is how a
///         wallet PUBLISHES, never how it QUALIFIES — transacting through the
///         kernel requires no registration at all.
///
///         This contract validates and emits — it does not aggregate. Profile
///         data and member availability are derived off-chain from event logs
///         (`MemberRegistered`, `MemberProfileUpdated`,
///         `MemberWithdrawalRequested`, `MemberWithdrawn`).
///         On-chain storage is limited to the dedup guard (`registered`) and the
///         pending-withdrawal release schedule.
///
///         The metadataURI JSON document is the member's composability surface:
///         it declares which clauses from ClauseRegistry the member operates
///         under and the member's catalogue. It is ONE document — there is no
///         buyer half and no seller half. The document is already split on
///         stable↔volatile (identity envelope here, item list behind
///         `catalogueURI`); a buyer/seller split would be a second, crossing
///         axis, and every field it would divide (`acceptedTokens`,
///         `catalogueURI`, location, branding) serves either side unchanged.
///
///         The deposit exists for spam protection only — it does not gate
///         metadata edits. `updateProfile` lets a registered member publish
///         a new metadataURI without disturbing the deposit. Discovery
///         indexers key off the most recent `MemberRegistered` or
///         `MemberProfileUpdated` event for an address.
contract MembersRegistry {
    /// @notice Deposit amount in ETH. Immutable at deploy.
    /// @dev Sybil-resistance stake, not a fee. The protocol does not
    ///      redistribute it; no party has authority to seize it. See
    ///      `requestWithdrawal()` / `withdraw()` for the reclaim path.
    uint256 public immutable registrationDeposit;

    /// @notice Seconds between requesting a withdrawal and being able to claim
    ///         it. Immutable at deploy. Zero means claimable in the same block
    ///         (still a two-call sequence).
    /// @dev THE anti-rage-quit parameter, and what makes `registrationDeposit`
    ///      a real Sybil price. Without it a single deposit is recyclable:
    ///      register → transact → withdraw → re-register under a fresh address,
    ///      so fabricating N identities costs O(1) capital however much breadth
    ///      is fabricated. With it, an attacker must hold a deposit locked per
    ///      identity for the cooldown, and the capital cost of sustaining N
    ///      identities across a reward period P becomes `deposit · N · T / P`.
    ///
    ///      The two ID-keyed registries (Clause, Assembly) need no equivalent:
    ///      their withdrawal is one-shot per key and the key's binding is
    ///      permanent, so there is nothing to recycle.
    uint256 public immutable withdrawalCooldown;

    /// @dev Dedup guard — prevents double-registration for the same address.
    ///      Cleared on withdrawal REQUEST to allow fresh re-registration.
    mapping(address => bool) internal _registered;

    /// @notice ETH awaiting release for an address, in wei. Zero means nothing
    ///         pending. Accumulates if an address registers and requests again
    ///         before claiming.
    mapping(address => uint256) public pendingDeposit;

    /// @notice Timestamp from which `pendingDeposit` may be claimed. Zero means
    ///         no pending withdrawal.
    mapping(address => uint256) public releaseAt;

    // ── Events ──────────────────────────────────────────────────────────
    event MemberRegistered(address indexed member, string metadataURI);
    event MemberProfileUpdated(address indexed member, string metadataURI);
    /// @dev The DE-SURFACING signal. Discovery and erasure readers fold this,
    ///      not `MemberWithdrawn` — the member leaves the surface at request
    ///      time, while the funds are still locked.
    event MemberWithdrawalRequested(address indexed member, uint256 amount, uint256 releaseAt);
    event MemberWithdrawn(address indexed member, uint256 amount);

    // ── Errors ──────────────────────────────────────────────────────────
    error AlreadyRegistered();
    error NotRegistered();
    error InsufficientDeposit();
    error NothingPending();
    error CooldownActive(uint256 releaseAt);
    error TransferFailed();

    // ── Constructor ─────────────────────────────────────────────────────

    /// @param _registrationDeposit Minimum ETH required to register (wei).
    /// @param _withdrawalCooldown  Seconds a requested withdrawal stays locked.
    constructor(uint256 _registrationDeposit, uint256 _withdrawalCooldown) {
        registrationDeposit = _registrationDeposit;
        withdrawalCooldown = _withdrawalCooldown;
    }

    // ── Views ───────────────────────────────────────────────────────────

    /// @notice Whether `member` currently holds a LIVE registration stake —
    ///         registered and not yet withdrawal-requested. This is the on-chain
    ///         read the RPGF path gates on: a settled process's usage counts
    ///         toward the reward only while its seller-of-record keeps a live ETH
    ///         stake here. Requesting withdrawal clears the guard, de-surfacing
    ///         the member AND forfeiting the reward eligibility its trades would
    ///         confer — while the deposit itself stays locked for the cooldown.
    function registered(address member) external view returns (bool) {
        return _registered[member];
    }

    /// @notice Whether `member` can claim a pending deposit right now.
    /// @dev    THE CHAIN ANSWERS THIS, never a client clock. `releaseAt` is a
    ///         block timestamp; a reader comparing it against wall-clock time is
    ///         wrong whenever the two drift — and on a chain they routinely do,
    ///         which silently disables (or wrongly enables) a claim affordance.
    ///         Same shape as `UsageCounter.periodClosed`: a time-dependent fact
    ///         is a view, so every reader gets the chain's own answer.
    function withdrawable(address member) external view returns (bool) {
        return releaseAt[member] != 0 && block.timestamp >= releaseAt[member];
    }

    // ── Registration ────────────────────────────────────────────────────

    /// @notice Register as a member. Requires msg.value == registrationDeposit.
    ///         Exact match prevents excess ETH from being trapped in the contract
    ///         (no sweep function, no owner). Deposit is reclaimable via
    ///         requestWithdrawal() then withdraw().
    /// @param metadataURI  IPFS or HTTPS URI pointing to the member's metadata JSON.
    function register(string calldata metadataURI) external payable {
        if (_registered[msg.sender]) revert AlreadyRegistered();
        if (msg.value != registrationDeposit) revert InsufficientDeposit();

        _registered[msg.sender] = true;

        emit MemberRegistered(msg.sender, metadataURI);
    }

    // ── Profile Update ──────────────────────────────────────────────────

    /// @notice Update the metadata URI of a registered member. Caller-only:
    ///         only the registered address can update its own profile. No
    ///         deposit change — the deposit is a spam-protection knob, not a
    ///         metadata-binding knob.
    /// @dev Emits a distinct `MemberProfileUpdated` event so off-chain
    ///      indexers can distinguish registrations from profile updates
    ///      (analytics) while still computing "current metadataURI" as the
    ///      most-recent event of either type for an address.
    /// @param metadataURI  New IPFS or HTTPS URI pointing to the member's metadata JSON.
    function updateProfile(string calldata metadataURI) external {
        if (!_registered[msg.sender]) revert NotRegistered();
        emit MemberProfileUpdated(msg.sender, metadataURI);
    }

    // ── Deposit Withdrawal ──────────────────────────────────────────────

    /// @notice Start reclaiming the registration deposit. Clears the dedup guard
    ///         immediately, so the member de-surfaces and can re-register at
    ///         once — but the ETH only becomes claimable after the cooldown.
    /// @dev Splitting de-surfacing from release is deliberate: discovery
    ///      removal and erasure of the published declaration are IMMEDIATE (no
    ///      participant is held on a surface they asked to leave), while the
    ///      capital stays committed for the cooldown so the deposit prices
    ///      identity rather than merely renting it. Requesting again before
    ///      claiming accumulates the amount and restarts the clock on the whole
    ///      pending balance.
    function requestWithdrawal() external {
        if (!_registered[msg.sender]) revert NotRegistered();

        // De-surface immediately — enables clean re-registration
        delete _registered[msg.sender];

        uint256 amount = registrationDeposit;
        uint256 unlockAt = block.timestamp + withdrawalCooldown;
        pendingDeposit[msg.sender] += amount;
        releaseAt[msg.sender] = unlockAt;

        emit MemberWithdrawalRequested(msg.sender, amount, unlockAt);
    }

    /// @notice Claim a deposit whose cooldown has elapsed.
    function withdraw() external {
        uint256 unlockAt = releaseAt[msg.sender];
        if (unlockAt == 0) revert NothingPending();
        if (block.timestamp < unlockAt) revert CooldownActive(unlockAt);

        uint256 amount = pendingDeposit[msg.sender];
        delete pendingDeposit[msg.sender];
        delete releaseAt[msg.sender];

        emit MemberWithdrawn(msg.sender, amount);

        if (amount > 0) {
            (bool ok,) = msg.sender.call{value: amount}("");
            if (!ok) revert TransferFailed();
        }
    }
}
