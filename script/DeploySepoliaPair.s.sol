// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/console.sol";
import {DeployBase} from "./DeployBase.s.sol";

/// @title DeploySepoliaPair — pair-only redeploy of the counter↔verifier pair
///
/// @notice Redeploys ONLY the adjacent pair (UsageCounter + FigaroBatchVerifier,
///         which hold each other's address) against a stack already live on
///         Sepolia. The Core, the four registries and their stakes are
///         untouched; their addresses come from the deployment record, exported
///         as EXISTING_* by scripts/deploy-sepolia.sh's PAIR_ONLY mode. The pair
///         is `DeployBase._deployPair`, the one every full deployment runs, on
///         the LIVE deployment's own schedule (RPGF_GENESIS is the live
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
///   SP1_VERIFIER                — the routed SP1 verifier the wrapper resolves on
///                                 SP1_VERIFIER_GATEWAY; bound, never the gateway
///   SP1_PROGRAM_VKEY            — the guest key the new verifier pins
///   EXISTING_FIGARO_CORE        — the record's figaroCore
///   EXISTING_MEMBERS_REGISTRY   — the record's membersRegistry
///   EXISTING_CLAUSE_REGISTRY    — the record's clauseRegistry
///   EXISTING_PROCESS_REGISTRY  — the record's processRegistry
///   EXISTING_AGREEMENT_REGISTRY — the record's agreementRegistry
contract DeploySepoliaPair is DeployBase {
    function run() external {
        runWith(
            vm.envUint("PRIVATE_KEY"),
            vm.envAddress("EXISTING_FIGARO_CORE"),
            vm.envAddress("EXISTING_MEMBERS_REGISTRY"),
            vm.envAddress("EXISTING_CLAUSE_REGISTRY"),
            vm.envAddress("EXISTING_PROCESS_REGISTRY"),
            vm.envAddress("EXISTING_AGREEMENT_REGISTRY"),
            vm.envAddress("SP1_VERIFIER"),
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
        address agreements_,
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
        require(assemblies_.code.length != 0, "EXISTING_PROCESS_REGISTRY has no code on this chain");
        require(agreements_.code.length != 0, "EXISTING_AGREEMENT_REGISTRY has no code on this chain");
        require(gateway_ != address(0), "SP1_VERIFIER_GATEWAY not set");
        require(vkey_ != bytes32(0), "SP1_PROGRAM_VKEY not set");
        _requireFirstPeriodEndsInFuture(genesis_);

        // The pair reads the live stack from the base's state.
        _core = core_;
        _members = members_;
        _clauses = clauses_;
        _assemblies = assemblies_;
        _agreements = agreements_;

        vm.startBroadcast(privateKey);
        _deployPair(vm.addr(privateKey), gateway_, vkey_, genesis_);
        console.log("UsageCounter:           ", _usageCounter);
        console.log("FigaroBatchVerifier:    ", _batchVerifier);
        vm.stopBroadcast();
    }
}
