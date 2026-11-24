// SPDX-License-Identifier: MIT
// Certora CVL — the sums FigaroCore keeps, for every state any sequence of
// calls reaches.
//
// What is proven here, and over what:
//
//   1. The running total is the sum of the payments.
//      `commitAddsItsPaymentToTheRunningTotal`: a successful commit to a
//      process raises its running total by exactly the commitment's payment,
//      leaves it equal to the signed `runningTotal`, and raises its count of
//      open orders by one. `commitTouchesNoOtherProcess` and
//      `onlyACommitMovesARunningTotal`: nothing else moves a running total.
//      With `anUnknownProcessIsEmpty` (a process not yet created holds a zero
//      running total), these give, by induction over any sequence of calls,
//      that a process's running total is the sum of the payments of the
//      orders committed to it. The induction is over calls, so the rule
//      form is the invariant: no step is left to a reading of the code.
//
//   2. The open-order count (A-5). A ghost counts the order hashes whose
//      status is 1 (`committedOrders`), and a ghost per process counts the
//      status writes made by a call that addresses that process (`countOf`).
//      Which process a call addresses is read from the storage access itself:
//      both `commit` and `resolveProcess` read `processes[pid].rootBuyer`
//      before any write to `orderStatus`, and an Sload hook records that
//      `pid`. `activeCountIsItsCommittedOrders(p)` proves
//      `countOf[p] == processes[p].activeOrderCount` for every p;
//      `theCountsSumToTheCommittedOrders` proves `Σ countOf == committedOrders`
//      (the two ghosts move together in one hook). Summed over p, the two
//      give the total form: Σ_p activeOrderCount(p) equals the number of
//      order hashes at status 1, whatever the attribution. The per-process
//      reading (count of p == orders of p at status 1) also needs that every
//      status write in a call addressing p is to keccak256(p, ·): the code
//      does that, and the injective hash ties the hash to p; this spec does
//      not state it as an invariant (property 3's `orderHashOf` method could),
//      so here that step is a reading, not a proof.
//
//   4. Payouts and conservation for a process of several orders
//      (`resolvePaysEachAccountItsShare`), ghost token model below.
//
//   5. A resolution names every open order once
//      (`aResolutionNamesEveryOpenOrderOnce`).
//
//   3. Exact holding. For every token t, the Core's balance in t equals the
//      bonds of the open orders whose process uses t
//      (`theCoreHoldsExactlyTheOpenBonds`). Ghosts:
//        - `bondOf[h]`: the amount pulled into the Core for order hash h. The
//          hook on the store of status 1 sets `lastCommitted = h`; `commit`
//          writes the status before its two pulls, and the pull summary adds
//          each amount to `bondOf[lastCommitted]`. The hook on the store of
//          status 2 zeroes `bondOf[h]`, so `bondOf` is non-zero only for an
//          open order (chosen so the sum below needs no status filter).
//        - `held[t]`: pulls into the Core in t minus payouts from it in t.
//        - `openSum[t]`: the sum of `bondOf[h]` over the orders whose bonds
//          were pulled in t, kept by the same summary and hook that move
//          `bondOf`, so it is Σ bondOf over the open orders in t by
//          construction (the usual Certora form of a sum over an unbounded set).
//      `anOpenOrderHoldsItsBonds(pid, c)` carries the link, quantified over
//      the preimage: for every process id and every commitment, if the order
//      hash `orderHashOf(pid, c)` (the harness's view, the contract's own
//      computation) is at status 1, its `bondOf` is 2 * payment +
//      2 * runningTotal, its pulls were in its process's token, its process
//      exists, and its seller is not the Core; otherwise its `bondOf` is 0.
//      Under `commit(c')` the prover's keccak256 model is injective: equal
//      order hashes give the same process id and the same fields. That is the
//      one assumption, and it is the prover's standard hashing model.
//      `theCoreHoldsExactlyTheOpenBonds(t)`: balance(t, Core) == held[t] ==
//      openSum[t]. Its preservation through `resolveProcess(pid, cs)` uses
//      `anOpenOrderHoldsItsBonds(pid, cs[i])` for each listed index (written
//      out to six) and `aBuyerIsNeverTheCore(pid)`. Solvency (the balance is
//      at least the open bonds) is the equality's weaker half.
//      Bounded: only the preservation through `resolveProcess`, by the loop.
//
// Bounds. `commit` has no loop: every assertion about a commit holds for
// every input. `resolveProcess` loops over its list; under `optimistic_loop`
// a path whose list is longer than `loop_iter` is pruned, so every rule that
// calls `resolveProcess`, and the preservation of each invariant through it,
// is proven for lists of at most `loop_iter` orders (the conf's value).
//
// Token model: TokenOpsVerification.spec's, keyed by token. SafeERC20's two
// helpers are summarized to move a ghost balance per (token, account), and
// `balanceOf` reads the ghost of the token called, so a transfer
// delivers exactly its amount (a standard ERC-20). Each summary's `require`
// prunes only a path on which the real token reverts (a balance short of the
// amount), and every assertion below is about a call that did not revert.

methods {
    function orderStatus(bytes32) external returns (uint8) envfree;
    function orderHashOf(bytes32, CommitmentTypes.Commitment) external returns (bytes32) envfree;

    function SafeERC20.safeTransfer(address token, address to, uint256 value) internal
        => summarizeSafeTransfer(token, to, value);
    function SafeERC20.safeTransferFrom(address token, address from, address to, uint256 value) internal
        => summarizeSafeTransferFrom(token, from, to, value);
    function _.balanceOf(address a) external => ghostBalanceOf(calledContract, a) expect (uint256);
}

// ── Token ghosts ─────────────────────────────────────────────────

ghost mapping(address => mapping(address => mathint)) balance {
    init_state axiom forall address t. forall address a. balance[t][a] == 0;
}

ghost mapping(address => mathint) held {
    init_state axiom forall address t. held[t] == 0;
}

ghost mapping(address => mathint) openSum {
    init_state axiom forall address t. openSum[t] == 0;
}

ghost mapping(bytes32 => mathint) bondOf {
    init_state axiom forall bytes32 h. bondOf[h] == 0;
}

ghost mapping(bytes32 => address) tokenOfOrder;

ghost bytes32 lastCommitted;

// A payout: the Core is the sender (SafeERC20.safeTransfer from the Core).
function summarizeSafeTransfer(address token, address to, uint256 value) {
    require balance[token][currentContract] >= to_mathint(value);
    balance[token][currentContract] = balance[token][currentContract] - to_mathint(value);
    balance[token][to] = balance[token][to] + to_mathint(value);
    held[token] = held[token] - to_mathint(value);
}

// A pull: in `commit`, always into the Core, after the order's status store.
function summarizeSafeTransferFrom(address token, address from, address to, uint256 value) {
    require balance[token][from] >= to_mathint(value);
    balance[token][from] = balance[token][from] - to_mathint(value);
    balance[token][to] = balance[token][to] + to_mathint(value);
    if (to == currentContract) {
        held[token] = held[token] + to_mathint(value);
        bondOf[lastCommitted] = bondOf[lastCommitted] + to_mathint(value);
        tokenOfOrder[lastCommitted] = token;
        openSum[token] = openSum[token] + to_mathint(value);
    }
}

function ghostBalanceOf(address token, address a) returns uint256 {
    require balance[token][a] >= 0 && balance[token][a] <= max_uint256;
    return assert_uint256(balance[token][a]);
}

// ── Order-status ghosts ──────────────────────────────────────────

// The process the running call addresses: the key of the last read of
// `processes[·].rootBuyer`.
ghost bytes32 curPid;

// The number of order hashes whose status is 1.
ghost mathint committedOrders {
    init_state axiom committedOrders == 0;
}

// Per process: status-1 entries added minus removed by calls addressing it.
ghost mapping(bytes32 => mathint) countOf {
    init_state axiom forall bytes32 p. countOf[p] == 0;
}

ghost mathint sumOfCounts {
    init_state axiom sumOfCounts == 0;
}

// Within one call: the number of 1 -> 2 writes, and whether any write to 2
// came from a status other than 1.
ghost mathint resolvedInCall;
ghost bool badResolveWrite;

hook Sload address b processes[KEY bytes32 p].rootBuyer {
    curPid = p;
}

hook Sstore orderStatus[KEY bytes32 h] uint8 newV (uint8 oldV) {
    mathint d = (newV == 1 ? 1 : 0) - (oldV == 1 ? 1 : 0);
    committedOrders = committedOrders + d;
    countOf[curPid] = countOf[curPid] + d;
    sumOfCounts = sumOfCounts + d;
    if (newV == 1) {
        lastCommitted = h;
    }
    if (newV == 2 && oldV == 1) {
        openSum[tokenOfOrder[h]] = openSum[tokenOfOrder[h]] - bondOf[h];
        bondOf[h] = 0;
    }
    if (newV == 2) {
        resolvedInCall = resolvedInCall + 1;
        if (oldV != 1) {
            badResolveWrite = true;
        }
    }
}

// ── Reads ────────────────────────────────────────────────────────

definition rootOf(bytes32 p) returns address = currentContract.processes[p].rootBuyer;
definition rtOf(bytes32 p) returns uint256 = currentContract.processes[p].runningTotal;
definition activeOf(bytes32 p) returns uint256 = currentContract.processes[p].activeOrderCount;
definition tokenOf(bytes32 p) returns address = currentContract.processes[p].token;

// ═══════════════════════════════════════════════════════════════════
// Invariants
// ═══════════════════════════════════════════════════════════════════

// A process not yet created holds nothing.
invariant anUnknownProcessIsEmpty(bytes32 p)
    rootOf(p) == 0 => (rtOf(p) == 0 && activeOf(p) == 0)
    filtered { f -> !f.isView }

// A-5, per process: the open-order count equals the status-1 entries the
// calls addressing p have left.
invariant activeCountIsItsCommittedOrders(bytes32 p)
    countOf[p] == to_mathint(activeOf(p))
    filtered { f -> !f.isView }
    {
        preserved {
            requireInvariant anUnknownProcessIsEmpty(p);
        }
    }

// The per-process counts sum to the number of order hashes at status 1.
invariant theCountsSumToTheCommittedOrders()
    sumOfCounts == committedOrders
    filtered { f -> !f.isView }

// ═══════════════════════════════════════════════════════════════════
// Property 3: the Core holds exactly the bonds of the open orders
// ═══════════════════════════════════════════════════════════════════

// No process's buyer is the Core: a commit whose buyer is the Core pulls
// from the Core into itself, the balance does not move, and `_pullExact`
// reverts.
invariant aBuyerIsNeverTheCore(bytes32 p)
    rootOf(p) != currentContract
    filtered { f -> !f.isView }

// The link between an order hash and the commitment it was signed over,
// quantified over every preimage (pid, c).
invariant anOpenOrderHoldsItsBonds(bytes32 pid, CommitmentTypes.Commitment c)
    (orderStatus(orderHashOf(pid, c)) != 1 => bondOf[orderHashOf(pid, c)] == 0)
    && (orderStatus(orderHashOf(pid, c)) == 1 =>
        (bondOf[orderHashOf(pid, c)] == 2 * to_mathint(c.payment) + 2 * to_mathint(c.runningTotal)
            && tokenOfOrder[orderHashOf(pid, c)] == tokenOf(pid)
            && rootOf(pid) != 0
            && c.seller != currentContract))
    filtered { f -> !f.isView }

// For every token: the Core's balance == pulls minus payouts == the sum of
// the open orders' bonds in that token.
invariant theCoreHoldsExactlyTheOpenBonds(address t)
    balance[t][currentContract] == held[t] && held[t] == openSum[t]
    filtered { f -> !f.isView }
    {
        preserved resolveProcess(bytes32 pid, CommitmentTypes.Commitment[] cs) with (env e) {
            requireInvariant aBuyerIsNeverTheCore(pid);
            if (cs.length > 0) { requireInvariant anOpenOrderHoldsItsBonds(pid, cs[0]); }
            if (cs.length > 1) { requireInvariant anOpenOrderHoldsItsBonds(pid, cs[1]); }
            if (cs.length > 2) { requireInvariant anOpenOrderHoldsItsBonds(pid, cs[2]); }
            if (cs.length > 3) { requireInvariant anOpenOrderHoldsItsBonds(pid, cs[3]); }
            if (cs.length > 4) { requireInvariant anOpenOrderHoldsItsBonds(pid, cs[4]); }
            if (cs.length > 5) { requireInvariant anOpenOrderHoldsItsBonds(pid, cs[5]); }
        }
    }

// ═══════════════════════════════════════════════════════════════════
// Property 1: the running total is the sum of the payments
// ═══════════════════════════════════════════════════════════════════

rule commitAddsItsPaymentToTheRunningTotal(bytes32 p) {
    requireInvariant anUnknownProcessIsEmpty(p);

    mathint rtBefore = rtOf(p);
    mathint activeBefore = activeOf(p);

    env e;
    CommitmentTypes.Commitment c;
    bytes buyerSig;
    bytes sellerSig;
    bytes32 pid;
    bytes32 orderHash;
    pid, orderHash = commit(e, c, buyerSig, sellerSig);
    require pid == p;

    assert to_mathint(rtOf(p)) == rtBefore + to_mathint(c.payment),
        "a commit raises its process's running total by exactly its payment";
    assert rtOf(p) == c.runningTotal,
        "after a commit, the running total equals the signed runningTotal";
    assert to_mathint(activeOf(p)) == activeBefore + 1,
        "a commit raises its process's open-order count by one";
}

rule commitTouchesNoOtherProcess(bytes32 q) {
    address rootBefore = rootOf(q);
    address tokenBefore = tokenOf(q);
    uint256 rtBefore = rtOf(q);
    uint256 activeBefore = activeOf(q);

    env e;
    CommitmentTypes.Commitment c;
    bytes buyerSig;
    bytes sellerSig;
    bytes32 pid;
    bytes32 orderHash;
    pid, orderHash = commit(e, c, buyerSig, sellerSig);
    require pid != q;

    assert rootOf(q) == rootBefore && tokenOf(q) == tokenBefore
        && rtOf(q) == rtBefore && activeOf(q) == activeBefore,
        "a commit changes no process but its own";
}

rule onlyACommitMovesARunningTotal(bytes32 q, method f)
    filtered { f -> !f.isView
        && f.selector != sig:commit(CommitmentTypes.Commitment, bytes, bytes).selector }
{
    uint256 rtBefore = rtOf(q);

    env e;
    calldataarg args;
    f(e, args);

    assert rtOf(q) == rtBefore, "no function but commit moves a running total";
}

// ═══════════════════════════════════════════════════════════════════
// Property 5: a resolution names every open order, each once
// ═══════════════════════════════════════════════════════════════════

rule aResolutionNamesEveryOpenOrderOnce(bytes32 pid, CommitmentTypes.Commitment[] cs) {
    requireInvariant anUnknownProcessIsEmpty(pid);
    requireInvariant activeCountIsItsCommittedOrders(pid);

    mathint activeBefore = activeOf(pid);
    require resolvedInCall == 0;
    require !badResolveWrite;

    env e;
    resolveProcess@withrevert(e, pid, cs);
    bool reverted = lastReverted;

    assert !reverted => to_mathint(cs.length) == activeBefore,
        "a resolution's list is as long as the process's open orders";
    assert !reverted => resolvedInCall == activeBefore && !badResolveWrite,
        "a resolution moves exactly that many distinct orders from 1 to 2";
    assert !reverted => activeOf(pid) == 0 && countOf[pid] == 0,
        "after a resolution the process has no open order";
}

// ═══════════════════════════════════════════════════════════════════
// Property 4: payouts and conservation for a process of several orders
// ═══════════════════════════════════════════════════════════════════

// What account `a` gains from the resolution of order `c` of a process whose
// buyer is `buyer`: as seller, its two bonds' worth back plus the payment;
// as buyer, its bond back less the payment; as the Core, minus both bonds.
function shareOf(address a, address buyer, CommitmentTypes.Commitment c) returns mathint {
    mathint asSeller = a == c.seller
        ? 2 * to_mathint(c.runningTotal) + to_mathint(c.payment) : 0;
    mathint asBuyer = a == buyer ? to_mathint(c.payment) : 0;
    mathint asCore = a == currentContract
        ? 0 - 2 * to_mathint(c.runningTotal) - 2 * to_mathint(c.payment) : 0;
    return asSeller + asBuyer + asCore;
}

// Every account, the Core and any seller or buyer among them, moves by
// exactly the sum of its shares over the listed orders: each seller gets
// 2 * runningTotal + payment per order it sold, the buyer its payment per
// order (its bond 2 * payment back, less the payment), and the Core loses
// both bonds per order. Summed over all accounts the shares cancel, so no
// token is created or destroyed. Any repetition of addresses (a seller in
// several orders, the buyer as a seller) is covered: no address is assumed
// distinct. Up to six orders are written out; `loop_iter` bounds it lower.
rule resolvePaysEachAccountItsShare(bytes32 pid, CommitmentTypes.Commitment[] cs, address a) {
    require cs.length <= 6;
    address buyer = rootOf(pid);

    mathint e0 = cs.length > 0 ? shareOf(a, buyer, cs[0]) : 0;
    mathint e1 = cs.length > 1 ? shareOf(a, buyer, cs[1]) : 0;
    mathint e2 = cs.length > 2 ? shareOf(a, buyer, cs[2]) : 0;
    mathint e3 = cs.length > 3 ? shareOf(a, buyer, cs[3]) : 0;
    mathint e4 = cs.length > 4 ? shareOf(a, buyer, cs[4]) : 0;
    mathint e5 = cs.length > 5 ? shareOf(a, buyer, cs[5]) : 0;
    mathint expected = e0 + e1 + e2 + e3 + e4 + e5;

    mathint before = balance[tokenOf(pid)][a];

    env e;
    resolveProcess@withrevert(e, pid, cs);
    bool reverted = lastReverted;

    assert !reverted => balance[tokenOf(pid)][a] - before == expected,
        "each account moves by exactly its shares of the listed orders";
}
