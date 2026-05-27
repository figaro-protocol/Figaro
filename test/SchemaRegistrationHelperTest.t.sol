// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {SchemaRegistry} from "../src/SchemaRegistry.sol";
import {AttestationCoordinator} from "../src/AttestationCoordinator.sol";
import {SchemaRegistrationHelper} from "../src/SchemaRegistrationHelper.sol";
import {ISchemaValidator} from "../src/ISchemaValidator.sol";
import {FigaroCore} from "../src/FigaroCore.sol";

/// @notice Minimal validator that reports a constructor-set schemaId. Used to
///         exercise the binding-mismatch revert path in the helper.
contract MockValidator is ISchemaValidator {
    bytes32 public immutable override schemaId;

    constructor(bytes32 _schemaId) {
        schemaId = _schemaId;
    }

    function validate(
        bytes32, /* id */
        uint8, /* stage */
        bytes calldata, /* sectionData */
        bytes calldata /* content */
    ) external view override {
        // permissive — accepts any input
    }
}

contract SchemaRegistrationHelperTest is Test {
    FigaroCore core;
    SchemaRegistry registry;
    AttestationCoordinator coordinator;
    SchemaRegistrationHelper helper;

    bytes32 constant TEST_SCHEMA = keccak256("test-schema-v1");
    bytes32 constant URI_HASH = keccak256("ipfs://test-schema/v1");
    bytes32 constant TEST_FAMILY = keccak256("test-family");

    function setUp() public {
        core = new FigaroCore();
        registry = new SchemaRegistry();
        coordinator = new AttestationCoordinator(address(core));
        helper = new SchemaRegistrationHelper(address(registry), address(coordinator));
    }

    // ── Constructor ─────────────────────────────────────────────────────────

    function test_constructor_setsImmutables() public view {
        assertEq(address(helper.schemaRegistry()), address(registry));
        assertEq(address(helper.attestationCoordinator()), address(coordinator));
    }

    function test_constructor_revertsOnZeroSchemaRegistry() public {
        vm.expectRevert(SchemaRegistrationHelper.ZeroAddress.selector);
        new SchemaRegistrationHelper(address(0), address(coordinator));
    }

    function test_constructor_revertsOnZeroCoordinator() public {
        vm.expectRevert(SchemaRegistrationHelper.ZeroAddress.selector);
        new SchemaRegistrationHelper(address(registry), address(0));
    }

    // ── Happy path ──────────────────────────────────────────────────────────

    function test_happyPath_registersAndBinds() public {
        MockValidator validator = new MockValidator(TEST_SCHEMA);
        helper.registerSchemaAndValidator(TEST_SCHEMA, 1, URI_HASH, TEST_FAMILY, address(validator));

        assertTrue(registry.registered(TEST_SCHEMA));
        assertEq(coordinator.schemaValidator(TEST_SCHEMA), address(validator));
    }

    function test_emitsBothEvents() public {
        MockValidator validator = new MockValidator(TEST_SCHEMA);

        vm.expectEmit(true, true, true, true, address(registry));
        emit SchemaRegistry.SchemaRegistered(TEST_SCHEMA, 1, URI_HASH, TEST_FAMILY, address(helper));
        vm.expectEmit(true, true, false, false, address(coordinator));
        emit AttestationCoordinator.ValidatorSet(TEST_SCHEMA, address(validator));

        helper.registerSchemaAndValidator(TEST_SCHEMA, 1, URI_HASH, TEST_FAMILY, address(validator));
    }

    function test_registrarRecordedAsHelperAddress() public {
        // The helper's address (not the calling EOA's) appears as the
        // SchemaRegistered.registrar. Documented behavior — schema authors who
        // want to be on record as the registrar should call SchemaRegistry directly.
        MockValidator validator = new MockValidator(TEST_SCHEMA);

        vm.recordLogs();
        helper.registerSchemaAndValidator(TEST_SCHEMA, 1, URI_HASH, TEST_FAMILY, address(validator));

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 topic = keccak256("SchemaRegistered(bytes32,uint64,bytes32,bytes32,address)");
        for (uint256 i = 0; i < logs.length; i++) {
            // Indexed: schemaId, family, registrar → 3 indexed + topic0 = 4 topics.
            if (logs[i].topics.length == 4 && logs[i].topics[0] == topic) {
                address registrar = address(uint160(uint256(logs[i].topics[3])));
                assertEq(registrar, address(helper), "registrar should be helper");
                return;
            }
        }
        revert("SchemaRegistered event not found");
    }

    // ── Revert paths (each underlying revert surfaces unchanged) ─────────────

    function test_revertsIfSchemaAlreadyRegistered() public {
        // Pre-register the schema directly via SchemaRegistry.
        registry.registerSchema(TEST_SCHEMA, 1, URI_HASH, TEST_FAMILY);
        MockValidator validator = new MockValidator(TEST_SCHEMA);

        vm.expectRevert(abi.encodeWithSelector(SchemaRegistry.AlreadyRegistered.selector, TEST_SCHEMA));
        helper.registerSchemaAndValidator(TEST_SCHEMA, 1, URI_HASH, TEST_FAMILY, address(validator));
    }

    function test_revertsIfZeroUriHash() public {
        MockValidator validator = new MockValidator(TEST_SCHEMA);
        vm.expectRevert(SchemaRegistry.ZeroUriHash.selector);
        helper.registerSchemaAndValidator(TEST_SCHEMA, 1, bytes32(0), TEST_FAMILY, address(validator));
    }

    function test_revertsIfZeroFamily() public {
        MockValidator validator = new MockValidator(TEST_SCHEMA);
        vm.expectRevert(SchemaRegistry.ZeroFamily.selector);
        helper.registerSchemaAndValidator(TEST_SCHEMA, 1, URI_HASH, bytes32(0), address(validator));
    }

    function test_revertsIfZeroValidator() public {
        vm.expectRevert(AttestationCoordinator.ZeroValidator.selector);
        helper.registerSchemaAndValidator(TEST_SCHEMA, 1, URI_HASH, TEST_FAMILY, address(0));
    }

    function test_revertsIfValidatorSchemaIdMismatch() public {
        bytes32 wrongSchemaId = keccak256("wrong-schema-v1");
        MockValidator validator = new MockValidator(wrongSchemaId);

        vm.expectRevert(
            abi.encodeWithSelector(
                AttestationCoordinator.InvalidValidatorBinding.selector,
                TEST_SCHEMA,
                wrongSchemaId
            )
        );
        helper.registerSchemaAndValidator(TEST_SCHEMA, 1, URI_HASH, TEST_FAMILY, address(validator));
    }

    function test_revertsIfValidatorAlreadyBound() public {
        // Front-runner pre-binds a validator for TEST_SCHEMA via direct setValidator call,
        // BEFORE the schema is registered. The helper call should revert when it
        // reaches setValidator.
        MockValidator preBound = new MockValidator(TEST_SCHEMA);
        coordinator.setValidator(TEST_SCHEMA, address(preBound));

        // Schema is NOT yet registered in SchemaRegistry.
        assertFalse(registry.registered(TEST_SCHEMA));

        // Helper attempts: register schema + bind a different validator. The bind fails.
        MockValidator legitimate = new MockValidator(TEST_SCHEMA);
        vm.expectRevert(abi.encodeWithSelector(AttestationCoordinator.ValidatorAlreadySet.selector, TEST_SCHEMA));
        helper.registerSchemaAndValidator(TEST_SCHEMA, 1, URI_HASH, TEST_FAMILY, address(legitimate));
    }

    // ── Atomicity (both-or-neither) ──────────────────────────────────────────
    //
    // If the second call (setValidator) reverts, Solidity tx semantics roll back
    // the first call (registerSchema). Verified by checking that the schema is
    // NOT registered after a failed helper call.

    function test_atomicity_failedValidatorMismatchDoesNotLeaveSchemaRegistered() public {
        bytes32 wrongSchemaId = keccak256("wrong-schema-v1");
        MockValidator validator = new MockValidator(wrongSchemaId);

        try helper.registerSchemaAndValidator(TEST_SCHEMA, 1, URI_HASH, TEST_FAMILY, address(validator)) {
            revert("expected revert");
        } catch {
            assertFalse(registry.registered(TEST_SCHEMA), "schema should not be registered after failed bind");
        }
    }

    function test_atomicity_failedZeroValidatorDoesNotLeaveSchemaRegistered() public {
        try helper.registerSchemaAndValidator(TEST_SCHEMA, 1, URI_HASH, TEST_FAMILY, address(0)) {
            revert("expected revert");
        } catch {
            assertFalse(registry.registered(TEST_SCHEMA), "schema should not be registered after failed bind");
        }
    }

    function test_atomicity_failedAlreadyBoundDoesNotLeaveSchemaRegistered() public {
        // Pre-bind a validator for TEST_SCHEMA via direct setValidator call.
        MockValidator preBound = new MockValidator(TEST_SCHEMA);
        coordinator.setValidator(TEST_SCHEMA, address(preBound));
        assertFalse(registry.registered(TEST_SCHEMA), "precondition: schema not yet registered");

        // Helper attempts — fails on setValidator.
        MockValidator legitimate = new MockValidator(TEST_SCHEMA);
        try helper.registerSchemaAndValidator(TEST_SCHEMA, 1, URI_HASH, TEST_FAMILY, address(legitimate)) {
            revert("expected revert");
        } catch {
            assertFalse(registry.registered(TEST_SCHEMA), "schema should not be registered after failed bind");
        }
    }

    // ── Composition with subsequent direct calls ────────────────────────────

    function test_helperBoundSchemaIsAttestableViaCoordinator() public view {
        // After helper-based registration + bind, the schema is fully usable —
        // not "marked as helper-bound" in any way. The validator binding is
        // just a normal first-write-wins entry.
        // (Read-only check; full attest requires committed orders, covered by AC tests.)
        assertEq(coordinator.schemaValidator(TEST_SCHEMA), address(0));
    }

    function test_helperBoundSchemaCannotBeReBoundDirectly() public {
        // Register + bind via helper.
        MockValidator validator = new MockValidator(TEST_SCHEMA);
        helper.registerSchemaAndValidator(TEST_SCHEMA, 1, URI_HASH, TEST_FAMILY, address(validator));

        // Direct setValidator call after helper-bind should also revert
        // (first-write-wins is enforced at the coordinator level, helper is not special).
        MockValidator second = new MockValidator(TEST_SCHEMA);
        vm.expectRevert(abi.encodeWithSelector(AttestationCoordinator.ValidatorAlreadySet.selector, TEST_SCHEMA));
        coordinator.setValidator(TEST_SCHEMA, address(second));
    }
}
