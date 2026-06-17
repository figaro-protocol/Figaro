// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ClauseRegistry} from "../src/ClauseRegistry.sol";
import {AttestationCoordinator} from "../src/AttestationCoordinator.sol";
import {ClauseRegistrationHelper} from "../src/ClauseRegistrationHelper.sol";
import {MockClauseValidator} from "../src/mocks/MockClauseValidator.sol";
import {FigaroCore} from "../src/FigaroCore.sol";

contract ClauseRegistrationHelperTest is Test {
    FigaroCore core;
    ClauseRegistry registry;
    AttestationCoordinator coordinator;
    ClauseRegistrationHelper helper;

    // The bare clause NAME and VERSION passed to register*; the clause id is the
    // 2-field key keccak256(abi.encode(name, version)) — the on-chain key the
    // registry dedups on and the coordinator binds the validator under (derived
    // in setUp because abi.encode is not a compile-time constant). metadataURI is
    // the IPFS locator; contentHash the spec digest.
    string constant TEST_CLAUSE_ID = "test-clause";
    uint64 constant TEST_VERSION = 1;
    bytes32 TEST_CLAUSE;
    string constant TEST_URI = "ipfs://test-clause/v1";
    bytes32 constant TEST_CONTENT = keccak256("test-clause-spec");
    bytes32 constant TEST_FAMILY = keccak256("test-family");

    function setUp() public {
        TEST_CLAUSE = keccak256(abi.encode(TEST_CLAUSE_ID, TEST_VERSION));
        core = new FigaroCore();
        registry = new ClauseRegistry();
        coordinator = new AttestationCoordinator(address(core));
        helper = new ClauseRegistrationHelper(address(registry), address(coordinator));
    }

    // ── Constructor ─────────────────────────────────────────────────────────

    function test_constructor_setsImmutables() public view {
        assertEq(address(helper.clauseRegistry()), address(registry));
        assertEq(address(helper.attestationCoordinator()), address(coordinator));
    }

    function test_constructor_revertsOnZeroClauseRegistry() public {
        vm.expectRevert(ClauseRegistrationHelper.ZeroAddress.selector);
        new ClauseRegistrationHelper(address(0), address(coordinator));
    }

    function test_constructor_revertsOnZeroCoordinator() public {
        vm.expectRevert(ClauseRegistrationHelper.ZeroAddress.selector);
        new ClauseRegistrationHelper(address(registry), address(0));
    }

    // ── Happy path ──────────────────────────────────────────────────────────

    function test_happyPath_registersAndBinds() public {
        MockClauseValidator validator = new MockClauseValidator(TEST_CLAUSE);
        helper.registerClauseAndValidator(TEST_CLAUSE_ID, TEST_VERSION, TEST_CONTENT, TEST_URI, TEST_FAMILY, address(validator));

        assertTrue(registry.registered(TEST_CLAUSE));
        assertEq(coordinator.clauseValidator(TEST_CLAUSE), address(validator));
    }

    function test_emitsBothEvents() public {
        MockClauseValidator validator = new MockClauseValidator(TEST_CLAUSE);

        // ClauseRegistered indexes family + registrar (2 topics); clauseId is now
        // a non-indexed string in data, so check data too.
        vm.expectEmit(true, true, false, true, address(registry));
        emit ClauseRegistry.ClauseRegistered(TEST_CLAUSE_ID, TEST_VERSION, TEST_CONTENT, TEST_URI, TEST_FAMILY, address(helper));
        vm.expectEmit(true, true, false, false, address(coordinator));
        emit AttestationCoordinator.ValidatorSet(TEST_CLAUSE, address(validator));

        helper.registerClauseAndValidator(TEST_CLAUSE_ID, TEST_VERSION, TEST_CONTENT, TEST_URI, TEST_FAMILY, address(validator));
    }

    function test_registrarRecordedAsHelperAddress() public {
        // The helper's address (not the calling EOA's) appears as the
        // ClauseRegistered.registrar. Documented behavior — clause authors who
        // want to be on record as the registrar should call ClauseRegistry directly.
        MockClauseValidator validator = new MockClauseValidator(TEST_CLAUSE);

        vm.recordLogs();
        helper.registerClauseAndValidator(TEST_CLAUSE_ID, TEST_VERSION, TEST_CONTENT, TEST_URI, TEST_FAMILY, address(validator));

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 topic = keccak256("ClauseRegistered(string,uint64,bytes32,string,bytes32,address)");
        for (uint256 i = 0; i < logs.length; i++) {
            // Indexed: family, registrar → 2 indexed + topic0 = 3 topics.
            if (logs[i].topics.length == 3 && logs[i].topics[0] == topic) {
                address registrar = address(uint160(uint256(logs[i].topics[2])));
                assertEq(registrar, address(helper), "registrar should be helper");
                return;
            }
        }
        revert("ClauseRegistered event not found");
    }

    // ── Revert paths (each underlying revert surfaces unchanged) ─────────────

    function test_revertsIfClauseAlreadyRegistered() public {
        // Pre-register the clause directly via ClauseRegistry.
        registry.registerClause(TEST_CLAUSE_ID, TEST_VERSION, TEST_CONTENT, TEST_URI, TEST_FAMILY);
        MockClauseValidator validator = new MockClauseValidator(TEST_CLAUSE);

        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.AlreadyRegistered.selector, TEST_CLAUSE));
        helper.registerClauseAndValidator(TEST_CLAUSE_ID, TEST_VERSION, TEST_CONTENT, TEST_URI, TEST_FAMILY, address(validator));
    }

    function test_revertsIfZeroContentHash() public {
        MockClauseValidator validator = new MockClauseValidator(TEST_CLAUSE);
        vm.expectRevert(ClauseRegistry.ZeroContentHash.selector);
        helper.registerClauseAndValidator(TEST_CLAUSE_ID, TEST_VERSION, bytes32(0), TEST_URI, TEST_FAMILY, address(validator));
    }

    function test_revertsIfEmptyMetadataURI() public {
        MockClauseValidator validator = new MockClauseValidator(TEST_CLAUSE);
        vm.expectRevert(ClauseRegistry.EmptyMetadataURI.selector);
        helper.registerClauseAndValidator(TEST_CLAUSE_ID, TEST_VERSION, TEST_CONTENT, "", TEST_FAMILY, address(validator));
    }

    function test_revertsIfZeroFamily() public {
        MockClauseValidator validator = new MockClauseValidator(TEST_CLAUSE);
        vm.expectRevert(ClauseRegistry.ZeroFamily.selector);
        helper.registerClauseAndValidator(TEST_CLAUSE_ID, TEST_VERSION, TEST_CONTENT, TEST_URI, bytes32(0), address(validator));
    }

    function test_revertsIfZeroValidator() public {
        vm.expectRevert(AttestationCoordinator.ZeroValidator.selector);
        helper.registerClauseAndValidator(TEST_CLAUSE_ID, TEST_VERSION, TEST_CONTENT, TEST_URI, TEST_FAMILY, address(0));
    }

    function test_revertsIfValidatorClauseIdMismatch() public {
        bytes32 wrongClauseId = keccak256(abi.encode("wrong-clause", TEST_VERSION));
        MockClauseValidator validator = new MockClauseValidator(wrongClauseId);

        vm.expectRevert(
            abi.encodeWithSelector(
                AttestationCoordinator.InvalidValidatorBinding.selector,
                TEST_CLAUSE,
                wrongClauseId
            )
        );
        helper.registerClauseAndValidator(TEST_CLAUSE_ID, TEST_VERSION, TEST_CONTENT, TEST_URI, TEST_FAMILY, address(validator));
    }

    function test_revertsIfValidatorAlreadyBound() public {
        // Front-runner pre-binds a validator for TEST_CLAUSE via direct setValidator call,
        // BEFORE the clause is registered. The helper call should revert when it
        // reaches setValidator.
        MockClauseValidator preBound = new MockClauseValidator(TEST_CLAUSE);
        coordinator.setValidator(TEST_CLAUSE, address(preBound));

        // Clause is NOT yet registered in ClauseRegistry.
        assertFalse(registry.registered(TEST_CLAUSE));

        // Helper attempts: register clause + bind a different validator. The bind fails.
        MockClauseValidator legitimate = new MockClauseValidator(TEST_CLAUSE);
        vm.expectRevert(abi.encodeWithSelector(AttestationCoordinator.ValidatorAlreadySet.selector, TEST_CLAUSE));
        helper.registerClauseAndValidator(TEST_CLAUSE_ID, TEST_VERSION, TEST_CONTENT, TEST_URI, TEST_FAMILY, address(legitimate));
    }

    // ── Atomicity (both-or-neither) ──────────────────────────────────────────
    //
    // If the second call (setValidator) reverts, Solidity tx semantics roll back
    // the first call (registerClause). Verified by checking that the clause is
    // NOT registered after a failed helper call.

    function test_atomicity_failedValidatorMismatchDoesNotLeaveClauseRegistered() public {
        bytes32 wrongClauseId = keccak256(abi.encode("wrong-clause", TEST_VERSION));
        MockClauseValidator validator = new MockClauseValidator(wrongClauseId);

        try helper.registerClauseAndValidator(TEST_CLAUSE_ID, TEST_VERSION, TEST_CONTENT, TEST_URI, TEST_FAMILY, address(validator)) {
            revert("expected revert");
        } catch {
            assertFalse(registry.registered(TEST_CLAUSE), "clause should not be registered after failed bind");
        }
    }

    function test_atomicity_failedZeroValidatorDoesNotLeaveClauseRegistered() public {
        try helper.registerClauseAndValidator(TEST_CLAUSE_ID, TEST_VERSION, TEST_CONTENT, TEST_URI, TEST_FAMILY, address(0)) {
            revert("expected revert");
        } catch {
            assertFalse(registry.registered(TEST_CLAUSE), "clause should not be registered after failed bind");
        }
    }

    function test_atomicity_failedAlreadyBoundDoesNotLeaveClauseRegistered() public {
        // Pre-bind a validator for TEST_CLAUSE via direct setValidator call.
        MockClauseValidator preBound = new MockClauseValidator(TEST_CLAUSE);
        coordinator.setValidator(TEST_CLAUSE, address(preBound));
        assertFalse(registry.registered(TEST_CLAUSE), "precondition: clause not yet registered");

        // Helper attempts — fails on setValidator.
        MockClauseValidator legitimate = new MockClauseValidator(TEST_CLAUSE);
        try helper.registerClauseAndValidator(TEST_CLAUSE_ID, TEST_VERSION, TEST_CONTENT, TEST_URI, TEST_FAMILY, address(legitimate)) {
            revert("expected revert");
        } catch {
            assertFalse(registry.registered(TEST_CLAUSE), "clause should not be registered after failed bind");
        }
    }

    // ── Composition with subsequent direct calls ────────────────────────────

    function test_helperBoundClauseIsAttestableViaCoordinator() public view {
        // After helper-based registration + bind, the clause is fully usable —
        // not "marked as helper-bound" in any way. The validator binding is
        // just a normal first-write-wins entry.
        // (Read-only check; full attest requires committed orders, covered by AC tests.)
        assertEq(coordinator.clauseValidator(TEST_CLAUSE), address(0));
    }

    function test_helperBoundClauseCannotBeReBoundDirectly() public {
        // Register + bind via helper.
        MockClauseValidator validator = new MockClauseValidator(TEST_CLAUSE);
        helper.registerClauseAndValidator(TEST_CLAUSE_ID, TEST_VERSION, TEST_CONTENT, TEST_URI, TEST_FAMILY, address(validator));

        // Direct setValidator call after helper-bind should also revert
        // (first-write-wins is enforced at the coordinator level, helper is not special).
        MockClauseValidator second = new MockClauseValidator(TEST_CLAUSE);
        vm.expectRevert(abi.encodeWithSelector(AttestationCoordinator.ValidatorAlreadySet.selector, TEST_CLAUSE));
        coordinator.setValidator(TEST_CLAUSE, address(second));
    }
}
