// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import "../src/FigaroCore.sol";
import "../src/AttestationCoordinator.sol";
import "../src/SchemaRegistry.sol";
import "../src/OperatorRegistry.sol";
import "../src/DutchAuction.sol";
import "../src/fig/FigToken.sol";
import "../src/mocks/MockPermitToken.sol";
import "../src/mocks/MockSP1Verifier.sol";
import "../src/FigaroBatchVerifier.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Minimal mock token for local dev.
contract MockToken is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {
        _mint(msg.sender, 1_000_000 ether);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @title Deploy — Full protocol stack to local Anvil
/// @notice Deploys: FigaroCore, AttestationCoordinator, SchemaRegistry,
///         OperatorRegistry, DutchAuction, FigToken, MockToken, MockPermitToken.
///         Registers reference schemas. Mints test tokens to Anvil accounts.
///
///         Devnet FIG allocation (mirrors canonical 10/30/60 shape at token scale):
///           100M (10%) → deployer's wallet (stands in for founder + DAO + airdrop
///                                            placeholders on devnet; staged airdrop
///                                            and dedicated wallets are mainnet-only).
///           The canonical allocation (100M founder / 300M DAO / 600M staged airdrop
///           at yr 2/5/9) is realized in script/DeployMainnet.s.sol.
contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // ── Mock tokens ─────────────────────────────────────────────
        MockToken token = new MockToken();
        console.log("MockToken deployed at:", address(token));

        MockPermitToken permitToken = new MockPermitToken();
        console.log("MockPermitToken deployed at:", address(permitToken));

        // ── Core ────────────────────────────────────────────────────
        FigaroCore core = new FigaroCore();
        console.log("FigaroCore deployed at:", address(core));

        // ── AttestationCoordinator ──────────────────────────────────
        AttestationCoordinator attestation = new AttestationCoordinator(address(core));
        console.log("AttestationCoordinator deployed at:", address(attestation));

        // ── SchemaRegistry ──────────────────────────────────────────
        SchemaRegistry schemas = new SchemaRegistry();
        console.log("SchemaRegistry deployed at:", address(schemas));

        // Register reference schemas
        schemas.registerSchema(keccak256("figaro-handoff-v1"), 1, keccak256("ipfs://figaro-handoff/v1"));
        schemas.registerSchema(
            keccak256("figaro-delivery-lifecycle-v1"), 1, keccak256("ipfs://figaro-delivery-lifecycle/v1")
        );
        schemas.registerSchema(keccak256("figaro-ghg-disclosure-v1"), 1, keccak256("ipfs://figaro-ghg-disclosure/v1"));
        schemas.registerSchema(keccak256("figaro-proximity-v1"), 1, keccak256("ipfs://figaro-proximity/v1"));
        schemas.registerSchema(keccak256("figaro-commerce-v1"), 1, keccak256("ipfs://figaro-commerce/v1"));
        schemas.registerSchema(keccak256("erc8004-agent-services-v1"), 1, keccak256("ipfs://erc8004-agent-services/v1"));
        console.log("Registered 6 reference schemas");

        // ── OperatorRegistry ────────────────────────────────────────
        OperatorRegistry operators = new OperatorRegistry(0.001 ether, 365 days);
        console.log("OperatorRegistry deployed at:", address(operators));

        // ── DutchAuction ────────────────────────────────────────────
        DutchAuction auction = new DutchAuction(
            30 minutes, // duration
            2000 // 20% floor
        );
        console.log("DutchAuction deployed at:", address(auction));

        // ── FIG Token ───────────────────────────────────────────────
        FigToken fig = new FigToken();
        console.log("FigToken deployed at:", address(fig));

        // Devnet genesis mint: 100M to deployer as a simplified placeholder
        // for testing. Mainnet performs the 10/30/60 canonical distribution
        // in DeployMainnet.s.sol.
        address deployer = vm.addr(deployerPrivateKey);
        fig.registerMinter(deployer, 100_000_000 ether);
        fig.mint(deployer, 100_000_000 ether);
        fig.renounceDeployerMint();
        console.log("Deployer mint renounced");

        // ── BatchVerifier (SP1 — mock verifier for devnet) ──────────
        // Genesis root = keccak256 of 7 concatenated sub-hashes:
        // 6 × keccak256("") (empty BTreeMaps) + keccak256(0u64_be || 0u256_be) (emission).
        // Matches the Rust kernel's KernelState::new().compute_root().
        //
        // Note: FigaroBatchVerifier is NOT a FIG minter and never will be.
        // The removed settlement-anchored emission model is deprecated.
        bytes32 genesisRoot = 0x10fc52ca200d9d5568c46b8435274d86183f39c5a9d8648b4006ec68f8058bc9;
        FigaroBatchVerifier batchVerifier = new FigaroBatchVerifier(
            address(new MockSP1Verifier()),
            keccak256("figaro-kernel-dev"), // devnet program vKey
            genesisRoot
        );
        console.log("FigaroBatchVerifier deployed at:", address(batchVerifier));

        // ── Mint test tokens to Anvil accounts ──────────────────────
        address[9] memory testAccounts = [
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
        for (uint256 i = 0; i < testAccounts.length; i++) {
            token.mint(testAccounts[i], 100_000 ether);
            permitToken.mint(testAccounts[i], 100_000 ether);
        }
        console.log("Minted test tokens to Anvil accounts [1]-[9]");

        vm.stopBroadcast();

        console.log("---");
        console.log("Deployment complete. Addresses:");
        console.log("  NEXT_PUBLIC_FIGARO_CORE=", address(core));
        console.log("  NEXT_PUBLIC_TOKEN_ADDRESS=", address(token));
        console.log("  NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS=", address(permitToken));
        console.log("  NEXT_PUBLIC_ATTESTATION_COORDINATOR=", address(attestation));
        console.log("  NEXT_PUBLIC_SCHEMA_REGISTRY=", address(schemas));
        console.log("  NEXT_PUBLIC_OPERATOR_REGISTRY=", address(operators));
        console.log("  NEXT_PUBLIC_DUTCH_AUCTION=", address(auction));
        console.log("  NEXT_PUBLIC_FIG_TOKEN_ADDRESS=", address(fig));
        // console.log(
        //     "  NEXT_PUBLIC_FIG_EMISSION_ADDRESS=",
        // );
        console.log("  NEXT_PUBLIC_BATCH_VERIFIER=", address(batchVerifier));
    }
}
