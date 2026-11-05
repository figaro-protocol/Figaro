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
// STATE: a draft the prover has run twice (jobs 9512759/8ad005da… and
// 9512759/21cf4904…, about forty seconds each, no stall) and VIOLATED both
// times, the second from an empty coordinator with the parties and the sender
// distinct from it. The counterexample's trace is on the prover's page and has
// not been read; until it is, and the rule or the scene is corrected, the three
// inventory entries stay PENDING and this file is the starting point, not the
// proof.
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

    swapAndCommit(e, c, buyerSig, sellerSig, buyerFunding, sellerFunding);

    assert tokenA.balanceOf(currentContract) == 0,
        "the coordinator retains none of token A after a swap-and-commit";
    assert tokenB.balanceOf(currentContract) == 0,
        "the coordinator retains none of token B after a swap-and-commit";
}
