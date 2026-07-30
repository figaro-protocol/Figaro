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

/// @notice The one SellerRegistry field this contract reads — whether an
///         address holds a LIVE registration stake (the seller-side gate).
interface ISellerStake {
    function registered(address seller) external view returns (bool);
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

    /// @notice SellerRegistry — the seller-side eligibility gate. A settled
    ///         process's usage counts toward the reward only while its
    ///         seller-of-record holds a LIVE ETH stake here (registered and
    ///         un-withdrawn), so fabricating breadth costs one base-currency
    ///         stake per Sybil seller. The reward itself is UNIFORM — no tag, no
    ///         category, no weight: every artifact's score is its real usage
    ///         alone (`icbrt(c·d²·1e18)`), and the network's own growth, not a
    ///         privileged class, is what the 600M pays for.
    ISellerStake public immutable sellers;

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
    ///         again — the two order-mandatory clauses (`figaro-commerce`,
    ///         `figaro-topology`) plus `figaro-assembly-provenance`.
    /// @dev    None of the three carries an adoption signal for its author. The
    ///         mandatory pair rides EVERY order and the provenance clause every
    ///         ASSEMBLY-composed process, so their counts are just "how many
    ///         processes settled" — protocol plumbing, not merit. Scoring them
    ///         would pay their authors for the protocol's own floor. (Assembly
    ///         usage is unaffected: `recordAssemblyUsage` credits the
    ///         `compositionHash` — the assembly's designer of record — never the
    ///         provenance clause, so excluding the clause does not touch it.)
    ///         This is deploy-frozen: WHICH
    ///         artifacts the reward ignores is a reward decision, not something a
    ///         registrar declares about itself — a self-declared exclusion would
    ///         simply never be declared.
    mapping(bytes32 => bool) public excludedArtifact;

    /// @notice Period boundaries (unix seconds, strictly ascending). Usage lands
    ///         in the first period whose end is still in the future; after the
    ///         last one, accrual is closed forever.
    uint64[] public periodEnd;

    /// @notice One (buyer, seller) pair contributes at most this many processes
    ///         to a single artifact in a period. Beyond it the process is
    ///         dropped entirely — it feeds neither `c` nor `d`. This is what
    ///         stops an artifact being farmed by repeat trade between two
    ///         wallets; breadth has to be real. (Orthogonal to the seller-stake
    ///         gate: the cap bounds repeat trade within a live pair, the stake
    ///         gate prices fabricating NEW pairs.)
    uint8 public constant PAIR_CAP = 5;

    // ── Accrual ─────────────────────────────────────────────────────

    struct Accrual {
        /// @dev Distinct settled processes that used this artifact.
        uint64 c;
        /// @dev Distinct (buyer, seller) pairs across those processes.
        uint64 d;
        /// @dev `icbrt(c * d^2 * 1e18)` — cached so `totalScore` can be
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
    error ArtifactExcluded(bytes32 artifact);
    error SellerNotStaked(address seller);

    // ── Constructor ─────────────────────────────────────────────────

    /// @param _core        FigaroCore — the order-status and domain source.
    /// @param _sellers     SellerRegistry — the seller-side live-stake gate.
    /// @param _provenanceClause  `figaro-assembly-provenance`'s clause key.
    /// @param _excluded    Artifacts that earn nothing — the mandatory clauses.
    /// @param _periodEnd   Strictly ascending period boundaries (unix seconds).
    constructor(
        address _core,
        address _sellers,
        bytes32 _provenanceClause,
        bytes32[] memory _excluded,
        uint64[] memory _periodEnd
    ) {
        if (_core == address(0) || _sellers == address(0)) revert ZeroAddress();
        if (_periodEnd.length == 0) revert EmptyPeriods();
        for (uint256 i = 1; i < _periodEnd.length; ++i) {
            if (_periodEnd[i] <= _periodEnd[i - 1]) revert PeriodsNotAscending();
        }
        core = IFigaroCore(_core);
        sellers = ISellerStake(_sellers);
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

    // ── Recording (permissionless) ──────────────────────────────────

    /// @notice Record one settled process's use of one artifact. Anyone may
    ///         call; the proof is what is trusted, never the caller. Recording
    ///         is opt-in and gas-paid by whoever benefits — usually the artifact's
    ///         author, since this is how their work is counted.
    ///
    /// @param order       The order's commitment struct, exactly as signed.
    /// @param artifact    Clause idHash or assembly compositionHash — must be the
    ///                    bytes32 key committed in the agreement's merkle leaf.
    /// @param sectionHash `keccak256` of the clause section's committed bytes —
    ///                    the FINGERPRINT, never the preimage. The merkle leaf
    ///                    needs only this hash, so the section CONTENT never
    ///                    touches public calldata: a `private`-disposition
    ///                    section's plaintext stays off-chain (encrypted IPFS),
    ///                    the chain sees the fingerprint alone. Matches the
    ///                    batched path's `bytes32` convention, byte for byte.
    /// @param proof       Merkle proof of the section against `order.agreementHash`.
    function recordUsage(
        CommitmentTypes.Commitment calldata order,
        bytes32 artifact,
        bytes32 sectionHash,
        bytes32[] calldata proof
    ) external {
        uint8 period = currentPeriod();

        // 1. The order is real and SETTLED. Usage is what a finished process
        //    leaves behind; an open process has not yet added any value.
        (bytes32 orderHash, bytes32 processId) = _requireResolvedOrder(order);

        // 2. The artifact was committed in the agreement both parties signed.
        //    Leaf shape is AttestationCoordinator's, byte for byte — one leaf
        //    convention across the protocol, double-hashed for leaf/node domain
        //    separation. A wrong `sectionHash` simply fails to open the proof, so
        //    taking the hash is exactly as sound as taking the preimage.
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encodePacked(artifact, sectionHash))));
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
        // An excluded artifact — a mandatory clause on every order, or the
        // provenance clause on every assembly-composed process — is protocol
        // floor; counting it would pay for the floor rather than for adoption.
        if (excludedArtifact[artifact]) revert ArtifactExcluded(artifact);
        // SELLER-SIDE GATE: usage counts only if the process's seller-of-record
        // holds a LIVE SellerRegistry stake. This is the breadth Sybil defense —
        // fabricating `d` distinct pairs now costs one base-currency (ETH) stake
        // per fake seller. Withdrawing the stake de-surfaces the seller AND stops
        // its future trades conferring reward.
        if (!sellers.registered(seller)) revert SellerNotStaked(seller);
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
        uint256 updated = _score(a.c, a.d);
        a.score = updated;
        // O(1) maintenance — the running total moves by the delta, never a sum.
        totalScoreIn[period] = totalScoreIn[period] + updated - previous;

        emit UsageRecorded(artifact, period, processId, pairKey, a.c, a.d, updated);
    }

    // ── Scoring ─────────────────────────────────────────────────────

    /// @notice `icbrt(c * d^2 * 1e18)` — breadth (distinct counterparty pairs)
    ///         weighted twice as heavily as volume, since the score is
    ///         proportional to `c^(1/3) * d^(2/3)`. UNIFORM across artifacts: no
    ///         tag, category, or weight multiplier — every artifact's score is
    ///         its real usage alone.
    /// @dev    Value is deliberately not a term: the protocol's cost to move one
    ///         unit equals its cost to move a trillion, and the adoption signal
    ///         is the same per counterparty pair regardless of quanta. Weighting
    ///         by value would import a "TVL matters" metric that belongs to a
    ///         different kind of system.
    function _score(uint64 c, uint64 d) internal pure returns (uint256) {
        if (c == 0 || d == 0) return 0;
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
