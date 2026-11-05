// SPDX-License-Identifier: MIT
// Certora CVL — the swap coordinator keeps no token (certora/token-ops.inventory,
// the three WitnessSwapAndCommitCoordinator._fund entries).
//
// Scene: the coordinator linked to the real FigaroCore, to the Foundry doubles
// for Permit2 (MockWitnessPermit2, which pulls the party's input token by its
// allowance) and for the venue (MockSwapVenue, which pulls amountIn by
// allowance and pays amountOut from its liquidity at a settable rate), and to
// two ERC-20 instances resolved by dispatcher. `swapAndCommit` sends the
// party's signed swap calldata to the venue by a low-level call, which the
// prover resolves against the linked venue's functions.
//
// The first two runs (jobs 9512759/8ad005da… and 9512759/21cf4904…) reported
// the rule violated. The counterexample's trace shows why the scene, not the
// contract, was at fault: the party's input token (0x2914) and the commitment's
// currency (0x7a7e) were arbitrary addresses, so each ERC-20 call on them was
// dispatched to whichever of the two instances the prover chose, call by call,
// and the swap calldata was empty, so the low-level call on the venue resolved
// to no function and was havoced, which lets the prover write any balance into
// an instance's storage. The scene now pins the two tokens to the two instances
// and resolves every unresolved call to the venue's one function, with a
// non-deterministic return and no state change otherwise (an empty or foreign
// calldata then produces no output, so `OutputBelowBond` reverts the path).
// With that scene the rule verifies and its vacuity check passes (job 9512759/22676dd3…).
//
// CoordinatorTokenConservation: on every completing path of swapAndCommit,
// the coordinator ends holding exactly what it held before of both tokens —
// the Permit2 pull, the venue's output and the input residual all leave it —
// and nothing it did not hold before stays. Reverting paths move nothing.

using MockERC20A as tokenA;
using MockERC20B as tokenB;

methods {
    function _.transfer(address, uint256) external => DISPATCHER(true);
    function _.transferFrom(address, address, uint256) external => DISPATCHER(true);
    function _.approve(address, uint256) external => DISPATCHER(true);
    function _.balanceOf(address) external => DISPATCHER(true);
    function _.allowance(address, address) external => DISPATCHER(true);
    function tokenA.balanceOf(address) external returns (uint256) envfree;
    function tokenB.balanceOf(address) external returns (uint256) envfree;
    // The coordinator forwards the party's signed swap calldata to the venue by a
    // low-level call. Calldata that names the venue's swap resolves to it; any
    // other calldata (empty, or a selector the venue lacks) moves no token and
    // returns anything, which is what the real venue's revert or no-op gives.
    unresolved external in _._ => DISPATCH [ MockSwapVenue.swap(address, address, uint256, address) ] default NONDET;
}

rule coordinatorTokenConservation(
    env e,
    CommitmentTypes.Commitment c,
    bytes buyerSig,
    bytes sellerSig,
    WitnessSwapAndCommitCoordinator.SwapFunding buyerFunding,
    WitnessSwapAndCommitCoordinator.SwapFunding sellerFunding
) {
    // Dynamic bytes bounded so the hashing of the witness and the signatures stays decidable.
    require buyerSig.length <= 65 && sellerSig.length <= 65;
    require buyerFunding.permitSignature.length <= 65 && sellerFunding.permitSignature.length <= 65;
    require buyerFunding.swapData.length <= 196 && sellerFunding.swapData.length <= 196;

    // The coordinator holds nothing between calls: that is the claim, and the
    // state the rule starts from. What a swap-and-commit brings in (the party's
    // input, the venue's output) leaves it in the same call.
    require tokenA.balanceOf(currentContract) == 0;
    require tokenB.balanceOf(currentContract) == 0;
    // The venue pays out of its own liquidity and never to itself; the parties
    // are wallets, not this contract.
    require e.msg.sender != currentContract;
    require c.buyer != currentContract && c.seller != currentContract;
    // The two tokens of the scene: a party swaps token A into the bond currency,
    // token B. An ERC-20 call on any other address would be dispatched to
    // either instance call by call, which no real token does.
    require c.currency == tokenB;
    require buyerFunding.inputToken == tokenA && sellerFunding.inputToken == tokenA;

    swapAndCommit(e, c, buyerSig, sellerSig, buyerFunding, sellerFunding);

    assert tokenA.balanceOf(currentContract) == 0,
        "the coordinator retains none of token A after a swap-and-commit";
    assert tokenB.balanceOf(currentContract) == 0,
        "the coordinator retains none of token B after a swap-and-commit";
}
