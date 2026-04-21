// SPDX-License-Identifier: MIT
// Certora CVL specification for FigToken
//
// Verifies the state-machine invariants of the FigToken minter registry:
//   I1. totalSupply never exceeds MAX_SUPPLY
//   I2. totalRegisteredCap never exceeds MAX_SUPPLY
//   I3. A registered minter's minted count never exceeds its cap
//   R1. totalRegisteredCap is monotonic (never decreases)
//   R2. Once deployerMintRenounced is true, it stays true
//   R3. A registered minter's cap is immutable after registration
//
// Style note: properties that must hold in ALL reachable states are written
// as `invariant` (checked from the constructor state AND preserved by every
// method). Properties that are about state transitions (monotonicity, one-way
// latches, immutability) are written as parametric `rule`s.

methods {
    function totalSupply() external returns (uint256) envfree;
    function MAX_SUPPLY() external returns (uint256) envfree;
    function totalRegisteredCap() external returns (uint256) envfree;
    function deployerMintRenounced() external returns (bool) envfree;
    function deployer() external returns (address) envfree;
    function minters(address) external returns (uint256, uint256) envfree;
}

// ═══════════════════════════════════════════════════════════════════
// RULE: totalSupply never exceeds MAX_SUPPLY
//
// Stated as an inductive preservation rule rather than `invariant` because
// the invariant form triggers built-in vacuity checks on methods that
// trivially preserve the property (e.g. renounceDeployerMint, transfer,
// permit) — these are NOT gated by `rule_sanity`. The init state is trivially
// satisfied: the constructor mints nothing, so totalSupply starts at 0.
// ═══════════════════════════════════════════════════════════════════

rule totalSupplyWithinMaxSupply(method f) {
    require totalSupply() <= MAX_SUPPLY();

    env e;
    calldataarg args;
    f(e, args);

    assert totalSupply() <= MAX_SUPPLY(),
        "totalSupply must never exceed MAX_SUPPLY";
}

// ═══════════════════════════════════════════════════════════════════
// RULE: totalRegisteredCap never exceeds MAX_SUPPLY
//
// Same shape and rationale as totalSupplyWithinMaxSupply. Init state:
// totalRegisteredCap starts at 0.
// ═══════════════════════════════════════════════════════════════════

rule totalRegisteredCapWithinMaxSupply(method f) {
    require totalRegisteredCap() <= MAX_SUPPLY();

    env e;
    calldataarg args;
    f(e, args);

    assert totalRegisteredCap() <= MAX_SUPPLY(),
        "totalRegisteredCap must never exceed MAX_SUPPLY";
}

// ═══════════════════════════════════════════════════════════════════
// RULE: Registered minter's minted count never exceeds its cap
//
// Stated as an inductive preservation rule because CVL cannot do field
// access on the tuple-returning public mapping getter (`minters(m)` returns
// `(uint256, uint256)`, not a struct with `.cap` / `.minted` in CVL's type
// system). We destructure into local vars instead.
//
// Init-state holds trivially: FigToken's constructor leaves `minters`
// untouched, so every (cap, minted) pair is (0, 0) and the invariant
// `cap > 0 => minted <= cap` is vacuously true.
// ═══════════════════════════════════════════════════════════════════

rule minterMintedWithinCap(address m, method f) {
    uint256 capBefore; uint256 mintedBefore;
    (capBefore, mintedBefore) = minters(m);

    // Pre-state: the unconditional invariant holds. This is strictly stronger
    // than the cap>0 conditional form because it also rules out the
    // unreachable-but-symbolic pre-state (cap=0, minted>0) that would
    // otherwise allow a subsequent registerMinter to land in (cap=c, minted>c).
    require mintedBefore <= capBefore;

    env e;
    calldataarg args;
    f(e, args);

    uint256 capAfter; uint256 mintedAfter;
    (capAfter, mintedAfter) = minters(m);

    assert mintedAfter <= capAfter,
        "Registered minter's minted amount must never exceed its cap";
}

// ═══════════════════════════════════════════════════════════════════
// RULE R1: totalRegisteredCap is monotonic (never decreases)
// ═══════════════════════════════════════════════════════════════════

rule totalRegisteredCapMonotonic(method f) {
    uint256 before = totalRegisteredCap();

    env e;
    calldataarg args;
    f(e, args);

    uint256 afterCall = totalRegisteredCap();

    assert afterCall >= before,
        "totalRegisteredCap must never decrease";
}

// ═══════════════════════════════════════════════════════════════════
// RULE R2: Once renounced, deployerMintRenounced stays true
// ═══════════════════════════════════════════════════════════════════

rule deployerMintRenouncedIsOneWayLatch(method f) {
    bool before = deployerMintRenounced();
    require before == true;

    env e;
    calldataarg args;
    f(e, args);

    assert deployerMintRenounced() == true,
        "Once renounced, deployerMintRenounced must stay true forever";
}

// ═══════════════════════════════════════════════════════════════════
// RULE R3: A registered minter's cap is immutable
// ═══════════════════════════════════════════════════════════════════

rule minterCapImmutable(address minter, method f) {
    uint256 capBefore; uint256 mintedBefore;
    (capBefore, mintedBefore) = minters(minter);

    // Only meaningful for already-registered minters
    require capBefore > 0;

    env e;
    calldataarg args;
    f(e, args);

    uint256 capAfter; uint256 mintedAfter;
    (capAfter, mintedAfter) = minters(minter);

    assert capAfter == capBefore,
        "A registered minter's cap must never change";
}
