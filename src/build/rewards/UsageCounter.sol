// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "src/core/kernel/CommitmentTypes.sol";

/// @notice The minimal FigaroCore surface this contract reads. Local-minimal binding
///         per the coordinator exemplar — never a vendored dependency.
interface IFigaroCore {
    function orderStatus(bytes32 orderHash) external view returns (uint8);
    function orderProcessId(bytes32 orderHash) external view returns (bytes32);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

/// @notice The one MembersRegistry field this contract reads — whether an
///         address holds a LIVE MEMBER stake. The stake is a member's (buyers
///         and sellers register alike); this contract applies it to the SELLER
///         of record — the seller-side gate.
interface IMemberStake {
    function registered(address member) external view returns (bool);
}

/// @notice The ClauseRegistry field the clause kind's gate reads — the clause's
///         stake state. A clause earns only while its registration stake is
///         un-withdrawn; the binding survives withdrawal, so `registeredBy != 0`
///         alone is not liveness.
interface IClauseStake {
    function depositOf(bytes32 clauseKey) external view returns (address registeredBy, bool withdrawn);
}

/// @notice The AssemblyRegistry field the assembly kind's gate reads — the
///         composition's binding. Live iff registered and the stake is not
///         withdrawn.
interface IAssemblyStake {
    function bindings(bytes32 assemblyHash)
        external
        view
        returns (address registeredBy, uint64 registeredAt, bool depositWithdrawn, string memory contentURI);
}

/// @notice The AgreementRegistry field the agreement kind's gate reads — the
///         registered agreement's binding. Live iff registered and the stake
///         is not withdrawn.
interface IAgreementStake {
    function bindings(bytes32 agreementHash)
        external
        view
        returns (address registeredBy, uint64 registeredAt, bool depositWithdrawn, string memory contentURI);
}

/// @title UsageCounter — verified clause, agreement or assembly usage, counted when it happens
/// @custom:security-contact figarosecurity@gmail.com
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
///
/// @notice Counts how much real trade a clause, a registered agreement or an
///         assembly carried, on chain, at the moment it happened. This exists because **the chain cannot
///         look backwards**: `FigaroCore` never calls the registries and
///         carries no usage, so no contract can learn a clause's usage after the
///         fact, and contracts cannot read events. Reconstructing usage later is
///         what forced the whole posting/bond/challenge/referee apparatus that
///         this replaces — a machine for making the chain *believe a claim about
///         the past*. Record the fact as it happens and there is no claim to
///         believe, nothing to bond, and nothing to adjudicate.
///
/// @dev    HOW A USE IS VERIFIED — nobody is trusted. Each entry point proves,
///         from data the chain already holds:
///           1. the order is real and RESOLVED (`core.orderStatus == 2`), and
///           2. what it credits is committed in that order's signed agreement
///              (merkle inclusion against `checkoutHash`): a clause by its
///              own leaf; a registered agreement by the reserved provenance
///              leaf, whose bytes name the agreementHash and the
///              assemblyHash; an assembly by the same provenance leaf plus
///              the agreement's membership proof under the assemblyHash.
///         Same check `AttestationCoordinator` performs, with the status gate
///         inverted: attestation is evidence DURING an open process, usage is
///         counted only once the process has resolved.
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
///         idempotent per (kind, key, process) — ONCE EVER, in whichever period
///         the use is counted. Nothing here can be revoked, re-weighted, or swept.
///
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any kind, express or implied. No liability is accepted for loss, damages, or bugs. Use at your own risk.
contract UsageCounter {
    // ── Composition (immutable) ─────────────────────────────────────

    IFigaroCore public immutable core;

    /// @notice MembersRegistry — the seller-side eligibility gate. A resolved
    ///         process's usage counts toward the reward only while its
    ///         seller-of-record holds a LIVE ETH stake here (registered and
    ///         un-withdrawn), which prices the seller IDENTITY — and with it
    ///         breadth itself, since `d` counts distinct staked sellers:
    ///         every unit of the score's dominant term costs one
    ///         live stake. The reward itself is UNIFORM — no tag, no
    ///         category, no weight: every clause's, agreement's or assembly's score is its
    ///         real usage alone (`icbrt(c·d²·1e18)`), and the network's own
    ///         growth, not a
    ///         privileged class, is what the 600M pays for.
    IMemberStake public immutable members;

    /// @notice ClauseRegistry / AssemblyRegistry / AgreementRegistry — the
    ///         designer-side stake gate, one registry per kind.
    /// @dev    Usage counts toward the reward only while the clause's,
    ///         assembly's or agreement's own registration stake is LIVE
    ///         (registered and un-withdrawn). This is the designer-side twin of
    ///         the seller-side `members` gate: an unregistered `bytes32` is just
    ///         a self-chosen merkle-leaf key, so without this gate a self-dealt
    ///         process could accrue score to arbitrary keys and inflate
    ///         `totalScoreIn` at gas cost, diluting every honest designer. No
    ///         read is registry PRIOR KNOWLEDGE: each accepts ANY live-staked
    ///         key, derived from the live registry, never a hardcoded set. A
    ///         `clauseOrAssembly` is a clause key, an assemblyHash
    ///         or an agreementHash, and every count names which by its KIND
    ///         (`KIND_CLAUSE`, `KIND_ASSEMBLY`, `KIND_AGREEMENT`): each kind's
    ///         count reads its own registry only, never another's.
    IClauseStake public immutable clauses;
    IAssemblyStake public immutable assemblies;
    IAgreementStake public immutable agreements;

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
    ///         present proof that resolved trade used a clause, agreement or assembly. See
    ///         `DESIGN_DECISIONS.md` #15 "`UsageCounter.applyBatchAccrual` has
    ///         one privileged caller — a proof-gated writer, not an admin".
    ///
    ///         Why a privileged caller at all: the batched path's accrual is
    ///         proved OFF-chain (that is the point — ~85% of a direct record is
    ///         storage plus `icbrt`), so the fact this contract needs cannot be
    ///         re-derived from calldata here. It trusts the vkey instead, which
    ///         is why the address is immutable and the verifier is redeployed
    ///         whenever the program changes.
    address public immutable batchVerifier;

    /// @notice The kind of a CLAUSE count: its key is a `ClauseRegistry` clause key.
    /// @dev    The three families are kept apart by kind, never by the bytes of
    ///         a key: nothing on chain can tell a clause key from a
    ///         assemblyHash or an agreementHash, and each registry takes any
    ///         bytes32, so a wallet can stake one family's key in another's
    ///         registry. Every accrual, count and score is therefore keyed by
    ///         (kind, key), and each kind's gate reads its own registry only — a
    ///         stake in one family never earns another family's accrual at the
    ///         same bytes.
    uint8 public constant KIND_CLAUSE = 0;
    /// @notice The kind of an ASSEMBLY count: its key is an `AssemblyRegistry`
    ///         assemblyHash.
    uint8 public constant KIND_ASSEMBLY = 1;
    /// @notice The kind of an AGREEMENT count: its key is an `AgreementRegistry`
    ///         agreementHash.
    uint8 public constant KIND_AGREEMENT = 2;

    /// @notice The key of the agreement format's reserved PROVENANCE leaf —
    ///         the leaf whose committed bytes name the registered agreement
    ///         an order instantiates and the assembly it came from.
    ///         `keccak256("figaro-agreement-provenance")`.
    /// @dev    The link from a resolved process to its agreement and its
    ///         assembly is a fact of the agreement FORMAT, never a clause: the
    ///         key is a constant derived from the format's own label, it is
    ///         registered nowhere and earns nothing. The clause and assembly
    ///         registries take a key as given, so a wallet can stake this key in
    ///         either; `_accrue` and the batch path refuse it on every kind
    ///         whatever any registry holds. The leaf's committed bytes are exactly
    ///         `{"agreementHash":"0x<64 lowercase hex>","assemblyHash":"0x<64
    ///         lowercase hex>"}`, reproduced here from the two keys claimed. An
    ///         agreementHash or an assemblyHash is never itself an agreement's
    ///         leaf key, so both are proved through this leaf; fixing the key as
    ///         a constant rather than taking it per call is what stops a caller
    ///         passing some clause whose committed bytes happen to name the two keys.
    ///         The mandatory clauses ride every order and earn like any other
    ///         clause: scoring them rewards their designer of record.
    bytes32 public constant provenanceLeaf = keccak256("figaro-agreement-provenance");

    /// @notice The key of an assembly tree's TERMS leaf — the leaf whose
    ///         committed bytes are the assembly-scoped clauses.
    ///         `keccak256("figaro-assembly-terms")`.
    /// @dev    A constant of the assembly format, beside the agreements'
    ///         leaves under the assemblyHash, and never a registration:
    ///         `_accrue` refuses it on every kind, the batch path skips it, and
    ///         `recordAssemblyUsage` refuses it as an agreementHash, so the terms
    ///         leaf never passes as an agreement.
    bytes32 public constant assemblyTermsLeaf = keccak256("figaro-assembly-terms");

    /// @notice The domain mixed into every leaf of an assembly's tree,
    ///         `keccak256("figaro-assembly-leaf")`: an assembly leaf is
    ///         `keccak256(keccak256(assemblyLeafDomain ‖ key ‖ dataHash))` where
    ///         the agreement format's leaf is `keccak256(keccak256(key ‖ dataHash))`,
    ///         so a tree over agreements never shares a shape with a tree over
    ///         clauses and no tree over agreement-format leaves opens an assembly leaf. The SDK
    ///         (`ASSEMBLY_LEAF_DOMAIN`) and the guest hold the same constant.
    bytes32 public constant assemblyLeafDomain = keccak256("figaro-assembly-leaf");

    /// @notice The minimum-support floor: a clause, agreement
    ///         or assembly scores
    ///         ZERO in a period until at least this many DISTINCT LIVE-STAKED
    ///         sellers have carried it there. Counting is unaffected — `c` and
    ///         `d` accrue below the floor and the score springs to its full
    ///         value when the floor is crossed; nothing is lost, only deferred.
    /// @dev    Why: below the floor sit exactly the clauses, agreements and assemblies
    ///         whose usage one
    ///         actor can fabricate alone — self-farms, fragmentation shards,
    ///         squatted names, trivial riders. A floor of k makes the minimum
    ///         viable farm k live stakes plus k cooldowns, with no curation and
    ///         no judgment. Applied per resolution path inside `_score` — the
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
        /// @dev Distinct resolved processes that used this clause, agreement or assembly.
        uint64 c;
        /// @dev Distinct live-staked sellers of record across those processes.
        uint64 d;
        /// @dev `icbrt(c * d^2 * 1e18)` — cached so `totalScore` can be
        ///      maintained in O(1) as a delta on every record.
        uint256 score;
    }

    /// @notice kind → key → period → accrual. The key is the `ClauseRegistry`
    ///         clause key under `KIND_CLAUSE`, the `AssemblyRegistry`
    ///         assemblyHash under `KIND_ASSEMBLY`, or the `AgreementRegistry`
    ///         agreementHash under `KIND_AGREEMENT` — the same identity each
    ///         family's own anchor uses, never a new identifier.
    mapping(uint8 => mapping(bytes32 => mapping(uint8 => Accrual))) public accrualOf;

    /// @notice The same accrual for trade resolved through `FigaroBatchVerifier`
    ///         — kept in a SEPARATE mapping, never merged into `accrualOf`.
    /// @dev    THE TWO ARE SUMMED AS SCORES, never as components (`scoreOf`).
    ///         Summing `c` and `d` would over-count breadth for any SELLER
    ///         active on BOTH paths: the chain holds counts, not the seller
    ///         sets, so it cannot union them — and an attacker who split one
    ///         seller's trade across the two universes would be paid
    ///         twice for the same breadth. For DISJOINT seller sets summing
    ///         scores never over-counts: the score is homogeneous of degree 1
    ///         and concave, so the sum is at most the pooled figure, with
    ///         equality when the split is proportional. For a seller active on
    ///         BOTH paths it does over-count — that seller enters each path's
    ///         `d`, and a key whose sellers are the same on both paths scores
    ///         up to 2^(2/3) ≈ 1.59× the pooled figure at an equal split: a
    ///         bounded bias toward keys carried on both paths, at the same
    ///         live stake per seller (the RPGF paper §4 and §7.3 state it).
    ///         Pooling `d` would need per-key seller sets from the batch,
    ///         which this call does not carry. The PROCESSES are disjoint by
    ///         construction (a
    ///         batch-resolved process never acquires FigaroCore status, and a
    ///         FigaroCore-resolved one is never in a batch), so no PROCESS is ever
    ///         counted on both sides.
    mapping(uint8 => mapping(bytes32 => mapping(uint8 => Accrual))) public batchAccrualOf;

    /// @notice period → summed score of every clause, agreement or assembly in it, across BOTH
    ///         resolution paths. A consumer paying pro rata divides by this; it
    ///         is final once the period ends.
    mapping(uint8 => uint256) public totalScoreIn;

    /// @notice kind → clause, agreement or assembly → processId → already counted. Idempotence is GLOBAL, not
    ///         per period: a resolved process counts ONCE EVER toward a clause, agreement or assembly,
    ///         in whichever period it is first recorded.
    /// @dev    Why not per period. A resolved order stays
    ///         resolved and its struct is public in the commit event, so anyone
    ///         can re-present it forever; the chain cannot see WHEN a process
    ///         resolved (no timestamp it can read), so a per-period key let the
    ///         same trade count again in every period. Rational play was then
    ///         "re-record everything each period", which pays for RECORDING GAS
    ///         rather than adoption: a designer whose clause is widely used but
    ///         who recorded once and moved on collects nothing later, while a
    ///         wallet that knows to re-record collects again and again on the
    ///         same trades — and a fabricated period-0 farm is milked across
    ///         every later period at record-gas only. Counting once ever makes
    ///         each period pay for usage that is NEW to it, which is what a
    ///         fixed per-period budget schedule assumes.
    mapping(uint8 => mapping(bytes32 => mapping(bytes32 => bool))) public processCounted;

    /// @notice kind → clause, agreement or assembly → period → seller → has this seller already contributed
    ///         to `d` in this period. Its only job is the distinct-staked-seller
    ///         count.
    /// @dev    Breadth does not count (buyer, seller) PAIRS. Pairs are
    ///         the wrong statistic because they cannot be priced: the buyer's
    ///         member stake, if any, is not what breadth prices, so one staked
    ///         seller plus N free buyer wallets would be
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
    mapping(uint8 => mapping(bytes32 => mapping(uint8 => mapping(address => bool)))) public sellerSeen;

    // ── Events ──────────────────────────────────────────────────────

    /// @param kind      `KIND_CLAUSE`, `KIND_ASSEMBLY` or `KIND_AGREEMENT`.
    /// @param clauseOrAssembly  Clause key, an assemblyHash or an agreementHash.
    /// @param period    The accrual period the usage landed in.
    /// @param processId The resolved process that used it.
    /// @param seller    The recorded order's seller of record (live-staked).
    /// @param c         The clause's, agreement's or assembly's distinct-process count after this count is taken.
    /// @param d         The clause's, agreement's or assembly's distinct-staked-seller count after this
    ///                  record.
    /// @param score     The clause's, agreement's or assembly's score after this count is taken.
    event UsageRecorded(
        uint8 kind,
        bytes32 indexed clauseOrAssembly,
        uint8 indexed period,
        bytes32 indexed processId,
        address seller,
        uint64 c,
        uint64 d,
        uint256 score
    );

    /// @notice One clause's, agreement's or assembly's batch-path accrual after a resolved batch.
    /// @dev    Deliberately NOT `UsageRecorded`: there is no processId and no
    ///         per-record seller to report, because the batch path proves
    ///         per-process facts off-chain and writes only the totals. An
    ///         indexer summing `UsageRecorded` alone sees the direct path only
    ///         — it must fold both events, and this one REPLACES rather than
    ///         adds (the values are cumulative, not deltas).
    /// @param kind     `KIND_CLAUSE`, `KIND_ASSEMBLY` or `KIND_AGREEMENT`.
    /// @param clauseOrAssembly Clause key, an assemblyHash or an agreementHash.
    /// @param period   The accrual period.
    /// @param c        Cumulative distinct resolved processes, batch path.
    /// @param d        Cumulative distinct staked sellers in this period, batch
    ///                 path.
    /// @param score    The batch-path score after this write.
    event BatchUsageRecorded(
        uint8 kind, bytes32 indexed clauseOrAssembly, uint8 indexed period, uint64 c, uint64 d, uint256 score
    );

    // ── Errors ──────────────────────────────────────────────────────

    error ZeroAddress();
    error ZeroMinSellers();
    error EmptyPeriods();
    error TooManyPeriods();
    error PeriodsNotAscending();
    error ClauseAgreementOrAssemblyNotRegistered(bytes32 clauseOrAssembly);
    error AccrualClosed();
    error UnknownOrder();
    error OrderNotResolved();
    error AlreadyCounted();
    error InvalidInclusionProof();
    /// @notice The agreement's leaf does not open under the assemblyHash
    ///         claimed: the assembly's tree holds no such agreement.
    error InvalidMembershipProof();
    error SellerNotStaked(address seller);
    error NotBatchVerifier();
    error PeriodMismatch(uint8 open, uint8 claimed);
    error ProvenanceLeafMismatch(bytes32 expected, bytes32 claimed);
    /// @notice One of the two reserved format keys (`provenanceLeaf`,
    ///         `assemblyTermsLeaf`) was claimed under some kind. Each is a
    ///         constant of its format and never a registration, whatever a
    ///         registry holds at that key.
    error ReservedKeyIsNotARegistration(bytes32 key);
    error AccrualWentBackwards(bytes32 clauseOrAssembly);

    // ── Constructor ─────────────────────────────────────────────────

    /// @param _core        FigaroCore — the order-status and domain source.
    /// @param _members     MembersRegistry — the member stake, applied to the seller of record (the seller-side gate).
    /// @param _clauses     ClauseRegistry — the clause-side stake gate.
    /// @param _assemblies  AssemblyRegistry — the assembly-side stake gate.
    /// @param _agreements  AgreementRegistry — the agreement-side stake gate.
    /// @param _batchVerifier  FigaroBatchVerifier — the proof-gated writer of
    ///                    the batch-path accrual. The verifier needs this
    ///                    contract's address too, so one of the two must be
    ///                    predicted at deploy time; the deploy scripts compute
    ///                    the verifier's address from the deployer nonce and
    ///                    deploy this contract FIRST. Immutable, so a wrong
    ///                    prediction is caught by the deploy script's own
    ///                    assertion, never silently tolerated.
    /// @param _minSellers  The minimum-support floor: distinct staked sellers an
    ///                     clause, agreement or assembly needs in a period before it scores. ≥ 1
    ///                     (1 disables the floor; mainnet uses 3).
    /// @param _periodEnd   Strictly ascending period boundaries (unix seconds).
    constructor(
        address _core,
        address _members,
        address _clauses,
        address _assemblies,
        address _agreements,
        address _batchVerifier,
        uint64 _minSellers,
        uint64[] memory _periodEnd
    ) {
        if (
            _core == address(0) || _members == address(0) || _clauses == address(0) || _assemblies == address(0)
                || _agreements == address(0) || _batchVerifier == address(0)
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
        agreements = IAgreementStake(_agreements);
        batchVerifier = _batchVerifier;
        minSellers = _minSellers;
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

    /// @notice A clause's, agreement's or assembly's TOTAL score for a period — direct-resolved trade
    ///         plus batch-resolved trade, summed as SCORES. This is the number a
    ///         reward consumer divides by `totalScoreIn`; reading `accrualOf`
    ///         alone sees only the direct path and under-pays every clause, agreement or assembly
    ///         that scaled.
    function scoreOf(uint8 kind, bytes32 clauseOrAssembly, uint8 period) external view returns (uint256) {
        return accrualOf[kind][clauseOrAssembly][period].score + batchAccrualOf[kind][clauseOrAssembly][period].score;
    }

    // ── Recording (permissionless) ──────────────────────────────────

    /// @notice Count one resolved process's use of one CLAUSE, counted under
    ///         `KIND_CLAUSE` and gated by `ClauseRegistry` alone. Anyone may
    ///         call; the proof is what is trusted, never the caller. Recording
    ///         is opt-in and gas-paid by whoever benefits — usually the clause's
    ///         designer of record, since this is how their work is counted.
    ///
    /// @param order       The order's commitment struct, exactly as signed.
    /// @param clauseOrAssembly    The clause key — the bytes32 key committed in the
    ///                    agreement's merkle leaf; counted under KIND_CLAUSE.
    /// @param clauseDataHash `keccak256` of the clause's committed bytes — the
    ///                    FINGERPRINT, never the preimage. The merkle leaf
    ///                    needs only this hash, so the clause's CONTENT never
    ///                    touches public calldata: a `private`-disposition
    ///                    clause's plaintext stays off-chain (encrypted IPFS),
    ///                    the chain sees the fingerprint alone. Matches the
    ///                    batched path's `bytes32` convention, byte for byte.
    /// @param proof       Merkle proof of the clause leaf against `order.checkoutHash`.
    function recordClauseUsage(
        CommitmentTypes.Commitment calldata order,
        bytes32 clauseOrAssembly,
        bytes32 clauseDataHash,
        bytes32[] calldata proof
    ) external {
        uint8 period = currentPeriod();

        // 1. The order is real and RESOLVED. Usage is what a finished process
        //    leaves behind; an open process has not yet added any value.
        (bytes32 orderHash, bytes32 processId) = _requireResolvedOrder(order);

        // 2. The clause is committed in the agreement both parties signed.
        //    Leaf shape is AttestationCoordinator's, byte for byte — one leaf
        //    convention across the protocol, double-hashed for leaf/node domain
        //    separation. A wrong `clauseDataHash` simply fails to open the proof, so
        //    taking the hash is exactly as sound as taking the preimage.
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encodePacked(clauseOrAssembly, clauseDataHash))));
        if (!MerkleProof.verify(proof, order.checkoutHash, leaf)) revert InvalidInclusionProof();

        // 3. DESIGNER-SIDE STAKE GATE. A clause earns only while its own
        //    registration stake is live. Without it an agreement a seller wrote
        //    could commit any bytes32 key and accrue score to it, inflating the
        //    shared denominator at gas cost. The seller-side twin is in `_accrue`.
        if (!_clauseLive(clauseOrAssembly)) revert ClauseAgreementOrAssemblyNotRegistered(clauseOrAssembly);

        _accrue(KIND_CLAUSE, clauseOrAssembly, period, processId, order.seller);
    }

    /// @notice Count one resolved process's use of a REGISTERED AGREEMENT,
    ///         under `KIND_AGREEMENT` and gated by `AgreementRegistry` alone. An
    ///         agreementHash is never a leaf key; what IS a leaf is the agreement
    ///         format's reserved provenance leaf, whose committed bytes name
    ///         exactly the agreementHash and the assemblyHash — so proving
    ///         that leaf proves the order instantiated this agreement, with no
    ///         new trust and no change to `checkoutHash`. The assembly named
    ///         beside it is part of the bytes only: its stake is never read here.
    ///
    /// @param order            The order's commitment struct, exactly as signed.
    /// @param agreementHash     The AgreementRegistry agreement being credited.
    /// @param assemblyHash  The assembly the order's provenance names.
    /// @param proof            Merkle proof of the provenance leaf against
    ///                         `checkoutHash`.
    function recordAgreementUsage(
        CommitmentTypes.Commitment calldata order,
        bytes32 agreementHash,
        bytes32 assemblyHash,
        bytes32[] calldata proof
    ) external {
        uint8 period = currentPeriod();
        (, bytes32 processId) = _requireResolvedOrder(order);

        _requireProvenance(order.checkoutHash, agreementHash, assemblyHash, proof);

        // DESIGNER-SIDE STAKE GATE, agreement form — the agreement must hold a
        // live AgreementRegistry binding (registered, stake un-withdrawn).
        if (!_agreementLive(agreementHash)) revert ClauseAgreementOrAssemblyNotRegistered(agreementHash);

        _accrue(KIND_AGREEMENT, agreementHash, period, processId, order.seller);
    }

    /// @notice Count one resolved process's use of an ASSEMBLY, under
    ///         `KIND_ASSEMBLY` and gated by `AssemblyRegistry` alone. Proved in
    ///         two steps: the provenance leaf, exactly as `recordAgreementUsage`
    ///         proves it, shows the order names this assemblyHash and the
    ///         agreementHash of the agreement it instantiated; the agreement's
    ///         leaf `keccak256(keccak256(assemblyLeafDomain ‖ agreementHash ‖ slotContentHash))` then
    ///         opens under the assemblyHash, which is the root of the
    ///         assembly's tree — so the assembly composes that agreement.
    ///         The agreement's own stake is never read here.
    ///
    /// @param order            The order's commitment struct, exactly as signed.
    /// @param assemblyHash  The AssemblyRegistry composition being credited.
    /// @param agreementHash     The agreementHash of the agreement the order
    ///                         instantiated.
    /// @param slotContentHash  `keccak256` of the agreement's committed bytes
    ///                         (the agreement's own clause fills and its index).
    /// @param leafProof        Merkle proof of the provenance leaf against
    ///                         `checkoutHash`.
    /// @param membershipProof  Merkle proof of the agreement's leaf against
    ///                         `assemblyHash`.
    function recordAssemblyUsage(
        CommitmentTypes.Commitment calldata order,
        bytes32 assemblyHash,
        bytes32 agreementHash,
        bytes32 slotContentHash,
        bytes32[] calldata leafProof,
        bytes32[] calldata membershipProof
    ) external {
        uint8 period = currentPeriod();
        (, bytes32 processId) = _requireResolvedOrder(order);

        // The terms leaf shares the assembly's tree with the agreements; a
        // reserved key is never an agreement's agreementHash, so neither passes
        // as one.
        if (agreementHash == provenanceLeaf || agreementHash == assemblyTermsLeaf) {
            revert ReservedKeyIsNotARegistration(agreementHash);
        }

        _requireProvenance(order.checkoutHash, agreementHash, assemblyHash, leafProof);

        // The agreement's leaf in the assembly's tree: the assembly leaf
        // domain, the agreementHash and the content hash, double-hashed as
        // every leaf of the format is.
        bytes32 slotLeaf =
            keccak256(bytes.concat(keccak256(abi.encodePacked(assemblyLeafDomain, agreementHash, slotContentHash))));
        if (!MerkleProof.verify(membershipProof, assemblyHash, slotLeaf)) revert InvalidMembershipProof();

        // DESIGNER-SIDE STAKE GATE, assembly form — the composition must hold a
        // live AssemblyRegistry binding (registered, stake un-withdrawn).
        if (!_assemblyLive(assemblyHash)) revert ClauseAgreementOrAssemblyNotRegistered(assemblyHash);

        _accrue(KIND_ASSEMBLY, assemblyHash, period, processId, order.seller);
    }

    /// @dev Require the reserved provenance leaf naming `agreementHash` and
    ///      `assemblyHash` under `checkoutHash`. No preimage is taken —
    ///      the provenance leaf's content is FULLY DETERMINED by the two keys.
    ///      A leaf's content commits as CANONICAL JSON bytes (object keys
    ///      sorted), and the provenance leaf carries exactly two fields, so
    ///      the committed bytes are reproducible verbatim:
    ///        {"agreementHash":"0x<64 lowercase hex>","assemblyHash":"0x<64 lowercase hex>"}
    ///      Reproduction, never parsing — the content FINGERPRINT is derived
    ///      here, never supplied. One check does both inclusion and content
    ///      match: a wrong key on either side derives a content hash whose leaf
    ///      is simply not in the tree. The leaf is keyed by the format's
    ///      constant `provenanceLeaf`, so no clause can stand in for it.
    function _requireProvenance(
        bytes32 checkoutHash,
        bytes32 agreementHash,
        bytes32 assemblyHash,
        bytes32[] calldata proof
    ) internal pure {
        bytes memory expected = abi.encodePacked(
            '{"agreementHash":"',
            _toLowerHexString(agreementHash),
            '","assemblyHash":"',
            _toLowerHexString(assemblyHash),
            '"}'
        );
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encodePacked(provenanceLeaf, keccak256(expected)))));
        if (!MerkleProof.verify(proof, checkoutHash, leaf)) revert InvalidInclusionProof();
    }

    // ── Recording (batch path, proof-gated) ─────────────────────────

    /// @notice One clause's, agreement's or assembly's CUMULATIVE batch-path accrual for a period — not
    ///         a delta. The guest proves the running totals, so the write here
    ///         is an overwrite and this contract keeps NO per-process storage
    ///         for the batch path at all. That is the whole economy of the
    ///         bridge: cost is O(distinct keys in the batch), not
    ///         O(records).
    struct BatchAccrual {
        bytes32 clauseOrAssembly;
        /// @dev `KIND_CLAUSE`, `KIND_ASSEMBLY` or `KIND_AGREEMENT` — the family
        ///      whose registry gates this accrual and whose storage it lands in.
        uint8 kind;
        uint64 c;
        uint64 d;
    }

    /// @notice Write the accrual an SP1 proof committed for one batch.
    ///
    /// @dev    WHAT THE PROOF ALREADY ESTABLISHED, so this function does not
    ///         re-check it: every credited order is real and RESOLVED in the
    ///         batch path's state, every clause, agreement or assembly was committed in the signed
    ///         agreement (merkle inclusion against `checkoutHash`), and no
    ///         (kind, key, process) triple is counted twice — the guest's counted
    ///         set rides the batch state root, so idempotence holds ACROSS
    ///         batches, not merely within one. `FigaroBatchVerifier` has
    ///         already matched these numbers against `usageAccrualHash`.
    ///
    /// @dev    WHAT THE PROOF CANNOT SEE, and is therefore checked HERE — all
    ///         three are live chain state this contract owns:
    ///           1. which period is open,
    ///           2. which sellers hold a live MembersRegistry stake,
    ///           3. which clauses, assemblies and agreements hold a live
    ///              registration — each accrual in its own kind's registry only.
    ///         The verifier deliberately checks none of them: it owns the
    ///         proof, this contract owns the reward's gates.
    ///
    /// @param period            The period the accrual lands in. Must be the
    ///                          OPEN one — the chain decides, never the
    ///                          sequencer's clock. A batch proven before a
    ///                          boundary and submitted after it is rejected and
    ///                          must be re-proven for the new period.
    /// @param claimedProvenanceLeaf The provenance leaf key the guest proved
    ///                          agreement and assembly claims against; must be `provenanceLeaf`.
    /// @param accruals          Per-(kind, key) cumulative `(c, d)`.
    /// @param sellers           Distinct sellers of record behind them.
    function applyBatchAccrual(
        uint8 period,
        bytes32 claimedProvenanceLeaf,
        BatchAccrual[] calldata accruals,
        address[] calldata sellers
    ) external {
        if (msg.sender != batchVerifier) revert NotBatchVerifier();

        // An empty accrual is a no-op, and MUST be: batches carrying no usage
        // claims have to keep resolving after the last period ends, when
        // `currentPeriod()` reverts `AccrualClosed`. Trade does not stop when
        // the reward does.
        if (accruals.length == 0) return;

        uint8 open = currentPeriod();
        if (period != open) revert PeriodMismatch(open, period);
        if (claimedProvenanceLeaf != provenanceLeaf) {
            revert ProvenanceLeafMismatch(provenanceLeaf, claimedProvenanceLeaf);
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
            // revert here would take down the whole batch's TOKEN resolution (a
            // reward-tier gate blocking the resolution tier). An un-live clause,
            // agreement or assembly simply earns nothing: don't write it, don't touch
            // the total, move on. The guest counts without knowing registration
            // (live chain state it cannot see), so the reward's own gate is
            // applied HERE, and applying it as a skip is what keeps trade
            // resolving. (Direct path reverts instead — it is a standalone tx
            // with nothing else to unwind.)
            // The two reserved keys are constants of their formats, never a
            // registration: the provenance leaf opens under every agreement that
            // names an agreement and an assembly, the terms leaf under every
            // assembly root, so a claim keyed on either is skipped whatever a
            // registry holds at that key (a registry takes any bytes32).
            if (a.clauseOrAssembly == provenanceLeaf || a.clauseOrAssembly == assemblyTermsLeaf) continue;
            // Each accrual is gated by its OWN kind's registry and never
            // another's: a stake in one family at these bytes earns nothing of
            // another family's accrual. An unknown kind names no registry and is
            // skipped.
            if (a.kind == KIND_CLAUSE) {
                if (!_clauseLive(a.clauseOrAssembly)) continue;
            } else if (a.kind == KIND_ASSEMBLY) {
                if (!_assemblyLive(a.clauseOrAssembly)) continue;
            } else if (a.kind == KIND_AGREEMENT) {
                if (!_agreementLive(a.clauseOrAssembly)) continue;
            } else {
                continue;
            }

            Accrual storage stored = batchAccrualOf[a.kind][a.clauseOrAssembly][period];
            // Cumulative counts can only grow. The state-root check in the
            // verifier already guarantees it; asserting it costs nothing (both
            // fields share a storage slot already being read) and it can never reject
            // an honest batch, so a guest regression surfaces as a revert
            // rather than as silently destroyed accrual.
            if (a.c < stored.c || a.d < stored.d) revert AccrualWentBackwards(a.clauseOrAssembly);

            uint256 previous = stored.score;
            uint256 updated = _score(a.c, a.d);
            stored.c = a.c;
            stored.d = a.d;
            stored.score = updated;
            totalScoreIn[period] = totalScoreIn[period] + updated - previous;

            emit BatchUsageRecorded(a.kind, a.clauseOrAssembly, period, a.c, a.d, updated);
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

    /// @dev The counting itself, shared by both routes. Idempotent per (kind,
    ///      key, process) — once ever, whatever the period. Every admitted process
    ///      feeds `c`; the first from each staked seller in the period also
    ///      feeds `d`.
    function _accrue(uint8 kind, bytes32 clauseOrAssembly, uint8 period, bytes32 processId, address seller) internal {
        // The two reserved keys never accrue, on any kind: each is its format's
        // own, never a registration, and no registry entry at that key makes it
        // one.
        if (clauseOrAssembly == provenanceLeaf || clauseOrAssembly == assemblyTermsLeaf) {
            revert ReservedKeyIsNotARegistration(clauseOrAssembly);
        }
        // SELLER-SIDE GATE: usage counts only if the process's seller-of-record
        // holds a LIVE MembersRegistry stake, read at RECORD time. This gate is
        // RETROACTIVE, not merely prospective: requesting withdrawal de-surfaces
        // the seller AND makes every one of their resolved-but-NOT-YET-RECORDED
        // processes permanently unrecordable once the period ends — recording
        // reads live state, and a resolved order carries no timestamp the chain
        // can gate on. The mitigation is a HABIT, not on-chain state: usage is
        // recorded AT RESOLUTION (the buyer's app records every committed
        // clause, agreement or assembly right after resolveProcess confirms — createCapabilityExecutors.ts),
        // when the seller is definitionally still staked. A seller who wants to
        // deny a specific designer must therefore stay unstaked through the period
        // end, forfeiting their own eligibility and locking their deposit — a
        // self-limiting grief accepted by design (DESIGN_DECISIONS "retroactive
        // member-stake gate on the seller of record"). Because `d` counts distinct
        // STAKED sellers, this one gate
        // prices breadth itself: n units of the score's dominant term cost n
        // live stakes. Identity cost is the only place Sybil resistance can
        // live (no scoring shape can separate a fabricated counterparty from a
        // genuine one), which is why it is the registries' stake terms —
        // deposit AND withdrawal cooldown — that carry it.
        if (!members.registered(seller)) revert SellerNotStaked(seller);
        // Once ever, not once per period — see `processCounted`.
        if (processCounted[kind][clauseOrAssembly][processId]) revert AlreadyCounted();

        // Breadth is counted PER PERIOD: a seller who carries the clause, agreement or assembly
        // again in a later period is new breadth for that period's tally.
        bool firstSeller = !sellerSeen[kind][clauseOrAssembly][period][seller];

        processCounted[kind][clauseOrAssembly][processId] = true;
        if (firstSeller) sellerSeen[kind][clauseOrAssembly][period][seller] = true;

        Accrual storage a = accrualOf[kind][clauseOrAssembly][period];
        unchecked {
            a.c += 1;
            if (firstSeller) a.d += 1;
        }

        uint256 previous = a.score;
        uint256 updated = _score(a.c, a.d);
        a.score = updated;
        // O(1) maintenance — the running total moves by the delta, never a sum.
        totalScoreIn[period] = totalScoreIn[period] + updated - previous;

        emit UsageRecorded(kind, clauseOrAssembly, period, processId, seller, a.c, a.d, updated);
    }

    // ── Scoring ─────────────────────────────────────────────────────

    /// @notice `icbrt(c * d^2 * 1e18)` — breadth (distinct staked sellers)
    ///         weighted twice as heavily as volume, since the score is
    ///         proportional to `c^(1/3) * d^(2/3)`; ZERO below the
    ///         minimum-support floor (`d < minSellers`). UNIFORM across
    ///         the three kinds: no tag, category, or weight multiplier — every
    ///         clause's, agreement's or assembly's score is its real usage alone.
    /// @dev    Value is deliberately not a term: the protocol's cost to move one
    ///         unit equals its cost to move a trillion, and the adoption signal
    ///         is the same per staked seller regardless of quanta. Weighting
    ///         by value would import a "TVL matters" metric that belongs to a
    ///         different kind of system. The floor sits HERE, not in `_accrue`,
    ///         so both resolution paths inherit it identically and counting
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
    ///      (committed agreements reference it forever), so a non-zero registeredBy
    ///      is not liveness; `!withdrawn` is.
    function _clauseLive(bytes32 clauseOrAssembly) internal view returns (bool) {
        (address registeredBy, bool withdrawn) = clauses.depositOf(clauseOrAssembly);
        return registeredBy != address(0) && !withdrawn;
    }

    /// @dev Whether `clauseOrAssembly` holds a LIVE AssemblyRegistry binding —
    ///      registered and its stake un-withdrawn.
    function _assemblyLive(bytes32 clauseOrAssembly) internal view returns (bool) {
        (address registeredBy, uint64 registeredAt, bool depositWithdrawn,) = assemblies.bindings(clauseOrAssembly);
        return registeredBy != address(0) && registeredAt != 0 && !depositWithdrawn;
    }

    /// @dev Whether `agreementHash` holds a LIVE AgreementRegistry binding —
    ///      registered and its stake un-withdrawn.
    function _agreementLive(bytes32 agreementHash) internal view returns (bool) {
        (address registeredBy, uint64 registeredAt, bool depositWithdrawn,) = agreements.bindings(agreementHash);
        return registeredBy != address(0) && registeredAt != 0 && !depositWithdrawn;
    }

    /// @dev Recompute the order hash from the signed struct and require the
    ///      FigaroCore to report it RESOLVED (status 2). Mirrors
    ///      `AttestationCoordinator._requireKnownCommitment`, inverted: that gate
    ///      wants an OPEN process (evidence during), this one wants a RESOLVED
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
