// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {AttestationCoordinator} from "../src/AttestationCoordinator.sol";
import {IClauseValidator} from "../src/IClauseValidator.sol";

/// @notice Proves the devnet deploy script wires every canonical clauseId to a
///         registered validator. Regression guard for backlog item "Deploy script
///         setValidator wiring": without this, every attest* call reverts with
///         ValidatorNotSet on a fresh coordinator.
///
///         The expected validator set is DERIVED from the ValidatorSet events
///         emitted during the deploy run rather than hard-listed as a typed
///         array. Pairs with scripts/lint-clause-counts.sh, which enforces
///         that the deploy script's console.log counts match the on-disk
///         clause source-of-truth — so a new clause added to Deploy.s.sol
///         flows into this test automatically and a new clause NOT added
///         is caught by the lint script.
contract DeployScriptTest is Test {
    function test_deployScript_wiresAllRuntimeValidators() public {
        // Deploy.run() reads PRIVATE_KEY from env; set it to Anvil account #0.
        vm.setEnv("PRIVATE_KEY", "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

        Deploy deployer = new Deploy();
        vm.recordLogs();
        deployer.run();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 validatorSetTopic = keccak256("ValidatorSet(bytes32,address)");
        address coordinator;
        uint256 setCount;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length == 3 && logs[i].topics[0] == validatorSetTopic) {
                if (coordinator == address(0)) coordinator = logs[i].emitter;
                setCount++;
            }
        }
        assertTrue(coordinator != address(0), "no ValidatorSet event observed");
        assertGt(setCount, 0, "deploy script wired zero validators");

        AttestationCoordinator ac = AttestationCoordinator(coordinator);

        // Walk every ValidatorSet emission: the live binding must still hold
        // and the validator's declared clauseId must match the event topic.
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length == 3 && logs[i].topics[0] == validatorSetTopic) {
                bytes32 clauseId = logs[i].topics[1];
                address validator = address(uint160(uint256(logs[i].topics[2])));
                assertEq(ac.clauseValidator(clauseId), validator, "live binding diverges from emitted ValidatorSet");
                assertEq(IClauseValidator(validator).clauseId(), clauseId, "validator bound to wrong clause");
            }
        }

        // Topology is agreement-only — no on-chain validator should be wired.
        assertEq(
            ac.clauseValidator(keccak256(abi.encode("figaro-topology", uint64(1)))),
            address(0),
            "figaro-topology-v1 must have no runtime validator (agreement-only clause)"
        );
    }
}
