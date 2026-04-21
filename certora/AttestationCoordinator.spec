// SPDX-License-Identifier: MIT
// Certora CVL specification for AttestationCoordinator
//
// AttestationCoordinator is stateless: it has no storage of its own.
// All role checks are reads from the linked FigaroCore instance.
//
// Rules are organized into two groups:
//   A) Targeted rules for attestAsBuyer (no struct parameters — clean CVL)
//   B) Parametric rules: no AC call can modify FigaroCore state
//
// The seller path (attestAsSeller) takes a CommitmentTypes.Commitment struct
// which is not directly declared in this spec; seller-role correctness is
// covered by the Foundry AttestationCoordinatorTest suite.

using FigaroCore as core;

methods {
    // FigaroCore view functions called by AttestationCoordinator (linked contract)
    function core.orderStatus(bytes32) external returns (uint8) envfree;
    function core.orderProcessId(bytes32) external returns (bytes32) envfree;
    function core.processes(bytes32) external returns (address, address, uint256, uint256) envfree;

    // IRoleResolver — wildcard external call from attestViaResolver.
    // NONDET havocs the return value: the AC rules verify that no call path
    // mutates FigaroCore state, which holds regardless of what isAuthorized
    // returns (whether the attestation reverts or succeeds, core is untouched).
    // DISPATCHER(true) would require a non-interface implementation in the
    // scene, which we don't have (IRoleResolver.sol is an interface).
    function _.isAuthorized(bytes32, address) external => NONDET;
}

// ═══════════════════════════════════════════════════════════════════
// RULE 1: Non-buyer cannot attest as buyer
//
// If msg.sender is not the rootBuyer of processId, attestAsBuyer reverts.
// ═══════════════════════════════════════════════════════════════════

rule nonBuyerCannotAttestAsBuyer(
    bytes32 processId,
    bytes32 orderHash,
    bytes32 schemaId,
    uint8   stage,
    bytes32 contentRef
) {
    env e;

    address rootBuyer; address currency; uint256 cumVal; uint256 count;
    (rootBuyer, currency, cumVal, count) = core.processes(processId);

    require e.msg.sender != rootBuyer;

    attestAsBuyer@withrevert(e, processId, orderHash, schemaId, stage, contentRef);

    assert lastReverted,
        "attestAsBuyer must revert when caller is not the process root buyer";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 2: Unknown process always causes attestAsBuyer to revert
//
// If rootBuyer == 0 the process does not exist; attestAsBuyer must revert.
// ═══════════════════════════════════════════════════════════════════

rule unknownProcessRevertsAsBuyer(
    bytes32 processId,
    bytes32 orderHash,
    bytes32 schemaId,
    uint8   stage,
    bytes32 contentRef
) {
    env e;

    address rootBuyer; address currency; uint256 cumVal; uint256 count;
    (rootBuyer, currency, cumVal, count) = core.processes(processId);

    require rootBuyer == 0;

    attestAsBuyer@withrevert(e, processId, orderHash, schemaId, stage, contentRef);

    assert lastReverted,
        "attestAsBuyer must revert for a process with no root buyer (unknown process)";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 3: Successful attestAsBuyer implies msg.sender is root buyer
//
// Contrapositive of rule 1; stated as a positive precondition check.
// ═══════════════════════════════════════════════════════════════════

rule successfulBuyerAttestationImpliesBuyer(
    bytes32 processId,
    bytes32 orderHash,
    bytes32 schemaId,
    uint8   stage,
    bytes32 contentRef
) {
    env e;

    attestAsBuyer@withrevert(e, processId, orderHash, schemaId, stage, contentRef);
    // Capture immediately — `lastReverted` is reset by any subsequent call,
    // including the view read on core.processes below.
    bool reverted = lastReverted;

    address rootBuyer; address currency; uint256 cumVal; uint256 count;
    (rootBuyer, currency, cumVal, count) = core.processes(processId);

    assert !reverted => e.msg.sender == rootBuyer,
        "If attestAsBuyer succeeds, msg.sender must equal the process root buyer";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 4: Successful attestAsBuyer implies target order is in processId
//
// The target orderHash must belong to processId or attestAsBuyer reverts.
// ═══════════════════════════════════════════════════════════════════

rule buyerAttestationEnforcesProcessBoundary(
    bytes32 processId,
    bytes32 orderHash,
    bytes32 schemaId,
    uint8   stage,
    bytes32 contentRef
) {
    env e;

    attestAsBuyer@withrevert(e, processId, orderHash, schemaId, stage, contentRef);
    bool reverted = lastReverted;

    bytes32 actualProcess = core.orderProcessId(orderHash);

    assert !reverted => actualProcess == processId,
        "If attestAsBuyer succeeds, the target order must belong to the given process";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 5: No AttestationCoordinator call can change FigaroCore order status
//
// AC only reads from Core (view calls only). Order status must be immutable
// across any AC function invocation.
// ═══════════════════════════════════════════════════════════════════

// `filtered` restricts `method f` to AttestationCoordinator's own external
// methods. Without it, CVL's `method f` also enumerates FigaroCore's methods
// (because FigaroCore is linked into the scene), and FigaroCore.commit()
// trivially violates the assertion — which isn't what this rule is about.
rule attestationCannotChangeOrderStatus(bytes32 watchedOrder, method f)
    filtered { f -> f.contract == currentContract }
{
    uint8 statusBefore = core.orderStatus(watchedOrder);

    env e;
    calldataarg args;
    f(e, args);

    assert core.orderStatus(watchedOrder) == statusBefore,
        "No AttestationCoordinator function can change FigaroCore order status";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 6: No AttestationCoordinator call can change FigaroCore process state
//
// rootBuyer, currency, cumulativeValue, and activeOrderCount are all
// owned by FigaroCore. AC cannot modify them.
// ═══════════════════════════════════════════════════════════════════

rule attestationCannotChangeProcessState(bytes32 watchedProcess, method f)
    filtered { f -> f.contract == currentContract }
{
    address rootBuyerBefore; address currencyBefore;
    uint256 cumValBefore;    uint256 countBefore;
    (rootBuyerBefore, currencyBefore, cumValBefore, countBefore) =
        core.processes(watchedProcess);

    env e;
    calldataarg args;
    f(e, args);

    address rootBuyerAfter; address currencyAfter;
    uint256 cumValAfter;    uint256 countAfter;
    (rootBuyerAfter, currencyAfter, cumValAfter, countAfter) =
        core.processes(watchedProcess);

    assert rootBuyerBefore == rootBuyerAfter &&
           currencyBefore   == currencyAfter  &&
           cumValBefore     == cumValAfter    &&
           countBefore      == countAfter,
        "No AttestationCoordinator function can change FigaroCore process state";
}
