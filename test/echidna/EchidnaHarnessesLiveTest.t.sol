// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {EchidnaFuzzer} from "src/echidna/EchidnaFuzzer.sol";
import {EchidnaFlorinToken} from "src/echidna/EchidnaFlorinToken.sol";
import {FigaroCore} from "src/core/kernel/FigaroCore.sol";
import {FlorinToken} from "src/rewards/FlorinToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title EchidnaHarnessesLiveTest — the fuzz harnesses' actions land
/// @notice A property fuzzer passes a harness whose every action reverts, or
///         whose actions swallow every failure, having explored nothing. This
///         file calls each action of the two harnesses once, through the real
///         `FigaroCore` and the real `FlorinToken`, and asserts the state
///         moved: a commit put both bonds in the Core, a resolve paid them out,
///         a mint raised the supply, a transfer moved a balance, a renounce set
///         the token's flag. A harness whose signing domain drifted from the
///         Core's, or whose actions lost their caller rights, fails here.
contract EchidnaHarnessesLiveTest is Test {
    // ── FigaroCore harness ───────────────────────────────────────────

    function test_theCoreHarnessCommitsAndResolves() public {
        EchidnaFuzzer f = new EchidnaFuzzer();
        FigaroCore core = f.core();
        IERC20 token = IERC20(address(f.token()));
        assertEq(token.balanceOf(address(core)), 0, "the Core starts empty");

        // A root of 100: buyer bond 2 × 100, seller bond 2 × 100.
        f.action_commitRoot(0, 100 ether);
        assertEq(token.balanceOf(address(core)), 400 ether, "the root commit landed both bonds");

        // A sub-order of 50 on process 0: running total 150, bonds 2 × 50 + 2 × 150.
        f.action_commitSub(0, 1, 50 ether);
        assertEq(token.balanceOf(address(core)), 800 ether, "the sub-order commit landed both bonds");

        // A second buyer's root of 10 and a root-and-sub of 1 + 2.
        f.action_commitRoot_buyer2(2, 10 ether);
        assertEq(token.balanceOf(address(core)), 840 ether, "buyer2's root landed");
        f.action_commitRootAndSub(1 ether, 2 ether);
        // Root of 1: bonds 2 + 2. Sub of 2 at running total 3: bonds 4 + 6.
        assertEq(token.balanceOf(address(core)), 840 ether + 4 ether + 10 ether, "root-and-sub landed");

        // The negative actions are refused and leave the Core's balance as it is.
        uint256 held = token.balanceOf(address(core));
        f.action_resolve_wrong_sender(0, 0);
        f.action_resolve_incomplete(0);
        assertEq(token.balanceOf(address(core)), held, "no refused resolve moved a token");

        // Resolve process 0: its two orders' bonds (800) leave the Core.
        f.action_resolve(0);
        assertEq(token.balanceOf(address(core)), held - 800 ether, "the resolve paid out process 0");

        f.action_mint_buyer(1 ether);
        f.action_mint_buyer2(1 ether);
        f.action_mint_seller(0, 1 ether);

        assertTrue(f.echidna_solvency(), "solvency");
        assertTrue(f.echidna_active_count_consistent(), "active count");
        assertTrue(f.echidna_cumulative_accounting(), "cumulative");
        assertTrue(f.echidna_state_monotonicity(), "monotonicity");
        assertTrue(f.echidna_token_conservation(), "conservation");
        assertTrue(f.echidna_buyer_dominance(), "buyer dominance");
        assertTrue(f.echidna_atomic_resolution(), "atomic resolution");
    }

    // ── FlorinToken harness ──────────────────────────────────────────

    function test_theFlorinHarnessRegistersMintsTransfersAndRenounces() public {
        EchidnaFlorinToken h = new EchidnaFlorinToken();
        FlorinToken token = h.token();
        assertEq(token.totalSupply(), 2_000_000 ether, "the constructor minted to the two users");

        // Register a minter with a fuzzed cap.
        uint256 capBefore = token.totalRegisteredCap();
        h.action_registerMinter(5 ether - 1);
        assertEq(h.actorCount(), 1, "a minter was registered");
        address actor = address(h.actors(0));
        (uint256 cap, uint256 minted) = token.minters(actor);
        assertEq(cap, 5 ether, "the cap is the fuzzed one, within what was left");
        assertEq(minted, 0);
        assertEq(token.totalRegisteredCap(), capBefore + 5 ether, "the token counted the cap");

        // Mint as the registered actor (who = 1), to the actor itself (to = 3).
        h.action_mint(1, 3, 3 ether);
        (, minted) = token.minters(actor);
        assertEq(minted, 3 ether, "the actor minted");
        assertEq(token.balanceOf(actor), 3 ether, "the actor holds what it minted");
        // Past the cap: 2 ether left, 2 ether + 1 asked; the token refuses.
        h.action_mint(1, 3, 2 ether + 1);
        (, minted) = token.minters(actor);
        assertEq(minted, 3 ether, "a mint past the cap is refused");

        // Mint as the harness (who = 0) to user1 (to = 1).
        uint256 user1Before = token.balanceOf(h.user1());
        h.action_mint(0, 1, 7 ether);
        assertEq(token.balanceOf(h.user1()) - user1Before, 7 ether, "the harness minted");

        // Transfer from the actor (from = 1) to user2 (to = 2).
        uint256 user2Before = token.balanceOf(h.user2());
        h.action_transfer(1, 2, 1 ether);
        assertEq(token.balanceOf(h.user2()) - user2Before, 1 ether, "the actor's transfer moved a balance");
        assertEq(token.balanceOf(actor), 2 ether);

        // Renounce: the flag is set, and no minter can be registered afterwards.
        h.action_renounce();
        assertTrue(token.deployerMintRenounced(), "the deployer renounced");
        h.action_registerMinter(1 ether);
        assertEq(h.actorCount(), 1, "no minter is registered after the renounce");

        assertTrue(h.echidna_max_supply_never_exceeded(), "max supply");
        assertTrue(h.echidna_minter_cap_enforced(), "minter caps");
        assertTrue(h.echidna_total_supply_matches_balances(), "balances");
        assertTrue(h.echidna_contract_transfer_preserves_supply(), "supply");
        assertTrue(h.echidna_no_zero_address_minter(), "zero minter");
        assertTrue(h.echidna_no_mint_to_zero_address(), "zero recipient");
        assertTrue(h.echidna_deployer_cannot_mint_after_renounce(), "no deployer mint after renounce");
    }
}
