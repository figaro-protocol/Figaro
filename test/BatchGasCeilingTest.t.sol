// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FigaroBatchVerifier.sol";
import "../src/mocks/MockSP1Verifier.sol";
import "../src/mocks/MockERC20.sol";

/// @title BatchGasCeilingTest — Empirical gas ceiling for settleBatch
/// @notice Measures how many NetPositions (each requiring a safeTransfer)
///         can be settled within the Ethereum 30M gas limit.
///         This is the apples-to-apples comparison with FigaroCore's
///         resolveProcess gas ceiling test.
contract BatchGasCeilingTest is Test {
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
        // Fund the verifier contract for payouts
        token.mint(address(bv), INITIAL_BALANCE);
    }

    // ── Hash helpers (matching contract internals) ─────────────────

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

    // ── Build a batch with N net-payout positions ──────────────────

    /// @dev Each position pays out 1 ether to a unique address.
    ///      This exercises: hash verification + safeTransfer per position.
    function _buildPayoutBatch(uint256 n)
        internal
        view
        returns (
            FigaroBatchVerifier.NetPosition[] memory positions,
            bytes memory publicValues,
            FigaroBatchVerifier.BatchEventData memory events
        )
    {
        positions = new FigaroBatchVerifier.NetPosition[](n);
        for (uint256 i = 0; i < n; i++) {
            positions[i] = FigaroBatchVerifier.NetPosition({
                token: address(token), user: address(uint160(0x1000 + i)), deposit: 0, payout: 1 ether
            });
        }

        bytes32 posHash = _hashPositions(positions);
        bytes32 emptyHash = _emptyEventsHash();
        bytes32 newRoot = bytes32(uint256(0x2));

        publicValues = abi.encode(
            GENESIS_ROOT, newRoot, uint64(block.chainid), address(bv), posHash, emptyHash, emptyHash, emptyHash
        );

        events = FigaroBatchVerifier.BatchEventData({
            attestations: new FigaroBatchVerifier.AttestationData[](0),
            clauses: new FigaroBatchVerifier.ClauseData[](0),
            mechanismClauses: new FigaroBatchVerifier.MechanismClauseData[](0),
            sellerEvents: new FigaroBatchVerifier.SellerEventInput[](0)
        });
    }

    function _trySettle(uint256 n) internal returns (bool ok, uint256 gasUsed) {
        // Reset state root to genesis for each attempt
        uint256 snapshot = vm.snapshotState();

        (
            FigaroBatchVerifier.NetPosition[] memory positions,
            bytes memory pv,
            FigaroBatchVerifier.BatchEventData memory events
        ) = _buildPayoutBatch(n);

        bytes memory data = abi.encodeCall(bv.settleBatch, (hex"", pv, positions, events));

        uint256 gasBefore = gasleft();
        (bool success,) = address(bv).call{gas: GAS_BUDGET}(data);
        gasUsed = gasBefore - gasleft();

        vm.revertToState(snapshot);
        return (success, gasUsed);
    }

    // ── Measure specific sizes ────────────────────────────────────

    function test_Gas_BatchSettle_10_positions() public {
        (bool ok, uint256 gas) = _trySettle(10);
        assertTrue(ok, "10 positions should succeed");
        emit log_named_uint("positions", 10);
        emit log_named_uint("gasUsed", gas);
    }

    function test_Gas_BatchSettle_50_positions() public {
        (bool ok, uint256 gas) = _trySettle(50);
        assertTrue(ok, "50 positions should succeed");
        emit log_named_uint("positions", 50);
        emit log_named_uint("gasUsed", gas);
    }

    function test_Gas_BatchSettle_100_positions() public {
        (bool ok, uint256 gas) = _trySettle(100);
        emit log_named_uint("positions", 100);
        emit log_named_uint("gasUsed", gas);
        emit log_named_string("success", ok ? "true" : "false");
    }

    function test_Gas_BatchSettle_200_positions() public {
        (bool ok, uint256 gas) = _trySettle(200);
        emit log_named_uint("positions", 200);
        emit log_named_uint("gasUsed", gas);
        emit log_named_string("success", ok ? "true" : "false");
    }

    function test_Gas_BatchSettle_500_positions() public {
        (bool ok, uint256 gas) = _trySettle(500);
        emit log_named_uint("positions", 500);
        emit log_named_uint("gasUsed", gas);
        emit log_named_string("success", ok ? "true" : "false");
    }

    function test_Gas_BatchSettle_1000_positions() public {
        (bool ok, uint256 gas) = _trySettle(1000);
        emit log_named_uint("positions", 1000);
        emit log_named_uint("gasUsed", gas);
        emit log_named_string("success", ok ? "true" : "false");
    }

    function test_Gas_BatchSettle_1500_positions() public {
        (bool ok, uint256 gas) = _trySettle(1500);
        emit log_named_uint("positions", 1500);
        emit log_named_uint("gasUsed", gas);
        emit log_named_string("success", ok ? "true" : "false");
    }

    function test_Gas_BatchSettle_2000_positions() public {
        (bool ok, uint256 gas) = _trySettle(2000);
        emit log_named_uint("positions", 2000);
        emit log_named_uint("gasUsed", gas);
        emit log_named_string("success", ok ? "true" : "false");
    }
}
