// SPDX-License-Identifier: MIT
// Certora CVL specification for AttestationCoordinator
// (merkle-gated agreement-receipt binding).
//
// The coordinator owns no storage. All role checks are reads from the linked
// FigaroCore instance (no new kernel state). Every runtime attestation carries
// a merkle inclusion proof against the signed `agreementHash` — the call reverts
// unless the caller's sectionHash and proof open to a committed clause. There is
// no on-chain clause-content validator; well-formedness is an off-chain concern.
// The coordinator takes only fingerprints (`sectionHash`, `contentRef`), never
// preimages, so a private section's plaintext never touches calldata.
//
// Rules are organized into two groups:
//   A) Role-gate invariants on attestAsBuyer (takes a Commitment struct; caller
//      must equal `c.buyer`, which equals rootBuyer by commit invariant)
//   B) Parametric rules: no AC call can modify FigaroCore state
//
// The seller path (attestAsSeller — takes role + target commitments) and the
// mechanism path (attestViaResolver) are covered by the Foundry suite in
// test/protocol/coordinators/AttestationCoordinatorTest.t.sol.
//
// Foundry-covered invariants NOT re-proven here:
//   • contentRef emitted verbatim from the caller → test_contentRefIsKeccakOfContent
//   • invalid inclusion proof → revert → test_attestAsSeller_revertsOnClauseNotInAgreement
//     / test_attestAsBuyer_revertsOnSectionDataMismatch (the `sectionHash`/`proof`
//     route through OZ `MerkleProof.verify` in `_verifyInclusion`; any successful
//     attestation must have opened the proof).

using FigaroCore as core;

methods {
    // FigaroCore view functions called by AttestationCoordinator (linked contract)
    function core.orderStatus(bytes32) external returns (uint8) envfree;
    function core.orderProcessId(bytes32) external returns (bytes32) envfree;
    function core.processes(bytes32) external returns (address, address, uint256, uint256) envfree;

    // IRoleResolver.isAuthorized — wildcard external call from attestViaResolver.
    // NONDET havocs the return value: AC rules verify that no call path mutates
    // FigaroCore state, which holds regardless of what isAuthorized returns.
    function _.isAuthorized(bytes32, address) external => NONDET;
}

// ═══════════════════════════════════════════════════════════════════
// GROUP A — Role-gate invariants (attestAsBuyer)
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// RULE 1: Non-buyer cannot attest as buyer
//
// If msg.sender is not the target commitment's buyer, attestAsBuyer reverts.
// (By commit invariant, `c.buyer == processes[c.processId].rootBuyer` for any
// committed order, so this is equivalent to the rootBuyer check but expressed
// directly on the signed commitment.)
// ═══════════════════════════════════════════════════════════════════

rule nonBuyerCannotAttestAsBuyer(
    CommitmentTypes.Commitment c,
    bytes32 clauseId,
    uint8   stage,
    bytes32 sectionHash,
    bytes32[] proof,
    bytes32 contentRef
) {
    env e;

    require e.msg.sender != c.buyer;

    attestAsBuyer@withrevert(e, c, clauseId, stage, sectionHash, proof, contentRef);

    assert lastReverted,
        "attestAsBuyer must revert when caller is not the commitment's buyer";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 2: Successful attestAsBuyer implies msg.sender == c.buyer
//
// Contrapositive of rule 1; stated as a positive precondition check.
// ═══════════════════════════════════════════════════════════════════

rule successfulBuyerAttestationImpliesBuyer(
    CommitmentTypes.Commitment c,
    bytes32 clauseId,
    uint8   stage,
    bytes32 sectionHash,
    bytes32[] proof,
    bytes32 contentRef
) {
    env e;

    attestAsBuyer@withrevert(e, c, clauseId, stage, sectionHash, proof, contentRef);
    bool reverted = lastReverted;

    assert !reverted => e.msg.sender == c.buyer,
        "If attestAsBuyer succeeds, msg.sender must equal the commitment's buyer";
}

// ═══════════════════════════════════════════════════════════════════
// GROUP B — AC cannot mutate FigaroCore state (parametric)
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// RULE 3: No AttestationCoordinator call can change FigaroCore order status
//
// AC only reads from Core (view calls only). Order status must be immutable
// across any AC function invocation.
// ═══════════════════════════════════════════════════════════════════

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
// RULE 4: No AttestationCoordinator call can change FigaroCore process state
//
// rootBuyer, currency, cumulativeValue, and activeOrderCount are all owned by
// FigaroCore. AC cannot modify them.
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
