// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../src/FigaroBatchVerifier.sol";
import "../src/mocks/MockSP1Verifier.sol";
import "../src/mocks/MockERC20.sol";
import {MockERC20FeeOnTransfer} from "../src/mocks/MockERC20FeeOnTransfer.sol";

/// @title FigaroBatchVerifierTest — Tests for the batch settlement verifier
contract FigaroBatchVerifierTest is Test {
    FigaroBatchVerifier internal bv;
    MockSP1Verifier internal mockVerifier;
    MockERC20 internal token;

    bytes32 internal constant PROGRAM_VKEY = bytes32(uint256(0xCAFE));
    bytes32 internal constant GENESIS_ROOT = bytes32(uint256(0x1));

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal charlie = address(0xC4A);

    uint256 internal constant INITIAL_BALANCE = 100_000 ether;

    function setUp() public {
        mockVerifier = new MockSP1Verifier();
        token = new MockERC20("Test Token", "TST");
        bv = new FigaroBatchVerifier(address(mockVerifier), PROGRAM_VKEY, GENESIS_ROOT);

        // Fund participants
        token.mint(alice, INITIAL_BALANCE);
        token.mint(bob, INITIAL_BALANCE);
        token.mint(charlie, INITIAL_BALANCE);

        // Fund the verifier contract for payouts
        token.mint(address(bv), INITIAL_BALANCE);

        // Approve verifier for all participants
        vm.prank(alice);
        token.approve(address(bv), type(uint256).max);
        vm.prank(bob);
        token.approve(address(bv), type(uint256).max);
        vm.prank(charlie);
        token.approve(address(bv), type(uint256).max);
    }

    // ── Helpers ───────────────────────────────────────────────────

    function _encodePublicValues(
        bytes32 prevRoot,
        bytes32 newRoot,
        uint64 chainId,
        address verifyingContract,
        bytes32 tokenOpsHash,
        bytes32 attEventsHash,
        bytes32 schEventsHash,
        bytes32 opEventsHash
    ) internal pure returns (bytes memory) {
        return abi.encode(
            prevRoot, newRoot, chainId, verifyingContract, tokenOpsHash, attEventsHash, schEventsHash, opEventsHash
        );
    }

    /// @dev Compute hash matching the Rust kernel's compute_positions_hash.
    function _hashPositions(FigaroBatchVerifier.NetPosition[] memory positions) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint256 i = 0; i < positions.length; i++) {
            packed = bytes.concat(
                packed,
                abi.encodePacked(positions[i].token, positions[i].user, positions[i].deposit, positions[i].payout)
            );
        }
        return keccak256(packed);
    }

    function _hashAttestations(FigaroBatchVerifier.AttestationData[] memory attestations)
        internal
        pure
        returns (bytes32)
    {
        bytes memory packed;
        for (uint256 i = 0; i < attestations.length; i++) {
            packed = bytes.concat(
                packed,
                abi.encodePacked(
                    attestations[i].orderHash,
                    attestations[i].processId,
                    attestations[i].attester,
                    attestations[i].schemaId,
                    attestations[i].stage,
                    attestations[i].contentRef
                )
            );
        }
        return keccak256(packed);
    }

    function _hashSchemas(
        FigaroBatchVerifier.SchemaData[] memory schemas,
        FigaroBatchVerifier.MechanismSchemaData[] memory mechanisms
    ) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint256 i = 0; i < schemas.length; i++) {
            packed = bytes.concat(
                packed,
                abi.encodePacked(schemas[i].schemaId, schemas[i].version, schemas[i].uriHash, schemas[i].registrar)
            );
        }
        for (uint256 i = 0; i < mechanisms.length; i++) {
            packed = bytes.concat(packed, abi.encodePacked(mechanisms[i].mechanism, mechanisms[i].schemaId));
        }
        return keccak256(packed);
    }

    function _hashOperatorEvents(FigaroBatchVerifier.OperatorEventInput[] memory events)
        internal
        pure
        returns (bytes32)
    {
        bytes memory packed;
        for (uint256 i = 0; i < events.length; i++) {
            uint8 tag = events[i].tag;
            // Tags 1 (Registered) and 2 (ProfileUpdated) share an encoding;
            // unknown tags are rejected by the contract before hashing.
            packed = bytes.concat(
                packed, abi.encodePacked(tag, events[i].operator, keccak256(bytes(events[i].metadataURI)))
            );
        }
        return keccak256(packed);
    }

    /// @dev Build a minimal valid batch with empty events and given positions.
    function _buildBatch(bytes32 newRoot, FigaroBatchVerifier.NetPosition[] memory positions)
        internal
        view
        returns (
            bytes memory publicValues,
            FigaroBatchVerifier.AttestationData[] memory attestations,
            FigaroBatchVerifier.SchemaData[] memory schemas,
            FigaroBatchVerifier.MechanismSchemaData[] memory mechanisms,
            FigaroBatchVerifier.OperatorEventInput[] memory operators
        )
    {
        attestations = new FigaroBatchVerifier.AttestationData[](0);
        schemas = new FigaroBatchVerifier.SchemaData[](0);
        mechanisms = new FigaroBatchVerifier.MechanismSchemaData[](0);
        operators = new FigaroBatchVerifier.OperatorEventInput[](0);

        bytes32 posHash = _hashPositions(positions);
        bytes32 attHash = _hashAttestations(attestations);
        bytes32 schHash = _hashSchemas(schemas, mechanisms);
        bytes32 opHash = _hashOperatorEvents(operators);

        publicValues = _encodePublicValues(
            GENESIS_ROOT, newRoot, uint64(block.chainid), address(bv), posHash, attHash, schHash, opHash
        );
    }

    /// @dev Convenience wrapper: pack separate event arrays into BatchEventData
    ///      and call settleBatch.
    function _settle(
        bytes memory pv,
        FigaroBatchVerifier.NetPosition[] memory positions,
        FigaroBatchVerifier.AttestationData[] memory att,
        FigaroBatchVerifier.SchemaData[] memory sch,
        FigaroBatchVerifier.MechanismSchemaData[] memory mech,
        FigaroBatchVerifier.OperatorEventInput[] memory ops
    ) internal {
        FigaroBatchVerifier.BatchEventData memory events =
            FigaroBatchVerifier.BatchEventData({
                attestations: att, schemas: sch, mechanismSchemas: mech, operatorEvents: ops
            });
        bv.settleBatch(hex"", pv, positions, events);
    }

    // ── Constructor tests ─────────────────────────────────────────

    function test_constructor_setsImmutables() public view {
        assertEq(address(bv.verifier()), address(mockVerifier));
        assertEq(bv.programVKey(), PROGRAM_VKEY);
        assertEq(bv.stateRoot(), GENESIS_ROOT);
        assertEq(bv.batchCount(), 0);
    }

    // ── Happy path: empty batch ───────────────────────────────────

    function test_settleBatch_emptyBatch() public {
        bytes32 newRoot = bytes32(uint256(0x2));
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](0);

        (
            bytes memory pv,
            FigaroBatchVerifier.AttestationData[] memory att,
            FigaroBatchVerifier.SchemaData[] memory sch,
            FigaroBatchVerifier.MechanismSchemaData[] memory mech,
            FigaroBatchVerifier.OperatorEventInput[] memory ops
        ) = _buildBatch(newRoot, positions);

        vm.expectEmit(true, true, true, true);
        emit FigaroBatchVerifier.BatchSettled(1, GENESIS_ROOT, newRoot, 0);

        _settle(pv, positions, att, sch, mech, ops);

        assertEq(bv.stateRoot(), newRoot);
        assertEq(bv.batchCount(), 1);
    }

    // ── Token transfers: net deposit ──────────────────────────────

    function test_settleBatch_netDeposit() public {
        bytes32 newRoot = bytes32(uint256(0x3));

        // Alice deposits 1000, no payout
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](1);
        positions[0] =
            FigaroBatchVerifier.NetPosition({token: address(token), user: alice, deposit: 1000 ether, payout: 0});

        (
            bytes memory pv,
            FigaroBatchVerifier.AttestationData[] memory att,
            FigaroBatchVerifier.SchemaData[] memory sch,
            FigaroBatchVerifier.MechanismSchemaData[] memory mech,
            FigaroBatchVerifier.OperatorEventInput[] memory ops
        ) = _buildBatch(newRoot, positions);

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bvBefore = token.balanceOf(address(bv));

        _settle(pv, positions, att, sch, mech, ops);

        assertEq(token.balanceOf(alice), aliceBefore - 1000 ether);
        assertEq(token.balanceOf(address(bv)), bvBefore + 1000 ether);
    }

    // ── Token transfers: net payout ──────────────────────────────

    function test_settleBatch_netPayout() public {
        bytes32 newRoot = bytes32(uint256(0x4));

        // Bob receives 500, no deposit
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](1);
        positions[0] =
            FigaroBatchVerifier.NetPosition({token: address(token), user: bob, deposit: 0, payout: 500 ether});

        (
            bytes memory pv,
            FigaroBatchVerifier.AttestationData[] memory att,
            FigaroBatchVerifier.SchemaData[] memory sch,
            FigaroBatchVerifier.MechanismSchemaData[] memory mech,
            FigaroBatchVerifier.OperatorEventInput[] memory ops
        ) = _buildBatch(newRoot, positions);

        uint256 bobBefore = token.balanceOf(bob);

        _settle(pv, positions, att, sch, mech, ops);

        assertEq(token.balanceOf(bob), bobBefore + 500 ether);
    }

    // ── Token transfers: net zero ─────────────────────────────────

    function test_settleBatch_netZero_noTransfer() public {
        bytes32 newRoot = bytes32(uint256(0x5));

        // Charlie deposits and receives the same amount
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](1);
        positions[0] = FigaroBatchVerifier.NetPosition({
            token: address(token), user: charlie, deposit: 1000 ether, payout: 1000 ether
        });

        (
            bytes memory pv,
            FigaroBatchVerifier.AttestationData[] memory att,
            FigaroBatchVerifier.SchemaData[] memory sch,
            FigaroBatchVerifier.MechanismSchemaData[] memory mech,
            FigaroBatchVerifier.OperatorEventInput[] memory ops
        ) = _buildBatch(newRoot, positions);

        uint256 charlieBefore = token.balanceOf(charlie);
        uint256 bvBefore = token.balanceOf(address(bv));

        _settle(pv, positions, att, sch, mech, ops);

        assertEq(token.balanceOf(charlie), charlieBefore);
        assertEq(token.balanceOf(address(bv)), bvBefore);
    }

    // ── Multiple positions in one batch ───────────────────────────

    function test_settleBatch_multiplePositions() public {
        bytes32 newRoot = bytes32(uint256(0x6));

        // Alice deposits 2000, Bob receives 1500
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](2);
        positions[0] =
            FigaroBatchVerifier.NetPosition({token: address(token), user: alice, deposit: 2000 ether, payout: 0});
        positions[1] =
            FigaroBatchVerifier.NetPosition({token: address(token), user: bob, deposit: 0, payout: 1500 ether});

        (
            bytes memory pv,
            FigaroBatchVerifier.AttestationData[] memory att,
            FigaroBatchVerifier.SchemaData[] memory sch,
            FigaroBatchVerifier.MechanismSchemaData[] memory mech,
            FigaroBatchVerifier.OperatorEventInput[] memory ops
        ) = _buildBatch(newRoot, positions);

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bobBefore = token.balanceOf(bob);

        _settle(pv, positions, att, sch, mech, ops);

        assertEq(token.balanceOf(alice), aliceBefore - 2000 ether);
        assertEq(token.balanceOf(bob), bobBefore + 1500 ether);
    }

    // ── State root chain ──────────────────────────────────────────

    function test_settleBatch_stateRootChain() public {
        bytes32 root2 = bytes32(uint256(0x10));
        bytes32 root3 = bytes32(uint256(0x11));
        FigaroBatchVerifier.NetPosition[] memory empty = new FigaroBatchVerifier.NetPosition[](0);

        // Batch 1: genesis → root2
        (
            bytes memory pv1,
            FigaroBatchVerifier.AttestationData[] memory att1,
            FigaroBatchVerifier.SchemaData[] memory sch1,
            FigaroBatchVerifier.MechanismSchemaData[] memory mech1,
            FigaroBatchVerifier.OperatorEventInput[] memory ops1
        ) = _buildBatch(root2, empty);
        _settle(pv1, empty, att1, sch1, mech1, ops1);
        assertEq(bv.stateRoot(), root2);
        assertEq(bv.batchCount(), 1);

        // Batch 2: root2 → root3
        bytes32 posHash = _hashPositions(empty);
        bytes32 attHash = _hashAttestations(att1);
        bytes32 schHash = _hashSchemas(sch1, mech1);
        bytes32 opHash = _hashOperatorEvents(ops1);

        bytes memory pv2 =
            _encodePublicValues(root2, root3, uint64(block.chainid), address(bv), posHash, attHash, schHash, opHash);
        _settle(pv2, empty, att1, sch1, mech1, ops1);
        assertEq(bv.stateRoot(), root3);
        assertEq(bv.batchCount(), 2);
    }

    // ── State root mismatch revert ────────────────────────────────

    function test_revert_stateRootMismatch() public {
        bytes32 badPrev = bytes32(uint256(0xDEAD));
        bytes32 newRoot = bytes32(uint256(0x2));
        FigaroBatchVerifier.NetPosition[] memory empty = new FigaroBatchVerifier.NetPosition[](0);

        FigaroBatchVerifier.AttestationData[] memory att = new FigaroBatchVerifier.AttestationData[](0);
        FigaroBatchVerifier.SchemaData[] memory sch = new FigaroBatchVerifier.SchemaData[](0);
        FigaroBatchVerifier.MechanismSchemaData[] memory mech = new FigaroBatchVerifier.MechanismSchemaData[](0);
        FigaroBatchVerifier.OperatorEventInput[] memory ops = new FigaroBatchVerifier.OperatorEventInput[](0);

        bytes memory pv = _encodePublicValues(
            badPrev,
            newRoot,
            uint64(block.chainid),
            address(bv),
            _hashPositions(empty),
            _hashAttestations(att),
            _hashSchemas(sch, mech),
            _hashOperatorEvents(ops)
        );

        vm.expectRevert(abi.encodeWithSelector(FigaroBatchVerifier.StateRootMismatch.selector, GENESIS_ROOT, badPrev));
        _settle(pv, empty, att, sch, mech, ops);
    }

    // ── Chain ID mismatch revert ──────────────────────────────────

    function test_revert_chainIdMismatch() public {
        bytes32 newRoot = bytes32(uint256(0x2));
        FigaroBatchVerifier.NetPosition[] memory empty = new FigaroBatchVerifier.NetPosition[](0);

        FigaroBatchVerifier.AttestationData[] memory att = new FigaroBatchVerifier.AttestationData[](0);
        FigaroBatchVerifier.SchemaData[] memory sch = new FigaroBatchVerifier.SchemaData[](0);
        FigaroBatchVerifier.MechanismSchemaData[] memory mech = new FigaroBatchVerifier.MechanismSchemaData[](0);
        FigaroBatchVerifier.OperatorEventInput[] memory ops = new FigaroBatchVerifier.OperatorEventInput[](0);

        bytes memory pv = _encodePublicValues(
            GENESIS_ROOT,
            newRoot,
            uint64(9999),
            address(bv),
            _hashPositions(empty),
            _hashAttestations(att),
            _hashSchemas(sch, mech),
            _hashOperatorEvents(ops)
        );

        vm.expectRevert(
            abi.encodeWithSelector(FigaroBatchVerifier.ChainIdMismatch.selector, uint64(block.chainid), uint64(9999))
        );
        _settle(pv, empty, att, sch, mech, ops);
    }

    // ── Verifying contract mismatch revert ────────────────────────

    function test_revert_verifyingContractMismatch() public {
        bytes32 newRoot = bytes32(uint256(0x2));
        FigaroBatchVerifier.NetPosition[] memory empty = new FigaroBatchVerifier.NetPosition[](0);

        FigaroBatchVerifier.AttestationData[] memory att = new FigaroBatchVerifier.AttestationData[](0);
        FigaroBatchVerifier.SchemaData[] memory sch = new FigaroBatchVerifier.SchemaData[](0);
        FigaroBatchVerifier.MechanismSchemaData[] memory mech = new FigaroBatchVerifier.MechanismSchemaData[](0);
        FigaroBatchVerifier.OperatorEventInput[] memory ops = new FigaroBatchVerifier.OperatorEventInput[](0);

        address badContract = address(0xBEEF);
        bytes memory pv = _encodePublicValues(
            GENESIS_ROOT,
            newRoot,
            uint64(block.chainid),
            badContract,
            _hashPositions(empty),
            _hashAttestations(att),
            _hashSchemas(sch, mech),
            _hashOperatorEvents(ops)
        );

        vm.expectRevert(
            abi.encodeWithSelector(FigaroBatchVerifier.VerifyingContractMismatch.selector, address(bv), badContract)
        );
        _settle(pv, empty, att, sch, mech, ops);
    }

    // ── Position hash mismatch revert ─────────────────────────────

    function test_revert_positionHashMismatch() public {
        bytes32 newRoot = bytes32(uint256(0x2));

        // Create positions but use wrong hash in public values
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](1);
        positions[0] =
            FigaroBatchVerifier.NetPosition({token: address(token), user: alice, deposit: 100 ether, payout: 0});

        FigaroBatchVerifier.AttestationData[] memory att = new FigaroBatchVerifier.AttestationData[](0);
        FigaroBatchVerifier.SchemaData[] memory sch = new FigaroBatchVerifier.SchemaData[](0);
        FigaroBatchVerifier.MechanismSchemaData[] memory mech = new FigaroBatchVerifier.MechanismSchemaData[](0);
        FigaroBatchVerifier.OperatorEventInput[] memory ops = new FigaroBatchVerifier.OperatorEventInput[](0);

        // Use empty position hash (wrong)
        FigaroBatchVerifier.NetPosition[] memory emptyPos = new FigaroBatchVerifier.NetPosition[](0);

        bytes memory pv = _encodePublicValues(
            GENESIS_ROOT,
            newRoot,
            uint64(block.chainid),
            address(bv),
            _hashPositions(emptyPos), // wrong hash
            _hashAttestations(att),
            _hashSchemas(sch, mech),
            _hashOperatorEvents(ops)
        );

        vm.expectRevert(FigaroBatchVerifier.PositionHashMismatch.selector);
        _settle(pv, positions, att, sch, mech, ops);
    }

    // ── Attestation events re-emitted ─────────────────────────────

    function test_settleBatch_attestationEvents() public {
        bytes32 newRoot = bytes32(uint256(0x7));
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](0);

        FigaroBatchVerifier.AttestationData[] memory att = new FigaroBatchVerifier.AttestationData[](1);
        att[0] = FigaroBatchVerifier.AttestationData({
            orderHash: bytes32(uint256(0xAA)),
            processId: bytes32(uint256(0xBB)),
            attester: alice,
            schemaId: bytes32(uint256(0xCC)),
            stage: 2,
            contentRef: bytes32(uint256(0xDD))
        });

        FigaroBatchVerifier.SchemaData[] memory sch = new FigaroBatchVerifier.SchemaData[](0);
        FigaroBatchVerifier.MechanismSchemaData[] memory mech = new FigaroBatchVerifier.MechanismSchemaData[](0);
        FigaroBatchVerifier.OperatorEventInput[] memory ops = new FigaroBatchVerifier.OperatorEventInput[](0);

        bytes32 posHash = _hashPositions(positions);
        bytes32 attHash = _hashAttestations(att);
        bytes32 schHash = _hashSchemas(sch, mech);
        bytes32 opHash = _hashOperatorEvents(ops);

        bytes memory pv = _encodePublicValues(
            GENESIS_ROOT, newRoot, uint64(block.chainid), address(bv), posHash, attHash, schHash, opHash
        );

        vm.expectEmit(true, true, true, true);
        emit FigaroBatchVerifier.Attestation(
            bytes32(uint256(0xAA)), bytes32(uint256(0xBB)), alice, bytes32(uint256(0xCC)), 2, bytes32(uint256(0xDD))
        );

        _settle(pv, positions, att, sch, mech, ops);
    }

    // ── Schema events re-emitted ──────────────────────────────────

    function test_settleBatch_schemaEvents() public {
        bytes32 newRoot = bytes32(uint256(0x8));
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](0);

        FigaroBatchVerifier.AttestationData[] memory att = new FigaroBatchVerifier.AttestationData[](0);

        FigaroBatchVerifier.SchemaData[] memory sch = new FigaroBatchVerifier.SchemaData[](1);
        sch[0] = FigaroBatchVerifier.SchemaData({
            schemaId: bytes32(uint256(0x51)), version: 1, uriHash: bytes32(uint256(0xA1)), registrar: bob
        });

        FigaroBatchVerifier.MechanismSchemaData[] memory mech = new FigaroBatchVerifier.MechanismSchemaData[](1);
        mech[0] = FigaroBatchVerifier.MechanismSchemaData({mechanism: charlie, schemaId: bytes32(uint256(0x51))});

        FigaroBatchVerifier.OperatorEventInput[] memory ops = new FigaroBatchVerifier.OperatorEventInput[](0);

        bytes32 posHash = _hashPositions(positions);
        bytes32 attHash = _hashAttestations(att);
        bytes32 schHash = _hashSchemas(sch, mech);
        bytes32 opHash = _hashOperatorEvents(ops);

        bytes memory pv = _encodePublicValues(
            GENESIS_ROOT, newRoot, uint64(block.chainid), address(bv), posHash, attHash, schHash, opHash
        );

        vm.expectEmit(true, true, false, true);
        emit FigaroBatchVerifier.SchemaRegistered(bytes32(uint256(0x51)), 1, bytes32(uint256(0xA1)), bob);

        vm.expectEmit(true, true, false, true);
        emit FigaroBatchVerifier.MechanismSchemaSet(charlie, bytes32(uint256(0x51)));

        _settle(pv, positions, att, sch, mech, ops);
    }

    // ── Operator events re-emitted ────────────────────────────────

    function test_settleBatch_operatorRegisteredEvent() public {
        bytes32 newRoot = bytes32(uint256(0x9));
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](0);

        FigaroBatchVerifier.AttestationData[] memory att = new FigaroBatchVerifier.AttestationData[](0);
        FigaroBatchVerifier.SchemaData[] memory sch = new FigaroBatchVerifier.SchemaData[](0);
        FigaroBatchVerifier.MechanismSchemaData[] memory mech = new FigaroBatchVerifier.MechanismSchemaData[](0);

        FigaroBatchVerifier.OperatorEventInput[] memory ops = new FigaroBatchVerifier.OperatorEventInput[](1);
        ops[0] = FigaroBatchVerifier.OperatorEventInput({
            tag: 1, // Registered
            operator: alice,
            metadataURI: "ipfs://QmFoo"
        });

        bytes32 posHash = _hashPositions(positions);
        bytes32 attHash = _hashAttestations(att);
        bytes32 schHash = _hashSchemas(sch, mech);
        bytes32 opHash = _hashOperatorEvents(ops);

        bytes memory pv = _encodePublicValues(
            GENESIS_ROOT, newRoot, uint64(block.chainid), address(bv), posHash, attHash, schHash, opHash
        );

        vm.expectEmit(true, false, false, true);
        emit FigaroBatchVerifier.OperatorRegistered(alice, "ipfs://QmFoo");

        _settle(pv, positions, att, sch, mech, ops);
    }

    // ── Operator profile-updated event ────────────────────────────

    function test_settleBatch_operatorProfileUpdated() public {
        bytes32 newRoot = bytes32(uint256(0xA));
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](0);

        FigaroBatchVerifier.AttestationData[] memory att = new FigaroBatchVerifier.AttestationData[](0);
        FigaroBatchVerifier.SchemaData[] memory sch = new FigaroBatchVerifier.SchemaData[](0);
        FigaroBatchVerifier.MechanismSchemaData[] memory mech = new FigaroBatchVerifier.MechanismSchemaData[](0);

        FigaroBatchVerifier.OperatorEventInput[] memory ops = new FigaroBatchVerifier.OperatorEventInput[](1);
        ops[0] = FigaroBatchVerifier.OperatorEventInput({
            tag: 2, // ProfileUpdated
            operator: bob,
            metadataURI: "ipfs://QmBar"
        });

        bytes32 posHash = _hashPositions(positions);
        bytes32 attHash = _hashAttestations(att);
        bytes32 schHash = _hashSchemas(sch, mech);
        bytes32 opHash = _hashOperatorEvents(ops);

        bytes memory pv = _encodePublicValues(
            GENESIS_ROOT, newRoot, uint64(block.chainid), address(bv), posHash, attHash, schHash, opHash
        );

        vm.expectEmit(true, false, false, true);
        emit FigaroBatchVerifier.OperatorProfileUpdated(bob, "ipfs://QmBar");

        _settle(pv, positions, att, sch, mech, ops);
    }

    // ── Invalid operator tag revert ───────────────────────────────

    function test_revert_invalidOperatorTag() public {
        bytes32 newRoot = bytes32(uint256(0xB));
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](0);

        FigaroBatchVerifier.AttestationData[] memory att = new FigaroBatchVerifier.AttestationData[](0);
        FigaroBatchVerifier.SchemaData[] memory sch = new FigaroBatchVerifier.SchemaData[](0);
        FigaroBatchVerifier.MechanismSchemaData[] memory mech = new FigaroBatchVerifier.MechanismSchemaData[](0);

        FigaroBatchVerifier.OperatorEventInput[] memory ops = new FigaroBatchVerifier.OperatorEventInput[](1);
        ops[0] = FigaroBatchVerifier.OperatorEventInput({
            tag: 3, // first unsupported tag past {Registered=1, ProfileUpdated=2}
            operator: alice,
            metadataURI: ""
        });

        // The contract's `_hashOperatorEvents` rejects unknown tags up front,
        // so the call reverts there regardless of what opHash we submit.
        bytes32 posHash = _hashPositions(positions);
        bytes32 attHash = _hashAttestations(att);
        bytes32 schHash = _hashSchemas(sch, mech);
        bytes32 opHash = bytes32(0);

        bytes memory pv = _encodePublicValues(
            GENESIS_ROOT, newRoot, uint64(block.chainid), address(bv), posHash, attHash, schHash, opHash
        );

        vm.expectRevert(abi.encodeWithSelector(FigaroBatchVerifier.InvalidOperatorTag.selector, uint8(3)));
        _settle(pv, positions, att, sch, mech, ops);
    }

    // ── Mixed batch: positions + events ───────────────────────────

    function test_settleBatch_mixedBatch() public {
        bytes32 newRoot = bytes32(uint256(0xC));

        // Alice deposits, Bob receives
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](2);
        positions[0] =
            FigaroBatchVerifier.NetPosition({token: address(token), user: alice, deposit: 3000 ether, payout: 0});
        positions[1] =
            FigaroBatchVerifier.NetPosition({token: address(token), user: bob, deposit: 0, payout: 2000 ether});

        // One attestation
        FigaroBatchVerifier.AttestationData[] memory att = new FigaroBatchVerifier.AttestationData[](1);
        att[0] = FigaroBatchVerifier.AttestationData({
            orderHash: bytes32(uint256(0x111)),
            processId: bytes32(uint256(0x222)),
            attester: charlie,
            schemaId: bytes32(uint256(0x333)),
            stage: 1,
            contentRef: bytes32(uint256(0x444))
        });

        // One operator registration
        FigaroBatchVerifier.SchemaData[] memory sch = new FigaroBatchVerifier.SchemaData[](0);
        FigaroBatchVerifier.MechanismSchemaData[] memory mech = new FigaroBatchVerifier.MechanismSchemaData[](0);

        FigaroBatchVerifier.OperatorEventInput[] memory ops = new FigaroBatchVerifier.OperatorEventInput[](1);
        ops[0] = FigaroBatchVerifier.OperatorEventInput({
            tag: 1,
            operator: charlie,
            metadataURI: "ipfs://QmBar"
        });

        bytes32 posHash = _hashPositions(positions);
        bytes32 attHash = _hashAttestations(att);
        bytes32 schHash = _hashSchemas(sch, mech);
        bytes32 opHash = _hashOperatorEvents(ops);

        bytes memory pv = _encodePublicValues(
            GENESIS_ROOT, newRoot, uint64(block.chainid), address(bv), posHash, attHash, schHash, opHash
        );

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bobBefore = token.balanceOf(bob);

        _settle(pv, positions, att, sch, mech, ops);

        assertEq(token.balanceOf(alice), aliceBefore - 3000 ether);
        assertEq(token.balanceOf(bob), bobBefore + 2000 ether);
        assertEq(bv.stateRoot(), newRoot);
        assertEq(bv.batchCount(), 1);
    }

    // ── Attestation hash mismatch revert ──────────────────────────

    function test_revert_attestationHashMismatch() public {
        bytes32 newRoot = bytes32(uint256(0xD));
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](0);

        // Submit attestation data but use empty hash
        FigaroBatchVerifier.AttestationData[] memory att = new FigaroBatchVerifier.AttestationData[](1);
        att[0] = FigaroBatchVerifier.AttestationData({
            orderHash: bytes32(uint256(1)),
            processId: bytes32(uint256(2)),
            attester: alice,
            schemaId: bytes32(uint256(3)),
            stage: 0,
            contentRef: bytes32(uint256(4))
        });

        FigaroBatchVerifier.SchemaData[] memory sch = new FigaroBatchVerifier.SchemaData[](0);
        FigaroBatchVerifier.MechanismSchemaData[] memory mech = new FigaroBatchVerifier.MechanismSchemaData[](0);
        FigaroBatchVerifier.OperatorEventInput[] memory ops = new FigaroBatchVerifier.OperatorEventInput[](0);

        // Use empty attestation hash (wrong)
        FigaroBatchVerifier.AttestationData[] memory emptyAtt = new FigaroBatchVerifier.AttestationData[](0);

        bytes memory pv = _encodePublicValues(
            GENESIS_ROOT,
            newRoot,
            uint64(block.chainid),
            address(bv),
            _hashPositions(positions),
            _hashAttestations(emptyAtt), // wrong hash
            _hashSchemas(sch, mech),
            _hashOperatorEvents(ops)
        );

        vm.expectRevert(FigaroBatchVerifier.AttestationHashMismatch.selector);
        _settle(pv, positions, att, sch, mech, ops);
    }

    // ── Batch counter increments ──────────────────────────────────

    // ── Schema hash mismatch revert ──────────────────────────────

    function test_revert_schemaHashMismatch() public {
        bytes32 newRoot = bytes32(uint256(0xE));
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](0);

        FigaroBatchVerifier.AttestationData[] memory att = new FigaroBatchVerifier.AttestationData[](0);

        // Submit schema data but use empty hash
        FigaroBatchVerifier.SchemaData[] memory sch = new FigaroBatchVerifier.SchemaData[](1);
        sch[0] = FigaroBatchVerifier.SchemaData({
            schemaId: bytes32(uint256(0x51)), version: 1, uriHash: bytes32(uint256(0xA1)), registrar: bob
        });
        FigaroBatchVerifier.MechanismSchemaData[] memory mech = new FigaroBatchVerifier.MechanismSchemaData[](0);
        FigaroBatchVerifier.OperatorEventInput[] memory ops = new FigaroBatchVerifier.OperatorEventInput[](0);

        // Use empty schema hash (wrong)
        FigaroBatchVerifier.SchemaData[] memory emptySch = new FigaroBatchVerifier.SchemaData[](0);

        bytes memory pv = _encodePublicValues(
            GENESIS_ROOT,
            newRoot,
            uint64(block.chainid),
            address(bv),
            _hashPositions(positions),
            _hashAttestations(att),
            _hashSchemas(emptySch, mech), // wrong hash
            _hashOperatorEvents(ops)
        );

        vm.expectRevert(FigaroBatchVerifier.SchemaHashMismatch.selector);
        _settle(pv, positions, att, sch, mech, ops);
    }

    // ── Operator hash mismatch revert ─────────────────────────────

    function test_revert_operatorHashMismatch() public {
        bytes32 newRoot = bytes32(uint256(0xF));
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](0);

        FigaroBatchVerifier.AttestationData[] memory att = new FigaroBatchVerifier.AttestationData[](0);
        FigaroBatchVerifier.SchemaData[] memory sch = new FigaroBatchVerifier.SchemaData[](0);
        FigaroBatchVerifier.MechanismSchemaData[] memory mech = new FigaroBatchVerifier.MechanismSchemaData[](0);

        // Submit operator data but use empty hash
        FigaroBatchVerifier.OperatorEventInput[] memory ops = new FigaroBatchVerifier.OperatorEventInput[](1);
        ops[0] =
            FigaroBatchVerifier.OperatorEventInput({tag: 1, operator: alice, metadataURI: "ipfs://QmTest"});

        // Use empty operator hash (wrong)
        FigaroBatchVerifier.OperatorEventInput[] memory emptyOps = new FigaroBatchVerifier.OperatorEventInput[](0);

        bytes memory pv = _encodePublicValues(
            GENESIS_ROOT,
            newRoot,
            uint64(block.chainid),
            address(bv),
            _hashPositions(positions),
            _hashAttestations(att),
            _hashSchemas(sch, mech),
            _hashOperatorEvents(emptyOps) // wrong hash
        );

        vm.expectRevert(FigaroBatchVerifier.OperatorHashMismatch.selector);
        _settle(pv, positions, att, sch, mech, ops);
    }

    // ── Operator updated event (tag 2) ────────────────────────────

    function test_settleBatch_operatorProfileUpdatedEvent_distinctTopic() public {
        bytes32 newRoot = bytes32(uint256(0x10A));
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](0);

        FigaroBatchVerifier.AttestationData[] memory att = new FigaroBatchVerifier.AttestationData[](0);
        FigaroBatchVerifier.SchemaData[] memory sch = new FigaroBatchVerifier.SchemaData[](0);
        FigaroBatchVerifier.MechanismSchemaData[] memory mech = new FigaroBatchVerifier.MechanismSchemaData[](0);

        FigaroBatchVerifier.OperatorEventInput[] memory ops = new FigaroBatchVerifier.OperatorEventInput[](1);
        ops[0] = FigaroBatchVerifier.OperatorEventInput({
            tag: 2, // ProfileUpdated
            operator: alice,
            metadataURI: "ipfs://QmUpdated"
        });

        bytes32 posHash = _hashPositions(positions);
        bytes32 attHash = _hashAttestations(att);
        bytes32 schHash = _hashSchemas(sch, mech);
        bytes32 opHash = _hashOperatorEvents(ops);

        bytes memory pv = _encodePublicValues(
            GENESIS_ROOT, newRoot, uint64(block.chainid), address(bv), posHash, attHash, schHash, opHash
        );

        vm.expectEmit(true, false, false, true);
        emit FigaroBatchVerifier.OperatorProfileUpdated(alice, "ipfs://QmUpdated");

        _settle(pv, positions, att, sch, mech, ops);
    }

    // ── Fee-on-transfer revert ────────────────────────────────────

    function test_revert_feeOnTransferDetected() public {
        MockERC20FeeOnTransfer feeToken = new MockERC20FeeOnTransfer("Fee Token", "FEE");
        feeToken.mint(alice, INITIAL_BALANCE);
        vm.prank(alice);
        feeToken.approve(address(bv), type(uint256).max);

        bytes32 newRoot = bytes32(uint256(0x10B));

        // Alice deposits via fee-on-transfer token
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](1);
        positions[0] =
            FigaroBatchVerifier.NetPosition({token: address(feeToken), user: alice, deposit: 1000 ether, payout: 0});

        (
            bytes memory pv,
            FigaroBatchVerifier.AttestationData[] memory att,
            FigaroBatchVerifier.SchemaData[] memory sch,
            FigaroBatchVerifier.MechanismSchemaData[] memory mech,
            FigaroBatchVerifier.OperatorEventInput[] memory ops
        ) = _buildBatch(newRoot, positions);

        vm.expectRevert(FigaroBatchVerifier.FeeOnTransferDetected.selector);
        _settle(pv, positions, att, sch, mech, ops);
    }

    // ── Batch counter increments ──────────────────────────────────

    function test_batchCounterIncrements() public {
        FigaroBatchVerifier.NetPosition[] memory empty = new FigaroBatchVerifier.NetPosition[](0);

        for (uint256 i = 0; i < 3; i++) {
            bytes32 newRoot = bytes32(uint256(100 + i));
            bytes32 prevRoot = (i == 0) ? GENESIS_ROOT : bytes32(uint256(99 + i));

            FigaroBatchVerifier.AttestationData[] memory att = new FigaroBatchVerifier.AttestationData[](0);
            FigaroBatchVerifier.SchemaData[] memory sch = new FigaroBatchVerifier.SchemaData[](0);
            FigaroBatchVerifier.MechanismSchemaData[] memory mech = new FigaroBatchVerifier.MechanismSchemaData[](0);
            FigaroBatchVerifier.OperatorEventInput[] memory ops = new FigaroBatchVerifier.OperatorEventInput[](0);

            bytes memory pv = _encodePublicValues(
                prevRoot,
                newRoot,
                uint64(block.chainid),
                address(bv),
                _hashPositions(empty),
                _hashAttestations(att),
                _hashSchemas(sch, mech),
                _hashOperatorEvents(ops)
            );
            _settle(pv, empty, att, sch, mech, ops);
        }

        assertEq(bv.batchCount(), 3);
    }
}

// FigaroBatchEmissionTest and emission-related tests removed
