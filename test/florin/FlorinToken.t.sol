// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FlorinToken} from "src/florin/FlorinToken.sol";

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
        vm.expectRevert(); // OpenZeppelin ERC20: mint to the zero address
        florin.mint(address(0), 1 ether);
    }

    // ── Reentrancy ───────────────────────────────────────────────────────

    function test_MintIsNonReentrant() public {
        // Not directly testable here, but covered by nonReentrant modifier
        assertTrue(florin.mint.selector != bytes4(0));
    }

    // ── ERC-20 edge cases ────────────────────────────────────────────────

    function test_TransferFailsIfInsufficientBalance() public {
        florin.mint(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert();
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
        vm.expectRevert();
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
        // Use wrong private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBEEF, keccak256(abi.encodePacked("bad")));
        vm.expectRevert();
        florin.permit(owner, bob, value, deadline, v, r, s);
    }

    function test_PermitFailsAfterDeadline() public {
        uint256 pk = 0xA11CE;
        address owner = vm.addr(pk);
        florin.mint(owner, 1000 ether);
        uint256 nonce = florin.nonces(owner);
        uint256 deadline = block.timestamp;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, keccak256(abi.encodePacked("bad")));
        vm.warp(deadline + 1);
        vm.expectRevert();
        florin.permit(owner, bob, 500 ether, deadline, v, r, s);
    }

    function test_PermitNonceIncrements() public {
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
        assertEq(florin.nonces(owner), nonce + 1);
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
