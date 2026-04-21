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
import "../src/fig/StagedMerkleAirdrop.sol";
import "../src/FigaroBatchVerifier.sol";

/// @title DeployMainnet — Mainnet deployment of the full Figaro V5 protocol stack
///
/// @notice Deploys all production contracts with no mocks. All security-sensitive
///         parameters are read from environment variables so they can be verified
///         independently before broadcast.
///
/// Required environment variables:
///   PRIVATE_KEY                — deployer private key (or use hardware wallet via flags)
///   SP1_VERIFIER               — address of the deployed Succinct SP1 verifier
///   SP1_PROGRAM_VKEY           — bytes32 verification key of the compiled figaro-kernel program
///   GENESIS_ROOT               — bytes32 initial state root from genesis KernelState::new()
///   FOUNDER_WALLET             — address receiving the 100M founder allocation at genesis
///   DAO_WALLET                 — address receiving the 300M DAO allocation at genesis
///   AIRDROP_ROOT_Y2            — bytes32 merkle root for the year-2 airdrop (300M)
///   AIRDROP_ROOT_Y5            — bytes32 merkle root for the year-5 airdrop (200M)
///   AIRDROP_ROOT_Y9            — bytes32 merkle root for the year-9 airdrop (100M)
///   AIRDROP_UNLOCK_Y2          — unix timestamp at which year-2 claims open
///   AIRDROP_UNLOCK_Y5          — unix timestamp at which year-5 claims open
///   AIRDROP_UNLOCK_Y9          — unix timestamp at which year-9 claims open
///
/// FIG allocation (1B total, canonical):
///   100M  (10%)  founders — genesis mint to FOUNDER_WALLET (no vesting, no unlock)
///   300M  (30%)  DAO      — genesis mint to DAO_WALLET     (no vesting, no unlock)
///   600M  (60%)  airdrops — one StagedMerkleAirdrop with three staged roots:
///                             stage 0 (year 2): 300M   (30% of total)
///                             stage 1 (year 5): 200M   (20% of total)
///                             stage 2 (year 9): 100M   (10% of total)
///
/// No settlement-anchored emission. No batch-path minting. FigaroBatchVerifier
/// is NOT a FIG minter and will never be registered as one.
///
/// @dev Deployer renounces minting rights at the end of this script. No new minters
///      can ever be registered afterward.
contract DeployMainnet is Script {
    uint256 constant FOUNDER_ALLOC = 100_000_000 ether; // 10%
    uint256 constant DAO_ALLOC = 300_000_000 ether; // 30%
    uint256 constant AIRDROP_ALLOC = 600_000_000 ether; // 60% (300 + 200 + 100)

    // Deployment output addresses — populated by run(), logged at the end.
    address internal _core;
    address internal _attestation;
    address internal _schemas;
    address internal _operators;
    address internal _auction;
    address internal _fig;
    address internal _airdrop;
    address internal _batchVerifier;

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");

        _validateEnv();

        vm.startBroadcast(privateKey);

        _deployProtocol();
        _deployFigEcosystem(privateKey);
        _deployBatchVerifier();

        vm.stopBroadcast();

        _logAddresses();
    }

    // ── Environment validation ───────────────────────────────────────

    function _validateEnv() internal view {
        require(vm.envAddress("SP1_VERIFIER") != address(0), "SP1_VERIFIER not set");
        require(vm.envBytes32("SP1_PROGRAM_VKEY") != bytes32(0), "SP1_PROGRAM_VKEY not set");
        require(vm.envBytes32("GENESIS_ROOT") != bytes32(0), "GENESIS_ROOT not set");
        require(vm.envAddress("FOUNDER_WALLET") != address(0), "FOUNDER_WALLET not set");
        require(vm.envAddress("DAO_WALLET") != address(0), "DAO_WALLET not set");
        require(vm.envBytes32("AIRDROP_ROOT_Y2") != bytes32(0), "AIRDROP_ROOT_Y2 not set");
        require(vm.envBytes32("AIRDROP_ROOT_Y5") != bytes32(0), "AIRDROP_ROOT_Y5 not set");
        require(vm.envBytes32("AIRDROP_ROOT_Y9") != bytes32(0), "AIRDROP_ROOT_Y9 not set");
        require(vm.envUint("AIRDROP_UNLOCK_Y2") != 0, "AIRDROP_UNLOCK_Y2 not set");
        require(vm.envUint("AIRDROP_UNLOCK_Y5") != 0, "AIRDROP_UNLOCK_Y5 not set");
        require(vm.envUint("AIRDROP_UNLOCK_Y9") != 0, "AIRDROP_UNLOCK_Y9 not set");
    }

    // ── Protocol kernel + extensions ────────────────────────────────

    function _deployProtocol() internal {
        FigaroCore core = new FigaroCore();
        _core = address(core);
        console.log("FigaroCore:             ", _core);

        AttestationCoordinator attestation = new AttestationCoordinator(_core);
        _attestation = address(attestation);
        console.log("AttestationCoordinator: ", _attestation);

        SchemaRegistry schemas = new SchemaRegistry();
        _schemas = address(schemas);
        console.log("SchemaRegistry:         ", _schemas);

        schemas.registerSchema(keccak256("figaro-handoff-v1"), 1, keccak256("ipfs://figaro-handoff/v1"));
        schemas.registerSchema(
            keccak256("figaro-delivery-lifecycle-v1"), 1, keccak256("ipfs://figaro-delivery-lifecycle/v1")
        );
        schemas.registerSchema(keccak256("figaro-ghg-disclosure-v1"), 1, keccak256("ipfs://figaro-ghg-disclosure/v1"));
        schemas.registerSchema(keccak256("figaro-proximity-v1"), 1, keccak256("ipfs://figaro-proximity/v1"));
        schemas.registerSchema(keccak256("figaro-commerce-v1"), 1, keccak256("ipfs://figaro-commerce/v1"));
        schemas.registerSchema(keccak256("erc8004-agent-services-v1"), 1, keccak256("ipfs://erc8004-agent-services/v1"));
        console.log("SchemaRegistry: 6 reference schemas registered");

        OperatorRegistry operators = new OperatorRegistry(0.001 ether, 365 days);
        _operators = address(operators);
        console.log("OperatorRegistry:       ", _operators);

        DutchAuction auction = new DutchAuction(30 minutes, 2000);
        _auction = address(auction);
        console.log("DutchAuction:           ", _auction);
    }

    // ── FIG token + genesis distribution + staged airdrop ───────────

    function _deployFigEcosystem(uint256 privateKey) internal {
        FigToken fig = new FigToken();
        _fig = address(fig);
        console.log("FigToken:               ", _fig);

        // Build staged airdrop with three immutable roots and three unlock times.
        bytes32[3] memory roots =
            [vm.envBytes32("AIRDROP_ROOT_Y2"), vm.envBytes32("AIRDROP_ROOT_Y5"), vm.envBytes32("AIRDROP_ROOT_Y9")];
        uint64[3] memory unlockTimes = [
            uint64(vm.envUint("AIRDROP_UNLOCK_Y2")),
            uint64(vm.envUint("AIRDROP_UNLOCK_Y5")),
            uint64(vm.envUint("AIRDROP_UNLOCK_Y9"))
        ];
        StagedMerkleAirdrop airdrop = new StagedMerkleAirdrop(_fig, roots, unlockTimes);
        _airdrop = address(airdrop);
        console.log("StagedMerkleAirdrop:    ", _airdrop);

        // Genesis distribution: mint 100M + 300M directly to the founder and
        // DAO wallets. Register the deployer as a one-shot genesis minter with
        // cap exactly 400M so that this script is the ONLY entity that can ever
        // exercise deployer-side minting, and only for these two transfers.
        address deployer = vm.addr(privateKey);
        fig.registerMinter(deployer, FOUNDER_ALLOC + DAO_ALLOC);
        fig.mint(vm.envAddress("FOUNDER_WALLET"), FOUNDER_ALLOC);
        fig.mint(vm.envAddress("DAO_WALLET"), DAO_ALLOC);
        console.log("FigToken: genesis mint complete (founder + DAO)");

        // Register the staged airdrop as the sole remaining minter.
        fig.registerMinter(_airdrop, AIRDROP_ALLOC);
        console.log("FigToken: StagedMerkleAirdrop registered as minter (600M cap)");

        // After renounce, no new minters can ever be registered and the deployer
        // cannot mint again. The 400M deployer cap is exactly exhausted at this
        // point; the 600M airdrop cap is the only remaining mint path.
        fig.renounceDeployerMint();
        console.log("FigToken: deployer mint renounced (permanent)");
    }

    // ── Batch verifier ───────────────────────────────────────────────

    function _deployBatchVerifier() internal {
        FigaroBatchVerifier bv = new FigaroBatchVerifier(
            vm.envAddress("SP1_VERIFIER"), vm.envBytes32("SP1_PROGRAM_VKEY"), vm.envBytes32("GENESIS_ROOT")
        );
        _batchVerifier = address(bv);
        console.log("FigaroBatchVerifier:    ", _batchVerifier);
    }

    // ── Address summary ──────────────────────────────────────────────

    function _logAddresses() internal view {
        console.log("---");
        console.log("Set these in your .env:");
        console.log("  NEXT_PUBLIC_FIGARO_CORE=              ", _core);
        console.log("  NEXT_PUBLIC_ATTESTATION_COORDINATOR=  ", _attestation);
        console.log("  NEXT_PUBLIC_SCHEMA_REGISTRY=          ", _schemas);
        console.log("  NEXT_PUBLIC_OPERATOR_REGISTRY=        ", _operators);
        console.log("  NEXT_PUBLIC_DUTCH_AUCTION=            ", _auction);
        console.log("  NEXT_PUBLIC_FIG_TOKEN_ADDRESS=        ", _fig);
        console.log("  NEXT_PUBLIC_STAGED_AIRDROP=           ", _airdrop);
        console.log("  NEXT_PUBLIC_BATCH_VERIFIER=           ", _batchVerifier);
        console.log("---");
    }
}
