// SPDX-License-Identifier: MIT
// Certora CVL specification for AttestationCoordinator
// (merkle-gated agreement-receipt binding).
//
// The coordinator owns no storage. All role checks are reads from the linked
// FigaroCore instance (no new FigaroCore state). Every runtime attestation carries
// a merkle inclusion proof against the signed `checkoutHash` — the call reverts
// unless the caller's clauseDataHash and proof open to a committed clause. There is
// no on-chain clause-content validator; well-formedness is an off-chain concern.
// The coordinator takes only fingerprints (`clauseDataHash`, `contentRef`), never
// preimages, so a private clause's plaintext never touches calldata.
//
// Rules are organized into two groups:
//   A) Role-gate invariants on attestAsBuyer and attestAsSeller (each takes the
//      attested order's Commitment struct; the caller must equal `c.buyer`,
//      which equals rootBuyer by commit invariant, or `c.seller`)
//   B) Parametric rules: no AC call can modify FigaroCore state
//
// Foundry-covered invariants NOT re-proven here:
//   • contentRef emitted verbatim from the caller → test_contentRefIsKeccakOfContent
//   • invalid inclusion proof → revert → test_attestAsSeller_revertsOnClauseNotInAgreement
//     / test_attestAsBuyer_revertsOnClauseDataMismatch (the `clauseDataHash`/`proof`
//     route through OZ `MerkleProof.verify` in `_verifyInclusion`; any successful
//     attestation must have opened the proof).

using FigaroCore as core;
using MockERC20A as token;

methods {
    // FigaroCore view functions called by AttestationCoordinator (linked contract)
    function core.orderStatus(bytes32) external returns (uint8) envfree;
    function core.processes(bytes32) external returns (address, address, uint256, uint256) envfree;
    function token.balanceOf(address) external returns (uint256) envfree;
}

// ═══════════════════════════════════════════════════════════════════
// GROUP A — Role-gate invariants (attestAsBuyer, attestAsSeller)
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
    bytes32 clauseDataHash,
    bytes32[] proof,
    bytes32 contentRef
) {
    env e;

    require e.msg.sender != c.buyer;

    attestAsBuyer@withrevert(e, c, clauseId, stage, clauseDataHash, proof, contentRef);

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
    bytes32 clauseDataHash,
    bytes32[] proof,
    bytes32 contentRef
) {
    env e;

    attestAsBuyer@withrevert(e, c, clauseId, stage, clauseDataHash, proof, contentRef);
    bool reverted = lastReverted;

    assert !reverted => e.msg.sender == c.buyer,
        "If attestAsBuyer succeeds, msg.sender must equal the commitment's buyer";
}

// Non-vacuity of the rule above, by construction: some call succeeds, so the
// implication is not proved over an empty set of successful runs.
rule successfulBuyerAttestationIsReachable(
    CommitmentTypes.Commitment c,
    bytes32 clauseId,
    uint8   stage,
    bytes32 clauseDataHash,
    bytes32[] proof,
    bytes32 contentRef
) {
    env e;

    attestAsBuyer@withrevert(e, c, clauseId, stage, clauseDataHash, proof, contentRef);

    satisfy !lastReverted;
}

// ═══════════════════════════════════════════════════════════════════
// RULE 2a: Non-seller cannot attest as seller
//
// If msg.sender is not the target commitment's seller, attestAsSeller reverts:
// a seller attests about a clause of its own order, and of no other.
// ═══════════════════════════════════════════════════════════════════

rule nonSellerCannotAttestAsSeller(
    CommitmentTypes.Commitment c,
    bytes32 clauseId,
    uint8   stage,
    bytes32 clauseDataHash,
    bytes32[] proof,
    bytes32 contentRef
) {
    env e;

    require e.msg.sender != c.seller;

    attestAsSeller@withrevert(e, c, clauseId, stage, clauseDataHash, proof, contentRef);

    assert lastReverted,
        "attestAsSeller must revert when caller is not the commitment's seller";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 2b: Successful attestAsSeller implies msg.sender == c.seller
// ═══════════════════════════════════════════════════════════════════

rule successfulSellerAttestationImpliesSeller(
    CommitmentTypes.Commitment c,
    bytes32 clauseId,
    uint8   stage,
    bytes32 clauseDataHash,
    bytes32[] proof,
    bytes32 contentRef
) {
    env e;

    attestAsSeller@withrevert(e, c, clauseId, stage, clauseDataHash, proof, contentRef);
    bool reverted = lastReverted;

    assert !reverted => e.msg.sender == c.seller,
        "If attestAsSeller succeeds, msg.sender must equal the commitment's seller";
}

// Non-vacuity of the rule above, by construction: some call succeeds, so the
// implication is not proved over an empty set of successful runs.
rule successfulSellerAttestationIsReachable(
    CommitmentTypes.Commitment c,
    bytes32 clauseId,
    uint8   stage,
    bytes32 clauseDataHash,
    bytes32[] proof,
    bytes32 contentRef
) {
    env e;

    attestAsSeller@withrevert(e, c, clauseId, stage, clauseDataHash, proof, contentRef);

    satisfy !lastReverted;
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
// rootBuyer, token, runningTotal, and activeOrderCount are all owned by
// FigaroCore. AC cannot modify them.
// ═══════════════════════════════════════════════════════════════════

rule attestationCannotChangeProcessState(bytes32 watchedProcess, method f)
    filtered { f -> f.contract == currentContract }
{
    address rootBuyerBefore; address tokenBefore;
    uint256 cumValBefore;    uint256 countBefore;
    (rootBuyerBefore, tokenBefore, cumValBefore, countBefore) =
        core.processes(watchedProcess);

    env e;
    calldataarg args;
    f(e, args);

    address rootBuyerAfter; address tokenAfter;
    uint256 cumValAfter;    uint256 countAfter;
    (rootBuyerAfter, tokenAfter, cumValAfter, countAfter) =
        core.processes(watchedProcess);

    assert rootBuyerBefore == rootBuyerAfter &&
           tokenBefore   == tokenAfter  &&
           cumValBefore     == cumValAfter    &&
           countBefore      == countAfter,
        "No AttestationCoordinator function can change FigaroCore process state";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 5: An attestation moves no token and writes no storage
//
// A standard ERC-20 (MockERC20A) is in the scene beside the coordinator and
// the Core. After any coordinator call that succeeds, the token's balance of
// any account is what it was, and the storage of the coordinator, of the Core
// and of the token is unchanged, compared whole. A token call the coordinator
// made, resolved to the token or left unresolved (which havocs the other
// contracts' storage), would move the token's storage and fail the rule.
// ═══════════════════════════════════════════════════════════════════

rule anAttestationMovesNoTokenAndWritesNoStorage(address a, method f)
    filtered { f -> f.contract == currentContract && !f.isView }
{
    uint256 balanceBefore = token.balanceOf(a);
    storage before = lastStorage;

    env e;
    calldataarg args;
    f(e, args);

    storage after = lastStorage;

    assert token.balanceOf(a) == balanceBefore,
        "No attestation moves any account's token balance";
    assert before[currentContract] == after[currentContract],
        "No attestation writes the coordinator's storage";
    assert before[core] == after[core],
        "No attestation writes the Core's storage";
    assert before[token] == after[token],
        "No attestation writes the token's storage";
}
