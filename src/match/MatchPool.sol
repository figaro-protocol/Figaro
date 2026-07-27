// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MatchPool — one crowd-steered funding round
/// @custom:security-contact figarosecurity@gmail.com
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
///
/// @notice A **Gitcoin-modelled** matching round. A crowd donates in whatever
///         token it holds; a separately-funded pool is then split across those
///         same recipients by quadratic funding — breadth of independent support,
///         not size of cheque. Gitcoin/Allo is the MODEL, never a dependency:
///         Allo is unmaintained, so the mechanism is implemented here.
///
///         One contract instance IS one round — a transaction-scoped institution.
///         Anyone deploys one, anyone funds it (the DAO treasury is one funder
///         among all), and it dissolves into claims.
///
/// @notice THIS CONTRACT IS ITS OWN DONATION RAIL, and that is what removes the
///         posting apparatus. Donations pass straight through to the recipient —
///         nothing is ever held on their behalf — while the round accumulates the
///         quadratic-funding sums AS EACH DONATION LANDS. The match is then
///         arithmetic over numbers the chain already has. The previous design
///         replayed a separate rail's event log after the fact, which no contract
///         can do, so the answer had to be POSTED under a BOND, CHALLENGED, and
///         settled by a FORUM. Count when it happens and none of that is needed:
///         no root, no bond, no challenge window, no referee.
///
/// @dev    QUADRATIC FUNDING, MAINTAINED IN O(1). A recipient's weight is the
///         coordination surplus `sumSqrt^2 - sumOf`, so many small independent
///         donors outweigh one large one. Both the per-recipient sums and the
///         running `totalWeight` update on every donation, so `claim` is a
///         division rather than a sweep over donors.
///
/// @dev    SURPLUS FORM IS THE SYBIL FLOOR — and it only holds because the roots
///         are taken PER DONOR (see `donatedBy`). A recipient funded by one donor
///         scores `sqrt(a)^2 - a`, zero up to integer truncation, no matter how
///         many transactions that donor splits it across. So the cheapest sybil
///         shape — a donor funding their own recipient, which is free here
///         because donations pass straight through — earns nothing. A donation
///         floor makes each counted donor real capital rather than a free vote,
///         and direct self-donation is refused outright.
///
/// @dev    No owner, no pause, no sweep, no claim expiry. Overfunding beyond the
///         finalized budget stays put, by the same no-escape-hatch doctrine as
///         everywhere else — fund exactly.
///
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any kind, express or implied. No liability is accepted for loss, damages, or bugs. Use at your own risk.
contract MatchPool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Round config (one instance = one round) ─────────────────────

    /// @notice The token the match pays out in.
    IERC20 public immutable matchToken;

    /// @notice The one token this round counts donations in. Single-token rounds
    ///         keep the arithmetic deterministic — no oracle, no FX. A round in
    ///         another currency is another round.
    IERC20 public immutable donationToken;

    /// @notice Donation window (unix seconds). Donations outside it are refused
    ///         rather than silently uncounted.
    uint64 public immutable donationStart;
    uint64 public immutable donationEnd;

    /// @notice Minimum donation that counts.
    uint256 public immutable donationFloor;

    /// @notice Per-recipient ceiling on the match, as a fraction of the budget.
    uint256 public constant CAP_NUMERATOR = 15;
    uint256 public constant CAP_DENOMINATOR = 100;

    // ── Accrual (maintained as donations land) ──────────────────────

    struct Recipient {
        /// @dev Sum of the integer square roots of this recipient's donations.
        uint256 sumSqrt;
        /// @dev Sum of the donations themselves — the surplus-form subtrahend.
        uint256 sumOf;
        /// @dev Distinct donating wallets. For readers; not a formula term.
        uint64 donors;
        bool claimed;
    }

    mapping(address => Recipient) public recipientOf;

    /// @notice recipient => donor => that donor's TOTAL to this recipient.
    /// @dev    Load-bearing for the sybil floor, not bookkeeping. `sumSqrt` must
    ///         be the sum of square roots PER DONOR, not per donation: taking the
    ///         root per call would let one wallet split a cheque into n parts and
    ///         manufacture surplus out of nothing (`n·sqrt(a/n)² > a`). Keeping
    ///         each donor's running total lets `donate` correct `sumSqrt` in O(1)
    ///         — remove the donor's old root, add their new one — so splitting is
    ///         exactly neutral and a lone donor still scores zero.
    mapping(address => mapping(address => uint256)) public donatedBy;

    /// @notice Summed matched weight across all recipients — the claim divisor.
    uint256 public totalWeight;

    /// @notice Match budget, snapshotted at finalize.
    uint256 public budget;
    /// @notice Whether the round is closed and the budget fixed.
    bool public finalized;
    /// @notice Match already paid out.
    uint256 public paid;

    // ── Events ──────────────────────────────────────────────────────

    event Donation(address indexed donor, address indexed recipient, uint256 amount, uint256 weightAfter);
    event Finalized(uint256 budget, uint256 totalWeight);
    event MatchClaimed(address indexed recipient, uint256 amount, uint256 weight);

    // ── Errors ──────────────────────────────────────────────────────

    error ZeroAddress();
    error BadWindow();
    error DonationsNotOpen();
    error DonationsStillOpen();
    error BelowFloor(uint256 amount, uint256 floor);
    error SelfDonation();
    error AmountMismatch(uint256 expected, uint256 received);
    error AlreadyFinalized();
    error NotFinalized();
    error NothingToClaim();
    error AlreadyClaimed();
    error BudgetExceeded();

    // ── Constructor ─────────────────────────────────────────────────

    constructor(
        address _matchToken,
        address _donationToken,
        uint64 _donationStart,
        uint64 _donationEnd,
        uint256 _donationFloor
    ) {
        if (_matchToken == address(0) || _donationToken == address(0)) revert ZeroAddress();
        if (_donationEnd <= _donationStart) revert BadWindow();
        matchToken = IERC20(_matchToken);
        donationToken = IERC20(_donationToken);
        donationStart = _donationStart;
        donationEnd = _donationEnd;
        donationFloor = _donationFloor;
    }

    // ── Donating (this contract IS the rail) ────────────────────────

    /// @notice Donate to a recipient. The tokens go STRAIGHT THROUGH to them —
    ///         this contract never holds a donation — and the round records the
    ///         quadratic-funding weight the donation earns.
    /// @dev    Strict-amount check: a fee-on-transfer donation token reverts
    ///         rather than silently under-crediting. Same house rule as the
    ///         standalone rail this replaces.
    function donate(address recipient, uint256 amount) external nonReentrant {
        if (recipient == address(0)) revert ZeroAddress();
        if (block.timestamp < donationStart || block.timestamp >= donationEnd) revert DonationsNotOpen();
        if (amount < donationFloor) revert BelowFloor(amount, donationFloor);
        if (recipient == msg.sender) revert SelfDonation();

        uint256 before = donationToken.balanceOf(recipient);
        donationToken.safeTransferFrom(msg.sender, recipient, amount);
        uint256 received = donationToken.balanceOf(recipient) - before;
        if (received != amount) revert AmountMismatch(amount, received);

        Recipient storage r = recipientOf[recipient];
        uint256 previousWeight = _weight(r);

        // Per-DONOR roots: swap this donor's old root for their new one, so a
        // split cheque is exactly neutral and cannot conjure surplus.
        uint256 wasFromDonor = donatedBy[recipient][msg.sender];
        uint256 nowFromDonor = wasFromDonor + amount;
        donatedBy[recipient][msg.sender] = nowFromDonor;

        r.sumSqrt = r.sumSqrt - sqrt(wasFromDonor) + sqrt(nowFromDonor);
        r.sumOf += amount;
        if (wasFromDonor == 0) {
            unchecked {
                r.donors += 1;
            }
        }

        uint256 updatedWeight = _weight(r);
        totalWeight = totalWeight + updatedWeight - previousWeight;

        emit Donation(msg.sender, recipient, amount, updatedWeight);
    }

    // ── Finalize ────────────────────────────────────────────────────

    /// @notice Close the round and snapshot whatever has been contributed to the
    ///         pool as the match budget. Permissionless, once the donation window
    ///         has ended — there is no privileged closer.
    function finalize() external {
        if (block.timestamp < donationEnd) revert DonationsStillOpen();
        if (finalized) revert AlreadyFinalized();
        finalized = true;
        budget = matchToken.balanceOf(address(this));
        emit Finalized(budget, totalWeight);
    }

    // ── Claim ───────────────────────────────────────────────────────

    /// @notice Claim a recipient's match. Anyone may call on their behalf; the
    ///         tokens always go to the recipient.
    function claim(address recipient) external nonReentrant {
        if (!finalized) revert NotFinalized();
        Recipient storage r = recipientOf[recipient];
        if (r.claimed) revert AlreadyClaimed();

        uint256 amount = matchOf(recipient);
        if (amount == 0) revert NothingToClaim();

        uint256 spent = paid + amount;
        if (spent > budget) revert BudgetExceeded();

        r.claimed = true;
        paid = spent;

        emit MatchClaimed(recipient, amount, _weight(r));
        matchToken.safeTransfer(recipient, amount);
    }

    // ── Views ───────────────────────────────────────────────────────

    /// @notice A recipient's match: `budget * weight / totalWeight`, capped.
    function matchOf(address recipient) public view returns (uint256) {
        if (!finalized || totalWeight == 0) return 0;
        Recipient storage r = recipientOf[recipient];
        if (r.claimed) return 0;
        uint256 amount = (budget * _weight(r)) / totalWeight;
        uint256 ceiling = (budget * CAP_NUMERATOR) / CAP_DENOMINATOR;
        return amount > ceiling ? ceiling : amount;
    }

    /// @notice A recipient's matched weight — the coordination surplus.
    function weightOf(address recipient) external view returns (uint256) {
        return _weight(recipientOf[recipient]);
    }

    // ── Internals ───────────────────────────────────────────────────

    function _weight(Recipient storage r) internal view returns (uint256) {
        uint256 squared = r.sumSqrt * r.sumSqrt;
        return squared > r.sumOf ? squared - r.sumOf : 0;
    }

    /// @notice Floor integer square root (Babylonian). Deterministic; the
    ///         off-chain recompute mirrors it exactly.
    function sqrt(uint256 n) public pure returns (uint256) {
        if (n == 0) return 0;
        uint256 x = n;
        uint256 y = (x + 1) >> 1;
        while (y < x) {
            x = y;
            y = (x + n / x) >> 1;
        }
        return x;
    }
}
