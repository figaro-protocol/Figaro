// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import "../src/core/kernel/FigaroCore.sol";
import "../src/core/attestation/AttestationCoordinator.sol";
import {WitnessSwapAndCommitCoordinator} from "../src/composability/WitnessSwapAndCommitCoordinator.sol";
import "../src/registries/ClauseRegistry.sol";
import "../src/registries/MembersRegistry.sol";
import "../src/rewards/FlorinToken.sol";
import {RpgfMinter} from "../src/rewards/RpgfMinter.sol";
import {UsageCounter} from "../src/rewards/UsageCounter.sol";
import {ProcessRegistry} from "../src/registries/ProcessRegistry.sol";
import {AgreementRegistry} from "../src/registries/AgreementRegistry.sol";
import "../src/core/verifier/FigaroBatchVerifier.sol";

/// @title DeploySepolia — Sepolia testnet rehearsal of the full Figaro stack
///
/// @notice Mirror of `DeployMainnet.s.sol` (testnet = mainnet rehearsal), with
///         no divergence: the same parameterization, the real yearly schedule
///         and the real 28-day cooldown (compressed-time claim rehearsal is
///         devnet's job), and the treasury read from DAO_WALLET as mainnet
///         reads it, a Safe that stands on the chain before this script runs.
///         The script deploys no mock.
///
/// Required environment variables:
///   PRIVATE_KEY                — deployer private key
///   FOUNDER_WALLET             — address receiving the 70M founder allocation
///   SUPPORTERS_WALLET          — address receiving the 30M supporters allocation
///   DAO_WALLET                 — address receiving the 300M DAO allocation: the
///                                treasury's Safe (RELEASE_READINESS Task 9)
///   RPGF_GENESIS               — unix timestamp anchoring the reward schedule
///                                (nine ANNUAL periods derived from it, as mainnet)
///   SP1_VERIFIER               — the SP1 verifier Succinct's gateway routes for this
///                                release's proofs, resolved by the wrapper on
///                                SP1_VERIFIER_GATEWAY and bound here, never the gateway
///   SP1_PROGRAM_VKEY           — the guest program's verification key
contract DeploySepolia is Script {
    uint256 constant FOUNDER_ALLOC = 70_000_000 ether; // 7%
    uint256 constant SUPPORTERS_ALLOC = 30_000_000 ether; // 3%
    uint256 constant DAO_ALLOC = 300_000_000 ether; // 30%
    uint256 constant RPGF_ALLOC = 600_000_000 ether; // 60%

    /// @dev The REAL accrual period — mainnet's value (no weekly compression;
    ///      this deployment is the release).
    uint64 constant PERIOD = 365 days;
    /// @dev Mainnet's cooldown, as the period is mainnet's.
    uint256 constant MEMBER_COOLDOWN = 28 days;

    address internal _core;
    address internal _attestation;
    address internal _swapCoordinator;
    address internal _clauses;
    address internal _members;
    address internal _florin;
    address internal _assemblies;
    address internal _agreements;
    address internal _usageCounter;
    address internal _rpgfMinter;
    address internal _batchVerifier;
    address internal _daoTreasury;

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");

        _validateEnv();

        vm.startBroadcast(privateKey);

        _deployProtocol(privateKey);
        _deployFlorinEcosystem(privateKey);

        vm.stopBroadcast();

        _logAddresses();
    }

    // ── Environment validation ───────────────────────────────────────

    function _validateEnv() internal view {
        require(vm.envAddress("FOUNDER_WALLET") != address(0), "FOUNDER_WALLET not set");
        require(vm.envAddress("SUPPORTERS_WALLET") != address(0), "SUPPORTERS_WALLET not set");
        require(vm.envAddress("DAO_WALLET") != address(0), "DAO_WALLET not set");
        require(
            vm.envUint("RPGF_GENESIS") + PERIOD > block.timestamp,
            "RPGF_GENESIS must place the first annual period end in the future"
        );
    }

    // ── The Core + compositions ────────────────────────────────

    function _deployProtocol(uint256 privateKey) internal {
        FigaroCore core = new FigaroCore();
        _core = address(core);
        console.log("FigaroCore:             ", _core);

        AttestationCoordinator attestation = new AttestationCoordinator(_core);
        _attestation = address(attestation);
        console.log("AttestationCoordinator: ", _attestation);

        // ── WitnessSwapAndCommitCoordinator (the swap-funded on-ramp) ──────
        // Composition, not Core: points at FigaroCore, canonical Permit2 and
        // the chain's Uniswap SwapRouter02 (env — from Uniswap's deployment docs).
        // The router is probed for BEHAVIOR (factory() + WETH9() answer with
        // contracts): an address is never trusted for existing alone (the SP1
        // gateway lesson, RELEASE_READINESS 7.3(c)). A stack already live
        // without it takes it alone via script/DeploySwapCoordinator.s.sol.
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
        // from RPGF paper §7; deposits do not compress).
        ClauseRegistry clauses = new ClauseRegistry(0.05 ether);
        _clauses = address(clauses);
        console.log("ClauseRegistry:         ", _clauses);

        ProcessRegistry assemblies = new ProcessRegistry(0.05 ether);
        _assemblies = address(assemblies);
        console.log("ProcessRegistry:       ", _assemblies);

        // AgreementRegistry — the registered agreements' anchor, parallel to
        // ClauseRegistry and ProcessRegistry. RpgfMinter reads it for the
        // agreement's designer of record. Same stake, same reasoning as above.
        AgreementRegistry agreements = new AgreementRegistry(0.05 ether);
        _agreements = address(agreements);
        console.log("AgreementRegistry:      ", _agreements);

        // Member stake and cooldown at the mainnet values.
        MembersRegistry members = new MembersRegistry(0.05 ether, MEMBER_COOLDOWN);
        _members = address(members);
        console.log("MembersRegistry:       ", _members);

        require(vm.envAddress("SP1_VERIFIER") != address(0), "SP1_VERIFIER not set");
        require(vm.envBytes32("SP1_PROGRAM_VKEY") != bytes32(0), "SP1_PROGRAM_VKEY not set");

        // Counter/verifier adjacent pair with address prediction, as mainnet.
        address deployer = vm.addr(privateKey);
        address predictedVerifier = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 1);
        _deployUsageCounter(predictedVerifier);

        FigaroBatchVerifier batchVerifier =
            new FigaroBatchVerifier(vm.envAddress("SP1_VERIFIER"), vm.envBytes32("SP1_PROGRAM_VKEY"), _usageCounter);
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

        UsageCounter usageCounter = new UsageCounter(
            _core,
            _members,
            _clauses,
            _assemblies,
            _agreements,
            batchVerifier_,
            3, // minimum-support floor
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

        // Nine slices, three rising tranches — the budgets
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
        RpgfMinter rpgfMinter =
            new RpgfMinter(address(florin), _usageCounter, _members, _clauses, _assemblies, _agreements, amounts);
        _rpgfMinter = address(rpgfMinter);
        console.log("RpgfMinter:             ", _rpgfMinter);
        florin.registerMinter(_rpgfMinter, RPGF_ALLOC);

        // The treasury is the address DAO_WALLET names, as on mainnet: a Safe
        // that stands before this script runs. Nothing is deployed for it.
        address deployer = vm.addr(privateKey);
        _daoTreasury = vm.envAddress("DAO_WALLET");
        console.log("DAO_WALLET (treasury):  ", _daoTreasury);

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
        console.log("  NEXT_PUBLIC_PROCESS_REGISTRY=        ", _assemblies);
        console.log("  NEXT_PUBLIC_AGREEMENT_REGISTRY=       ", _agreements);
        console.log("  NEXT_PUBLIC_MEMBERS_REGISTRY=       ", _members);
        console.log("  NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS=        ", _florin);
        console.log("  NEXT_PUBLIC_USAGE_COUNTER=            ", _usageCounter);
        console.log("  NEXT_PUBLIC_RPGF_MINTER=              ", _rpgfMinter);
        console.log("  NEXT_PUBLIC_BATCH_VERIFIER=           ", _batchVerifier);
        console.log("  NEXT_PUBLIC_DAO_TREASURY=             ", _daoTreasury);
        console.log("---");
    }
}
