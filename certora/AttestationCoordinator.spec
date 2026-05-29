// SPDX-License-Identifier: MIT
// Certora CVL specification for AttestationCoordinator
// (validator-gated + agreement-receipt binding).
//
// The coordinator owns one storage mapping (`clauseValidator`). All role checks
// are reads from the linked FigaroCore instance (no new kernel state). Every
// runtime attestation carries a merkle inclusion proof against the signed
// `agreementHash` — the call reverts unless the caller's sectionData and proof
// open to a committed clause.
//
// Rules are organized into three groups:
//   A) Role-gate invariants on attestAsBuyer (takes a Commitment struct; caller
//      must equal `c.buyer`, which equals rootBuyer by commit invariant)
//   B) Parametric rules: no AC call can modify FigaroCore state
//   C) Validator-gate + binding invariants
//
// The seller path (attestAsSeller — takes role + target commitments) and the
// mechanism path (attestViaResolver) are covered by the Foundry suite in
// test/AttestationCoordinatorTest.t.sol.
//
// Foundry-covered invariants NOT re-proven here:
//   • validator-binding-check     → test_setValidator_rejectsMismatchedBinding
//   • contentRef == keccak256(content) → test_contentRefIsKeccakOfContent
//   • invalid inclusion proof → revert (covered structurally by the spec rules
//     below: `sectionData`/`proof` land in `_validateContent` which routes
//     through OZ `MerkleProof.verify`; any successful attestation must have
//     opened the proof. Tests exercise the revert path directly.)

using FigaroCore as core;

methods {
    // FigaroCore view functions called by AttestationCoordinator (linked contract)
    function core.orderStatus(bytes32) external returns (uint8) envfree;
    function core.orderProcessId(bytes32) external returns (bytes32) envfree;
    function core.processes(bytes32) external returns (address, address, uint256, uint256) envfree;

    // AttestationCoordinator's own validator-registry getter.
    function clauseValidator(bytes32) external returns (address) envfree;

    // IRoleResolver.isAuthorized — wildcard external call from attestViaResolver.
    // NONDET havocs the return value: AC rules verify that no call path mutates
    // FigaroCore state, which holds regardless of what isAuthorized returns.
    function _.isAuthorized(bytes32, address) external => NONDET;

    // IClauseValidator hooks. `validate` is view and called by _validateContent
    // for every attest* path; NONDET models "validator accepts" (non-reverting)
    // since the rules here assert properties orthogonal to content semantics.
    // `clauseId` is called only by setValidator and its correctness is
    // Foundry-covered (see file header).
    function _.validate(bytes32, uint8, bytes, bytes) external => NONDET;
    function _.clauseId() external => NONDET;
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
    bytes   sectionData,
    bytes32[] proof,
    bytes   content
) {
    env e;

    require e.msg.sender != c.buyer;

    attestAsBuyer@withrevert(e, c, clauseId, stage, sectionData, proof, content);

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
    bytes   sectionData,
    bytes32[] proof,
    bytes   content
) {
    env e;

    attestAsBuyer@withrevert(e, c, clauseId, stage, sectionData, proof, content);
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

// ═══════════════════════════════════════════════════════════════════
// GROUP C — Validator-gate + binding invariants
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// RULE 5: Validator-mandatory-on-attest (buyer path)
//
// A clause with no registered validator cannot be attested under: if
// clauseValidator[clauseId] == 0 pre-call, attestAsBuyer must revert.
// This is the "no silent attestation" guarantee — an unknown clause cannot
// emit an Attestation event. Paired with the merkle-proof gate in
// `_validateContent`, it closes both the unknown-clause and unsigned-clause
// attack surfaces.
// ═══════════════════════════════════════════════════════════════════

rule noValidatorBlocksBuyerAttestation(
    CommitmentTypes.Commitment c,
    bytes32 clauseId,
    uint8   stage,
    bytes   sectionData,
    bytes32[] proof,
    bytes   content
) {
    env e;

    require clauseValidator(clauseId) == 0;

    attestAsBuyer@withrevert(e, c, clauseId, stage, sectionData, proof, content);

    assert lastReverted,
        "attestAsBuyer must revert when no validator is registered for clauseId";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 6: First-write-wins — cannot overwrite an existing validator
//
// setValidator(s, v) must revert whenever clauseValidator[s] != 0.
// Makes the validator binding immutable post-registration and prevents a
// validator-swap rug-pull.
// ═══════════════════════════════════════════════════════════════════

rule setValidatorIsFirstWriteWins(bytes32 clauseId, address newValidator) {
    env e;

    require clauseValidator(clauseId) != 0;

    setValidator@withrevert(e, clauseId, newValidator);

    assert lastReverted,
        "setValidator must revert when a validator is already registered for clauseId";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 7: setValidator cannot alter bindings for other clauses
//
// Storage isolation: setValidator(s1, v) touches only clauseValidator[s1];
// clauseValidator[s2] for any s2 != s1 is preserved. Combined with rule 6,
// every (clauseId → validator) binding is stable for life once set.
// ═══════════════════════════════════════════════════════════════════

rule setValidatorPreservesOtherBindings(
    bytes32 touchedClause,
    bytes32 otherClause,
    address newValidator
) {
    env e;

    require touchedClause != otherClause;
    address otherBefore = clauseValidator(otherClause);

    setValidator@withrevert(e, touchedClause, newValidator);

    address otherAfter = clauseValidator(otherClause);

    assert otherBefore == otherAfter,
        "setValidator must not modify the validator binding of any other clause";
}
