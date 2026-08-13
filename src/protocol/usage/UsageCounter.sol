// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "src/kernel/CommitmentTypes.sol";

/// @notice The minimal kernel surface this contract reads. Local-minimal binding
///         per the coordinator exemplar — never a vendored dependency.
interface IFigaroCore {
    function orderStatus(bytes32 orderHash) external view returns (uint8);
    function orderProcessId(bytes32 orderHash) external view returns (bytes32);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

/// @notice The one MembersRegistry field this contract reads — whether an
///         address holds a LIVE registration stake (the seller-side gate).
interface IMemberStake {
    function registered(address member) external view returns (bool);
}

/// @notice The ClauseRegistry field the clause-or-assembly-side gate reads — the clause's
///         stake state. A clause earns only while its registration deposit is
///         un-withdrawn; the binding survives withdrawal, so `registrar != 0`
///         alone is not liveness.
interface IClauseStake {
    function depositOf(bytes32 idHash) external view returns (address registrar, bool withdrawn);
}

/// @notice The AssemblyRegistry field the clause-or-assembly-side gate reads — the
///         composition's binding. Live iff registered and the deposit is not
///         withdrawn.
interface IAssemblyStake {
    function bindings(bytes32 compositionHash)
        external
        view
        returns (address author, uint64 registeredAt, bool depositWithdrawn, string memory contentURI);
}

/// @title UsageCounter — verified clause or assembly usage, counted when it happens
/// @custom:security-contact figarosecurity@gmail.com
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
///
/// @notice Counts how much real trade a clause or an assembly carried, on chain,
///         at the moment it happened. This exists because **the chain cannot
///         look backwards**: `FigaroCore` never calls the registries and the
///         kernel is frozen, so no contract can learn a clause's usage after the
///         fact, and contracts cannot read events. Reconstructing usage later is
///         what forced the whole posting/bond/challenge/referee apparatus that
///         this replaces — a machine for making the chain *believe a claim about
///         the past*. Record the fact as it happens and there is no claim to
///         believe, nothing to bond, and nothing to adjudicate.
///
/// @dev    HOW A RECORD IS VERIFIED — nobody is trusted. `recordClauseUsage` proves,
///         from data the chain already holds:
///           1. the order is real and RESOLVED (`core.orderStatus == 2`), and
///           2. the clause or assembly was committed in that order's signed agreement
///              (merkle inclusion against `agreementHash`).
///         Same check `AttestationCoordinator` performs, with the status gate
///         inverted: attestation is evidence DURING an open process, usage is
///         counted only once the process has settled.
///
/// @dev    PERIODS, NOT CHECKPOINTS. Accrual buckets into fixed periods set at
///         deploy. A period's counts are final once it ends, so a consumer
///         paying out for period `i` reads a number that can no longer move —
///         no snapshots, no checkpoint arrays, no history walk. Periods are
///         generic here: this contract knows nothing about tranches, rewards, or
///         who pays. A consumer maps its own schedule onto them. Each period
///         counts only usage NEW to it: a process counts once ever (see
///         `processCounted`), so a later period cannot be paid for an earlier
///         period's trade.
///
/// @dev    NO OWNER, NO ADMIN, NO PAUSE. Recording is permissionless and
///         idempotent per (clause-or-assembly, process) — ONCE EVER, in whichever period
///         the record lands. Nothing here can be revoked, re-weighted, or swept.
///
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any kind, express or implied. No liability is accepted for loss, damages, or bugs. Use at your own risk.
contract UsageCounter {
    // ── Composition (immutable) ─────────────────────────────────────

    IFigaroCore public immutable core;

    /// @notice MembersRegistry — the seller-side eligibility gate. A settled
    ///         process's usage counts toward the reward only while its
    ///         seller-of-record holds a LIVE ETH stake here (registered and
    ///         un-withdrawn), which prices the seller IDENTITY — and with it
    ///         breadth itself, since `d` counts distinct staked sellers (ruled
    ///         2026-07-31): every unit of the score's dominant term costs one
    ///         live stake. The reward itself is UNIFORM — no tag, no
    ///         category, no weight: every clause or assembly's score is its
    ///         real usage alone (`icbrt(c·d²·1e18)`), and the network's own
    ///         growth, not a
    ///         privileged class, is what the 600M pays for.
    IMemberStake public immutable members;

    /// @notice ClauseRegistry / AssemblyRegistry — the CLAUSE-OR-ASSEMBLY-side
    ///         stake gate.
    /// @dev    Usage counts toward the reward only while the clause's or
    ///         assembly's own registration deposit is LIVE (registered and
    ///         un-withdrawn). This is the clause-or-assembly-side twin of the
    ///         seller-side `members` gate: an unregistered `bytes32` is just a
    ///         self-authored merkle-leaf key, so without this gate a self-dealt
    ///         process could accrue score to arbitrary keys and inflate
    ///         `totalScoreIn` at gas cost, diluting every honest author. Neither
    ///         read is registry PRIOR KNOWLEDGE: both accept ANY live-staked
    ///         key, derived from the live registry, never a hardcoded set. A
    ///         `clauseOrAssembly` is a clause idHash OR an assembly
    ///         compositionHash; both registries are consulted because the
    ///         families are parallel.
    IClauseStake public immutable clauses;
    IAssemblyStake public immutable assemblies;

    /// @notice `FigaroBatchVerifier` — the ONLY address that may write the
    ///         batch-path accrual, and a PROOF-GATED WRITER, not an owner.
    /// @dev    Read this as an admin backdoor and you have it backwards. The
    ///         verifier has no discretion: it may call `applyBatchAccrual` only
    ///         with numbers an SP1 proof committed under an IMMUTABLE
    ///         verification key, against a state root that advances by that
    ///         same proof. It cannot choose the accrual, cannot write twice for
    ///         the same trade (the guest's counted set rides the state root),
    ///         and cannot be repointed — no setter exists. What it CAN do is
    ///         exactly what the direct path lets anyone do permissionlessly:
    ///         present proof that settled trade used a clause or assembly. See
    ///         `DESIGN_DECISIONS.md` § "A proof-gated writer is not an admin".
    ///
    ///         Why a privileged caller at all: the batched path's accrual is
    ///         proved OFF-chain (that is the point — ~85% of a direct record is
    ///         storage plus `icbrt`), so the fact this contract needs cannot be
    ///         re-derived from calldata here. It trusts the vkey instead, which
    ///         is why the address is immutable and the verifier is redeployed
    ///         whenever the program changes.
    address public immutable batchVerifier;

    /// @notice The clause key whose committed section names the assembly a
    ///         process ran under — `figaro-assembly-provenance`'s
    ///         `keccak256(abi.encode(clauseId, version))`.
    /// @dev    Why this is needed at all: an agreement's merkle leaves are keyed
    ///         by CLAUSE key (`agreement.ts`), so a compositionHash is never
    ///         itself a leaf key and an assembly can never be proved the way a
    ///         clause is. It is proved INDIRECTLY — the provenance clause is a
    ///         leaf, and its section content IS the compositionHash. Fixing the
    ///         clause key here rather than taking it per call is what stops a
    ///         caller passing some other clause whose 32-byte section happens to
    ///         equal an assembly's hash.
    bytes32 public immutable provenanceClause;

    /// @notice Clauses and assemblies that earn nothing, set once at deploy and
    ///         never written again — at the reference genesis, exactly
    ///         `figaro-assembly-provenance` (re-ruled 2026-08-13; the two
    ///         order-mandatory clauses EARN).
    /// @dev    The provenance clause is scoring infrastructure — the leaf through
    ///         which an assembly's designer is credited — so scoring it would pay
    ///         one adoption twice (once to the designer via `recordAssemblyUsage`,
    ///         again to the leaf's author). The mandatory clauses ride every
    ///         order, so scoring them levies every settled process for their
    ///         author-of-record — the commons treasury under the genesis
    ///         registration, a usage-indexed endowment of the commons.
    ///         This is deploy-frozen: WHICH clauses and assemblies the reward
    ///         ignores is a reward decision, not something a
    ///         registrar declares about itself — a self-declared exclusion would
    ///         simply never be declared.
    mapping(bytes32 => bool) public excludedClauseOrAssembly;

    /// @notice The minimum-support floor (ruled 2026-07-31): a clause or
    ///         assembly scores
    ///         ZERO in a period until at least this many DISTINCT LIVE-STAKED
    ///         sellers have carried it there. Counting is unaffected — `c` and
    ///         `d` accrue below the floor and the score springs to its full
    ///         value when the floor is crossed; nothing is lost, only deferred.
    /// @dev    Why: below the floor sit exactly the clauses and assemblies
    ///         whose usage one
    ///         actor can fabricate alone — self-farms, fragmentation shards,
    ///         squatted names, trivial riders. A floor of k makes the minimum
    ///         viable farm k live stakes plus k cooldowns, with no curation and
    ///         no judgment. Applied per settlement path inside `_score` — the
    ///         paths cannot union their seller sets, and flooring each side
    ///         separately can only ever UNDER-pay a boundary case, never let
    ///         one seller straddle the universes to double toward the floor.
    ///         Mainnet value 3, the smallest k at which solo or pair collusion
    ///         cannot reach the scoreboard; a deploy-time constant like every
    ///         other reward parameter.
    uint64 public immutable minSellers;

    /// @notice Period boundaries (unix seconds, strictly ascending). Usage lands
    ///         in the first period whose end is still in the future; after the
    ///         last one, accrual is closed forever.
    uint64[] public periodEnd;

    // ── Accrual ─────────────────────────────────────────────────────

    struct Accrual {
        /// @dev Distinct settled processes that used this clause or assembly.
        uint64 c;
        /// @dev Distinct live-staked sellers of record across those processes.
        uint64 d;
        /// @dev `icbrt(c * d^2 * 1e18)` — cached so `totalScore` can be
        ///      maintained in O(1) as a delta on every record.
        uint256 score;
    }

    /// @notice clause or assembly key → period → accrual. The clause or assembly key is the
    ///         `ClauseRegistry` idHash for a clause, or the `AssemblyRegistry`
    ///         compositionHash for an assembly — the same identity each family's
    ///         own anchor uses, never a new identifier.
    mapping(bytes32 => mapping(uint8 => Accrual)) public accrualOf;

    /// @notice The same accrual for trade settled through `FigaroBatchVerifier`
    ///         — kept in a SEPARATE slot, never merged into `accrualOf`.
    /// @dev    THE TWO ARE SUMMED AS SCORES, never as components (`scoreOf`).
    ///         Summing `c` and `d` would over-count breadth for any SELLER
    ///         active on BOTH paths: the chain holds counts, not the seller
    ///         sets, so it cannot union them — and an attacker who split one
    ///         seller's trade across the two universes would be paid
    ///         twice for the same breadth. Summing scores can never over-count,
    ///         and because the score is homogeneous of degree 1 the shortfall
    ///         is EXACTLY ZERO when the split is proportional, small otherwise.
    ///         Safety first; the two are disjoint by construction anyway (a
    ///         batch-settled process never acquires kernel status, and a
    ///         kernel-settled one is never in a batch), so no PROCESS is ever
    ///         counted on both sides.
    mapping(bytes32 => mapping(uint8 => Accrual)) public batchAccrualOf;

    /// @notice period → summed score of every clause or assembly in it, across BOTH
    ///         settlement paths. A consumer paying pro rata divides by this; it
    ///         is final once the period ends.
    mapping(uint8 => uint256) public totalScoreIn;

    /// @notice clause or assembly → processId → already counted. Idempotence is GLOBAL, not
    ///         per period: a settled process counts ONCE EVER toward a clause or assembly,
    ///         in whichever period it is first recorded.
    /// @dev    Why not per period (ruled 2026-07-30). A resolved order stays
    ///         resolved and its struct is public in the commit event, so anyone
    ///         can re-present it forever; the chain cannot see WHEN a process
    ///         resolved (no timestamp it can read), so a per-period key let the
    ///         same trade count again in every period. Rational play was then
    ///         "re-record everything each period", which pays for RECORDING GAS
    ///         rather than adoption: an author whose clause is widely used but
    ///         who recorded once and moved on collects nothing later, while a
    ///         wallet that knows to re-record collects again and again on the
    ///         same trades — and a fabricated period-0 farm is milked across
    ///         every later period at record-gas only. Counting once ever makes
    ///         each period pay for usage that is NEW to it, which is what a
    ///         fixed per-period budget schedule assumes.
    mapping(bytes32 => mapping(bytes32 => bool)) public processCounted;

    /// @notice clause or assembly → period → seller → has this seller already contributed
    ///         to `d` in this period. Its only job is the distinct-staked-seller
    ///         count.
    /// @dev    Breadth counted (buyer, seller) PAIRS until 2026-07-31. Pairs are
    ///         the wrong statistic because they cannot be priced: the buyer side
    ///         has no stake, so one staked seller plus N free buyer wallets was
    ///         N units of `d` — the score's dominant term, manufacturable at gas
    ///         cost — and even staking BOTH sides prices pairs sublinearly (k
    ///         staked buyers × m staked sellers mint k·m pairs from k+m
    ///         deposits). Distinct staked sellers is the leverage-free
    ///         statistic: n units of breadth cost n live stakes, exactly linear,
    ///         which is what the Sybil bound's rent-dissipation argument needs.
    ///         Sybil resistance comes from the cost of an identity (the
    ///         registries' stakes — deposit and withdrawal cooldown), never from
    ///         the shape of the score: no scoring function can separate a
    ///         fabricated counterparty from a genuine one, so the score weights
    ///         only what the stake has priced.
    mapping(bytes32 => mapping(uint8 => mapping(address => bool))) public sellerSeen;

    // ── Events ──────────────────────────────────────────────────────

    /// @param clauseOrAssembly  Clause idHash or assembly compositionHash.
    /// @param period    The accrual period the usage landed in.
    /// @param processId The settled process that used it.
    /// @param seller    The recorded order's seller of record (live-staked).
    /// @param c         The clause or assembly's distinct-process count after this record.
    /// @param d         The clause or assembly's distinct-staked-seller count after this
    ///                  record.
    /// @param score     The clause or assembly's score after this record.
    event UsageRecorded(
        bytes32 indexed clauseOrAssembly,
        uint8 indexed period,
        bytes32 indexed processId,
        address seller,
        uint64 c,
        uint64 d,
        uint256 score
    );

    /// @notice One clause or assembly's batch-path accrual after a settled batch.
    /// @dev    Deliberately NOT `UsageRecorded`: there is no processId and no
    ///         per-record seller to report, because the batch path proves
    ///         per-process facts off-chain and writes only the totals. An
    ///         indexer summing `UsageRecorded` alone sees the direct path only
    ///         — it must fold both events, and this one REPLACES rather than
    ///         adds (the values are cumulative, not deltas).
    /// @param clauseOrAssembly Clause idHash or assembly compositionHash.
    /// @param period   The accrual period.
    /// @param c        Cumulative distinct settled processes, batch path.
    /// @param d        Cumulative distinct staked sellers in this period, batch
    ///                 path.
    /// @param score    The batch-path score after this write.
    event BatchUsageRecorded(bytes32 indexed clauseOrAssembly, uint8 indexed period, uint64 c, uint64 d, uint256 score);

    // ── Errors ──────────────────────────────────────────────────────

    error ZeroAddress();
    error ZeroMinSellers();
    error EmptyPeriods();
    error TooManyPeriods();
    error PeriodsNotAscending();
    error ClauseOrAssemblyNotRegistered(bytes32 clauseOrAssembly);
    error AccrualClosed();
    error UnknownOrder();
    error OrderNotResolved();
    error AlreadyCounted();
    error InvalidInclusionProof();
    error ClauseOrAssemblyExcluded(bytes32 clauseOrAssembly);
    error SellerNotStaked(address seller);
    error NotBatchVerifier();
    error PeriodMismatch(uint8 open, uint8 claimed);
    error ProvenanceClauseMismatch(bytes32 expected, bytes32 claimed);
    error AccrualWentBackwards(bytes32 clauseOrAssembly);

    // ── Constructor ─────────────────────────────────────────────────

    /// @param _core        FigaroCore — the order-status and domain source.
    /// @param _members     MembersRegistry — the seller-side live-stake gate.
    /// @param _clauses     ClauseRegistry — the clause-side stake gate.
    /// @param _assemblies  AssemblyRegistry — the assembly-side stake gate.
    /// @param _batchVerifier  FigaroBatchVerifier — the proof-gated writer of
    ///                    the batch-path accrual. The verifier needs this
    ///                    contract's address too, so one of the two must be
    ///                    predicted at deploy time; the deploy scripts compute
    ///                    the verifier's address from the deployer nonce and
    ///                    deploy this contract FIRST. Immutable, so a wrong
    ///                    prediction is caught by the deploy script's own
    ///                    assertion, never silently tolerated.
    /// @param _provenanceClause  `figaro-assembly-provenance`'s clause key.
    /// @param _excluded    Clauses and assemblies that earn nothing — attribution plumbing (the assembly-provenance clause).
    /// @param _minSellers  The minimum-support floor: distinct staked sellers an
    ///                     clause or assembly needs in a period before it scores. ≥ 1
    ///                     (1 disables the floor; mainnet uses 3).
    /// @param _periodEnd   Strictly ascending period boundaries (unix seconds).
    constructor(
        address _core,
        address _members,
        address _clauses,
        address _assemblies,
        address _batchVerifier,
        bytes32 _provenanceClause,
        bytes32[] memory _excluded,
        uint64 _minSellers,
        uint64[] memory _periodEnd
    ) {
        if (
            _core == address(0) || _members == address(0) || _clauses == address(0) || _assemblies == address(0)
                || _batchVerifier == address(0)
        ) {
            revert ZeroAddress();
        }
        if (_minSellers == 0) revert ZeroMinSellers();
        if (_periodEnd.length == 0) revert EmptyPeriods();
        // `currentPeriod()` / `periodClosed()` narrow the index to uint8; more
        // than 256 periods would wrap period 256 to 0 and re-open a closed
        // period's accrual, breaking the finality a consumer's payout relies on.
        if (_periodEnd.length > 256) revert TooManyPeriods();
        for (uint256 i = 1; i < _periodEnd.length; ++i) {
            if (_periodEnd[i] <= _periodEnd[i - 1]) revert PeriodsNotAscending();
        }
        core = IFigaroCore(_core);
        members = IMemberStake(_members);
        clauses = IClauseStake(_clauses);
        assemblies = IAssemblyStake(_assemblies);
        batchVerifier = _batchVerifier;
        provenanceClause = _provenanceClause;
        minSellers = _minSellers;
        for (uint256 i = 0; i < _excluded.length; ++i) {
            excludedClauseOrAssembly[_excluded[i]] = true;
        }
        periodEnd = _periodEnd;
    }

    // ── Views ───────────────────────────────────────────────────────

    /// @notice Number of accrual periods.
    function periodCount() external view returns (uint256) {
        return periodEnd.length;
    }

    /// @notice The period now open for accrual. Reverts once the last has ended.
    function currentPeriod() public view returns (uint8) {
        uint256 n = periodEnd.length;
        for (uint256 i = 0; i < n; ++i) {
            if (block.timestamp < periodEnd[i]) return uint8(i);
        }
        revert AccrualClosed();
    }

    /// @notice Whether a period has ended — i.e. its counts can no longer move.
    ///         A consumer paying out for a period should require this.
    function periodClosed(uint8 period) external view returns (bool) {
        return period < periodEnd.length && block.timestamp >= periodEnd[period];
    }

    /// @notice A clause or assembly's TOTAL score for a period — direct-settled trade
    ///         plus batch-settled trade, summed as SCORES. This is the number a
    ///         reward consumer divides by `totalScoreIn`; reading `accrualOf`
    ///         alone sees only the direct path and under-pays every clause or assembly
    ///         that scaled.
    function scoreOf(bytes32 clauseOrAssembly, uint8 period) external view returns (uint256) {
        return accrualOf[clauseOrAssembly][period].score + batchAccrualOf[clauseOrAssembly][period].score;
    }

    // ── Recording (permissionless) ──────────────────────────────────

    /// @notice Record one settled process's use of one clause or assembly. Anyone may
    ///         call; the proof is what is trusted, never the caller. Recording
    ///         is opt-in and gas-paid by whoever benefits — usually the clause or assembly's
    ///         author, since this is how their work is counted.
    ///
    /// @param order       The order's commitment struct, exactly as signed.
    /// @param clauseOrAssembly    Clause idHash or assembly compositionHash — must be the
    ///                    bytes32 key committed in the agreement's merkle leaf.
    /// @param sectionHash `keccak256` of the clause section's committed bytes —
    ///                    the FINGERPRINT, never the preimage. The merkle leaf
    ///                    needs only this hash, so the section CONTENT never
    ///                    touches public calldata: a `private`-disposition
    ///                    section's plaintext stays off-chain (encrypted IPFS),
    ///                    the chain sees the fingerprint alone. Matches the
    ///                    batched path's `bytes32` convention, byte for byte.
    /// @param proof       Merkle proof of the section against `order.agreementHash`.
    function recordClauseUsage(
        CommitmentTypes.Commitment calldata order,
        bytes32 clauseOrAssembly,
        bytes32 sectionHash,
        bytes32[] calldata proof
    ) external {
        uint8 period = currentPeriod();

        // 1. The order is real and SETTLED. Usage is what a finished process
        //    leaves behind; an open process has not yet added any value.
        (bytes32 orderHash, bytes32 processId) = _requireResolvedOrder(order);

        // 2. The clause or assembly was committed in the agreement both parties signed.
        //    Leaf shape is AttestationCoordinator's, byte for byte — one leaf
        //    convention across the protocol, double-hashed for leaf/node domain
        //    separation. A wrong `sectionHash` simply fails to open the proof, so
        //    taking the hash is exactly as sound as taking the preimage.
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encodePacked(clauseOrAssembly, sectionHash))));
        if (!MerkleProof.verify(proof, order.agreementHash, leaf)) revert InvalidInclusionProof();

        // 3. CLAUSE-OR-ASSEMBLY-SIDE STAKE GATE. A clause earns only while its own
        //    registration deposit is live. Without it a self-authored agreement
        //    could commit any bytes32 key and accrue score to it, inflating the
        //    shared denominator at gas cost. The seller-side twin is in `_accrue`.
        if (!_clauseLive(clauseOrAssembly)) revert ClauseOrAssemblyNotRegistered(clauseOrAssembly);

        _accrue(clauseOrAssembly, period, processId, order.seller);
    }

    /// @notice Record one settled process's use of an ASSEMBLY. Same guarantees
    ///         as `recordClauseUsage`, proved one step differently: an agreement's
    ///         leaves are keyed by CLAUSE, so a compositionHash is never a leaf
    ///         key. What IS a leaf is the provenance clause, whose committed
    ///         section content is exactly the compositionHash — so proving that
    ///         leaf and matching its content proves the process ran under this
    ///         assembly, with no new trust and no change to `agreementHash`.
    ///
    /// @param order            The order's commitment struct, exactly as signed.
    /// @param compositionHash  The AssemblyRegistry composition being credited.
    /// @param proof            Merkle proof of the provenance section against
    ///                         `agreementHash`.
    function recordAssemblyUsage(
        CommitmentTypes.Commitment calldata order,
        bytes32 compositionHash,
        bytes32[] calldata proof
    ) external {
        uint8 period = currentPeriod();
        (, bytes32 processId) = _requireResolvedOrder(order);

        // No section preimage is taken — the provenance section's content is
        // FULLY DETERMINED by `compositionHash`. Sections commit as CANONICAL
        // JSON bytes, and the provenance section carries exactly one field, so
        // the committed bytes are reproducible verbatim from the claimed hash:
        //   {"compositionHash":"0x<64 lowercase hex>"}
        // Reproduction, never parsing — the section FINGERPRINT is derived here,
        // never supplied. This collapses the old two-step check (inclusion +
        // content-match) into one: a wrong `compositionHash` derives a section
        // hash whose leaf is simply not in the tree. The leaf is the PROVENANCE
        // clause, fixed at deploy, so no other clause can stand in for it.
        bytes memory expected = abi.encodePacked('{"compositionHash":"', _toLowerHexString(compositionHash), '"}');
        bytes32 sectionHash = keccak256(expected);
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encodePacked(provenanceClause, sectionHash))));
        if (!MerkleProof.verify(proof, order.agreementHash, leaf)) revert InvalidInclusionProof();

        // CLAUSE-OR-ASSEMBLY-SIDE STAKE GATE, assembly form — the composition must hold a
        // live AssemblyRegistry binding (registered, deposit un-withdrawn).
        if (!_assemblyLive(compositionHash)) revert ClauseOrAssemblyNotRegistered(compositionHash);

        _accrue(compositionHash, period, processId, order.seller);
    }

    // ── Recording (batch path, proof-gated) ─────────────────────────

    /// @notice One clause or assembly's CUMULATIVE batch-path accrual for a period — not
    ///         a delta. The guest proves the running totals, so the write here
    ///         is an overwrite and this contract keeps NO per-process storage
    ///         for the batch path at all. That is the whole economy of the
    ///         bridge: cost is O(distinct clauses and assemblies in the batch), not
    ///         O(records).
    struct BatchAccrual {
        bytes32 clauseOrAssembly;
        uint64 c;
        uint64 d;
    }

    /// @notice Write the accrual an SP1 proof committed for one batch.
    ///
    /// @dev    WHAT THE PROOF ALREADY ESTABLISHED, so this function does not
    ///         re-check it: every credited order is real and RESOLVED in the
    ///         batch path's state, every clause or assembly was committed in the signed
    ///         agreement (merkle inclusion against `agreementHash`), and no
    ///         (clause-or-assembly, process) pair is counted twice — the guest's counted
    ///         set rides the batch state root, so idempotence holds ACROSS
    ///         batches, not merely within one. `FigaroBatchVerifier` has
    ///         already matched these numbers against `usageAccrualHash`.
    ///
    /// @dev    WHAT THE PROOF CANNOT SEE, and is therefore checked HERE — all
    ///         three are live chain state this contract owns:
    ///           1. which period is open,
    ///           2. which sellers hold a live MembersRegistry stake,
    ///           3. which clauses and assemblies are excluded from scoring.
    ///         The verifier deliberately checks none of them: it owns the
    ///         proof, this contract owns the reward's gates.
    ///
    /// @param period            The period the accrual lands in. Must be the
    ///                          OPEN one — the chain decides, never the
    ///                          sequencer's clock. A batch proven before a
    ///                          boundary and submitted after it is rejected and
    ///                          must be re-proven for the new period.
    /// @param claimedProvenance The provenance clause key the guest proved
    ///                          assembly claims against.
    /// @param accruals          Per-clause-or-assembly cumulative `(c, d)`.
    /// @param sellers           Distinct sellers of record behind them.
    function applyBatchAccrual(
        uint8 period,
        bytes32 claimedProvenance,
        BatchAccrual[] calldata accruals,
        address[] calldata sellers
    ) external {
        if (msg.sender != batchVerifier) revert NotBatchVerifier();

        // An empty accrual is a no-op, and MUST be: batches carrying no usage
        // claims have to keep settling after the last period ends, when
        // `currentPeriod()` reverts `AccrualClosed`. Trade does not stop when
        // the reward does.
        if (accruals.length == 0) return;

        uint8 open = currentPeriod();
        if (period != open) revert PeriodMismatch(open, period);
        if (claimedProvenance != provenanceClause) {
            revert ProvenanceClauseMismatch(provenanceClause, claimedProvenance);
        }

        // SELLER-SIDE GATE, batch form. The direct path checks one seller per
        // record; here the guest declares the distinct sellers its admitted
        // claims rest on and every one must hold a LIVE stake. Same gate, same
        // moment (request-time, not claim-time), O(distinct sellers).
        for (uint256 i = 0; i < sellers.length; ++i) {
            if (!members.registered(sellers[i])) revert SellerNotStaked(sellers[i]);
        }

        for (uint256 i = 0; i < accruals.length; ++i) {
            BatchAccrual calldata a = accruals[i];
            // SKIP, never revert — this call runs inside `settleBatch`, so a
            // revert here would take down the whole batch's TOKEN settlement (a
            // reward-tier gate blocking the settlement tier). An excluded or
            // un-live clause or assembly simply earns nothing: don't write it, don't touch
            // the total, move on. The guest counts without knowing exclusion or
            // registration (both are live chain state it cannot see), so the
            // reward's own gates are applied HERE, and applying them as skips is
            // what keeps trade settling. (Direct path reverts instead — it is a
            // standalone tx with nothing else to unwind.)
            if (excludedClauseOrAssembly[a.clauseOrAssembly]) continue;
            if (!_clauseLive(a.clauseOrAssembly) && !_assemblyLive(a.clauseOrAssembly)) continue;

            Accrual storage stored = batchAccrualOf[a.clauseOrAssembly][period];
            // Cumulative counts can only grow. The state-root check in the
            // verifier already guarantees it; asserting it costs nothing (both
            // fields share a slot already being read) and it can never reject
            // an honest batch, so a guest regression surfaces as a revert
            // rather than as silently destroyed accrual.
            if (a.c < stored.c || a.d < stored.d) revert AccrualWentBackwards(a.clauseOrAssembly);

            uint256 previous = stored.score;
            uint256 updated = _score(a.c, a.d);
            stored.c = a.c;
            stored.d = a.d;
            stored.score = updated;
            totalScoreIn[period] = totalScoreIn[period] + updated - previous;

            emit BatchUsageRecorded(a.clauseOrAssembly, period, a.c, a.d, updated);
        }
    }

    /// @dev 0x-prefixed lowercase hex of a bytes32 — the canonical-JSON
    ///      rendering of a bytes32-hex field value.
    function _toLowerHexString(bytes32 value) private pure returns (bytes memory out) {
        bytes16 alphabet = 0x30313233343536373839616263646566; // "0123456789abcdef"
        out = new bytes(66);
        out[0] = "0";
        out[1] = "x";
        for (uint256 i = 0; i < 32; i++) {
            out[2 + i * 2] = alphabet[uint8(value[i]) >> 4];
            out[3 + i * 2] = alphabet[uint8(value[i]) & 0x0f];
        }
    }

    /// @dev The counting itself, shared by both routes. Idempotent per (clause-or-assembly,
    ///      process) — once ever, whatever the period. Every admitted process
    ///      feeds `c`; the first from each staked seller in the period also
    ///      feeds `d`.
    function _accrue(bytes32 clauseOrAssembly, uint8 period, bytes32 processId, address seller) internal {
        // An excluded clause or assembly — at genesis, the provenance clause
        // alone — is scoring infrastructure; counting it would double-pay the
        // adoption it exists to attribute.
        if (excludedClauseOrAssembly[clauseOrAssembly]) revert ClauseOrAssemblyExcluded(clauseOrAssembly);
        // SELLER-SIDE GATE: usage counts only if the process's seller-of-record
        // holds a LIVE MembersRegistry stake, read at RECORD time. This gate is
        // RETROACTIVE, not merely prospective: requesting withdrawal de-surfaces
        // the seller AND makes every one of their settled-but-NOT-YET-RECORDED
        // processes permanently unrecordable once the period ends — recording
        // reads live state, and a resolved order carries no timestamp the chain
        // can gate on. The mitigation is a HABIT, not on-chain state: usage is
        // recorded AT SETTLEMENT (the buyer's app records every committed
        // clause or assembly right after resolveProcess confirms — createCapabilityExecutors.ts),
        // when the seller is definitionally still staked. A seller who wants to
        // deny a specific author must therefore stay unstaked through the period
        // end, forfeiting their own eligibility and locking their deposit — a
        // self-limiting grief accepted by design (DESIGN_DECISIONS "retroactive
        // seller-stake gate"). Because `d` counts distinct STAKED sellers, this one gate
        // prices breadth itself: n units of the score's dominant term cost n
        // live stakes. Identity cost is the only place Sybil resistance can
        // live (no scoring shape can separate a fabricated counterparty from a
        // genuine one), which is why it is the registries' stake terms —
        // deposit AND withdrawal cooldown — that carry it.
        if (!members.registered(seller)) revert SellerNotStaked(seller);
        // Once ever, not once per period — see `processCounted`.
        if (processCounted[clauseOrAssembly][processId]) revert AlreadyCounted();

        // Breadth is counted PER PERIOD: a seller who carries the clause or assembly
        // again in a later period is new breadth for that period's tally.
        bool firstSeller = !sellerSeen[clauseOrAssembly][period][seller];

        processCounted[clauseOrAssembly][processId] = true;
        if (firstSeller) sellerSeen[clauseOrAssembly][period][seller] = true;

        Accrual storage a = accrualOf[clauseOrAssembly][period];
        unchecked {
            a.c += 1;
            if (firstSeller) a.d += 1;
        }

        uint256 previous = a.score;
        uint256 updated = _score(a.c, a.d);
        a.score = updated;
        // O(1) maintenance — the running total moves by the delta, never a sum.
        totalScoreIn[period] = totalScoreIn[period] + updated - previous;

        emit UsageRecorded(clauseOrAssembly, period, processId, seller, a.c, a.d, updated);
    }

    // ── Scoring ─────────────────────────────────────────────────────

    /// @notice `icbrt(c * d^2 * 1e18)` — breadth (distinct staked sellers)
    ///         weighted twice as heavily as volume, since the score is
    ///         proportional to `c^(1/3) * d^(2/3)`; ZERO below the
    ///         minimum-support floor (`d < minSellers`). UNIFORM across
    ///         clauses and assemblies: no tag, category, or weight multiplier — every
    ///         clause or assembly's score is its real usage alone.
    /// @dev    Value is deliberately not a term: the protocol's cost to move one
    ///         unit equals its cost to move a trillion, and the adoption signal
    ///         is the same per staked seller regardless of quanta. Weighting
    ///         by value would import a "TVL matters" metric that belongs to a
    ///         different kind of system. The floor sits HERE, not in `_accrue`,
    ///         so both settlement paths inherit it identically and counting
    ///         below the floor is never refused — only unscored until support
    ///         arrives.
    function _score(uint64 c, uint64 d) internal view returns (uint256) {
        if (c == 0 || d < minSellers) return 0;
        return icbrt(uint256(c) * uint256(d) * uint256(d) * 1e18);
    }

    /// @notice The largest x whose cube fits a uint256 — the search ceiling, so
    ///         `mid * mid * mid` below can never overflow.
    /// @dev    floor(cbrt(2^256 - 1)). An earlier revision guarded the cube with
    ///         floor(cbrt(2^64 - 1)) = 2642245 instead, which SATURATED every
    ///         score above `c * d^2 >= 19` at that constant and collapsed the
    ///         pro-rata split toward equal shares. The bound belongs to the type
    ///         the arithmetic is done in.
    uint256 internal constant CUBE_MAX = 48740834812604276470692694;

    /// @notice Floor integer cube root. Mirrors the SDK's `icbrt` so the on-chain
    ///         score and any off-chain recompute agree exactly.
    function icbrt(uint256 n) public pure returns (uint256) {
        if (n < 8) return n > 0 ? 1 : 0;
        uint256 lo = 1;
        // Clamping the CEILING (rather than rejecting candidates inside the loop)
        // is what keeps the cube in range: every `mid` considered is <= CUBE_MAX.
        // It also keeps `lo + hi + 1` from overflowing when `n` is near 2^256.
        uint256 hi = n < CUBE_MAX ? n : CUBE_MAX;
        // Binary search the largest x with x^3 <= n.
        while (lo < hi) {
            uint256 mid = (lo + hi + 1) >> 1;
            if (mid * mid * mid <= n) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        return lo;
    }

    // ── Internals ───────────────────────────────────────────────────

    /// @dev Whether `clauseOrAssembly` holds a LIVE ClauseRegistry stake — registered
    ///      and its deposit un-withdrawn. The binding survives withdrawal
    ///      (committed agreements reference it forever), so a non-zero registrar
    ///      is not liveness; `!withdrawn` is.
    function _clauseLive(bytes32 clauseOrAssembly) internal view returns (bool) {
        (address registrar, bool withdrawn) = clauses.depositOf(clauseOrAssembly);
        return registrar != address(0) && !withdrawn;
    }

    /// @dev Whether `clauseOrAssembly` holds a LIVE AssemblyRegistry binding —
    ///      registered and its deposit un-withdrawn.
    function _assemblyLive(bytes32 clauseOrAssembly) internal view returns (bool) {
        (address author, uint64 registeredAt, bool depositWithdrawn,) = assemblies.bindings(clauseOrAssembly);
        return author != address(0) && registeredAt != 0 && !depositWithdrawn;
    }

    /// @dev Recompute the order hash from the signed struct and require the
    ///      kernel to report it RESOLVED (status 2). Mirrors
    ///      `AttestationCoordinator._requireKnownCommitment`, inverted: that gate
    ///      wants an OPEN process (evidence during), this one wants a SETTLED
    ///      process (value added).
    function _requireResolvedOrder(CommitmentTypes.Commitment calldata c)
        internal
        view
        returns (bytes32 orderHash, bytes32 processId)
    {
        processId = c.processId == bytes32(0)
            ? keccak256(abi.encodePacked("\x19\x01", core.DOMAIN_SEPARATOR(), CommitmentTypes.hashStruct(c)))
            : c.processId;

        orderHash = keccak256(abi.encodePacked(processId, CommitmentTypes.hashStruct(c)));

        uint8 status = core.orderStatus(orderHash);
        if (status == 0) revert UnknownOrder();
        if (status != 2) revert OrderNotResolved();
    }
}
