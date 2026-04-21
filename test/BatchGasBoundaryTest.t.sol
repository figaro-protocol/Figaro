// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FigaroBatchVerifier.sol";
import "../src/mocks/MockSP1Verifier.sol";
import "../src/mocks/MockERC20.sol";

/// @title BatchGasBoundaryTest — Find the exact ceiling
contract BatchGasBoundaryTest is Test {
    FigaroBatchVerifier internal bv;
    MockSP1Verifier internal mockVerifier;
    MockERC20 internal token;

    bytes32 internal constant PROGRAM_VKEY = bytes32(uint256(0xCAFE));
    bytes32 internal constant GENESIS_ROOT = bytes32(uint256(0x1));
    uint256 internal constant GAS_BUDGET = 30_000_000;
    uint256 internal constant INITIAL_BALANCE = 1_000_000_000 ether;

    function setUp() public {
        mockVerifier = new MockSP1Verifier();
        token = new MockERC20("Test Token", "TST");
        bv = new FigaroBatchVerifier(address(mockVerifier), PROGRAM_VKEY, GENESIS_ROOT);
        token.mint(address(bv), INITIAL_BALANCE);
    }

    function _hashPositions(FigaroBatchVerifier.NetPosition[] memory positions) internal pure returns (bytes32) {
        uint256 len = positions.length;
        bytes memory packed = new bytes(len * 104);
        uint256 offset;
        for (uint256 i = 0; i < len; i++) {
            address tkn = positions[i].token;
            address usr = positions[i].user;
            uint256 dep = positions[i].deposit;
            uint256 pay = positions[i].payout;
            assembly {
                let dst := add(add(packed, 32), offset)
                mstore(dst, shl(96, tkn))
                mstore(add(dst, 20), shl(96, usr))
                mstore(add(dst, 40), dep)
                mstore(add(dst, 72), pay)
            }
            offset += 104;
        }
        return keccak256(packed);
    }

    function _emptyEventsHash() internal pure returns (bytes32) {
        return keccak256("");
    }

    function _trySettle(uint256 n) internal returns (bool ok, uint256 gasUsed) {
        uint256 snapshot = vm.snapshotState();

        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](n);
        for (uint256 i = 0; i < n; i++) {
            positions[i] = FigaroBatchVerifier.NetPosition({
                token: address(token), user: address(uint160(0x1000 + i)), deposit: 0, payout: 1 ether
            });
        }

        bytes32 posHash = _hashPositions(positions);
        bytes32 emptyHash = _emptyEventsHash();
        bytes32 newRoot = bytes32(uint256(0x2));

        bytes memory pv = abi.encode(
            GENESIS_ROOT, newRoot, uint64(block.chainid), address(bv), posHash, emptyHash, emptyHash, emptyHash
        );

        FigaroBatchVerifier.BatchEventData memory events = FigaroBatchVerifier.BatchEventData({
            attestations: new FigaroBatchVerifier.AttestationData[](0),
            schemas: new FigaroBatchVerifier.SchemaData[](0),
            mechanismSchemas: new FigaroBatchVerifier.MechanismSchemaData[](0),
            operatorEvents: new FigaroBatchVerifier.OperatorEventInput[](0)
        });

        bytes memory data = abi.encodeCall(bv.settleBatch, (hex"", pv, positions, events));

        uint256 gasBefore = gasleft();
        (bool success,) = address(bv).call{gas: GAS_BUDGET}(data);
        gasUsed = gasBefore - gasleft();

        vm.revertToState(snapshot);
        return (success, gasUsed);
    }

    function test_Gas_BatchBoundary() public {
        uint256[6] memory sizes = [uint256(1100), 1120, 1140, 1150, 1160, 1180];

        for (uint256 j = 0; j < sizes.length; j++) {
            (bool ok, uint256 gas) = _trySettle(sizes[j]);
            emit log_named_uint("positions", sizes[j]);
            emit log_named_uint("gasUsed", gas);
            emit log_named_string("success", ok ? "true" : "false");
        }
    }
}
