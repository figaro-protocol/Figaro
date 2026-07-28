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

/// @notice The one ClauseRegistry field this contract reads.
interface IClauseTags {
    function rpgfTagOf(bytes32 idHash) external view returns (bytes32);
}

/// @title UsageCounter — verified artifact usage, counted when it happens
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
/// @dev    HOW A RECORD IS VERIFIED — nobody is trusted. `recordUsage` proves,
///         from data the chain already holds:
///           1. the order is real and RESOLVED (`core.orderStatus == 2`), and
///           2. the artifact was committed in that order's signed agreement
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
///         who pays. A consumer maps its own schedule onto them.
///
/// @dev    NO OWNER, NO ADMIN, NO PAUSE. Recording is permissionless and
///         idempotent per (artifact, period, process). Nothing here can be
///         revoked, re-weighted, or swept.
///
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any kind, express or implied. No liability is accepted for loss, damages, or bugs. Use at your own risk.
contract UsageCounter {
    // ── Composition (immutable) ─────────────────────────────────────

    IFigaroCore public immutable core;
    IClauseTags public immutable clauses;

    /// @notice The tag that earns the substrate-broadening weight, read from
    ///         `ClauseRegistry.rpgfTagOf`. Frozen at deploy: WHICH tag pays is a
    ///         reward decision, while MEMBERSHIP of the tag stays permissionless
    ///         on the registry — anyone registering under it inherits the weight
    ///         without touching this contract or the kernel.
    bytes32 public immutable boostedTag;

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

    /// @notice Artifacts that earn nothing, set once at deploy and never written
    ///         again — the MANDATORY clauses (`figaro-commerce`, `figaro-topology`).
    /// @dev    They are excluded because they are committed on EVERY order, so
    ///         their count is just "how many processes settled" and carries no
    ///         signal about merit. Scoring them would pay their authors for the
    ///         protocol's own floor. This is deploy-frozen for the same reason
    ///         `boostedTag` is: WHICH artifacts the reward ignores is a reward
    ///         decision, not something a registrar declares about itself — a
    ///         self-declared exclusion would simply never be declared.
    mapping(bytes32 => bool) public excludedArtifact;

    /// @notice Period boundaries (unix seconds, strictly ascending). Usage lands
    ///         in the first period whose end is still in the future; after the
    ///         last one, accrual is closed forever.
    uint64[] public periodEnd;

    // ── Weights (milli — integer thousandths) ───────────────────────

    /// @notice Substrate-broadening weight for `boostedTag` artifacts.
    uint32 public constant BOOSTED_WEIGHT = 3000;
    /// @notice Weight for everything else, including every assembly.
    uint32 public constant BASE_WEIGHT = 1000;
    /// @notice One (buyer, seller) pair contributes at most this many processes
    ///         to a single artifact in a period. Beyond it the process is
    ///         dropped entirely — it feeds neither `c` nor `d`. This is what
    ///         stops an artifact being farmed by repeat trade between two
    ///         wallets; breadth has to be real.
    uint8 public constant PAIR_CAP = 5;

    // ── Accrual ─────────────────────────────────────────────────────

    struct Accrual {
        /// @dev Distinct settled processes that used this artifact.
        uint64 c;
        /// @dev Distinct (buyer, seller) pairs across those processes.
        uint64 d;
        /// @dev `weight * icbrt(c * d^2 * 1e18)` — cached so `totalScore` can be
        ///      maintained in O(1) as a delta on every record.
        uint256 score;
    }

    /// @notice artifact key → period → accrual. The artifact key is the
    ///         `ClauseRegistry` idHash for a clause, or the `AssemblyRegistry`
    ///         compositionHash for an assembly — the same identity each family's
    ///         own anchor uses, never a new identifier.
    mapping(bytes32 => mapping(uint8 => Accrual)) public accrualOf;

    /// @notice period → summed score of every artifact in it. A consumer paying
    ///         pro rata divides by this; it is final once the period ends.
    mapping(uint8 => uint256) public totalScoreIn;

    /// @dev artifact → period → processId → already counted (idempotence).
    mapping(bytes32 => mapping(uint8 => mapping(bytes32 => bool))) public processCounted;

    /// @dev artifact → period → pairKey → processes counted so far (the cap).
    mapping(bytes32 => mapping(uint8 => mapping(bytes32 => uint8))) public pairCount;

    // ── Events ──────────────────────────────────────────────────────

    /// @param artifact  Clause idHash or assembly compositionHash.
    /// @param period    The accrual period the usage landed in.
    /// @param processId The settled process that used it.
    /// @param pairKey   keccak256(buyer, seller) of the recorded order.
    /// @param c         The artifact's distinct-process count after this record.
    /// @param d         The artifact's distinct-pair count after this record.
    /// @param score     The artifact's score after this record.
    event UsageRecorded(
        bytes32 indexed artifact,
        uint8 indexed period,
        bytes32 indexed processId,
        bytes32 pairKey,
        uint64 c,
        uint64 d,
        uint256 score
    );

    // ── Errors ──────────────────────────────────────────────────────

    error ZeroAddress();
    error EmptyPeriods();
    error PeriodsNotAscending();
    error AccrualClosed();
    error UnknownOrder();
    error OrderNotResolved();
    error AlreadyCounted();
    error PairCapReached();
    error InvalidInclusionProof();
    error ProvenanceMismatch();
    error ArtifactExcluded(bytes32 artifact);

    // ── Constructor ─────────────────────────────────────────────────

    /// @param _core        FigaroCore — the order-status and domain source.
    /// @param _clauses     ClauseRegistry — the `rpgfTagOf` source.
    /// @param _boostedTag  The tag earning `BOOSTED_WEIGHT` (e.g. keccak256("geo")).
    /// @param _provenanceClause  `figaro-assembly-provenance`'s clause key.
    /// @param _excluded    Artifacts that earn nothing — the mandatory clauses.
    /// @param _periodEnd   Strictly ascending period boundaries (unix seconds).
    constructor(
        address _core,
        address _clauses,
        bytes32 _boostedTag,
        bytes32 _provenanceClause,
        bytes32[] memory _excluded,
        uint64[] memory _periodEnd
    ) {
        if (_core == address(0) || _clauses == address(0)) revert ZeroAddress();
        if (_periodEnd.length == 0) revert EmptyPeriods();
        for (uint256 i = 1; i < _periodEnd.length; ++i) {
            if (_periodEnd[i] <= _periodEnd[i - 1]) revert PeriodsNotAscending();
        }
        core = IFigaroCore(_core);
        clauses = IClauseTags(_clauses);
        boostedTag = _boostedTag;
        provenanceClause = _provenanceClause;
        for (uint256 i = 0; i < _excluded.length; ++i) {
            excludedArtifact[_excluded[i]] = true;
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

    /// @notice The weight an artifact carries. Clauses tagged `boostedTag` earn
    ///         `BOOSTED_WEIGHT`; everything else, and every assembly, earns
    ///         `BASE_WEIGHT`.
    function weightOf(bytes32 artifact) public view returns (uint32) {
        return clauses.rpgfTagOf(artifact) == boostedTag && boostedTag != bytes32(0) ? BOOSTED_WEIGHT : BASE_WEIGHT;
    }

    // ── Recording (permissionless) ──────────────────────────────────

    /// @notice Record one settled process's use of one artifact. Anyone may
    ///         call; the proof is what is trusted, never the caller. Recording
    ///         is opt-in and gas-paid by whoever benefits — usually the artifact's
    ///         author, since this is how their work is counted.
    ///
    /// @param order       The order's commitment struct, exactly as signed.
    /// @param artifact    Clause idHash or assembly compositionHash — must be the
    ///                    bytes32 key committed in the agreement's merkle leaf.
    /// @param sectionData The clause section's committed bytes.
    /// @param proof       Merkle proof of the section against `order.agreementHash`.
    function recordUsage(
        CommitmentTypes.Commitment calldata order,
        bytes32 artifact,
        bytes calldata sectionData,
        bytes32[] calldata proof
    ) external {
        uint8 period = currentPeriod();

        // 1. The order is real and SETTLED. Usage is what a finished process
        //    leaves behind; an open process has not yet added any value.
        (bytes32 orderHash, bytes32 processId) = _requireResolvedOrder(order);

        // 2. The artifact was committed in the agreement both parties signed.
        //    Leaf shape is AttestationCoordinator's, byte for byte — one leaf
        //    convention across the protocol, double-hashed for leaf/node domain
        //    separation.
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encodePacked(artifact, keccak256(sectionData)))));
        if (!MerkleProof.verify(proof, order.agreementHash, leaf)) revert InvalidInclusionProof();

        _accrue(artifact, period, processId, order.buyer, order.seller);
    }

    /// @notice Record one settled process's use of an ASSEMBLY. Same guarantees
    ///         as `recordUsage`, proved one step differently: an agreement's
    ///         leaves are keyed by CLAUSE, so a compositionHash is never a leaf
    ///         key. What IS a leaf is the provenance clause, whose committed
    ///         section content is exactly the compositionHash — so proving that
    ///         leaf and matching its content proves the process ran under this
    ///         assembly, with no new trust and no change to `agreementHash`.
    ///
    /// @param order            The order's commitment struct, exactly as signed.
    /// @param compositionHash  The AssemblyRegistry composition being credited.
    /// @param sectionData      The provenance section's committed bytes — a
    ///                         single `bytes32` field, so exactly 32 bytes.
    /// @param proof            Merkle proof of that section against `agreementHash`.
    function recordAssemblyUsage(
        CommitmentTypes.Commitment calldata order,
        bytes32 compositionHash,
        bytes calldata sectionData,
        bytes32[] calldata proof
    ) external {
        uint8 period = currentPeriod();
        (, bytes32 processId) = _requireResolvedOrder(order);

        // The leaf is the PROVENANCE clause — fixed at deploy, so no other
        // clause can stand in for it.
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encodePacked(provenanceClause, keccak256(sectionData)))));
        if (!MerkleProof.verify(proof, order.agreementHash, leaf)) revert InvalidInclusionProof();

        // …and its content must BE the assembly claimed. Sections commit as
        // CANONICAL JSON bytes — the very bytes the merkle leaf hashes — and
        // the provenance section carries exactly one field, so the claimed
        // compositionHash must REPRODUCE the committed bytes verbatim:
        //   {"compositionHash":"0x<64 lowercase hex>"}
        // Reproduction, never parsing: no new trust enters. (The earlier
        // raw-32-byte check contradicted the section-encoding convention and
        // made every honest runtime call revert — caught by the first
        // end-to-end exercise, 2026-07-28.)
        bytes memory expected = abi.encodePacked('{"compositionHash":"', _toLowerHexString(compositionHash), '"}');
        if (keccak256(sectionData) != keccak256(expected)) revert ProvenanceMismatch();

        _accrue(compositionHash, period, processId, order.buyer, order.seller);
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

    /// @dev The counting itself, shared by both routes. Idempotent per (artifact,
    ///      period, process); the pair cap drops a process entirely once reached,
    ///      so it feeds neither `c` nor `d`.
    function _accrue(bytes32 artifact, uint8 period, bytes32 processId, address buyer, address seller) internal {
        // A mandatory clause rides every order; counting it would pay for the
        // floor rather than for adoption.
        if (excludedArtifact[artifact]) revert ArtifactExcluded(artifact);
        if (processCounted[artifact][period][processId]) revert AlreadyCounted();

        bytes32 pairKey = keccak256(abi.encodePacked(buyer, seller));
        uint8 seen = pairCount[artifact][period][pairKey];
        if (seen >= PAIR_CAP) revert PairCapReached();

        processCounted[artifact][period][processId] = true;
        pairCount[artifact][period][pairKey] = seen + 1;

        Accrual storage a = accrualOf[artifact][period];
        unchecked {
            a.c += 1;
            if (seen == 0) a.d += 1; // first process from this pair
        }

        uint256 previous = a.score;
        uint256 updated = _score(weightOf(artifact), a.c, a.d);
        a.score = updated;
        // O(1) maintenance — the running total moves by the delta, never a sum.
        totalScoreIn[period] = totalScoreIn[period] + updated - previous;

        emit UsageRecorded(artifact, period, processId, pairKey, a.c, a.d, updated);
    }

    // ── Scoring ─────────────────────────────────────────────────────

    /// @notice `weight * icbrt(c * d^2 * 1e18)` — breadth (distinct counterparty
    ///         pairs) weighted twice as heavily as volume, since the score is
    ///         proportional to `c^(1/3) * d^(2/3)`.
    /// @dev    Value is deliberately not a term: the protocol's cost to move one
    ///         unit equals its cost to move a trillion, and the adoption signal
    ///         is the same per counterparty pair regardless of quanta. Weighting
    ///         by value would import a "TVL matters" metric that belongs to a
    ///         different kind of system.
    function _score(uint32 weight, uint64 c, uint64 d) internal pure returns (uint256) {
        if (c == 0 || d == 0) return 0;
        return uint256(weight) * icbrt(uint256(c) * uint256(d) * uint256(d) * 1e18);
    }

    /// @notice Floor integer cube root. Mirrors the SDK's `icbrt` so the on-chain
    ///         score and any off-chain recompute agree exactly.
    function icbrt(uint256 n) public pure returns (uint256) {
        if (n < 8) return n > 0 ? 1 : 0;
        uint256 lo = 1;
        uint256 hi = n;
        // Binary search the largest x with x^3 <= n, guarding the cube overflow.
        while (lo < hi) {
            uint256 mid = (lo + hi + 1) >> 1;
            if (mid <= 2642245 && mid * mid * mid <= n) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        return lo;
    }

    // ── Internals ───────────────────────────────────────────────────

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
