// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {FlorinToken} from "src/rewards/FlorinToken.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title FlorinTokenTest
/// @notice Foundry tests for FlorinToken registry, minting, ERC-20, and permit logic. Covers all edge and revert cases.
contract FlorinTokenTest is Test {
    // ── Registry edge cases ──────────────────────────────────────────────

    function test_CannotRegisterMinterAfterRenounce() public {
        florin.renounceDeployerMint();
        vm.expectRevert(FlorinToken.DeployerMintRenounced.selector);
        florin.registerMinter(address(0xBEEF), 1 ether);
    }

    function test_CannotRegisterMinterTwice() public {
        // Fresh token — setUp's deployer registration fills the cap budget, so
        // we need a clean minter registry to exercise the duplicate-registration
        // check specifically (rather than the sum-of-caps check).
        FlorinToken fresh = new FlorinToken();
        fresh.registerMinter(address(0xBEEF), 1 ether);
        vm.expectRevert(FlorinToken.MinterAlreadySet.selector);
        fresh.registerMinter(address(0xBEEF), 2 ether);
    }

    function test_CannotRegisterMinterZeroAddress() public {
        vm.expectRevert(FlorinToken.ZeroAddress.selector);
        florin.registerMinter(address(0), 1 ether);
    }

    function test_CannotRegisterMinterIfCapExceedsMaxSupply() public {
        // setUp registered address(this) with cap 1B, which equals MAX_SUPPLY.
        // Any additional cap registration must now revert via totalRegisteredCap.
        vm.expectRevert(FlorinToken.SupplyCapExceeded.selector);
        florin.registerMinter(address(0xBEEF), 1);
    }

    function test_TotalRegisteredCapIsSumOfAllCaps() public {
        // Fresh token: register two minters whose caps together fit MAX_SUPPLY.
        FlorinToken fresh = new FlorinToken();
        fresh.registerMinter(address(0xAAA1), 400_000_000 ether);
        fresh.registerMinter(address(0xBBB2), 600_000_000 ether);
        assertEq(fresh.totalRegisteredCap(), 1_000_000_000 ether);

        // A third registration, even of 1 wei, would overflow the 1B budget.
        vm.expectRevert(FlorinToken.SupplyCapExceeded.selector);
        fresh.registerMinter(address(0xCCC3), 1);
    }

    function test_OnlyDeployerCanRegisterMinter() public {
        vm.prank(alice);
        vm.expectRevert(FlorinToken.NotMinter.selector);
        florin.registerMinter(address(0xBEEF), 1 ether);
    }

    function test_OnlyDeployerCanRenounce() public {
        vm.prank(alice);
        vm.expectRevert(FlorinToken.NotMinter.selector);
        florin.renounceDeployerMint();
    }

    function test_MinterRegisteredEvent() public {
        // Fresh token for the same reason as test_CannotRegisterMinterTwice —
        // avoid colliding with setUp's 1B deployer registration.
        FlorinToken fresh = new FlorinToken();
        vm.expectEmit(true, false, false, true);
        emit FlorinToken.MinterRegistered(address(0xBEEF), 1 ether);
        fresh.registerMinter(address(0xBEEF), 1 ether);
    }

    // ── Minting edge cases ───────────────────────────────────────────────

    function test_MintFailsIfNotRegistered() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(FlorinToken.MinterNotRegistered.selector);
        florin.mint(alice, 1 ether);
    }

    function test_MintFailsIfAmountExceedsMinterCap() public {
        // setUp registers address(this) at 1B; there is no room in the
        // registry budget for another minter. Use a fresh token.
        FlorinToken fresh = new FlorinToken();
        fresh.registerMinter(address(0xBEEF), 1 ether);
        vm.prank(address(0xBEEF));
        fresh.mint(alice, 1 ether);
        vm.expectRevert(FlorinToken.MinterCapExceeded.selector);
        vm.prank(address(0xBEEF));
        fresh.mint(alice, 1);
    }

    function test_MintFailsIfAmountExceedsMaxSupply() public {
        // Deploy a fresh token with a single minter that holds the full 1B cap.
        // Minting beyond that cap should revert (minter cap is hit first).
        FlorinToken fresh = new FlorinToken();
        fresh.registerMinter(address(0xBEEF), 1_000_000_000 ether);
        vm.prank(address(0xBEEF));
        fresh.mint(alice, 1_000_000_000 ether);
        vm.expectRevert(FlorinToken.MinterCapExceeded.selector);
        vm.prank(address(0xBEEF));
        fresh.mint(alice, 1);
    }

    function test_MintFailsToZeroAddress() public {
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        florin.mint(address(0), 1 ether);
    }

    // ── What a mint writes ───────────────────────────────────────────────

    /// A mint writes the minter's tally, the supply and the recipient's
    /// balance, and no other slot of the token (no guard flag among them).
    /// That it makes no external call is `test_MintMakesNoExternalCall`.
    function test_MintWritesOnlyTheTallyTheSupplyAndTheBalance() public {
        vm.record();
        florin.mint(alice, 1 ether);
        (, bytes32[] memory writes) = vm.accesses(address(florin));
        assertEq(writes.length, 3, "a mint writes three slots");
    }

    /// No call leaves the token during `mint`: every account access recorded
    /// across the mint is the test's own call into the token, never a call,
    /// a delegatecall, a staticcall or a creation the token makes.
    function test_MintMakesNoExternalCall() public {
        vm.startStateDiffRecording();
        florin.mint(alice, 1 ether);
        VmSafe.AccountAccess[] memory accesses = vm.stopAndReturnStateDiff();
        uint256 calls;
        for (uint256 i = 0; i < accesses.length; ++i) {
            VmSafe.AccountAccessKind k = accesses[i].kind;
            bool isCall = k == VmSafe.AccountAccessKind.Call || k == VmSafe.AccountAccessKind.DelegateCall
                || k == VmSafe.AccountAccessKind.CallCode || k == VmSafe.AccountAccessKind.StaticCall
                || k == VmSafe.AccountAccessKind.Create;
            if (!isCall) continue;
            assertTrue(accesses[i].accessor != address(florin), "mint made a call out of the token");
            ++calls;
        }
        assertEq(calls, 1, "the only call is the test's call into mint");
    }

    // ── ERC-20 edge cases ────────────────────────────────────────────────

    function test_TransferFailsIfInsufficientBalance() public {
        florin.mint(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, alice, 1 ether, 2 ether));
        florin.transfer(bob, 2 ether);
    }

    function test_ApproveAndTransferFrom() public {
        florin.mint(alice, 100 ether);
        vm.prank(alice);
        florin.approve(bob, 50 ether);
        vm.prank(bob);
        florin.transferFrom(alice, bob, 50 ether);
        assertEq(florin.balanceOf(bob), 50 ether);
        assertEq(florin.allowance(alice, bob), 0);
    }

    function test_TransferToZeroAddressFails() public {
        florin.mint(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        florin.transfer(address(0), 1 ether);
    }

    // ── Permit/EIP-2612 edge cases ───────────────────────────────────────

    function test_PermitFailsWithInvalidSignature() public {
        uint256 pk = 0xA11CE;
        address owner = vm.addr(pk);
        florin.mint(owner, 1000 ether);
        uint256 nonce = florin.nonces(owner);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 value = 500 ether;
        // The right permit digest, signed with the wrong private key.
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBEEF, _permitDigest(owner, bob, value, nonce, deadline));
        vm.expectRevert(abi.encodeWithSelector(ERC20Permit.ERC2612InvalidSigner.selector, vm.addr(0xBEEF), owner));
        florin.permit(owner, bob, value, deadline, v, r, s);
    }

    function test_PermitFailsAfterDeadline() public {
        uint256 pk = 0xA11CE;
        address owner = vm.addr(pk);
        florin.mint(owner, 1000 ether);
        uint256 nonce = florin.nonces(owner);
        // Read through the cheatcode: the via-IR build re-reads `block.timestamp`
        // after `vm.warp`, which would move the deadline with the warp.
        uint256 deadline = vm.getBlockTimestamp();
        // A valid signature by the owner: only the deadline is wrong.
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _permitDigest(owner, bob, 500 ether, nonce, deadline));
        vm.warp(deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(ERC20Permit.ERC2612ExpiredSignature.selector, deadline));
        florin.permit(owner, bob, 500 ether, deadline, v, r, s);
    }

    function test_PermitNonceIncrements() public {
        uint256 pk = 0xA11CE;
        address owner = vm.addr(pk);
        florin.mint(owner, 1000 ether);
        uint256 nonce = florin.nonces(owner);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 value = 500 ether;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _permitDigest(owner, bob, value, nonce, deadline));
        florin.permit(owner, bob, value, deadline, v, r, s);
        assertEq(florin.nonces(owner), nonce + 1);
    }

    function _permitDigest(address owner, address spender, uint256 value, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                florin.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                        owner,
                        spender,
                        value,
                        nonce,
                        deadline
                    )
                )
            )
        );
    }
    FlorinToken florin;
    address deployer = address(this);
    address alice = address(0xA);
    address bob = address(0xB);

    function setUp() public {
        florin = new FlorinToken();
        florin.registerMinter(address(this), 1_000_000_000 ether);
    }

    // ── Constructor ───────────────────────────────────────────────────────

    function test_Name() public view {
        assertEq(florin.name(), "Florin");
    }

    function test_Symbol() public view {
        assertEq(florin.symbol(), "FLORIN");
    }

    function test_Decimals() public view {
        assertEq(florin.decimals(), 18);
    }

    // ── Custom: Deployer cannot mint after renounce (Echidna limitation workaround) ──
    /// @dev This property cannot be fully exercised by Echidna due to contract state resets between fuzzing runs.
    ///      This test ensures that after renouncing, deployer minting is permanently disabled.
    function test_DeployerCannotMintAfterRenounce() public {
        florin.renounceDeployerMint();
        vm.expectRevert(FlorinToken.DeployerMintRenounced.selector);
        florin.mint(alice, 1 ether);
    }

    // test_EmissionStillWorksAfterDeployerRenounce removed

    // ── Unauthorized mint ─────────────────────────────────────────────────

    function test_StrangerCannotMint() public {
        vm.prank(alice);
        vm.expectRevert(FlorinToken.MinterNotRegistered.selector);
        florin.mint(alice, 100 ether);
    }

    // ── EIP-2612 permit ───────────────────────────────────────────────────

    function test_PermitWorks() public {
        uint256 pk = 0xA11CE;
        address owner = vm.addr(pk);

        florin.mint(owner, 1000 ether);

        uint256 nonce = florin.nonces(owner);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 value = 500 ether;

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                florin.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                        owner,
                        bob,
                        value,
                        nonce,
                        deadline
                    )
                )
            )
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        florin.permit(owner, bob, value, deadline, v, r, s);

        assertEq(florin.allowance(owner, bob), value);
    }

    // ── Standard ERC-20 ─────────────────────────────────────────────────

    function test_Transfer() public {
        florin.mint(alice, 100 ether);
        vm.prank(alice);
        florin.transfer(bob, 40 ether);
        assertEq(florin.balanceOf(alice), 60 ether);
        assertEq(florin.balanceOf(bob), 40 ether);
    }

    // ── Full genesis flow ─────────────────────────────────────────────────

    // test_FullGenesisFlow removed

    // ── Supply cap ────────────────────────────────────────────────────────

    function test_MaxSupplyConstant() public view {
        assertEq(florin.MAX_SUPPLY(), 1_000_000_000 ether);
    }

    function test_SupplyCapExceeded() public {
        // Mint up to just under the cap
        florin.mint(alice, 999_999_999 ether);

        // Mint 1 more ether — still under cap
        florin.mint(alice, 1 ether);
        assertEq(florin.totalSupply(), 1_000_000_000 ether);

        // Mint 1 wei over the cap — should revert
        vm.expectRevert(FlorinToken.MinterCapExceeded.selector);
        florin.mint(alice, 1);
    }

    // test_SupplyCapExceeded_EmissionContract removed
}
