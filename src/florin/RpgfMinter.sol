// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IFlorinMinter} from "./IFlorinMinter.sol";
import {IRpgfArbitrator} from "./IRpgfArbitrator.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title RpgfMinter — optimistic three-tranche retroactive public-goods minter for the florin
/// @custom:security-contact security@figaro.org
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice Distributes the 600M florins reserved for clause authors and assembly
///         designers of record, in three tranches, via an OPTIMISTIC posted-root
///         mechanism — no proving infrastructure, no submitter role, no
///         discretionary panel:
///
///         1. POST — once a tranche's earliest-post time passes, ANYONE posts the
///            tranche's payout Merkle root plus the event window it was computed
///            over, staking an ETH bond. The scoring formula is deterministic
///            over public chain events; its canonical spec is anchored here by
///            `formulaHash` (keccak256 of the spec bytes), so any observer can
///            recompute the root exactly.
///         2. CHALLENGE — during the challenge window, ANYONE may stake an equal
///            bond to challenge. A challenge ALWAYS voids the posting (no
///            adjudication gates validity — reposting a correct root is cheap).
///            The bonds move to a bond case settled on a separate track.
///         3. FINALIZE — a root that survives its full challenge window
///            unchallenged finalizes; the poster's bond returns.
///         4. CLAIM — recipients (or anyone on their behalf) mint their
///            allocation with a Merkle proof. Claims never expire.
///
///         Bond cases: the poster may escalate a challenge to the composed
///         arbitration forum (`IRpgfArbitrator`, deployment config — Kleros via
///         an adapter, or a mock on devnet) by paying the forum's fee; the
///         forum's ruling routes both bonds to the winner. A poster who does
///         not escalate within the dispute window concedes both bonds to the
///         challenger. The forum NEVER decides whether a mint happens — only
///         who keeps the bonds. Minting is purely mechanical: unchallenged
///         window ⇒ finalized root ⇒ Merkle claims.
///
///         WHY OPTIMISTIC: the prior design (git history: an SP1-proof-gated,
///         submitter-role minter) proved the formula was applied to the
///         supplied event window but never that the window matched chain
///         history — a trusted-submitter hole at full proving-infrastructure
///         price. Deterministic public recompute under a bonded challenge
///         covers formula AND input provenance, with zero recurring cost to
///         anyone but the disputing parties.
///
///         No owner, no pause, no sweep, no claim expiry. Payouts of bonds use
///         pull-payments (`withdrawBonds`) so an unpayable address can never
///         brick a ruling or a concession.
///
/// @dev Per-tranche budget is enforced twice: `minted[t] + amount <= amounts[t]`
///      here (an over-allocating root fails late claims — such a root is
///      exactly what challenges are for; this is the backstop), and the outer
///      FlorinToken minter cap (600M registered at genesis, before
///      `renounceDeployerMint` — this contract must therefore exist at florin
///      genesis).
///
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any
///      kind, express or implied. No liability is accepted for loss, damages,
///      or bugs. Use at your own risk.
contract RpgfMinter {
    uint8 public constant TRANCHE_COUNT = 3;

    /// @notice Rulings the composed forum may return for a bond case.
    uint8 public constant RULING_REFUSED = 0; // bonds return to their owners
    uint8 public constant RULING_POSTER = 1; // poster takes both bonds
    uint8 public constant RULING_CHALLENGER = 2; // challenger takes both bonds

    IFlorinMinter public immutable florin;
    IRpgfArbitrator public immutable arbitrator;
    /// @notice keccak256 of the canonical formula-spec bytes (`sdk/src/rpgf/formula.json`).
    bytes32 public immutable formulaHash;
    /// @notice ETH stake required to post a root, and to challenge one.
    uint256 public immutable bond;
    /// @notice Seconds a posting must survive unchallenged to finalize.
    uint64 public immutable challengeWindow;
    /// @notice Seconds the poster has to escalate a challenge before conceding.
    uint64 public immutable disputeWindow;

    struct Tranche {
        uint256 amount; // florin budget of this tranche
        uint64 earliestPost; // no posting before this timestamp
        bytes32 root; // set at finalization, immutable after
        uint64 fromBlock; // finalized window (public recompute record)
        uint64 toBlock;
        bool finalized;
        uint256 minted; // budget backstop accumulator
    }

    struct Posting {
        address poster;
        bytes32 root;
        uint64 fromBlock;
        uint64 toBlock;
        uint64 postedAt; // 0 = no active posting
    }

    enum CaseStatus {
        Open,
        Disputed,
        Closed
    }

    struct BondCase {
        address poster;
        address challenger;
        uint64 challengedAt;
        CaseStatus status;
    }

    Tranche[TRANCHE_COUNT] public tranches;
    Posting[TRANCHE_COUNT] public postings;
    BondCase[] public bondCases;

    /// @notice claimed[trancheId][account] = true once the account's allocation minted.
    mapping(uint8 => mapping(address => bool)) public claimed;

    /// @notice Pull-payment balances for returned/won bonds.
    mapping(address => uint256) public withdrawable;

    // ── Errors ──────────────────────────────────────────────────────

    error ZeroAddress();
    error ZeroBond();
    error ZeroWindow();
    error ZeroAmount();
    error PostTimesNotAscending();
    error InvalidTranche(uint8 trancheId);
    error TrancheFinalized(uint8 trancheId);
    error TrancheNotFinalized(uint8 trancheId);
    error PostTooEarly(uint8 trancheId, uint64 earliestPost);
    error PostingActive(uint8 trancheId);
    error NoActivePosting(uint8 trancheId);
    error WrongBond(uint256 expected, uint256 provided);
    error ZeroRoot();
    error ChallengeWindowClosed(uint8 trancheId);
    error ChallengeWindowOpen(uint8 trancheId);
    error InvalidCase(uint256 caseId);
    error CaseNotOpen(uint256 caseId);
    error CaseNotDisputed(uint256 caseId);
    error NotPoster(uint256 caseId);
    error NotArbitrator();
    error DisputeWindowClosed(uint256 caseId);
    error DisputeWindowOpen(uint256 caseId);
    error InvalidRuling(uint8 ruling);
    error AlreadyClaimed(uint8 trancheId, address account);
    error InvalidProof();
    error TrancheBudgetExceeded(uint8 trancheId);
    error NothingToWithdraw();
    error WithdrawFailed();

    // ── Events ──────────────────────────────────────────────────────

    event RootPosted(uint8 indexed trancheId, address indexed poster, bytes32 root, uint64 fromBlock, uint64 toBlock);
    event RootChallenged(uint8 indexed trancheId, uint256 indexed caseId, address indexed challenger, bytes32 root);
    event ChallengeDisputed(uint256 indexed caseId, uint256 fee);
    event ChallengeConceded(uint256 indexed caseId);
    event CaseRuled(uint256 indexed caseId, uint8 ruling);
    event TrancheFinalizedRoot(uint8 indexed trancheId, bytes32 root, uint64 fromBlock, uint64 toBlock);
    event Claimed(uint8 indexed trancheId, address indexed account, uint256 amount);
    event BondsWithdrawn(address indexed account, uint256 amount);

    // ── Constructor ─────────────────────────────────────────────────

    /// @param _florin          The FlorinToken this minter mints through (must be
    ///                         registered as a FlorinToken minter before renounce).
    /// @param _arbitrator      The composed bond-settlement forum (config, never code).
    /// @param _formulaHash     keccak256 of the canonical formula-spec bytes.
    /// @param _bond            ETH stake for posting and for challenging.
    /// @param _challengeWindow Seconds a posting must survive to finalize.
    /// @param _disputeWindow   Seconds the poster has to escalate a challenge.
    /// @param _earliestPost    Ascending earliest-post timestamps per tranche.
    /// @param _amounts         florin budget per tranche.
    constructor(
        address _florin,
        address _arbitrator,
        bytes32 _formulaHash,
        uint256 _bond,
        uint64 _challengeWindow,
        uint64 _disputeWindow,
        uint64[TRANCHE_COUNT] memory _earliestPost,
        uint256[TRANCHE_COUNT] memory _amounts
    ) {
        if (_florin == address(0) || _arbitrator == address(0)) {
            revert ZeroAddress();
        }
        if (_bond == 0) revert ZeroBond();
        if (_challengeWindow == 0 || _disputeWindow == 0) revert ZeroWindow();
        florin = IFlorinMinter(_florin);
        arbitrator = IRpgfArbitrator(_arbitrator);
        formulaHash = _formulaHash;
        bond = _bond;
        challengeWindow = _challengeWindow;
        disputeWindow = _disputeWindow;
        for (uint8 i = 0; i < TRANCHE_COUNT; i++) {
            if (_amounts[i] == 0) revert ZeroAmount();
            if (i > 0 && _earliestPost[i] <= _earliestPost[i - 1]) revert PostTimesNotAscending();
            tranches[i].amount = _amounts[i];
            tranches[i].earliestPost = _earliestPost[i];
        }
    }

    // ── Post ────────────────────────────────────────────────────────

    /// @notice Post a tranche's payout Merkle root, staking the bond. The
    ///         window `[fromBlock, toBlock]` is the recompute input record;
    ///         the formula spec defines the canonical window — a wrong window
    ///         is a wrong root, and challengeable as such.
    function postRoot(uint8 trancheId, bytes32 root, uint64 fromBlock, uint64 toBlock) external payable {
        if (trancheId >= TRANCHE_COUNT) revert InvalidTranche(trancheId);
        Tranche storage t = tranches[trancheId];
        if (t.finalized) revert TrancheFinalized(trancheId);
        if (block.timestamp < t.earliestPost) revert PostTooEarly(trancheId, t.earliestPost);
        if (postings[trancheId].postedAt != 0) revert PostingActive(trancheId);
        if (msg.value != bond) revert WrongBond(bond, msg.value);
        if (root == bytes32(0)) revert ZeroRoot();

        postings[trancheId] = Posting({
            poster: msg.sender, root: root, fromBlock: fromBlock, toBlock: toBlock, postedAt: uint64(block.timestamp)
        });
        emit RootPosted(trancheId, msg.sender, root, fromBlock, toBlock);
    }

    // ── Challenge ───────────────────────────────────────────────────

    /// @notice Challenge the active posting, staking an equal bond. The posting
    ///         is voided unconditionally; the bonds settle on the case track.
    function challenge(uint8 trancheId) external payable returns (uint256 caseId) {
        if (trancheId >= TRANCHE_COUNT) revert InvalidTranche(trancheId);
        Posting memory p = postings[trancheId];
        if (p.postedAt == 0) revert NoActivePosting(trancheId);
        if (block.timestamp >= uint256(p.postedAt) + challengeWindow) revert ChallengeWindowClosed(trancheId);
        if (msg.value != bond) revert WrongBond(bond, msg.value);

        delete postings[trancheId];
        caseId = bondCases.length;
        bondCases.push(
            BondCase({
                poster: p.poster, challenger: msg.sender, challengedAt: uint64(block.timestamp), status: CaseStatus.Open
            })
        );
        emit RootChallenged(trancheId, caseId, msg.sender, p.root);
    }

    // ── Bond-case track ─────────────────────────────────────────────

    /// @notice Escalate a challenge to the composed forum. Poster-only, within
    ///         the dispute window; `msg.value` carries the forum's fee.
    function disputeChallenge(uint256 caseId) external payable {
        BondCase storage c = _requireCase(caseId);
        if (c.status != CaseStatus.Open) revert CaseNotOpen(caseId);
        if (msg.sender != c.poster) revert NotPoster(caseId);
        if (block.timestamp >= uint256(c.challengedAt) + disputeWindow) revert DisputeWindowClosed(caseId);

        c.status = CaseStatus.Disputed;
        arbitrator.createDispute{value: msg.value}(caseId);
        emit ChallengeDisputed(caseId, msg.value);
    }

    /// @notice Close an unescalated challenge after the dispute window: the
    ///         poster conceded, the challenger takes both bonds. Anyone may call.
    function concede(uint256 caseId) external {
        BondCase storage c = _requireCase(caseId);
        if (c.status != CaseStatus.Open) revert CaseNotOpen(caseId);
        if (block.timestamp < uint256(c.challengedAt) + disputeWindow) revert DisputeWindowOpen(caseId);

        c.status = CaseStatus.Closed;
        withdrawable[c.challenger] += 2 * bond;
        emit ChallengeConceded(caseId);
    }

    /// @notice Forum callback routing the bonds. The forum decides money only —
    ///         never whether a mint happens.
    function rule(uint256 caseId, uint8 ruling) external {
        if (msg.sender != address(arbitrator)) revert NotArbitrator();
        BondCase storage c = _requireCase(caseId);
        if (c.status != CaseStatus.Disputed) revert CaseNotDisputed(caseId);

        c.status = CaseStatus.Closed;
        if (ruling == RULING_POSTER) {
            withdrawable[c.poster] += 2 * bond;
        } else if (ruling == RULING_CHALLENGER) {
            withdrawable[c.challenger] += 2 * bond;
        } else if (ruling == RULING_REFUSED) {
            withdrawable[c.poster] += bond;
            withdrawable[c.challenger] += bond;
        } else {
            revert InvalidRuling(ruling);
        }
        emit CaseRuled(caseId, ruling);
    }

    /// @notice Withdraw returned or won bonds (pull-payment).
    function withdrawBonds() external {
        uint256 amount = withdrawable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        withdrawable[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit BondsWithdrawn(msg.sender, amount);
    }

    // ── Finalize ────────────────────────────────────────────────────

    /// @notice Finalize a posting that survived its full challenge window.
    ///         Anyone may call; the poster's bond returns via pull-payment.
    function finalize(uint8 trancheId) external {
        if (trancheId >= TRANCHE_COUNT) revert InvalidTranche(trancheId);
        Tranche storage t = tranches[trancheId];
        if (t.finalized) revert TrancheFinalized(trancheId);
        Posting memory p = postings[trancheId];
        if (p.postedAt == 0) revert NoActivePosting(trancheId);
        if (block.timestamp < uint256(p.postedAt) + challengeWindow) revert ChallengeWindowOpen(trancheId);

        delete postings[trancheId];
        t.root = p.root;
        t.fromBlock = p.fromBlock;
        t.toBlock = p.toBlock;
        t.finalized = true;
        withdrawable[p.poster] += bond;
        emit TrancheFinalizedRoot(trancheId, p.root, p.fromBlock, p.toBlock);
    }

    // ── Claim ───────────────────────────────────────────────────────

    /// @notice Mint `account`'s allocation from a finalized tranche. Callable
    ///         by anyone on the account's behalf; the mint always goes to
    ///         `account`. Leaves are OpenZeppelin standard-tree shaped:
    ///         `keccak256(bytes.concat(keccak256(abi.encode(account, amount))))`.
    function claim(uint8 trancheId, address account, uint256 amount, bytes32[] calldata proof) external {
        if (trancheId >= TRANCHE_COUNT) revert InvalidTranche(trancheId);
        Tranche storage t = tranches[trancheId];
        if (!t.finalized) revert TrancheNotFinalized(trancheId);
        if (claimed[trancheId][account]) revert AlreadyClaimed(trancheId, account);

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(account, amount))));
        if (!MerkleProof.verify(proof, t.root, leaf)) revert InvalidProof();
        if (t.minted + amount > t.amount) revert TrancheBudgetExceeded(trancheId);

        claimed[trancheId][account] = true;
        t.minted += amount;
        florin.mint(account, amount);
        emit Claimed(trancheId, account, amount);
    }

    // ── Internal ────────────────────────────────────────────────────

    function _requireCase(uint256 caseId) internal view returns (BondCase storage) {
        if (caseId >= bondCases.length) revert InvalidCase(caseId);
        return bondCases[caseId];
    }
}
