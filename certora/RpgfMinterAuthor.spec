// SPDX-License-Identifier: MIT
// Certora CVL specification for RpgfMinter's `_isAuthor` — the kind selection
// `RpgfMinter.spec` summarizes to a ghost. Here `_isAuthor` runs as written,
// against three registry contracts with their own arbitrary storage, linked to
// the minter's `clauses`, `assemblies` and `agreements`
// (certora/harness/AuthorRegistryMocks.sol). The harness
// (certora/harness/RpgfMinterAuthorHarness.sol) adds one view that calls
// `_isAuthor`.
//
// The conf compiles without via-IR. Under via-IR the prover's pointer analysis
// fails on `_isAuthor` (its decoding of the `bindings` string return), leaves
// the registry calls unresolved and answers them with arbitrary values, so the
// rule below would read no registry at all.
//
// What the two rules prove, for every kind, key, account and registry state:
//   1. the answer for a kind is the live designer of record in the one
//      registry that kind names, and depends on no other registry's entry at
//      the same key: a stake in one family at another family's bytes makes no
//      designer of record for it;
//   2. a kind that names no registry is refused.

using ClauseAuthorMock as clauseReg;
using AssemblyAuthorMock as assemblyReg;
using AgreementAuthorMock as agreementReg;

methods {
    function isAuthor(uint8, bytes32, address) external returns (bool) envfree;
    function clauseReg.registeredByOf(bytes32) external returns (address) envfree;
    function clauseReg.withdrawnOf(bytes32) external returns (bool) envfree;
    function assemblyReg.registeredByOf(bytes32) external returns (address) envfree;
    function assemblyReg.withdrawnOf(bytes32) external returns (bool) envfree;
    function agreementReg.registeredByOf(bytes32) external returns (address) envfree;
    function agreementReg.withdrawnOf(bytes32) external returns (bool) envfree;
}

// ═══════════════════════════════════════════════════════════════════
// RULE 1: Each kind reads its own registry, and only its own
//
// KIND_CLAUSE (0) reads ClauseRegistry's depositOf, KIND_ASSEMBLY (1)
// AssemblyRegistry's bindings, KIND_AGREEMENT (2) AgreementRegistry's
// bindings. Each right-hand side below reads one registry alone, so the
// equality is also the independence: whatever the other two registries hold
// at the same key, the answer does not move.
// ═══════════════════════════════════════════════════════════════════

rule isAuthorReadsOnlyItsKindsRegistry(uint8 kind, bytes32 key, address account) {
    require kind < 3;

    address clauseBy = clauseReg.registeredByOf(key);
    bool clauseWithdrawn = clauseReg.withdrawnOf(key);
    address assemblyBy = assemblyReg.registeredByOf(key);
    bool assemblyWithdrawn = assemblyReg.withdrawnOf(key);
    address agreementBy = agreementReg.registeredByOf(key);
    bool agreementWithdrawn = agreementReg.withdrawnOf(key);

    bool result = isAuthor(kind, key, account);

    assert kind == 0 => (result <=> (clauseBy != 0 && clauseBy == account && !clauseWithdrawn)),
        "the clause kind answers from ClauseRegistry alone";
    assert kind == 1 => (result <=> (assemblyBy != 0 && assemblyBy == account && !assemblyWithdrawn)),
        "the assembly kind answers from AssemblyRegistry alone";
    assert kind == 2 => (result <=> (agreementBy != 0 && agreementBy == account && !agreementWithdrawn)),
        "the agreement kind answers from AgreementRegistry alone";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 2: A kind that names no registry is refused
// ═══════════════════════════════════════════════════════════════════

rule isAuthorRefusesAnUnknownKind(uint8 kind, bytes32 key, address account) {
    require kind >= 3;

    isAuthor@withrevert(kind, key, account);

    assert lastReverted,
        "a kind past KIND_AGREEMENT names no registry and reverts";
}
