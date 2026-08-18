// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import "../src/kernel/FigaroCore.sol";
import "../src/protocol/coordinators/AttestationCoordinator.sol";
import {WitnessSwapAndCommitCoordinator} from "../src/protocol/coordinators/WitnessSwapAndCommitCoordinator.sol";
import "../src/protocol/registries/ClauseRegistry.sol";
import "../src/protocol/registries/MembersRegistry.sol";
import "../src/florin/FlorinToken.sol";
import {RpgfMinter} from "../src/rpgf/RpgfMinter.sol";
import {UsageCounter} from "../src/protocol/usage/UsageCounter.sol";
import {AssemblyRegistry} from "../src/protocol/registries/AssemblyRegistry.sol";
import "../src/protocol/verifier/FigaroBatchVerifier.sol";
import "../src/mocks/MockTreasuryMultisig.sol";

/// @title DeploySepolia — Sepolia testnet rehearsal of the full Figaro V5 stack
///
/// @notice Mirror of `DeployMainnet.s.sol` (testnet = mainnet rehearsal). Every
///         deviation from the mainnet script is a TESTNET DIVERGENCE listed here;
///         anything not listed is byte-for-byte the mainnet parameterization.
///
/// TESTNET DIVERGENCE (exactly one; ruled 2026-08-14 — the weekly-period
/// compression originally carried here was REVERTED the same day it landed:
/// this Sepolia deployment is the public incremental release, so it runs the
/// REAL yearly schedule and the real 28-day cooldown; compressed-time claim
/// rehearsal is devnet's job):
///   1. DAO_WALLET is not read from env. The script deploys
///      `MockTreasuryMultisig([FOUNDER_WALLET, SUPPORTERS_WALLET, deployer], 2)`
///      and mints the 300M DAO allocation to it — the mock-as-code divergence
///      (mainnet: a canonical Safe at DAO_WALLET, config never code —
///      RELEASE_READINESS Task 9; mock posture re-affirmed 2026-08-14).
///
/// Required environment variables:
///   PRIVATE_KEY                — deployer private key
///   FOUNDER_WALLET             — address receiving the 70M founder allocation
///   SUPPORTERS_WALLET          — address receiving the 30M supporters allocation
///   RPGF_GENESIS               — unix timestamp anchoring the reward schedule
///                                (nine ANNUAL periods derived from it, as mainnet)
///   SP1_VERIFIER_GATEWAY       — Succinct's canonical gateway on Sepolia
///   SP1_PROGRAM_VKEY           — the guest program's verification key
contract DeploySepolia is Script {
    uint256 constant FOUNDER_ALLOC = 70_000_000 ether; // 7%
    uint256 constant SUPPORTERS_ALLOC = 30_000_000 ether; // 3%
    uint256 constant DAO_ALLOC = 300_000_000 ether; // 30%
    uint256 constant RPGF_ALLOC = 600_000_000 ether; // 60%

    /// @dev The REAL accrual period — mainnet's value (weekly compression
    ///      reverted by ruling 2026-08-14; this deployment is the release).
    uint64 constant PERIOD = 365 days;
    /// @dev Mainnet's cooldown — its compression fell with the period's.
    uint256 constant MEMBER_COOLDOWN = 28 days;

    address internal _core;
    address internal _attestation;
    address internal _swapCoordinator;
    address internal _clauses;
    address internal _members;
    address internal _florin;
    address internal _assemblies;
    address internal _usageCounter;
    address internal _rpgfMinter;
    address internal _batchVerifier;
    address internal _daoTreasury;

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");

        _validateEnv(vm.addr(privateKey));

        vm.startBroadcast(privateKey);

        _deployProtocol(privateKey);
        _deployFlorinEcosystem(privateKey);

        vm.stopBroadcast();

        _logAddresses();
    }

    // ── Environment validation ───────────────────────────────────────

    function _validateEnv(address deployer) internal view {
        address founder = vm.envAddress("FOUNDER_WALLET");
        address supporters = vm.envAddress("SUPPORTERS_WALLET");
        require(founder != address(0), "FOUNDER_WALLET not set");
        require(supporters != address(0), "SUPPORTERS_WALLET not set");
        // The mock treasury's 2-of-3 owner set (divergence 3) needs three
        // distinct owners — MockTreasuryMultisig reverts on duplicates.
        require(
            founder != supporters && founder != deployer && supporters != deployer,
            "FOUNDER/SUPPORTERS/deployer must be three distinct addresses"
        );
        require(
            vm.envUint("RPGF_GENESIS") + PERIOD > block.timestamp,
            "RPGF_GENESIS must place the first annual period end in the future"
        );
    }

    // ── Protocol kernel + compositions ────────────────────────────────

    function _deployProtocol(uint256 privateKey) internal {
        FigaroCore core = new FigaroCore();
        _core = address(core);
        console.log("FigaroCore:             ", _core);

        AttestationCoordinator attestation = new AttestationCoordinator(_core);
        _attestation = address(attestation);
        console.log("AttestationCoordinator: ", _attestation);

        // ── WitnessSwapAndCommitCoordinator (the swap-funded on-ramp) ──────
        // Composition, not kernel: points at the kernel, canonical Permit2 and
        // the chain's Uniswap SwapRouter02 (env — from Uniswap's deployment docs).
        // The router is probed for BEHAVIOUR (factory() + WETH9() answer with
        // contracts): an address is never trusted for existing alone (the SP1
        // gateway lesson, RELEASE_READINESS 7.3(c)). Omitted from this script
        // until 2026-08-18 — an omission, not a decision; deployed alone onto
        // the live Sepolia stack that day (script/DeploySwapCoordinator.s.sol).
        {
            address permit2 = vm.envAddress("PERMIT2");
            address router = vm.envAddress("SWAP_ROUTER");
            require(permit2.code.length != 0, "PERMIT2 has no code on this chain");
            (bool okF, bytes memory f) = router.staticcall(abi.encodeWithSignature("factory()"));
            (bool okW, bytes memory w) = router.staticcall(abi.encodeWithSignature("WETH9()"));
            require(
                okF && f.length == 32 && abi.decode(f, (address)).code.length != 0,
                "SWAP_ROUTER: factory() is not a contract - not SwapRouter02"
            );
            require(
                okW && w.length == 32 && abi.decode(w, (address)).code.length != 0,
                "SWAP_ROUTER: WETH9() is not a contract - not SwapRouter02"
            );
            WitnessSwapAndCommitCoordinator swapCoordinator =
                new WitnessSwapAndCommitCoordinator(_core, permit2, router);
            _swapCoordinator = address(swapCoordinator);
            console.log("WitnessSwapAndCommitCoordinator:", _swapCoordinator);
        }

        // Author-side stakes — the ratified mainnet values (0.05 ether, sized
        // 2026-07-31 from RPGF paper §7; deposits do not compress).
        ClauseRegistry clauses = new ClauseRegistry(0.05 ether);
        _clauses = address(clauses);
        console.log("ClauseRegistry:         ", _clauses);

        AssemblyRegistry assemblies = new AssemblyRegistry(0.05 ether);
        _assemblies = address(assemblies);
        console.log("AssemblyRegistry:       ", _assemblies);

        // Seller stake and cooldown at the mainnet values.
        MembersRegistry members = new MembersRegistry(0.05 ether, MEMBER_COOLDOWN);
        _members = address(members);
        console.log("MembersRegistry:       ", _members);

        require(vm.envAddress("SP1_VERIFIER_GATEWAY") != address(0), "SP1_VERIFIER_GATEWAY not set");
        require(vm.envBytes32("SP1_PROGRAM_VKEY") != bytes32(0), "SP1_PROGRAM_VKEY not set");

        // Counter/verifier adjacent pair with address prediction, as mainnet.
        address deployer = vm.addr(privateKey);
        address predictedVerifier = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 1);
        _deployUsageCounter(predictedVerifier);

        bytes32 emptyMapHash = keccak256("");
        bytes32 emptyUsageHash = keccak256(abi.encodePacked(uint64(0), uint64(0), uint64(0)));
        FigaroBatchVerifier batchVerifier = new FigaroBatchVerifier(
            vm.envAddress("SP1_VERIFIER_GATEWAY"),
            vm.envBytes32("SP1_PROGRAM_VKEY"),
            _clauses,
            _usageCounter,
            keccak256(abi.encodePacked(emptyMapHash, emptyMapHash, emptyMapHash, emptyUsageHash))
        );
        _batchVerifier = address(batchVerifier);
        require(_batchVerifier == predictedVerifier, "verifier address prediction failed");
        console.log("FigaroBatchVerifier:    ", _batchVerifier);
    }

    /// @dev Identical to mainnet except the period length (divergence 1).
    function _deployUsageCounter(address batchVerifier_) internal {
        uint64 genesis = uint64(vm.envUint("RPGF_GENESIS"));
        uint64[] memory periods = new uint64[](9);
        for (uint256 i = 0; i < 9; ++i) {
            periods[i] = genesis + uint64((i + 1)) * PERIOD;
        }

        // The mandatory clauses EARN (ruled 2026-08-13); only the
        // assembly-provenance clause stays excluded (attribution plumbing).
        bytes32[] memory excluded = new bytes32[](1);
        excluded[0] = keccak256(abi.encode("figaro-assembly-provenance", uint64(1)));

        UsageCounter usageCounter = new UsageCounter(
            _core,
            _members,
            _clauses,
            _assemblies,
            batchVerifier_,
            keccak256(abi.encode("figaro-assembly-provenance", uint64(1))),
            excluded,
            3, // minimum-support floor (ruled 2026-07-31)
            periods
        );
        _usageCounter = address(usageCounter);
        console.log("UsageCounter:           ", _usageCounter);
    }

    // ── florin token + genesis distribution ─────────────────────────

    function _deployFlorinEcosystem(uint256 privateKey) internal {
        FlorinToken florin = new FlorinToken();
        _florin = address(florin);
        console.log("FlorinToken:               ", _florin);

        // Nine slices, three rising tranches (ruled 2026-07-31) — the budgets
        // are the mainnet values; only the period LENGTH compressed.
        uint256[] memory amounts = new uint256[](9);
        amounts[0] = 45_000_000 ether;
        amounts[1] = 45_000_000 ether;
        amounts[2] = 60_000_000 ether;
        amounts[3] = 60_000_000 ether;
        amounts[4] = 60_000_000 ether;
        amounts[5] = 82_500_000 ether;
        amounts[6] = 82_500_000 ether;
        amounts[7] = 82_500_000 ether;
        amounts[8] = 82_500_000 ether;
        uint256 amountsSum;
        for (uint256 i = 0; i < amounts.length; ++i) {
            amountsSum += amounts[i];
        }
        require(amountsSum == RPGF_ALLOC, "RPGF period budgets must sum to the allocation");
        RpgfMinter rpgfMinter = new RpgfMinter(address(florin), _usageCounter, _clauses, _assemblies, amounts);
        _rpgfMinter = address(rpgfMinter);
        console.log("RpgfMinter:             ", _rpgfMinter);
        florin.registerMinter(_rpgfMinter, RPGF_ALLOC);

        // Divergence 3: the DAO wallet is a mock 2-of-3 deployed here, owners
        // founder + supporters + deployer. Mainnet reads a canonical Safe from
        // DAO_WALLET instead and deploys nothing.
        address deployer = vm.addr(privateKey);
        address[] memory treasuryOwners = new address[](3);
        treasuryOwners[0] = vm.envAddress("FOUNDER_WALLET");
        treasuryOwners[1] = vm.envAddress("SUPPORTERS_WALLET");
        treasuryOwners[2] = deployer;
        MockTreasuryMultisig daoTreasury = new MockTreasuryMultisig(treasuryOwners, 2);
        _daoTreasury = address(daoTreasury);
        console.log("MockTreasuryMultisig:   ", _daoTreasury);

        // Genesis distribution, one-shot deployer minter capped at exactly 400M.
        florin.registerMinter(deployer, FOUNDER_ALLOC + SUPPORTERS_ALLOC + DAO_ALLOC);
        florin.mint(vm.envAddress("FOUNDER_WALLET"), FOUNDER_ALLOC);
        florin.mint(vm.envAddress("SUPPORTERS_WALLET"), SUPPORTERS_ALLOC);
        florin.mint(_daoTreasury, DAO_ALLOC);
        console.log("FlorinToken: genesis mint complete (founder + supporters + DAO)");

        florin.renounceDeployerMint();
        console.log("FlorinToken: deployer mint renounced (permanent)");
    }

    // ── Address summary ──────────────────────────────────────────────

    function _logAddresses() internal view {
        console.log("---");
        console.log("Set these in your .env:");
        console.log("  NEXT_PUBLIC_FIGARO_CORE=              ", _core);
        console.log("  NEXT_PUBLIC_ATTESTATION_COORDINATOR=  ", _attestation);
        console.log("  NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR=", _swapCoordinator);
        console.log("  NEXT_PUBLIC_SWAP_ROUTER=", vm.envAddress("SWAP_ROUTER"));
        console.log("  NEXT_PUBLIC_PERMIT2=", vm.envAddress("PERMIT2"));
        console.log("  NEXT_PUBLIC_CLAUSE_REGISTRY=          ", _clauses);
        console.log("  NEXT_PUBLIC_ASSEMBLY_REGISTRY=        ", _assemblies);
        console.log("  NEXT_PUBLIC_MEMBERS_REGISTRY=       ", _members);
        console.log("  NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS=        ", _florin);
        console.log("  NEXT_PUBLIC_USAGE_COUNTER=            ", _usageCounter);
        console.log("  NEXT_PUBLIC_RPGF_MINTER=              ", _rpgfMinter);
        console.log("  NEXT_PUBLIC_BATCH_VERIFIER=           ", _batchVerifier);
        console.log("  NEXT_PUBLIC_DAO_TREASURY=             ", _daoTreasury);
        console.log("---");
    }
}
