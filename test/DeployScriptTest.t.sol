// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {AttestationCoordinator} from "../src/AttestationCoordinator.sol";
import {ISchemaValidator} from "../src/ISchemaValidator.sol";
import {AssemblyRegistry} from "../src/AssemblyRegistry.sol";
import {IAssemblyValidator} from "../src/IAssemblyValidator.sol";

/// @notice Proves the devnet deploy script wires every canonical schemaId to a
///         registered validator. Regression guard for backlog item "Deploy script
///         setValidator wiring": without this, every attest* call reverts with
///         ValidatorNotSet on a fresh coordinator.
contract DeployScriptTest is Test {
    function test_deployScript_wiresAllRuntimeValidators() public {
        // Deploy.run() reads PRIVATE_KEY from env; set it to Anvil account #0.
        vm.setEnv("PRIVATE_KEY", "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

        Deploy deployer = new Deploy();
        vm.recordLogs();
        deployer.run();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // ValidatorSet(indexed schemaId, indexed validator) — collect all bindings
        // emitted during the script run.
        bytes32 validatorSetTopic = keccak256("ValidatorSet(bytes32,address)");
        address coordinator;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length == 3 && logs[i].topics[0] == validatorSetTopic) {
                coordinator = logs[i].emitter;
                break;
            }
        }
        assertTrue(coordinator != address(0), "no ValidatorSet event observed");

        AttestationCoordinator ac = AttestationCoordinator(coordinator);

        bytes32[16] memory expected = [
            keccak256("figaro-commerce-v1"),
            keccak256("figaro-geo-v2"),
            keccak256("figaro-fulfilment-v2"),
            keccak256("figaro-ghg-protocol-v1"),
            keccak256("figaro-ghg-iso-14064-v1"),
            keccak256("figaro-ghg-pas-2050-v1"),
            keccak256("figaro-ghg-en-16258-v1"),
            keccak256("figaro-ghg-custom-v1"),
            keccak256("figaro-ghg-measurement-v1"),
            keccak256("figaro-proximity-policy-v1"),
            keccak256("figaro-proximity-proof-v1"),
            keccak256("figaro-merchant-process-v1"),
            keccak256("figaro-courier-process-v1"),
            keccak256("figaro-jurisdiction-v1"),
            keccak256("figaro-consent-v1"),
            keccak256("figaro-offset-policy-v1")
        ];

        for (uint256 i = 0; i < expected.length; i++) {
            address v = ac.schemaValidator(expected[i]);
            assertTrue(v != address(0), "validator not set for schema");
            assertEq(ISchemaValidator(v).schemaId(), expected[i], "validator bound to wrong schema");
        }

        // Topology is manifest-only — no on-chain validator should be wired.
        assertEq(
            ac.schemaValidator(keccak256("figaro-topology-v1")),
            address(0),
            "figaro-topology-v1 must have no runtime validator (manifest-only clause)"
        );
    }

    /// @notice Proves the devnet deploy script binds the direct-sale-v1
    ///         validator to the AssemblyRegistry. Without this binding,
    ///         registerAssembly("direct-sale-v1") reverts ValidatorNotSet.
    function test_deployScript_bindsDirectSaleAssemblyValidator() public {
        vm.setEnv("PRIVATE_KEY", "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

        Deploy deployer = new Deploy();
        vm.recordLogs();
        deployer.run();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // AssemblyRegistry.ValidatorBound(indexed classId, indexed validator, indexed registrar)
        bytes32 validatorBoundTopic = keccak256("ValidatorBound(bytes32,address,address)");
        address registry;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length == 4 && logs[i].topics[0] == validatorBoundTopic) {
                registry = logs[i].emitter;
                break;
            }
        }
        assertTrue(registry != address(0), "no AssemblyRegistry.ValidatorBound event observed");

        AssemblyRegistry ar = AssemblyRegistry(registry);
        bytes32 directSaleClassId = keccak256("direct-sale-v1");
        IAssemblyValidator v = ar.validators(directSaleClassId);
        assertTrue(address(v) != address(0), "direct-sale-v1 validator not bound");
        assertEq(v.assemblyClassId(), directSaleClassId, "validator bound to wrong class");
    }
}
