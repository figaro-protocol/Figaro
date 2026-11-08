// SPDX-License-Identifier: MIT
// Certora CVL — the token movements of FigaroBatchVerifier's batch resolution.
//
// What is proved, and on what. `settleBatch` moves tokens in one step:
// `_executePositions`, which reconciles the batch's net positions in two passes
// over the guest's order, every pull before any payout. These rules run that
// step alone, through `certora/harness/FigaroBatchVerifierHarness.sol`'s
// `executePositions`, on two positions of any tokens and any users. The rest of
// `settleBatch` (the proof, the public values, the hash checks, the registry
// anchor, the operation stream, the counter call) moves no token; Foundry holds
// that `settleBatch` executes exactly the positions the proof committed
// (`PositionHashMismatch`), and the equivalence run under VERIFICATION_MAP E-13
// holds it against `FigaroCore`. A rule over all of `settleBatch` processed no
// rule within the prover's global timeout, so the step is proved where it is.
//
// The rules, for every two positions:
//   1. each position's user moves by exactly its payout minus its deposit;
//   2. the verifier moves, per token, by exactly the positions' deposits minus
//      their payouts in that token;
//   3. no other balance moves;
//   4. no payout waits on a pull: when the verifier's holding of a token plus
//      the batch's pulls in it cover the batch's payouts in it, and each payer
//      holds its net deposit, no transfer asks a holder for more than it holds
//      (the property the second pass exists for; one pass in the guest's order
//      fails it with the payee listed first and the verifier holding nothing).
//
// The token model: one ghost balance per (token, holder). `safeTransfer` and
// `safeTransferFrom` move it; `balanceOf` reads it, so `_pullExact`'s
// fee-on-transfer check runs against it. A transfer its holder cannot cover
// moves nothing and sets `shortfall` — a real token reverts there — so rules
// 1–3 hold on every call that resolves without a shortfall, and rule 4 proves
// the shortfall unreachable under its precondition.
//
// More than two positions. Each pass is a loop whose body moves one position's
// tokens and nothing else. Rules 1–3 are sums of per-position moves, so a third
// position adds its own term and touches no other's. Rule 4's only
// order-dependence is a payout before a pull in the same token; two positions,
// one of each in either order and in one token or two, are the cases a longer
// list is built from. The rules state two; the argument extends them.

ghost mapping(address => mapping(address => mathint)) bal;
persistent ghost bool shortfall;

methods {
    function SafeERC20.safeTransfer(address token, address to, uint256 value) internal
        => move(token, currentContract, to, value);
    function SafeERC20.safeTransferFrom(address token, address from, address to, uint256 value) internal
        => move(token, from, to, value);
    function _.balanceOf(address a) external => balanceIn(calledContract, a) expect (uint256);
}

function move(address token, address from, address to, uint256 value) {
    if (bal[token][from] < to_mathint(value)) {
        shortfall = true;
    } else {
        bal[token][from] = bal[token][from] - to_mathint(value);
        bal[token][to] = bal[token][to] + to_mathint(value);
    }
}

function balanceIn(address token, address a) returns uint256 {
    require bal[token][a] >= 0 && bal[token][a] <= max_uint256;
    return assert_uint256(bal[token][a]);
}

// ═══════════════════════════════════════════════════════════════════
// Preconditions
// ═══════════════════════════════════════════════════════════════════

definition MAX_VALUE() returns uint256 = 2^200;

/// Two positions, each on a user that is neither zero nor the verifier, no two
/// on the same (token, user) — the guest nets one position per pair.
function twoPositions(FigaroBatchVerifier.NetPosition[] positions) {
    require positions.length == 2;
    require positions[0].user != currentContract && positions[1].user != currentContract;
    require positions[0].user != 0 && positions[1].user != 0;
    require positions[0].user != positions[1].user || positions[0].token != positions[1].token;
    require positions[0].deposit < MAX_VALUE() && positions[0].payout < MAX_VALUE();
    require positions[1].deposit < MAX_VALUE() && positions[1].payout < MAX_VALUE();
    require bal[positions[0].token][currentContract] < to_mathint(MAX_VALUE());
    require bal[positions[1].token][currentContract] < to_mathint(MAX_VALUE());
}

/// What the batch's positions pull from their users in `token`, and pay out.
function pulledIn(FigaroBatchVerifier.NetPosition[] positions, address token) returns mathint {
    mathint sum = 0;
    if (positions[0].token == token && positions[0].deposit > positions[0].payout) {
        sum = sum + positions[0].deposit - positions[0].payout;
    }
    if (positions[1].token == token && positions[1].deposit > positions[1].payout) {
        sum = sum + positions[1].deposit - positions[1].payout;
    }
    return sum;
}

function paidIn(FigaroBatchVerifier.NetPosition[] positions, address token) returns mathint {
    mathint sum = 0;
    if (positions[0].token == token && positions[0].payout > positions[0].deposit) {
        sum = sum + positions[0].payout - positions[0].deposit;
    }
    if (positions[1].token == token && positions[1].payout > positions[1].deposit) {
        sum = sum + positions[1].payout - positions[1].deposit;
    }
    return sum;
}

// ═══════════════════════════════════════════════════════════════════
// RULE 1: Each user moves by its payout minus its deposit
// ═══════════════════════════════════════════════════════════════════

rule eachUserMovesByItsNetPosition(FigaroBatchVerifier.NetPosition[] positions) {
    twoPositions(positions);
    require !shortfall;
    env e;
    mathint before0 = bal[positions[0].token][positions[0].user];
    mathint before1 = bal[positions[1].token][positions[1].user];

    executePositions@withrevert(e, positions);
    bool resolved = !lastReverted && !shortfall;

    assert resolved => bal[positions[0].token][positions[0].user] - before0
        == positions[0].payout - positions[0].deposit,
        "the first position's user moves by its payout minus its deposit";
    assert resolved => bal[positions[1].token][positions[1].user] - before1
        == positions[1].payout - positions[1].deposit,
        "the second position's user moves by its payout minus its deposit";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 2: The verifier moves, per token, by deposits minus payouts
// ═══════════════════════════════════════════════════════════════════

rule verifierMovesByTheBatchNetInEachToken(FigaroBatchVerifier.NetPosition[] positions, address token) {
    twoPositions(positions);
    require !shortfall;
    env e;
    mathint before = bal[token][currentContract];

    executePositions@withrevert(e, positions);
    bool resolved = !lastReverted && !shortfall;

    assert resolved => bal[token][currentContract] - before
        == pulledIn(positions, token) - paidIn(positions, token),
        "the verifier's holding of a token moves by the batch's pulls minus its payouts in it";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 3: No other balance moves
// ═══════════════════════════════════════════════════════════════════

rule noOtherBalanceMoves(FigaroBatchVerifier.NetPosition[] positions, address token, address holder) {
    twoPositions(positions);
    require !shortfall;
    require holder != currentContract;
    require holder != positions[0].user || token != positions[0].token;
    require holder != positions[1].user || token != positions[1].token;
    env e;
    mathint before = bal[token][holder];

    executePositions@withrevert(e, positions);
    bool resolved = !lastReverted && !shortfall;

    assert resolved => bal[token][holder] == before,
        "no balance outside the positions' users and the verifier moves";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 4: No payout waits on a pull
// ═══════════════════════════════════════════════════════════════════

rule noPayoutWaitsOnAPull(FigaroBatchVerifier.NetPosition[] positions) {
    twoPositions(positions);
    require !shortfall;
    address t0 = positions[0].token;
    address t1 = positions[1].token;
    require bal[t0][currentContract] + pulledIn(positions, t0) >= paidIn(positions, t0);
    require bal[t1][currentContract] + pulledIn(positions, t1) >= paidIn(positions, t1);
    require positions[0].deposit > positions[0].payout
        => bal[t0][positions[0].user] >= positions[0].deposit - positions[0].payout;
    require positions[1].deposit > positions[1].payout
        => bal[t1][positions[1].user] >= positions[1].deposit - positions[1].payout;
    env e;

    executePositions@withrevert(e, positions);

    assert !shortfall,
        "a payout never asks the verifier for more than it holds once the batch's pulls are in";
}
