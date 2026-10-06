// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import {UsageCounter} from "../src/build/rewards/UsageCounter.sol";
import "../src/core/verifier/FigaroBatchVerifier.sol";

/// @title DeploySepoliaPair — pair-only redeploy of the counter↔verifier pair
///
/// @notice Redeploys ONLY the adjacent pair (UsageCounter + FigaroBatchVerifier,
///         which hold each other's address) against a stack already live on
///         Sepolia. The Core, the three registries and their stakes are
///         untouched; their addresses come from the deployment record, exported
///         as EXISTING_* by scripts/deploy-sepolia.sh's PAIR_ONLY mode. The pair
///         is parameterized exactly as script/DeploySepolia.s.sol's pair section,
///         on the LIVE deployment's own schedule (RPGF_GENESIS is the live
///         counter's periodEnd[0] minus one period, never invented).
///
///         The one pair-redeploy residual: the live RpgfMinter stays bound to
///         the counter it was deployed with (florin minter registration is
///         renounced), so usage accrued through the NEW counter is not claimable
///         on Sepolia — docs/AUDITOR_HANDOVER.md records it.
///
///         `runWith` is the whole deployment; the env-reading `run()` exists
///         for the wrapper (forge refuses an overloaded `run`). Tests call
///         `runWith` directly — `vm.setEnv` is process-global and test
///         functions run in parallel, so a script tested through env races
///         its sibling tests.
///
/// Required environment variables (env-reading entry):
///   PRIVATE_KEY                 — deployer private key
///   RPGF_GENESIS                — the live deployment's reward-schedule anchor
///   SP1_VERIFIER_GATEWAY        — Succinct's canonical gateway on Sepolia
///   SP1_PROGRAM_VKEY            — the guest key the new verifier pins
///   EXISTING_FIGARO_CORE        — the record's figaroCore
///   EXISTING_MEMBERS_REGISTRY   — the record's membersRegistry
///   EXISTING_CLAUSE_REGISTRY    — the record's clauseRegistry
///   EXISTING_ASSEMBLY_REGISTRY  — the record's assemblyRegistry
contract DeploySepoliaPair is Script {
    /// @dev The REAL accrual period — DeploySepolia.s.sol's value.
    uint64 constant PERIOD = 365 days;

    address internal _usageCounter;
    address internal _batchVerifier;

    function run() external {
        runWith(
            vm.envUint("PRIVATE_KEY"),
            vm.envAddress("EXISTING_FIGARO_CORE"),
            vm.envAddress("EXISTING_MEMBERS_REGISTRY"),
            vm.envAddress("EXISTING_CLAUSE_REGISTRY"),
            vm.envAddress("EXISTING_ASSEMBLY_REGISTRY"),
            vm.envAddress("SP1_VERIFIER_GATEWAY"),
            vm.envBytes32("SP1_PROGRAM_VKEY"),
            uint64(vm.envUint("RPGF_GENESIS"))
        );

        console.log("");
        console.log("Frontend .env values:");
        console.log("  NEXT_PUBLIC_USAGE_COUNTER=            ", _usageCounter);
        console.log("  NEXT_PUBLIC_BATCH_VERIFIER=           ", _batchVerifier);
    }

    function runWith(
        uint256 privateKey,
        address core_,
        address members_,
        address clauses_,
        address assemblies_,
        address gateway_,
        bytes32 vkey_,
        uint64 genesis_
    ) public {
        // Every existing address must hold code on the target chain — an
        // address is never trusted for existing alone (the SP1 gateway
        // lesson, RELEASE_READINESS 7.3(c)).
        require(core_.code.length != 0, "EXISTING_FIGARO_CORE has no code on this chain");
        require(members_.code.length != 0, "EXISTING_MEMBERS_REGISTRY has no code on this chain");
        require(clauses_.code.length != 0, "EXISTING_CLAUSE_REGISTRY has no code on this chain");
        require(assemblies_.code.length != 0, "EXISTING_ASSEMBLY_REGISTRY has no code on this chain");
        require(gateway_ != address(0), "SP1_VERIFIER_GATEWAY not set");
        require(vkey_ != bytes32(0), "SP1_PROGRAM_VKEY not set");
        require(
            uint256(genesis_) + PERIOD > block.timestamp,
            "RPGF_GENESIS must place the first annual period end in the future"
        );

        vm.startBroadcast(privateKey);
        _deployPair(privateKey, core_, members_, clauses_, assemblies_, gateway_, vkey_, genesis_);
        vm.stopBroadcast();
    }

    /// @dev Counter/verifier adjacent pair with address prediction, exactly as
    ///      DeploySepolia.s.sol — the counter binds the verifier's predicted
    ///      address, the verifier binds the counter's real one, and the
    ///      prediction is required to have held.
    function _deployPair(
        uint256 privateKey,
        address core_,
        address members_,
        address clauses_,
        address assemblies_,
        address gateway_,
        bytes32 vkey_,
        uint64 genesis_
    ) internal {
        address deployer = vm.addr(privateKey);
        address predictedVerifier = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 1);

        uint64[] memory periods = new uint64[](9);
        for (uint256 i = 0; i < 9; ++i) {
            periods[i] = genesis_ + uint64((i + 1)) * PERIOD;
        }

        // The mandatory clauses EARN; only the
        // assembly-provenance clause stays excluded (attribution plumbing).
        bytes32[] memory excluded = new bytes32[](1);
        excluded[0] = keccak256(abi.encode("figaro-assembly-provenance", uint64(1)));

        UsageCounter usageCounter = new UsageCounter(
            core_,
            members_,
            clauses_,
            assemblies_,
            predictedVerifier,
            keccak256(abi.encode("figaro-assembly-provenance", uint64(1))),
            excluded,
            3, // minimum-support floor
            periods
        );
        _usageCounter = address(usageCounter);
        console.log("UsageCounter:           ", _usageCounter);

        bytes32 emptyMapHash = keccak256("");
        bytes32 emptyUsageHash = keccak256(abi.encodePacked(uint64(0), uint64(0), uint64(0)));
        FigaroBatchVerifier batchVerifier = new FigaroBatchVerifier(
            gateway_,
            vkey_,
            clauses_,
            _usageCounter,
            keccak256(abi.encodePacked(emptyMapHash, emptyMapHash, emptyMapHash, emptyUsageHash))
        );
        _batchVerifier = address(batchVerifier);
        require(_batchVerifier == predictedVerifier, "verifier address prediction failed");
        console.log("FigaroBatchVerifier:    ", _batchVerifier);
    }
}
