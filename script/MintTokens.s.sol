// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

interface IMockERC20 {
    function mint(address to, uint256 amount) external;
}

contract MintTokensScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address tokenAddress = vm.envAddress("TOKEN_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        IMockERC20 token = IMockERC20(tokenAddress);

        // Mint 100,000 TEST tokens to each of the 10 Anvil accounts
        address[10] memory accounts = [
            0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266,
            0x70997970C51812dc3A010C7d01b50e0d17dc79C8,
            0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,
            0x90F79bf6EB2c4f870365E785982E1f101E93b906,
            0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65,
            0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc,
            0x976EA74026E726554dB657fA54763abd0C3a0aa9,
            0x14dC79964da2C08b23698B3D3cc7Ca32193d9955,
            0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f,
            0xa0Ee7A142d267C1f36714E4a8F75612F20a79720
        ];

        uint256 mintAmount = 100_000 ether; // 100,000 tokens per account

        for (uint256 i = 0; i < accounts.length; i++) {
            token.mint(accounts[i], mintAmount);
            console.log("Minted", mintAmount / 1e18, "TEST to:", accounts[i]);
        }

        vm.stopBroadcast();

        console.log("");
        console.log("Total minted:", (mintAmount * 10) / 1e18, "TEST");
    }
}
