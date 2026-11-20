// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {ClauseRegistry} from "src/registries/ClauseRegistry.sol";
import {ProcessRegistry} from "src/registries/ProcessRegistry.sol";
import {AgreementRegistry} from "src/registries/AgreementRegistry.sol";

/// @title HalmosClauseRegistry / HalmosProcessRegistry / HalmosAgreementRegistry
///        — the key-bound stake machines designer-of-record eligibility rests on
///
/// @notice `ClauseRegistry`, `ProcessRegistry` and `AgreementRegistry` are
///         `MembersRegistry`'s siblings on a key: each key (the clause key,
///         keccak256 of the spec's pinned bytes / the processDesignHash / the
///         agreementHash) is bound FIRST-WRITE-WINS and PERMANENTLY, and its
///         stake comes back in two steps, as a member's does:
///         `requestWithdrawal` flips the withdrawn flag at once, and
///         `withdraw` pays the stake out only after `withdrawalCooldown`. A
///         withdrawn key can never be registered again by anyone
///         (`AlreadyRegistered` / `ProcessAlreadyRegistered` /
///         `AgreementAlreadyRegistered` guard the key forever, not just the
///         wallet that staked it). The withdrawn flag is read at both ends,
///         by `UsageCounter` when it counts a use and by
///         `RpgfMinter._isAuthor` at the claim —
///         `depositOf[key].withdrawn == false` for a clause,
///         `bindings[key].depositWithdrawn == false` for an assembly and for
///         an agreement. These properties are those assumptions, proved
///         symbolically:
///
///           P1  stake solvency             — the registry holds at least
///                                            what it owes (every live or
///                                            pending stake), under arbitrary
///                                            register/request/claim
///                                            interleavings by two symbolic
///                                            actors; a requested stake is
///                                            claimable in full once the
///                                            cooldown has elapsed, and never
///                                            before.
///           P2  first-write-wins           — once a key is bound, no SECOND
///               permanence                   registration for it ever
///                                            succeeds, for ANY caller
///                                            (including the original
///                                            registrant) and in ANY
///                                            withdrawn state, and the stored
///                                            binding (registeredBy, or
///                                            registeredBy/contentURI) never
///                                            changes.
///           P3  the claim is one-shot      — a second claim for an
///                                            already-paid key cannot move
///                                            ETH, for any caller.
///           P4  the request ends           — the exact bit the counter
///               liveness, permanently        reads flips to "withdrawn" at
///                                            the request and no reachable
///                                            call sequence (re-registration
///                                            attempt, second request) ever
///                                            restores it.
///           P5  cross-key isolation        — registering, requesting, or
///                                            attempting to hijack key A
///                                            never touches key B's binding
///                                            or stake state.
///
///         Each registry takes the key directly from the caller, so every
///         key below is fully symbolic. The cooldown is the deployed 28 days;
///         the claim-timing property takes a symbolic elapsed time.
///
///         Halmos convention: `check_` prefix, not `test_`.
///
/// @dev    WHAT THIS DOES NOT PROVE: that the stake or the cooldown is priced
///         correctly, or anything about `RpgfMinter`'s reward arithmetic. It
///         proves the three registries the counter and the minter read are
///         the machine the sentences above describe. Companion:
///         `HalmosMembersRegistry.t.sol` (the members' cooldown;
///         `reference_halmos_operations` memory has the run recipe).
contract HalmosClauseRegistry is Test {
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    uint256 internal constant COOLDOWN = 28 days;

    // ── P1: deposit solvency ─────────────────────────────────────────

    /// The registry holds at least what it owes: the sum of live
    /// (un-withdrawn) deposits, under arbitrary register/request/claim
    /// interleavings by two symbolic actors and any deposit size.
    function check_solvency_holdsWhateverTwoActorsDo(
        uint96 deposit,
        bytes32 keyA,
        bytes32 keyB,
        bool aliceWithdraws,
        bool bobWithdraws,
        bool aliceClaims,
        bool bobClaims
    ) public {
        vm.assume(keyA != bytes32(0));
        vm.assume(keyB != bytes32(0));
        vm.assume(keyA != keyB);

        ClauseRegistry r = new ClauseRegistry(deposit, COOLDOWN);
        vm.deal(ALICE, uint256(deposit) + 1 ether);
        vm.deal(BOB, uint256(deposit) + 1 ether);

        vm.prank(ALICE);
        r.registerClause{value: deposit}(keyA, "ipfs://a");
        vm.prank(BOB);
        r.registerClause{value: deposit}(keyB, "ipfs://b");

        if (aliceWithdraws) {
            vm.prank(ALICE);
            r.requestWithdrawal(keyA);
        }
        if (bobWithdraws) {
            vm.prank(BOB);
            r.requestWithdrawal(keyB);
        }
        vm.warp(block.timestamp + COOLDOWN);
        if (aliceWithdraws && aliceClaims) {
            vm.prank(ALICE);
            r.withdraw(keyA);
        }
        if (bobWithdraws && bobClaims) {
            vm.prank(BOB);
            r.withdraw(keyB);
        }

        // A stake is owed until it is paid out: live, or requested and
        // still pending. The flag `depositOf` holds flips at the request;
        // the pending half is `releaseAt`.
        (, bool aWithdrawn) = r.depositOf(keyA);
        (, bool bWithdrawn) = r.depositOf(keyB);
        bool aPaid = aWithdrawn && r.releaseAt(keyA) == 0;
        bool bPaid = bWithdrawn && r.releaseAt(keyB) == 0;
        uint256 owed = (aPaid ? 0 : uint256(deposit)) + (bPaid ? 0 : uint256(deposit));

        assertGe(address(r).balance, owed, "the registry must hold every live deposit");
    }

    /// A requested deposit is claimable in full once the cooldown has
    /// elapsed, and no call moves it before: the request pays nothing, and
    /// the claim pays exactly what was booked.
    function check_requestedDepositIsClaimableInFull_onlyAfterTheCooldown(uint96 deposit, bytes32 keyA, uint32 elapsed)
        public
    {
        vm.assume(keyA != bytes32(0));

        ClauseRegistry r = new ClauseRegistry(deposit, COOLDOWN);
        vm.deal(ALICE, uint256(deposit) + 1 ether);

        vm.prank(ALICE);
        r.registerClause{value: deposit}(keyA, "ipfs://a");
        vm.prank(ALICE);
        r.requestWithdrawal(keyA);
        assertEq(address(r).balance, deposit, "the request pays nothing");

        vm.warp(block.timestamp + elapsed);
        uint256 before = ALICE.balance;
        vm.prank(ALICE);
        (bool ok,) = address(r).call(abi.encodeCall(ClauseRegistry.withdraw, (keyA)));

        if (elapsed < COOLDOWN) {
            assertFalse(ok, "no claim before the cooldown");
            assertEq(ALICE.balance, before, "no ETH moves early");
            assertEq(address(r).balance, deposit, "the stake stays locked");
        } else {
            assertTrue(ok, "the claim succeeds once the cooldown has elapsed");
            assertEq(ALICE.balance, before + deposit, "paid in full");
            assertEq(address(r).balance, 0, "and nothing is left owed");
        }
    }

    function check_firstWriteWins_noSecondRegistrationEverSucceeds(
        uint96 deposit,
        bytes32 keyA,
        bool aliceWithdrawsFirst,
        bool secondCallerIsAlice
    ) public {
        vm.assume(keyA != bytes32(0));

        ClauseRegistry r = new ClauseRegistry(deposit, COOLDOWN);
        vm.deal(ALICE, uint256(deposit) * 2 + 1 ether);
        vm.deal(BOB, uint256(deposit) * 2 + 1 ether);

        vm.prank(ALICE);
        r.registerClause{value: deposit}(keyA, "ipfs://original");

        if (aliceWithdrawsFirst) {
            vm.prank(ALICE);
            r.requestWithdrawal(keyA);
        }

        address secondCaller = secondCallerIsAlice ? ALICE : BOB;
        vm.prank(secondCaller);
        (bool ok,) =
            address(r).call{value: deposit}(abi.encodeCall(ClauseRegistry.registerClause, (keyA, "ipfs://hijack")));

        assertFalse(ok, "no second registration for this key ever succeeds, withdrawn or not, original caller or not");
        (address registeredBy,) = r.depositOf(keyA);
        assertEq(registeredBy, ALICE, "the registeredBy of record is permanent");
        assertTrue(r.registered(keyA), "and the binding stays registered forever");
    }

    // ── P3: the claim is one-shot ────────────────────────────────────

    /// A second claim for an already-paid key cannot move ETH,
    /// for the registering wallet or anyone else.
    function check_withdrawalIsOneShot_secondWithdrawCannotMoveEth(uint96 deposit, bytes32 keyA) public {
        vm.assume(keyA != bytes32(0));

        ClauseRegistry r = new ClauseRegistry(deposit, COOLDOWN);
        vm.deal(ALICE, uint256(deposit) + 1 ether);

        vm.prank(ALICE);
        r.registerClause{value: deposit}(keyA, "ipfs://a");
        vm.prank(ALICE);
        r.requestWithdrawal(keyA);
        vm.warp(block.timestamp + COOLDOWN);
        vm.prank(ALICE);
        r.withdraw(keyA);

        uint256 balAfterFirst = ALICE.balance;
        uint256 contractBalAfterFirst = address(r).balance;

        vm.prank(ALICE);
        (bool ok,) = address(r).call(abi.encodeCall(ClauseRegistry.withdraw, (keyA)));

        assertFalse(ok, "a second claim for this key cannot succeed");
        assertEq(ALICE.balance, balAfterFirst, "no ETH moves on the second attempt");
        assertEq(address(r).balance, contractBalAfterFirst, "contract balance is unchanged");
    }

    // ── P4: the request ends liveness, permanently ──────────────────

    /// `depositOf(key).withdrawn` — the EXACT bit `UsageCounter` reads at
    /// the count and `RpgfMinter._isAuthor` at the claim — flips true at the
    /// request and no reachable call
    /// sequence afterward (a re-registration attempt, a second withdrawal
    /// attempt, from any caller) ever restores it.
    function check_withdrawalEndsEligibility_andNothingRestoresIt(
        uint96 deposit,
        bytes32 keyA,
        bool attemptReRegister,
        bool attemptSecondWithdraw
    ) public {
        vm.assume(keyA != bytes32(0));

        ClauseRegistry r = new ClauseRegistry(deposit, COOLDOWN);
        vm.deal(ALICE, uint256(deposit) * 2 + 1 ether);
        vm.deal(BOB, uint256(deposit) + 1 ether);

        vm.prank(ALICE);
        r.registerClause{value: deposit}(keyA, "ipfs://a");

        (, bool withdrawnBefore) = r.depositOf(keyA);
        assertFalse(withdrawnBefore, "deposit starts live");

        vm.prank(ALICE);
        r.requestWithdrawal(keyA);

        (, bool withdrawnAfter) = r.depositOf(keyA);
        assertTrue(withdrawnAfter, "liveness ends at the request (withdrawn == true)");

        // Try every call that MIGHT restore eligibility.
        if (attemptReRegister) {
            vm.prank(BOB);
            address(r).call{value: deposit}(abi.encodeCall(ClauseRegistry.registerClause, (keyA, "ipfs://again")));
        }
        if (attemptSecondWithdraw) {
            vm.prank(ALICE);
            address(r).call(abi.encodeCall(ClauseRegistry.requestWithdrawal, (keyA)));
        }

        (, bool withdrawnFinal) = r.depositOf(keyA);
        assertTrue(withdrawnFinal, "and nothing restores it -- this is the bit read at the count and at the claim");
    }

    // ── P5: cross-key isolation ──────────────────────────────────────

    /// Registering, withdrawing, or attempting to hijack key A never
    /// touches key B's binding or deposit state.
    function check_crossKeyIsolation_keyATouchesNothingOfKeyB(
        uint96 deposit,
        bytes32 keyA,
        bytes32 keyB,
        bool aliceWithdraws,
        bool attemptHijackA
    ) public {
        vm.assume(keyA != bytes32(0));
        vm.assume(keyB != bytes32(0));
        vm.assume(keyA != keyB);

        ClauseRegistry r = new ClauseRegistry(deposit, COOLDOWN);
        vm.deal(ALICE, uint256(deposit) * 2 + 1 ether);
        vm.deal(BOB, uint256(deposit) + 1 ether);

        vm.prank(BOB);
        r.registerClause{value: deposit}(keyB, "ipfs://b");

        (address registeredByB0, bool withdrawnB0) = r.depositOf(keyB);
        bool registeredB0 = r.registered(keyB);

        vm.prank(ALICE);
        r.registerClause{value: deposit}(keyA, "ipfs://a");
        if (aliceWithdraws) {
            vm.prank(ALICE);
            r.requestWithdrawal(keyA);
        }
        if (attemptHijackA) {
            vm.prank(BOB);
            address(r).call{value: deposit}(abi.encodeCall(ClauseRegistry.registerClause, (keyA, "ipfs://hijack-a")));
        }

        (address registeredByB1, bool withdrawnB1) = r.depositOf(keyB);
        assertEq(registeredByB1, registeredByB0, "B's registeredBy is untouched by anything done to A");
        assertEq(withdrawnB1, withdrawnB0, "B's withdrawn flag is untouched by anything done to A");
        assertEq(r.registered(keyB), registeredB0, "B's registered flag is untouched by anything done to A");
    }
}

/// @notice Same five properties, restated for `ProcessRegistry`'s shape:
///         the key is the caller-supplied `processDesignHash`, and both keys
///         are left fully symbolic, as for the clause registry above.
contract HalmosProcessRegistry is Test {
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    uint256 internal constant COOLDOWN = 28 days;

    // ── P1: deposit solvency ─────────────────────────────────────────

    function check_solvency_holdsWhateverTwoActorsDo(
        uint96 deposit,
        bytes32 hashA,
        bytes32 hashB,
        bool aliceWithdraws,
        bool bobWithdraws,
        bool aliceClaims,
        bool bobClaims
    ) public {
        vm.assume(hashA != bytes32(0));
        vm.assume(hashB != bytes32(0));
        vm.assume(hashA != hashB);

        ProcessRegistry r = new ProcessRegistry(deposit, COOLDOWN);
        vm.deal(ALICE, uint256(deposit) + 1 ether);
        vm.deal(BOB, uint256(deposit) + 1 ether);

        vm.prank(ALICE);
        r.registerProcess{value: deposit}(hashA, "ipfs://a");
        vm.prank(BOB);
        r.registerProcess{value: deposit}(hashB, "ipfs://b");

        if (aliceWithdraws) {
            vm.prank(ALICE);
            r.requestWithdrawal(hashA);
        }
        if (bobWithdraws) {
            vm.prank(BOB);
            r.requestWithdrawal(hashB);
        }
        vm.warp(block.timestamp + COOLDOWN);
        if (aliceWithdraws && aliceClaims) {
            vm.prank(ALICE);
            r.withdraw(hashA);
        }
        if (bobWithdraws && bobClaims) {
            vm.prank(BOB);
            r.withdraw(hashB);
        }

        // NOTE: deliberately NOT re-read via `r.bindings(...)` here. Two
        // independently-symbolic mapping keys, each round-tripped through
        // `bindings()`'s auto-generated getter (a struct containing a
        // dynamic `string`), trips a Halmos internal decoder limit
        // (`NotConcreteError: symbolic memory offset` — the ABI-decode of a
        // dynamic tail whose length-encoding bit is itself symbolic; see
        // https://github.com/a16z/halmos/wiki/warnings#internal-error). Every
        // OTHER property in this file reads `bindings()` with a symbolic key,
        // including after a conditional withdrawal, and passes — this is the
        // one place two such reads combine in one property. `aliceWithdraws`
        // / `bobWithdraws` already determine the owed amount exactly: both
        // `requestWithdrawal` and `withdraw` calls above are unconditionally successful by
        // construction (fresh registry, valid registrant, called at most
        // once), so recomputing "still owed" from them is not a weaker
        // statement, just one that avoids the decoder boundary. The
        // getter's own correctness after a withdrawal is covered concretely in
        // `ProcessRegistryTest.t.sol` (`test_withdraw_afterCooldown_paysOnce`).
        uint256 owed =
            (aliceWithdraws && aliceClaims ? 0 : uint256(deposit)) + (bobWithdraws && bobClaims ? 0 : uint256(deposit));

        assertGe(address(r).balance, owed, "the registry must hold every live deposit");
    }

    function check_requestedDepositIsClaimableInFull_onlyAfterTheCooldown(uint96 deposit, bytes32 hashA, uint32 elapsed)
        public
    {
        vm.assume(hashA != bytes32(0));

        ProcessRegistry r = new ProcessRegistry(deposit, COOLDOWN);
        vm.deal(ALICE, uint256(deposit) + 1 ether);

        vm.prank(ALICE);
        r.registerProcess{value: deposit}(hashA, "ipfs://a");
        vm.prank(ALICE);
        r.requestWithdrawal(hashA);
        assertEq(address(r).balance, deposit, "the request pays nothing");

        vm.warp(block.timestamp + elapsed);
        uint256 before = ALICE.balance;
        vm.prank(ALICE);
        (bool ok,) = address(r).call(abi.encodeCall(ProcessRegistry.withdraw, (hashA)));

        if (elapsed < COOLDOWN) {
            assertFalse(ok, "no claim before the cooldown");
            assertEq(ALICE.balance, before, "no ETH moves early");
            assertEq(address(r).balance, deposit, "the stake stays locked");
        } else {
            assertTrue(ok, "the claim succeeds once the cooldown has elapsed");
            assertEq(ALICE.balance, before + deposit, "paid in full");
            assertEq(address(r).balance, 0, "and nothing is left owed");
        }
    }

    function check_firstWriteWins_noSecondRegistrationEverSucceeds(
        uint96 deposit,
        bytes32 hashA,
        bool aliceWithdrawsFirst,
        bool secondCallerIsAlice
    ) public {
        vm.assume(hashA != bytes32(0));

        ProcessRegistry r = new ProcessRegistry(deposit, COOLDOWN);
        vm.deal(ALICE, uint256(deposit) * 2 + 1 ether);
        vm.deal(BOB, uint256(deposit) * 2 + 1 ether);

        vm.prank(ALICE);
        r.registerProcess{value: deposit}(hashA, "ipfs://original");

        if (aliceWithdrawsFirst) {
            vm.prank(ALICE);
            r.requestWithdrawal(hashA);
        }

        address secondCaller = secondCallerIsAlice ? ALICE : BOB;
        vm.prank(secondCaller);
        (bool ok,) =
            address(r).call{value: deposit}(abi.encodeCall(ProcessRegistry.registerProcess, (hashA, "ipfs://hijack")));

        assertFalse(ok, "no second registration for this processDesignHash ever succeeds, withdrawn or not");
        (address registeredBy, uint64 registeredAt,, string memory uri) = r.bindings(hashA);
        assertEq(registeredBy, ALICE, "the registeredBy of record is permanent");
        assertEq(uri, "ipfs://original", "contentURI never changes on a failed hijack");
        assertGt(registeredAt, 0, "and the binding stays registered forever");
    }

    // ── P3: the claim is one-shot ────────────────────────────────────

    function check_withdrawalIsOneShot_secondWithdrawCannotMoveEth(uint96 deposit, bytes32 hashA) public {
        vm.assume(hashA != bytes32(0));

        ProcessRegistry r = new ProcessRegistry(deposit, COOLDOWN);
        vm.deal(ALICE, uint256(deposit) + 1 ether);

        vm.prank(ALICE);
        r.registerProcess{value: deposit}(hashA, "ipfs://a");
        vm.prank(ALICE);
        r.requestWithdrawal(hashA);
        vm.warp(block.timestamp + COOLDOWN);
        vm.prank(ALICE);
        r.withdraw(hashA);

        uint256 balAfterFirst = ALICE.balance;
        uint256 contractBalAfterFirst = address(r).balance;

        vm.prank(ALICE);
        (bool ok,) = address(r).call(abi.encodeCall(ProcessRegistry.withdraw, (hashA)));

        assertFalse(ok, "a second claim for this processDesignHash cannot succeed");
        assertEq(ALICE.balance, balAfterFirst, "no ETH moves on the second attempt");
        assertEq(address(r).balance, contractBalAfterFirst, "contract balance is unchanged");
    }

    // ── P4: the request ends liveness, permanently ──────────────────

    function check_withdrawalEndsEligibility_andNothingRestoresIt(
        uint96 deposit,
        bytes32 hashA,
        bool attemptReRegister,
        bool attemptSecondWithdraw
    ) public {
        vm.assume(hashA != bytes32(0));

        ProcessRegistry r = new ProcessRegistry(deposit, COOLDOWN);
        vm.deal(ALICE, uint256(deposit) * 2 + 1 ether);
        vm.deal(BOB, uint256(deposit) + 1 ether);

        vm.prank(ALICE);
        r.registerProcess{value: deposit}(hashA, "ipfs://a");

        (,, bool withdrawnBefore,) = r.bindings(hashA);
        assertFalse(withdrawnBefore, "deposit starts live");

        vm.prank(ALICE);
        r.requestWithdrawal(hashA);

        (,, bool withdrawnAfter,) = r.bindings(hashA);
        assertTrue(withdrawnAfter, "liveness ends at the request (depositWithdrawn == true)");

        if (attemptReRegister) {
            vm.prank(BOB);
            address(r).call{value: deposit}(abi.encodeCall(ProcessRegistry.registerProcess, (hashA, "ipfs://hijack")));
        }
        if (attemptSecondWithdraw) {
            vm.prank(ALICE);
            address(r).call(abi.encodeCall(ProcessRegistry.requestWithdrawal, (hashA)));
        }

        (,, bool withdrawnFinal,) = r.bindings(hashA);
        assertTrue(withdrawnFinal, "and nothing restores it -- this is the bit read at the count and at the claim");
    }

    // ── P5: cross-key isolation ──────────────────────────────────────

    /// @dev Bundles one `bindings(hash)` read behind a single memory pointer
    ///      so a snapshot occupies one stack entry instead of four — needed to
    ///      keep `check_crossKeyIsolation_keyATouchesNothingOfKeyB` under the
    ///      stack limit with 5 symbolic parameters already live (same
    ///      technique as `HalmosUsageCounter.t.sol`'s `Snapshot`).
    struct Binding {
        address registeredBy;
        uint64 registeredAt;
        bool withdrawn;
        string uri;
    }

    function _binding(ProcessRegistry r, bytes32 hash) internal view returns (Binding memory b) {
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

        ProcessRegistry r = new ProcessRegistry(deposit, COOLDOWN);
        vm.deal(ALICE, uint256(deposit) * 2 + 1 ether);
        vm.deal(BOB, uint256(deposit) + 1 ether);

        vm.prank(BOB);
        r.registerProcess{value: deposit}(hashB, "ipfs://b");
        Binding memory before = _binding(r, hashB);

        vm.prank(ALICE);
        r.registerProcess{value: deposit}(hashA, "ipfs://a");
        if (aliceWithdraws) {
            vm.prank(ALICE);
            r.requestWithdrawal(hashA);
        }
        if (attemptHijackA) {
            vm.prank(BOB);
            address(r).call{value: deposit}(abi.encodeCall(ProcessRegistry.registerProcess, (hashA, "ipfs://hijack-a")));
        }

        Binding memory afterOps = _binding(r, hashB);
        assertEq(afterOps.registeredBy, before.registeredBy, "B's registeredBy is untouched by anything done to A");
        assertEq(afterOps.registeredAt, before.registeredAt, "B's registeredAt is untouched by anything done to A");
        assertEq(afterOps.withdrawn, before.withdrawn, "B's withdrawn flag is untouched by anything done to A");
        assertEq(afterOps.uri, before.uri, "B's contentURI is untouched by anything done to A");
    }
}

/// @notice Same five properties, restated for `AgreementRegistry`'s shape:
///         the key is the caller-supplied `agreementHash`, and both keys are
///         left symbolic over every key the registry takes (any but zero and
///         the two reserved format keys).
contract HalmosAgreementRegistry is Test {
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    uint256 internal constant COOLDOWN = 28 days;

    /// @dev A key the registry takes: non-zero and neither reserved format
    ///      key (the provenance leaf key, the assembly terms leaf key), which
    ///      `registerAgreement` refuses — `AgreementRegistryTest` covers it.
    function _assumeRegistrable(bytes32 key) internal pure {
        vm.assume(key != bytes32(0));
        vm.assume(key != keccak256("figaro-agreement-provenance"));
        vm.assume(key != keccak256("figaro-assembly-terms"));
    }

    // ── P1: stake solvency ─────────────────────────────────────────

    function check_solvency_holdsWhateverTwoActorsDo(
        uint96 stake,
        bytes32 keyA,
        bytes32 keyB,
        bool aliceWithdraws,
        bool bobWithdraws,
        bool aliceClaims,
        bool bobClaims
    ) public {
        _assumeRegistrable(keyA);
        _assumeRegistrable(keyB);
        vm.assume(keyA != keyB);

        AgreementRegistry r = new AgreementRegistry(stake, COOLDOWN);
        vm.deal(ALICE, uint256(stake) + 1 ether);
        vm.deal(BOB, uint256(stake) + 1 ether);

        vm.prank(ALICE);
        r.registerAgreement{value: stake}(keyA, "ipfs://a");
        vm.prank(BOB);
        r.registerAgreement{value: stake}(keyB, "ipfs://b");

        if (aliceWithdraws) {
            vm.prank(ALICE);
            r.requestWithdrawal(keyA);
        }
        if (bobWithdraws) {
            vm.prank(BOB);
            r.requestWithdrawal(keyB);
        }
        vm.warp(block.timestamp + COOLDOWN);
        if (aliceWithdraws && aliceClaims) {
            vm.prank(ALICE);
            r.withdraw(keyA);
        }
        if (bobWithdraws && bobClaims) {
            vm.prank(BOB);
            r.withdraw(keyB);
        }

        // NOTE: deliberately NOT re-read via `r.bindings(...)` here. Two
        // independently-symbolic mapping keys, each round-tripped through
        // `bindings()`'s auto-generated getter (a struct containing a
        // dynamic `string`), trips a Halmos internal decoder limit
        // (`NotConcreteError: symbolic memory offset` — the ABI-decode of a
        // dynamic tail whose length-encoding bit is itself symbolic; see
        // https://github.com/a16z/halmos/wiki/warnings#internal-error). Every
        // OTHER property in this file reads `bindings()` with a symbolic key,
        // including after a conditional withdrawal, and passes — this is the
        // one place two such reads combine in one property. `aliceWithdraws`
        // / `bobWithdraws` already determine the owed amount exactly: both
        // `requestWithdrawal` and `withdraw` calls above are unconditionally successful by
        // construction (fresh registry, valid registrant, called at most
        // once), so recomputing "still owed" from them is not a weaker
        // statement, just one that avoids the decoder boundary. The
        // getter's own correctness after a withdrawal is covered concretely in
        // `AgreementRegistryTest.t.sol` (`test_withdraw_afterCooldown_paysOnce`).
        uint256 owed =
            (aliceWithdraws && aliceClaims ? 0 : uint256(stake)) + (bobWithdraws && bobClaims ? 0 : uint256(stake));

        assertGe(address(r).balance, owed, "the registry must hold every live stake");
    }

    function check_requestedStakeIsClaimableInFull_onlyAfterTheCooldown(uint96 stake, bytes32 keyA, uint32 elapsed)
        public
    {
        vm.assume(keyA != bytes32(0));

        AgreementRegistry r = new AgreementRegistry(stake, COOLDOWN);
        vm.deal(ALICE, uint256(stake) + 1 ether);

        vm.prank(ALICE);
        r.registerAgreement{value: stake}(keyA, "ipfs://a");
        vm.prank(ALICE);
        r.requestWithdrawal(keyA);
        assertEq(address(r).balance, stake, "the request pays nothing");

        vm.warp(block.timestamp + elapsed);
        uint256 before = ALICE.balance;
        vm.prank(ALICE);
        (bool ok,) = address(r).call(abi.encodeCall(AgreementRegistry.withdraw, (keyA)));

        if (elapsed < COOLDOWN) {
            assertFalse(ok, "no claim before the cooldown");
            assertEq(ALICE.balance, before, "no ETH moves early");
            assertEq(address(r).balance, stake, "the stake stays locked");
        } else {
            assertTrue(ok, "the claim succeeds once the cooldown has elapsed");
            assertEq(ALICE.balance, before + stake, "paid in full");
            assertEq(address(r).balance, 0, "and nothing is left owed");
        }
    }

    function check_firstWriteWins_noSecondRegistrationEverSucceeds(
        uint96 stake,
        bytes32 keyA,
        bool aliceWithdrawsFirst,
        bool secondCallerIsAlice
    ) public {
        _assumeRegistrable(keyA);

        AgreementRegistry r = new AgreementRegistry(stake, COOLDOWN);
        vm.deal(ALICE, uint256(stake) * 2 + 1 ether);
        vm.deal(BOB, uint256(stake) * 2 + 1 ether);

        vm.prank(ALICE);
        r.registerAgreement{value: stake}(keyA, "ipfs://original");

        if (aliceWithdrawsFirst) {
            vm.prank(ALICE);
            r.requestWithdrawal(keyA);
        }

        address secondCaller = secondCallerIsAlice ? ALICE : BOB;
        vm.prank(secondCaller);
        (bool ok,) =
            address(r).call{value: stake}(abi.encodeCall(AgreementRegistry.registerAgreement, (keyA, "ipfs://hijack")));

        assertFalse(ok, "no second registration for this agreementHash ever succeeds, withdrawn or not");
        (address registeredBy, uint64 registeredAt,, string memory uri) = r.bindings(keyA);
        assertEq(registeredBy, ALICE, "the registeredBy of record is permanent");
        assertEq(uri, "ipfs://original", "contentURI never changes on a failed hijack");
        assertGt(registeredAt, 0, "and the binding stays registered forever");
    }

    // ── P3: the claim is one-shot ────────────────────────────────────

    function check_withdrawalIsOneShot_secondWithdrawCannotMoveEth(uint96 stake, bytes32 keyA) public {
        _assumeRegistrable(keyA);

        AgreementRegistry r = new AgreementRegistry(stake, COOLDOWN);
        vm.deal(ALICE, uint256(stake) + 1 ether);

        vm.prank(ALICE);
        r.registerAgreement{value: stake}(keyA, "ipfs://a");
        vm.prank(ALICE);
        r.requestWithdrawal(keyA);
        vm.warp(block.timestamp + COOLDOWN);
        vm.prank(ALICE);
        r.withdraw(keyA);

        uint256 balAfterFirst = ALICE.balance;
        uint256 contractBalAfterFirst = address(r).balance;

        vm.prank(ALICE);
        (bool ok,) = address(r).call(abi.encodeCall(AgreementRegistry.withdraw, (keyA)));

        assertFalse(ok, "a second claim for this agreementHash cannot succeed");
        assertEq(ALICE.balance, balAfterFirst, "no ETH moves on the second attempt");
        assertEq(address(r).balance, contractBalAfterFirst, "contract balance is unchanged");
    }

    // ── P4: the request ends liveness, permanently ──────────────────

    function check_withdrawalEndsEligibility_andNothingRestoresIt(
        uint96 stake,
        bytes32 keyA,
        bool attemptReRegister,
        bool attemptSecondWithdraw
    ) public {
        _assumeRegistrable(keyA);

        AgreementRegistry r = new AgreementRegistry(stake, COOLDOWN);
        vm.deal(ALICE, uint256(stake) * 2 + 1 ether);
        vm.deal(BOB, uint256(stake) + 1 ether);

        vm.prank(ALICE);
        r.registerAgreement{value: stake}(keyA, "ipfs://a");

        (,, bool withdrawnBefore,) = r.bindings(keyA);
        assertFalse(withdrawnBefore, "stake starts live");

        vm.prank(ALICE);
        r.requestWithdrawal(keyA);

        (,, bool withdrawnAfter,) = r.bindings(keyA);
        assertTrue(withdrawnAfter, "liveness ends at the request (depositWithdrawn == true)");

        if (attemptReRegister) {
            vm.prank(BOB);
            address(r).call{value: stake}(abi.encodeCall(AgreementRegistry.registerAgreement, (keyA, "ipfs://hijack")));
        }
        if (attemptSecondWithdraw) {
            vm.prank(ALICE);
            address(r).call(abi.encodeCall(AgreementRegistry.requestWithdrawal, (keyA)));
        }

        (,, bool withdrawnFinal,) = r.bindings(keyA);
        assertTrue(withdrawnFinal, "and nothing restores it -- this is exactly the designer-rewards held-at-claim read");
    }

    // ── P5: cross-key isolation ──────────────────────────────────────

    /// @dev Bundles one `bindings(key)` read behind a single memory pointer
    ///      so a snapshot occupies one stack entry instead of four — needed to
    ///      keep `check_crossKeyIsolation_keyATouchesNothingOfKeyB` under the
    ///      stack limit with 5 symbolic parameters already live (same
    ///      technique as `HalmosUsageCounter.t.sol`'s `Snapshot`).
    struct Binding {
        address registeredBy;
        uint64 registeredAt;
        bool withdrawn;
        string uri;
    }

    function _binding(AgreementRegistry r, bytes32 key) internal view returns (Binding memory b) {
        (b.registeredBy, b.registeredAt, b.withdrawn, b.uri) = r.bindings(key);
    }

    function check_crossKeyIsolation_keyATouchesNothingOfKeyB(
        uint96 stake,
        bytes32 keyA,
        bytes32 keyB,
        bool aliceWithdraws,
        bool attemptHijackA
    ) public {
        _assumeRegistrable(keyA);
        _assumeRegistrable(keyB);
        vm.assume(keyA != keyB);

        AgreementRegistry r = new AgreementRegistry(stake, COOLDOWN);
        vm.deal(ALICE, uint256(stake) * 2 + 1 ether);
        vm.deal(BOB, uint256(stake) + 1 ether);

        vm.prank(BOB);
        r.registerAgreement{value: stake}(keyB, "ipfs://b");
        Binding memory before = _binding(r, keyB);

        vm.prank(ALICE);
        r.registerAgreement{value: stake}(keyA, "ipfs://a");
        if (aliceWithdraws) {
            vm.prank(ALICE);
            r.requestWithdrawal(keyA);
        }
        if (attemptHijackA) {
            vm.prank(BOB);
            address(r).call{value: stake}(
                abi.encodeCall(AgreementRegistry.registerAgreement, (keyA, "ipfs://hijack-a"))
            );
        }

        Binding memory afterOps = _binding(r, keyB);
        assertEq(afterOps.registeredBy, before.registeredBy, "B's registeredBy is untouched by anything done to A");
        assertEq(afterOps.registeredAt, before.registeredAt, "B's registeredAt is untouched by anything done to A");
        assertEq(afterOps.withdrawn, before.withdrawn, "B's withdrawn flag is untouched by anything done to A");
        assertEq(afterOps.uri, before.uri, "B's contentURI is untouched by anything done to A");
    }
}
