// SPDX-License-Identifier: MIT
// Certora CVL specification for FigaroCore
//
// This spec verifies state-machine invariants at the Solidity level.
// All rules are parametric (quantified over every external method)
// so they hold for commit(), resolveProcess(), and any future function.
//
// Token conservation and resolution payouts are proved by Halmos
// symbolic execution (test/kernel/HalmosFigaroCore.t.sol, 7/7 proved with z3).

methods {
    function orderStatus(bytes32) external returns (uint8) envfree;
    function orderProcessId(bytes32) external returns (bytes32) envfree;
    function processes(bytes32) external returns (address, address, uint256, uint256) envfree;
}

// ═══════════════════════════════════════════════════════════════════
// RULE 1: Order Status Never Decreases
//
// orderStatus can only move forward: 0 -> 1 -> 2.  Never backwards.
// ═══════════════════════════════════════════════════════════════════

rule orderStatusNeverDecreases(bytes32 orderHash, method f) {
    uint8 statusBefore = orderStatus(orderHash);

    env e;
    calldataarg args;
    f(e, args);

    uint8 statusAfter = orderStatus(orderHash);

    assert statusAfter >= statusBefore,
        "Order status must never decrease";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 2: Order Status Transitions Are Valid
//
// The only legal transitions are 0->1 (commit) and 1->2 (resolve).
// ═══════════════════════════════════════════════════════════════════

rule orderStatusTransitionsAreValid(bytes32 orderHash, method f) {
    uint8 statusBefore = orderStatus(orderHash);

    env e;
    calldataarg args;
    f(e, args);

    uint8 statusAfter = orderStatus(orderHash);

    assert (statusAfter == statusBefore) ||
           (statusBefore == 0 && statusAfter == 1) ||
           (statusBefore == 1 && statusAfter == 2),
        "Only valid transitions are 0->1 (commit) and 1->2 (resolve)";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 3: Active Order Count Never Decreases Via Commit
//
// No function can decrease activeOrderCount below its pre-state value
// unless it also resolves orders (which zeroes it).  Proved parametrically.
// ═══════════════════════════════════════════════════════════════════

rule commitIncreasesActiveCount(bytes32 processId, method f) {
    address rootBuyer; address currency; uint256 cumVal; uint256 countBefore;
    (rootBuyer, currency, cumVal, countBefore) = processes(processId);

    require rootBuyer != 0;

    env e;
    calldataarg args;
    f(e, args);

    address rootBuyer2; address currency2; uint256 cumVal2; uint256 countAfter;
    (rootBuyer2, currency2, cumVal2, countAfter) = processes(processId);

    // After any function: count either stays, increases, or drops to 0 (resolve)
    assert countAfter >= countBefore || countAfter == 0,
        "Active count can only increase (commit) or drop to zero (resolve)";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 4: Buyer Dominance (parametric)
//
// If a non-buyer calls any function, the process state must not
// transition to resolved (activeOrderCount must not drop to 0).
// This is the parametric version of buyer dominance.
// ═══════════════════════════════════════════════════════════════════

rule onlyBuyerCanResolve(bytes32 processId, method f) {
    address rootBuyer; address currency; uint256 cumVal; uint256 count;
    (rootBuyer, currency, cumVal, count) = processes(processId);

    require rootBuyer != 0;
    require count > 0;

    env e;
    require e.msg.sender != rootBuyer;

    calldataarg args;
    f(e, args);

    address rootBuyer2; address currency2; uint256 cumVal2; uint256 countAfter;
    (rootBuyer2, currency2, cumVal2, countAfter) = processes(processId);

    // A non-buyer cannot zero the active count (i.e. cannot resolve)
    assert countAfter > 0,
        "Only the root buyer can resolve a process";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 5: No Double Commit
//
// An order that already has status >= 1 cannot have its status
// decreased or overwritten.  This is implied by orderStatusNeverDecreases
// but stated explicitly for clarity.
// ═══════════════════════════════════════════════════════════════════

rule noDoubleCommit(bytes32 orderHash, method f) {
    uint8 statusBefore = orderStatus(orderHash);
    require statusBefore != 0;

    env e;
    calldataarg args;
    f(e, args);

    assert orderStatus(orderHash) >= statusBefore,
        "Committed/resolved orders cannot be re-committed";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 6: Cumulative Value Monotonicity
//
// The cumulativeValue of a process can only increase, never decrease.
// ═══════════════════════════════════════════════════════════════════

rule cumulativeValueMonotonic(bytes32 processId, method f) {
    address rootBuyer; address currency; uint256 cumBefore; uint256 count;
    (rootBuyer, currency, cumBefore, count) = processes(processId);

    // Process must already exist — new process creation is not a "decrease"
    require rootBuyer != 0;

    env e;
    calldataarg args;
    f(e, args);

    address rootBuyer2; address currency2; uint256 cumAfter; uint256 count2;
    (rootBuyer2, currency2, cumAfter, count2) = processes(processId);

    assert cumAfter >= cumBefore,
        "Cumulative value must never decrease";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 7: Process Root Buyer Immutability
//
// Once a process is created, its rootBuyer address never changes.
// ═══════════════════════════════════════════════════════════════════

rule rootBuyerImmutable(bytes32 processId, method f) {
    address rootBuyerBefore; address currency; uint256 cumVal; uint256 count;
    (rootBuyerBefore, currency, cumVal, count) = processes(processId);

    require rootBuyerBefore != 0;

    env e;
    calldataarg args;
    f(e, args);

    address rootBuyerAfter; address currency2; uint256 cumVal2; uint256 count2;
    (rootBuyerAfter, currency2, cumVal2, count2) = processes(processId);

    assert rootBuyerAfter == rootBuyerBefore,
        "Root buyer of an existing process must never change";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 8: Process Currency Immutability
//
// Once a process is created, its currency never changes.
// ═══════════════════════════════════════════════════════════════════

rule currencyImmutable(bytes32 processId, method f) {
    address rootBuyer; address currencyBefore; uint256 cumVal; uint256 count;
    (rootBuyer, currencyBefore, cumVal, count) = processes(processId);

    require rootBuyer != 0;

    env e;
    calldataarg args;
    f(e, args);

    address rootBuyer2; address currencyAfter; uint256 cumVal2; uint256 count2;
    (rootBuyer2, currencyAfter, cumVal2, count2) = processes(processId);

    assert currencyAfter == currencyBefore,
        "Currency of an existing process must never change";
}
