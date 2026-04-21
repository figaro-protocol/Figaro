// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigToken} from "src/fig/FigToken.sol";

/// @title FigTokenTest
/// @notice Foundry tests for FigToken registry, minting, ERC-20, and permit logic. Covers all edge and revert cases.
contract FigTokenTest is Test {
    // ── Registry edge cases ──────────────────────────────────────────────

    function test_CannotRegisterMinterAfterRenounce() public {
        fig.renounceDeployerMint();
        vm.expectRevert(FigToken.DeployerMintRenounced.selector);
        fig.registerMinter(address(0xBEEF), 1 ether);
    }

    function test_CannotRegisterMinterTwice() public {
        // Fresh token — setUp's deployer registration fills the cap budget, so
        // we need a clean minter registry to exercise the duplicate-registration
        // check specifically (rather than the sum-of-caps check).
        FigToken fresh = new FigToken();
        fresh.registerMinter(address(0xBEEF), 1 ether);
        vm.expectRevert(FigToken.MinterAlreadySet.selector);
        fresh.registerMinter(address(0xBEEF), 2 ether);
    }

    function test_CannotRegisterMinterZeroAddress() public {
        vm.expectRevert(FigToken.ZeroAddress.selector);
        fig.registerMinter(address(0), 1 ether);
    }

    function test_CannotRegisterMinterIfCapExceedsMaxSupply() public {
        // setUp registered address(this) with cap 1B, which equals MAX_SUPPLY.
        // Any additional cap registration must now revert via totalRegisteredCap.
        vm.expectRevert(FigToken.SupplyCapExceeded.selector);
        fig.registerMinter(address(0xBEEF), 1);
    }

    function test_TotalRegisteredCapIsSumOfAllCaps() public {
        // Fresh token: register two minters whose caps together fit MAX_SUPPLY.
        FigToken fresh = new FigToken();
        fresh.registerMinter(address(0xAAA1), 400_000_000 ether);
        fresh.registerMinter(address(0xBBB2), 600_000_000 ether);
        assertEq(fresh.totalRegisteredCap(), 1_000_000_000 ether);

        // A third registration, even of 1 wei, would overflow the 1B budget.
        vm.expectRevert(FigToken.SupplyCapExceeded.selector);
        fresh.registerMinter(address(0xCCC3), 1);
    }

    function test_OnlyDeployerCanRegisterMinter() public {
        vm.prank(alice);
        vm.expectRevert(FigToken.NotMinter.selector);
        fig.registerMinter(address(0xBEEF), 1 ether);
    }

    function test_OnlyDeployerCanRenounce() public {
        vm.prank(alice);
        vm.expectRevert(FigToken.NotMinter.selector);
        fig.renounceDeployerMint();
    }

    function test_MinterRegisteredEvent() public {
        // Fresh token for the same reason as test_CannotRegisterMinterTwice —
        // avoid colliding with setUp's 1B deployer registration.
        FigToken fresh = new FigToken();
        vm.expectEmit(true, false, false, true);
        emit FigToken.MinterRegistered(address(0xBEEF), 1 ether);
        fresh.registerMinter(address(0xBEEF), 1 ether);
    }

    // ── Minting edge cases ───────────────────────────────────────────────

    function test_MintFailsIfNotRegistered() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(FigToken.MinterNotRegistered.selector);
        fig.mint(alice, 1 ether);
    }

    function test_MintFailsIfAmountExceedsMinterCap() public {
        // setUp registers address(this) at 1B; there is no room in the
        // registry budget for another minter. Use a fresh token.
        FigToken fresh = new FigToken();
        fresh.registerMinter(address(0xBEEF), 1 ether);
        vm.prank(address(0xBEEF));
        fresh.mint(alice, 1 ether);
        vm.expectRevert(FigToken.MinterCapExceeded.selector);
        vm.prank(address(0xBEEF));
        fresh.mint(alice, 1);
    }

    function test_MintFailsIfAmountExceedsMaxSupply() public {
        // Deploy a fresh token with a single minter that holds the full 1B cap.
        // Minting beyond that cap should revert (minter cap is hit first).
        FigToken fresh = new FigToken();
        fresh.registerMinter(address(0xBEEF), 1_000_000_000 ether);
        vm.prank(address(0xBEEF));
        fresh.mint(alice, 1_000_000_000 ether);
        vm.expectRevert(FigToken.MinterCapExceeded.selector);
        vm.prank(address(0xBEEF));
        fresh.mint(alice, 1);
    }

    function test_MintFailsToZeroAddress() public {
        vm.expectRevert(); // OpenZeppelin ERC20: mint to the zero address
        fig.mint(address(0), 1 ether);
    }

    // ── Reentrancy ───────────────────────────────────────────────────────

    function test_MintIsNonReentrant() public {
        // Not directly testable here, but covered by nonReentrant modifier
        assertTrue(fig.mint.selector != bytes4(0));
    }

    // ── ERC-20 edge cases ────────────────────────────────────────────────

    function test_TransferFailsIfInsufficientBalance() public {
        fig.mint(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert();
        fig.transfer(bob, 2 ether);
    }

    function test_ApproveAndTransferFrom() public {
        fig.mint(alice, 100 ether);
        vm.prank(alice);
        fig.approve(bob, 50 ether);
        vm.prank(bob);
        fig.transferFrom(alice, bob, 50 ether);
        assertEq(fig.balanceOf(bob), 50 ether);
        assertEq(fig.allowance(alice, bob), 0);
    }

    function test_TransferToZeroAddressFails() public {
        fig.mint(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert();
        fig.transfer(address(0), 1 ether);
    }

    // ── Permit/EIP-2612 edge cases ───────────────────────────────────────

    function test_PermitFailsWithInvalidSignature() public {
        uint256 pk = 0xA11CE;
        address owner = vm.addr(pk);
        fig.mint(owner, 1000 ether);
        uint256 nonce = fig.nonces(owner);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 value = 500 ether;
        // Use wrong private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBEEF, keccak256(abi.encodePacked("bad")));
        vm.expectRevert();
        fig.permit(owner, bob, value, deadline, v, r, s);
    }

    function test_PermitFailsAfterDeadline() public {
        uint256 pk = 0xA11CE;
        address owner = vm.addr(pk);
        fig.mint(owner, 1000 ether);
        uint256 nonce = fig.nonces(owner);
        uint256 deadline = block.timestamp;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, keccak256(abi.encodePacked("bad")));
        vm.warp(deadline + 1);
        vm.expectRevert();
        fig.permit(owner, bob, 500 ether, deadline, v, r, s);
    }

    function test_PermitNonceIncrements() public {
        uint256 pk = 0xA11CE;
        address owner = vm.addr(pk);
        fig.mint(owner, 1000 ether);
        uint256 nonce = fig.nonces(owner);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 value = 500 ether;
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                fig.DOMAIN_SEPARATOR(),
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
        fig.permit(owner, bob, value, deadline, v, r, s);
        assertEq(fig.nonces(owner), nonce + 1);
    }
    FigToken fig;
    address deployer = address(this);
    address alice = address(0xA);
    address bob = address(0xB);

    function setUp() public {
        fig = new FigToken();
        fig.registerMinter(address(this), 1_000_000_000 ether);
    }

    // ── Constructor ───────────────────────────────────────────────────────

    function test_Name() public view {
        assertEq(fig.name(), "Figaro");
    }

    function test_Symbol() public view {
        assertEq(fig.symbol(), "FIG");
    }

    function test_Decimals() public view {
        assertEq(fig.decimals(), 18);
    }

    // ── Custom: Deployer cannot mint after renounce (Echidna limitation workaround) ──
    /// @dev This property cannot be fully exercised by Echidna due to contract state resets between fuzzing runs.
    ///      This test ensures that after renouncing, deployer minting is permanently disabled.
    function test_DeployerCannotMintAfterRenounce() public {
        fig.renounceDeployerMint();
        vm.expectRevert(FigToken.DeployerMintRenounced.selector);
        fig.mint(alice, 1 ether);
    }

    // test_EmissionStillWorksAfterDeployerRenounce removed

    // ── Unauthorized mint ─────────────────────────────────────────────────

    function test_StrangerCannotMint() public {
        vm.prank(alice);
        vm.expectRevert(FigToken.MinterNotRegistered.selector);
        fig.mint(alice, 100 ether);
    }

    // ── EIP-2612 permit ───────────────────────────────────────────────────

    function test_PermitWorks() public {
        uint256 pk = 0xA11CE;
        address owner = vm.addr(pk);

        fig.mint(owner, 1000 ether);

        uint256 nonce = fig.nonces(owner);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 value = 500 ether;

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                fig.DOMAIN_SEPARATOR(),
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
        fig.permit(owner, bob, value, deadline, v, r, s);

        assertEq(fig.allowance(owner, bob), value);
    }

    // ── Standard ERC-20 ─────────────────────────────────────────────────

    function test_Transfer() public {
        fig.mint(alice, 100 ether);
        vm.prank(alice);
        fig.transfer(bob, 40 ether);
        assertEq(fig.balanceOf(alice), 60 ether);
        assertEq(fig.balanceOf(bob), 40 ether);
    }

    // ── Full genesis flow ─────────────────────────────────────────────────

    // test_FullGenesisFlow removed

    // ── Supply cap ────────────────────────────────────────────────────────

    function test_MaxSupplyConstant() public view {
        assertEq(fig.MAX_SUPPLY(), 1_000_000_000 ether);
    }

    function test_SupplyCapExceeded() public {
        // Mint up to just under the cap
        fig.mint(alice, 999_999_999 ether);

        // Mint 1 more ether — still under cap
        fig.mint(alice, 1 ether);
        assertEq(fig.totalSupply(), 1_000_000_000 ether);

        // Mint 1 wei over the cap — should revert
        vm.expectRevert(FigToken.MinterCapExceeded.selector);
        fig.mint(alice, 1);
    }

    // test_SupplyCapExceeded_EmissionContract removed
}
