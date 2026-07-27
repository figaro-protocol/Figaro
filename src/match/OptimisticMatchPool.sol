// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IRpgfArbitrator} from "src/rpgf/IRpgfArbitrator.sol";

/// @title OptimisticMatchPool — one crowd-steered match round, optimistically settled
/// @notice The RpgfMinter shape minus minting: a deterministic, ANCHORED match
///         formula (`formulaHash` — the exact spec bytes; QF with its sybil
///         mitigations is one such spec, the contract is formula-agnostic)
///         runs over the public `DonationRail` event stream for this round's
///         donation token and window. Anyone recomputes the match allocation
///         and posts its merkle root under an ETH bond; a challenge ALWAYS
///         voids the posting (payout stays purely mechanical — only a root
///         surviving its full unchallenged window finalizes); bond cases
///         settle on their own track via the composed IRpgfArbitrator seam
///         (the same forum seam, mock, adapter, and dispute surface the
///         minter uses). Finalization snapshots the pool's balance as the
///         round budget; merkle claims transfer the match token out.
///
///         One contract instance IS one round — a transaction-scoped
///         institution: anyone deploys one, anyone funds it (ordinary
///         transfers in; the DAO treasury is one funder among all), and it
///         dissolves into claims. No owner, no pause, no sweep, no claim
///         expiry: overfunding beyond the finalized budget stays, by the
///         same no-escape-hatch doctrine as everywhere else — fund exactly.
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any
///      kind, express or implied. No liability is accepted for loss, damages,
///      or bugs. Use at your own risk.
contract OptimisticMatchPool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Round config (one instance = one round) ─────────────────────

    /// @notice The token the match pays out in.
    IERC20 public immutable matchToken;
    /// @notice The one token this round's formula counts donations in
    ///         (single-token rounds keep the formula deterministic — no
    ///         oracle, no FX).
    address public immutable donationToken;
    /// @notice The DonationRail whose events are this round's input record.
    address public immutable donationRail;
    /// @notice keccak256 of the canonical match-formula spec bytes.
    bytes32 public immutable formulaHash;
    /// @notice The composed bond-settlement forum (config, never code).
    IRpgfArbitrator public immutable arbitrator;
    /// @notice ETH stake for posting and for challenging.
    uint256 public immutable bond;
    uint64 public immutable challengeWindow;
    uint64 public immutable disputeWindow;
    /// @notice The donation window the formula counts (timestamps; the spec
    ///         defines the canonical event filter — a wrong window is a wrong
    ///         root, and challengeable as such).
    uint64 public immutable donationStart;
    uint64 public immutable donationEnd;

    // ── Optimistic state (the minter's shape, single-round) ─────────

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

    uint8 public constant RULING_REFUSED = 0; // bonds return to their owners
    uint8 public constant RULING_POSTER = 1; // poster takes both bonds
    uint8 public constant RULING_CHALLENGER = 2; // challenger takes both bonds

    Posting public posting;
    BondCase[] public bondCases;

    bytes32 public finalRoot;
    uint64 public finalFromBlock;
    uint64 public finalToBlock;
    bool public finalized;
    /// @notice The round budget: the pool's match-token balance at
    ///         finalization. Claims never exceed it.
    uint256 public budget;
    uint256 public claimedTotal;

    mapping(address => bool) public claimed;
    /// @notice Pull-payment balances for returned/won bonds.
    mapping(address => uint256) public withdrawable;

    // ── Errors ──────────────────────────────────────────────────────

    error ZeroAddress();
    error ZeroBond();
    error ZeroWindow();
    error DonationWindowInverted();
    error DonationWindowOpen();
    error RoundFinalized();
    error RoundNotFinalized();
    error PostingActive();
    error NoActivePosting();
    error WrongBond(uint256 expected, uint256 provided);
    error ZeroRoot();
    error ChallengeWindowClosed();
    error ChallengeWindowStillOpen();
    error InvalidCase(uint256 caseId);
    error CaseNotOpen(uint256 caseId);
    error CaseNotDisputed(uint256 caseId);
    error NotPoster(uint256 caseId);
    error NotArbitrator();
    error DisputeWindowClosed(uint256 caseId);
    error DisputeWindowStillOpen(uint256 caseId);
    error InvalidRuling(uint8 ruling);
    error AlreadyClaimed(address account);
    error InvalidProof();
    error BudgetExceeded();
    error NothingToWithdraw();
    error WithdrawFailed();

    // ── Events (the minter's names, single-round shapes) ────────────

    event RootPosted(address indexed poster, bytes32 root, uint64 fromBlock, uint64 toBlock);
    event RootChallenged(uint256 indexed caseId, address indexed challenger, bytes32 root);
    event ChallengeDisputed(uint256 indexed caseId, uint256 fee);
    event ChallengeConceded(uint256 indexed caseId);
    event CaseRuled(uint256 indexed caseId, uint8 ruling);
    event MatchFinalized(bytes32 root, uint64 fromBlock, uint64 toBlock, uint256 budget);
    event Claimed(address indexed account, uint256 amount);
    event BondsWithdrawn(address indexed account, uint256 amount);

    constructor(
        address _matchToken,
        address _donationToken,
        address _donationRail,
        bytes32 _formulaHash,
        address _arbitrator,
        uint256 _bond,
        uint64 _challengeWindow,
        uint64 _disputeWindow,
        uint64 _donationStart,
        uint64 _donationEnd
    ) {
        if (
            _matchToken == address(0) || _donationToken == address(0) || _donationRail == address(0)
                || _arbitrator == address(0)
        ) {
            revert ZeroAddress();
        }
        if (_bond == 0) revert ZeroBond();
        if (_challengeWindow == 0 || _disputeWindow == 0) revert ZeroWindow();
        if (_donationEnd <= _donationStart) revert DonationWindowInverted();
        matchToken = IERC20(_matchToken);
        donationToken = _donationToken;
        donationRail = _donationRail;
        formulaHash = _formulaHash;
        arbitrator = IRpgfArbitrator(_arbitrator);
        bond = _bond;
        challengeWindow = _challengeWindow;
        disputeWindow = _disputeWindow;
        donationStart = _donationStart;
        donationEnd = _donationEnd;
    }

    // ── Post ────────────────────────────────────────────────────────

    /// @notice Post the round's match root, staking the bond. Only after the
    ///         donation window closes; `[fromBlock, toBlock]` records the
    ///         recompute input window.
    function postRoot(bytes32 root, uint64 fromBlock, uint64 toBlock) external payable {
        if (block.timestamp < donationEnd) revert DonationWindowOpen();
        if (finalized) revert RoundFinalized();
        if (posting.postedAt != 0) revert PostingActive();
        if (msg.value != bond) revert WrongBond(bond, msg.value);
        if (root == bytes32(0)) revert ZeroRoot();

        posting = Posting({
            poster: msg.sender, root: root, fromBlock: fromBlock, toBlock: toBlock, postedAt: uint64(block.timestamp)
        });
        emit RootPosted(msg.sender, root, fromBlock, toBlock);
    }

    // ── Challenge ───────────────────────────────────────────────────

    /// @notice Challenge the active posting, staking an equal bond. The
    ///         posting is voided unconditionally; the bonds settle on the
    ///         case track.
    function challenge() external payable returns (uint256 caseId) {
        Posting memory p = posting;
        if (p.postedAt == 0) revert NoActivePosting();
        if (block.timestamp >= uint256(p.postedAt) + challengeWindow) revert ChallengeWindowClosed();
        if (msg.value != bond) revert WrongBond(bond, msg.value);

        delete posting;
        caseId = bondCases.length;
        bondCases.push(
            BondCase({
                poster: p.poster, challenger: msg.sender, challengedAt: uint64(block.timestamp), status: CaseStatus.Open
            })
        );
        emit RootChallenged(caseId, msg.sender, p.root);
    }

    // ── Bond-case track (identical to the minter's) ─────────────────

    /// @notice Escalate a challenge to the composed forum. Poster-only,
    ///         within the dispute window; `msg.value` carries the forum fee.
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
        if (block.timestamp < uint256(c.challengedAt) + disputeWindow) revert DisputeWindowStillOpen(caseId);

        c.status = CaseStatus.Closed;
        withdrawable[c.challenger] += 2 * bond;
        emit ChallengeConceded(caseId);
    }

    /// @notice Forum callback routing the bonds. The forum decides money only
    ///         — never whether the match pays.
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
    function withdrawBonds() external nonReentrant {
        uint256 amount = withdrawable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        withdrawable[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit BondsWithdrawn(msg.sender, amount);
    }

    // ── Finalize ────────────────────────────────────────────────────

    /// @notice Finalize a posting that survived its full challenge window;
    ///         snapshots the pool's balance as the round budget. Anyone may
    ///         call; the poster's bond returns via pull-payment.
    function finalize() external {
        if (finalized) revert RoundFinalized();
        Posting memory p = posting;
        if (p.postedAt == 0) revert NoActivePosting();
        if (block.timestamp < uint256(p.postedAt) + challengeWindow) revert ChallengeWindowStillOpen();

        delete posting;
        finalRoot = p.root;
        finalFromBlock = p.fromBlock;
        finalToBlock = p.toBlock;
        finalized = true;
        budget = matchToken.balanceOf(address(this));
        withdrawable[p.poster] += bond;
        emit MatchFinalized(p.root, p.fromBlock, p.toBlock, budget);
    }

    // ── Claim ───────────────────────────────────────────────────────

    /// @notice Transfer `account`'s match from the finalized round. Callable
    ///         by anyone on the account's behalf; the match always goes to
    ///         `account`. Leaves are OpenZeppelin standard-tree shaped:
    ///         `keccak256(bytes.concat(keccak256(abi.encode(account, amount))))`.
    function claim(address account, uint256 amount, bytes32[] calldata proof) external nonReentrant {
        if (!finalized) revert RoundNotFinalized();
        if (claimed[account]) revert AlreadyClaimed(account);

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(account, amount))));
        if (!MerkleProof.verify(proof, finalRoot, leaf)) revert InvalidProof();
        if (claimedTotal + amount > budget) revert BudgetExceeded();

        claimed[account] = true;
        claimedTotal += amount;
        matchToken.safeTransfer(account, amount);
        emit Claimed(account, amount);
    }

    // ── Internal ────────────────────────────────────────────────────

    function _requireCase(uint256 caseId) internal view returns (BondCase storage) {
        if (caseId >= bondCases.length) revert InvalidCase(caseId);
        return bondCases[caseId];
    }
}
