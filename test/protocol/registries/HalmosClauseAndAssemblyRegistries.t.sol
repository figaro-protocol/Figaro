// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {ClauseRegistry} from "src/protocol/registries/ClauseRegistry.sol";
import {AssemblyRegistry} from "src/protocol/registries/AssemblyRegistry.sol";

/// @title HalmosClauseRegistry / HalmosAssemblyRegistry — the ID-keyed stake
///        machines RPGF author eligibility rests on
///
/// @notice `ClauseRegistry` and `AssemblyRegistry` are `MembersRegistry`'s
///         siblings minus the cooldown: each key (clauseId+version /
///         compositionHash) is bound FIRST-WRITE-WINS and PERMANENTLY —
///         there is no `requestWithdrawal` two-step and nothing to recycle,
///         because a withdrawn key can never be re-registered by anyone
///         (`AlreadyRegistered` / `CompositionAlreadyRegistered` guard the
///         key forever, not just the depositor). `RpgfMinter._isAuthor`
///         (src/rpgf/RpgfMinter.sol:236-241) reads this machine directly at
///         CLAIM time — `depositOf[key].withdrawn == false` for a clause,
///         `bindings[hash].depositWithdrawn == false` for an assembly — with
///         no timestamp and no snapshot. These properties are those
///         assumptions, proved symbolically:
///
///           P1  deposit solvency           — the registry holds at least
///                                            what it owes, under arbitrary
///                                            register/withdraw interleavings
///                                            by two symbolic actors, and a
///                                            live deposit is withdrawable in
///                                            full (no cooldown, no residue).
///           P2  first-write-wins           — once a key is bound, no SECOND
///               permanence                   registration for it ever
///                                            succeeds, for ANY caller
///                                            (including the original
///                                            registrant) and in ANY
///                                            withdrawn state, and the stored
///                                            binding (contentHash/registeredBy
///                                            or registeredBy/contentURI) never
///                                            changes.
///           P3  withdrawal is one-shot     — a second withdraw for an
///                                            already-withdrawn key cannot
///                                            move ETH, for any caller.
///           P4  withdrawal ends            — the exact bit `_isAuthor`
///               eligibility, permanently     reads flips to "not eligible"
///                                            at withdraw and no reachable
///                                            call sequence (re-registration
///                                            attempt, second withdrawal
///                                            attempt) ever restores it.
///           P5  cross-key isolation        — registering, withdrawing, or
///                                            attempting to hijack key A
///                                            never touches key B's binding
///                                            or deposit state.
///
///         Halmos convention: `check_` prefix, not `test_`. No `vm.warp` /
///         cooldown anywhere in this file — that parameter does not exist on
///         these two contracts (`docs/DESIGN_DECISIONS.md` §15 "Scope").
///
/// @dev    WHAT THIS DOES NOT PROVE: that the deposit is priced correctly, or
///         anything about `RpgfMinter`'s reward arithmetic. It proves the two
///         registries `_isAuthor` reads are the machine the eligibility
///         sentence above describes. Companion: `HalmosMembersRegistry.t.sol`
///         (the cooldown-bearing sibling; `reference_halmos_operations`
///         memory has the run recipe).
contract HalmosClauseRegistry is Test {
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);

    string internal constant CLAUSE_A_ID = "figaro-halmos-clause-a";
    string internal constant CLAUSE_B_ID = "figaro-halmos-clause-b";
    uint64 internal constant VERSION = 1;

    bytes32 internal constant KEY_A = keccak256(abi.encode(CLAUSE_A_ID, VERSION));
    bytes32 internal constant KEY_B = keccak256(abi.encode(CLAUSE_B_ID, VERSION));

    // ── P1: deposit solvency ─────────────────────────────────────────

    /// The registry holds at least what it owes: the sum of live
    /// (un-withdrawn) deposits, under arbitrary register/withdraw
    /// interleavings by two symbolic actors and any deposit size.
    function check_solvency_holdsWhateverTwoActorsDo(
        uint96 deposit,
        bytes32 contentHashA,
        bytes32 contentHashB,
        bool aliceWithdraws,
        bool bobWithdraws
    ) public {
        vm.assume(contentHashA != bytes32(0));
        vm.assume(contentHashB != bytes32(0));

        ClauseRegistry r = new ClauseRegistry(deposit);
        vm.deal(ALICE, uint256(deposit) + 1 ether);
        vm.deal(BOB, uint256(deposit) + 1 ether);

        vm.prank(ALICE);
        r.registerClause{value: deposit}(CLAUSE_A_ID, VERSION, contentHashA, "ipfs://a");
        vm.prank(BOB);
        r.registerClause{value: deposit}(CLAUSE_B_ID, VERSION, contentHashB, "ipfs://b");

        if (aliceWithdraws) {
            vm.prank(ALICE);
            r.withdrawDeposit(KEY_A);
        }
        if (bobWithdraws) {
            vm.prank(BOB);
            r.withdrawDeposit(KEY_B);
        }

        (, bool aWithdrawn) = r.depositOf(KEY_A);
        (, bool bWithdrawn) = r.depositOf(KEY_B);
        uint256 owed = (aWithdrawn ? 0 : uint256(deposit)) + (bWithdrawn ? 0 : uint256(deposit));

        assertGe(address(r).balance, owed, "the registry must hold every live deposit");
    }

    /// A live deposit is withdrawable in full, immediately — there is no
    /// cooldown on this contract, so "claimable" and "registered" are the
    /// same instant, and the claim pays exactly what was booked.
    function check_liveDepositIsAlwaysWithdrawableInFull(uint96 deposit, bytes32 contentHash) public {
        vm.assume(contentHash != bytes32(0));

        ClauseRegistry r = new ClauseRegistry(deposit);
        vm.deal(ALICE, uint256(deposit) + 1 ether);

        vm.prank(ALICE);
        r.registerClause{value: deposit}(CLAUSE_A_ID, VERSION, contentHash, "ipfs://a");

        uint256 before = ALICE.balance;
        vm.prank(ALICE);
        r.withdrawDeposit(KEY_A);

        assertEq(ALICE.balance, before + deposit, "paid in full, immediately, no cooldown");
        assertEq(address(r).balance, 0, "and nothing is left owed");
    }

    // ── P2: first-write-wins permanence ─────────────────────────────

    /// Once a key is registered, NO second registration for it ever
    /// succeeds — not from the original registrant, not from anyone else,
    /// whether the deposit is still live or already withdrawn — and the
    /// stored binding never changes. This is the property the "committed
    /// agreements reference it forever" guarantee stands on.
    function check_firstWriteWins_noSecondRegistrationEverSucceeds(
        uint96 deposit,
        bytes32 contentHashA,
        bytes32 contentHashSecond,
        bool aliceWithdrawsFirst,
        bool secondCallerIsAlice
    ) public {
        vm.assume(contentHashA != bytes32(0));
        vm.assume(contentHashSecond != bytes32(0));

        ClauseRegistry r = new ClauseRegistry(deposit);
        vm.deal(ALICE, uint256(deposit) * 2 + 1 ether);
        vm.deal(BOB, uint256(deposit) * 2 + 1 ether);

        vm.prank(ALICE);
        r.registerClause{value: deposit}(CLAUSE_A_ID, VERSION, contentHashA, "ipfs://original");

        if (aliceWithdrawsFirst) {
            vm.prank(ALICE);
            r.withdrawDeposit(KEY_A);
        }

        address secondCaller = secondCallerIsAlice ? ALICE : BOB;
        vm.prank(secondCaller);
        (bool ok,) = address(r).call{value: deposit}(
            abi.encodeCall(ClauseRegistry.registerClause, (CLAUSE_A_ID, VERSION, contentHashSecond, "ipfs://hijack"))
        );

        assertFalse(ok, "no second registration for this key ever succeeds, withdrawn or not, original caller or not");
        assertEq(r.contentHashOf(KEY_A), contentHashA, "the content-hash binding never changes");
        (address registeredBy,) = r.depositOf(KEY_A);
        assertEq(registeredBy, ALICE, "the registeredBy of record is permanent");
        assertTrue(r.registered(KEY_A), "and the binding stays registered forever");
    }

    // ── P3: withdrawal is one-shot ───────────────────────────────────

    /// A second withdraw for an already-withdrawn key cannot move ETH,
    /// for the registering wallet or anyone else.
    function check_withdrawalIsOneShot_secondWithdrawCannotMoveEth(uint96 deposit, bytes32 contentHash) public {
        vm.assume(contentHash != bytes32(0));

        ClauseRegistry r = new ClauseRegistry(deposit);
        vm.deal(ALICE, uint256(deposit) + 1 ether);

        vm.prank(ALICE);
        r.registerClause{value: deposit}(CLAUSE_A_ID, VERSION, contentHash, "ipfs://a");
        vm.prank(ALICE);
        r.withdrawDeposit(KEY_A);

        uint256 balAfterFirst = ALICE.balance;
        uint256 contractBalAfterFirst = address(r).balance;

        vm.prank(ALICE);
        (bool ok,) = address(r).call(abi.encodeCall(ClauseRegistry.withdrawDeposit, (KEY_A)));

        assertFalse(ok, "a second withdraw for this key cannot succeed");
        assertEq(ALICE.balance, balAfterFirst, "no ETH moves on the second attempt");
        assertEq(address(r).balance, contractBalAfterFirst, "contract balance is unchanged");
    }

    // ── P4: withdrawal ends eligibility, permanently ────────────────

    /// `depositOf(key).withdrawn` — the EXACT bit `RpgfMinter._isAuthor`
    /// reads at claim time — flips true at withdraw and no reachable call
    /// sequence afterward (a re-registration attempt, a second withdrawal
    /// attempt, from any caller) ever restores it.
    function check_withdrawalEndsEligibility_andNothingRestoresIt(
        uint96 deposit,
        bytes32 contentHash,
        bytes32 attemptedContentHash,
        bool attemptReRegister,
        bool attemptSecondWithdraw
    ) public {
        vm.assume(contentHash != bytes32(0));
        vm.assume(attemptedContentHash != bytes32(0));

        ClauseRegistry r = new ClauseRegistry(deposit);
        vm.deal(ALICE, uint256(deposit) * 2 + 1 ether);
        vm.deal(BOB, uint256(deposit) + 1 ether);

        vm.prank(ALICE);
        r.registerClause{value: deposit}(CLAUSE_A_ID, VERSION, contentHash, "ipfs://a");

        (, bool withdrawnBefore) = r.depositOf(KEY_A);
        assertFalse(withdrawnBefore, "deposit starts live");

        vm.prank(ALICE);
        r.withdrawDeposit(KEY_A);

        (, bool withdrawnAfter) = r.depositOf(KEY_A);
        assertTrue(withdrawnAfter, "eligibility ends at withdraw (withdrawn == true)");

        // Try every call that MIGHT restore eligibility.
        if (attemptReRegister) {
            vm.prank(BOB);
            address(r).call{value: deposit}(
                abi.encodeCall(
                    ClauseRegistry.registerClause, (CLAUSE_A_ID, VERSION, attemptedContentHash, "ipfs://again")
                )
            );
        }
        if (attemptSecondWithdraw) {
            vm.prank(ALICE);
            address(r).call(abi.encodeCall(ClauseRegistry.withdrawDeposit, (KEY_A)));
        }

        (, bool withdrawnFinal) = r.depositOf(KEY_A);
        assertTrue(withdrawnFinal, "and nothing restores it -- this is exactly the RPGF held-at-claim read");
    }

    // ── P5: cross-key isolation ──────────────────────────────────────

    /// Registering, withdrawing, or attempting to hijack key A never
    /// touches key B's binding or deposit state.
    function check_crossKeyIsolation_keyATouchesNothingOfKeyB(
        uint96 deposit,
        bytes32 contentHashA,
        bytes32 contentHashB,
        bool aliceWithdraws,
        bool attemptHijackA
    ) public {
        vm.assume(contentHashA != bytes32(0));
        vm.assume(contentHashB != bytes32(0));

        ClauseRegistry r = new ClauseRegistry(deposit);
        vm.deal(ALICE, uint256(deposit) * 2 + 1 ether);
        vm.deal(BOB, uint256(deposit) + 1 ether);

        vm.prank(BOB);
        r.registerClause{value: deposit}(CLAUSE_B_ID, VERSION, contentHashB, "ipfs://b");

        (address registeredByB0, bool withdrawnB0) = r.depositOf(KEY_B);
        bytes32 contentHashOfB0 = r.contentHashOf(KEY_B);
        bool registeredB0 = r.registered(KEY_B);

        vm.prank(ALICE);
        r.registerClause{value: deposit}(CLAUSE_A_ID, VERSION, contentHashA, "ipfs://a");
        if (aliceWithdraws) {
            vm.prank(ALICE);
            r.withdrawDeposit(KEY_A);
        }
        if (attemptHijackA) {
            vm.prank(BOB);
            address(r).call{value: deposit}(
                abi.encodeCall(ClauseRegistry.registerClause, (CLAUSE_A_ID, VERSION, contentHashB, "ipfs://hijack-a"))
            );
        }

        (address registeredByB1, bool withdrawnB1) = r.depositOf(KEY_B);
        assertEq(registeredByB1, registeredByB0, "B's registeredBy is untouched by anything done to A");
        assertEq(withdrawnB1, withdrawnB0, "B's withdrawn flag is untouched by anything done to A");
        assertEq(r.contentHashOf(KEY_B), contentHashOfB0, "B's content hash is untouched by anything done to A");
        assertEq(r.registered(KEY_B), registeredB0, "B's registered flag is untouched by anything done to A");
    }
}

/// @notice Same five properties, restated for `AssemblyRegistry`'s shape:
///         the key IS the caller-supplied `compositionHash` directly (no
///         name+version indirection), so both keys are left fully symbolic
///         here rather than fixed string constants — a stronger statement
///         of P5 than the clause version can make.
contract HalmosAssemblyRegistry is Test {
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);

    // ── P1: deposit solvency ─────────────────────────────────────────

    function check_solvency_holdsWhateverTwoActorsDo(
        uint96 deposit,
        bytes32 hashA,
        bytes32 hashB,
        bool aliceWithdraws,
        bool bobWithdraws
    ) public {
        vm.assume(hashA != bytes32(0));
        vm.assume(hashB != bytes32(0));
        vm.assume(hashA != hashB);

        AssemblyRegistry r = new AssemblyRegistry(deposit);
        vm.deal(ALICE, uint256(deposit) + 1 ether);
        vm.deal(BOB, uint256(deposit) + 1 ether);

        vm.prank(ALICE);
        r.registerAssembly{value: deposit}(hashA, "ipfs://a");
        vm.prank(BOB);
        r.registerAssembly{value: deposit}(hashB, "ipfs://b");

        if (aliceWithdraws) {
            vm.prank(ALICE);
            r.withdrawDeposit(hashA);
        }
        if (bobWithdraws) {
            vm.prank(BOB);
            r.withdrawDeposit(hashB);
        }

        // NOTE: deliberately NOT re-read via `r.bindings(...)` here. Two
        // independently-symbolic mapping keys, each round-tripped through
        // `bindings()`'s auto-generated getter (a struct containing a
        // dynamic `string`), trips a Halmos internal decoder limit
        // (`NotConcreteError: symbolic memory offset` — the ABI-decode of a
        // dynamic tail whose length-encoding bit is itself symbolic; see
        // https://github.com/a16z/halmos/wiki/warnings#internal-error). Every
        // OTHER property in this file reads `bindings()` with a symbolic key,
        // including after a conditional withdraw, and passes — this is the
        // one place two such reads combine in one property. `aliceWithdraws`
        // / `bobWithdraws` already determine the owed amount exactly: both
        // `withdrawDeposit` calls above are unconditionally successful by
        // construction (fresh registry, valid registrant, called at most
        // once), so recomputing "still owed" from them is not a weaker
        // statement, just one that avoids the decoder boundary. The
        // getter's own correctness after withdraw is covered concretely in
        // `AssemblyRegistryTest.t.sol` (`test_withdrawDeposit_happy`).
        uint256 owed = (aliceWithdraws ? 0 : uint256(deposit)) + (bobWithdraws ? 0 : uint256(deposit));

        assertGe(address(r).balance, owed, "the registry must hold every live deposit");
    }

    function check_liveDepositIsAlwaysWithdrawableInFull(uint96 deposit, bytes32 hashA) public {
        vm.assume(hashA != bytes32(0));

        AssemblyRegistry r = new AssemblyRegistry(deposit);
        vm.deal(ALICE, uint256(deposit) + 1 ether);

        vm.prank(ALICE);
        r.registerAssembly{value: deposit}(hashA, "ipfs://a");

        uint256 before = ALICE.balance;
        vm.prank(ALICE);
        r.withdrawDeposit(hashA);

        assertEq(ALICE.balance, before + deposit, "paid in full, immediately, no cooldown");
        assertEq(address(r).balance, 0, "and nothing is left owed");
    }

    // ── P2: first-write-wins permanence ─────────────────────────────

    function check_firstWriteWins_noSecondRegistrationEverSucceeds(
        uint96 deposit,
        bytes32 hashA,
        bool aliceWithdrawsFirst,
        bool secondCallerIsAlice
    ) public {
        vm.assume(hashA != bytes32(0));

        AssemblyRegistry r = new AssemblyRegistry(deposit);
        vm.deal(ALICE, uint256(deposit) * 2 + 1 ether);
        vm.deal(BOB, uint256(deposit) * 2 + 1 ether);

        vm.prank(ALICE);
        r.registerAssembly{value: deposit}(hashA, "ipfs://original");

        if (aliceWithdrawsFirst) {
            vm.prank(ALICE);
            r.withdrawDeposit(hashA);
        }

        address secondCaller = secondCallerIsAlice ? ALICE : BOB;
        vm.prank(secondCaller);
        (bool ok,) =
            address(r).call{value: deposit}(abi.encodeCall(AssemblyRegistry.registerAssembly, (hashA, "ipfs://hijack")));

        assertFalse(ok, "no second registration for this compositionHash ever succeeds, withdrawn or not");
        (address registeredBy, uint64 registeredAt,, string memory uri) = r.bindings(hashA);
        assertEq(registeredBy, ALICE, "the registeredBy of record is permanent");
        assertEq(uri, "ipfs://original", "contentURI never changes on a failed hijack");
        assertGt(registeredAt, 0, "and the binding stays registered forever");
    }

    // ── P3: withdrawal is one-shot ───────────────────────────────────

    function check_withdrawalIsOneShot_secondWithdrawCannotMoveEth(uint96 deposit, bytes32 hashA) public {
        vm.assume(hashA != bytes32(0));

        AssemblyRegistry r = new AssemblyRegistry(deposit);
        vm.deal(ALICE, uint256(deposit) + 1 ether);

        vm.prank(ALICE);
        r.registerAssembly{value: deposit}(hashA, "ipfs://a");
        vm.prank(ALICE);
        r.withdrawDeposit(hashA);

        uint256 balAfterFirst = ALICE.balance;
        uint256 contractBalAfterFirst = address(r).balance;

        vm.prank(ALICE);
        (bool ok,) = address(r).call(abi.encodeCall(AssemblyRegistry.withdrawDeposit, (hashA)));

        assertFalse(ok, "a second withdraw for this compositionHash cannot succeed");
        assertEq(ALICE.balance, balAfterFirst, "no ETH moves on the second attempt");
        assertEq(address(r).balance, contractBalAfterFirst, "contract balance is unchanged");
    }

    // ── P4: withdrawal ends eligibility, permanently ────────────────

    function check_withdrawalEndsEligibility_andNothingRestoresIt(
        uint96 deposit,
        bytes32 hashA,
        bool attemptReRegister,
        bool attemptSecondWithdraw
    ) public {
        vm.assume(hashA != bytes32(0));

        AssemblyRegistry r = new AssemblyRegistry(deposit);
        vm.deal(ALICE, uint256(deposit) * 2 + 1 ether);
        vm.deal(BOB, uint256(deposit) + 1 ether);

        vm.prank(ALICE);
        r.registerAssembly{value: deposit}(hashA, "ipfs://a");

        (,, bool withdrawnBefore,) = r.bindings(hashA);
        assertFalse(withdrawnBefore, "deposit starts live");

        vm.prank(ALICE);
        r.withdrawDeposit(hashA);

        (,, bool withdrawnAfter,) = r.bindings(hashA);
        assertTrue(withdrawnAfter, "eligibility ends at withdraw (depositWithdrawn == true)");

        if (attemptReRegister) {
            vm.prank(BOB);
            address(r).call{value: deposit}(abi.encodeCall(AssemblyRegistry.registerAssembly, (hashA, "ipfs://hijack")));
        }
        if (attemptSecondWithdraw) {
            vm.prank(ALICE);
            address(r).call(abi.encodeCall(AssemblyRegistry.withdrawDeposit, (hashA)));
        }

        (,, bool withdrawnFinal,) = r.bindings(hashA);
        assertTrue(withdrawnFinal, "and nothing restores it -- this is exactly the RPGF held-at-claim read");
    }

    // ── P5: cross-key isolation ──────────────────────────────────────

    /// @dev Bundles one `bindings(hash)` read behind a single memory pointer
    ///      so a snapshot occupies one stack slot instead of four — needed to
    ///      keep `check_crossKeyIsolation_keyATouchesNothingOfKeyB` under the
    ///      stack limit with 5 symbolic parameters already live (same
    ///      technique as `HalmosUsageCounter.t.sol`'s `Snapshot`).
    struct Binding {
        address registeredBy;
        uint64 registeredAt;
        bool withdrawn;
        string uri;
    }

    function _binding(AssemblyRegistry r, bytes32 hash) internal view returns (Binding memory b) {
        (b.registeredBy, b.registeredAt, b.withdrawn, b.uri) = r.bindings(hash);
    }

    function check_crossKeyIsolation_keyATouchesNothingOfKeyB(
        uint96 deposit,
        bytes32 hashA,
        bytes32 hashB,
        bool aliceWithdraws,
        bool attemptHijackA
    ) public {
        vm.assume(hashA != bytes32(0));
        vm.assume(hashB != bytes32(0));
        vm.assume(hashA != hashB);

        AssemblyRegistry r = new AssemblyRegistry(deposit);
        vm.deal(ALICE, uint256(deposit) * 2 + 1 ether);
        vm.deal(BOB, uint256(deposit) + 1 ether);

        vm.prank(BOB);
        r.registerAssembly{value: deposit}(hashB, "ipfs://b");
        Binding memory before = _binding(r, hashB);

        vm.prank(ALICE);
        r.registerAssembly{value: deposit}(hashA, "ipfs://a");
        if (aliceWithdraws) {
            vm.prank(ALICE);
            r.withdrawDeposit(hashA);
        }
        if (attemptHijackA) {
            vm.prank(BOB);
            address(r).call{value: deposit}(
                abi.encodeCall(AssemblyRegistry.registerAssembly, (hashA, "ipfs://hijack-a"))
            );
        }

        Binding memory afterOps = _binding(r, hashB);
        assertEq(afterOps.registeredBy, before.registeredBy, "B's registeredBy is untouched by anything done to A");
        assertEq(afterOps.registeredAt, before.registeredAt, "B's registeredAt is untouched by anything done to A");
        assertEq(afterOps.withdrawn, before.withdrawn, "B's withdrawn flag is untouched by anything done to A");
        assertEq(afterOps.uri, before.uri, "B's contentURI is untouched by anything done to A");
    }
}
