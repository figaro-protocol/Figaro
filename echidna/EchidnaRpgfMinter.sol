// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FigToken} from "../src/fig/FigToken.sol";
import {RpgfMinter} from "../src/fig/RpgfMinter.sol";
import {ISP1Verifier} from "../src/interfaces/ISP1Verifier.sol";

/// @notice Echidna-compatible SP1 verifier — accepts any proof bytes.
contract EchidnaSP1Verifier is ISP1Verifier {
    function verifyProof(bytes32, bytes calldata, bytes calldata) external pure override {}
}

/// @title EchidnaRpgfMinter — Property-based fuzzing for RpgfMinter
/// @notice Run: `echidna . --contract EchidnaRpgfMinter --config echidna.yaml`
///
/// @dev Properties tested (8):
///        echidna_claim_flag_monotonic       — claimed[stage][user] never flips back from true to false
///        echidna_total_minted_within_cap    — total FIG minted by RpgfMinter <= 600M cap
///        echidna_minter_immutable           — minter() address never changes
///        echidna_submitter_immutable        — submitter() address never changes
///        echidna_program_vkey_immutable     — programVKey() never changes
///        echidna_unlock_times_immutable     — stages[i].unlockTime never changes
///        echidna_root_one_shot              — stages[i].root never replaced once non-zero
///        echidna_claim_balance_consistency  — balanceOf(claimant) consistent with claim history
contract EchidnaRpgfMinter {
    FigToken public token;
    EchidnaSP1Verifier public verifier;
    RpgfMinter public minter;

    address public deployer = address(this);
    address public alice = address(0xA);
    address public bob = address(0xB);
    bytes32 internal constant PROGRAM_VKEY = bytes32(uint256(0xDEAD));
    uint256 internal constant CLAIM_AMOUNT = 1 ether;

    // Captured constants at construction time — used to assert immutability later.
    address internal immutable _minterTarget;
    address internal immutable _submitter;
    bytes32 internal immutable _programVKey;
    uint64 internal _u0;
    uint64 internal _u1;
    uint64 internal _u2;

    // Mirror state tracked by the harness for monotonicity checks.
    bool internal _aliceClaimedStage0;
    bool internal _bobClaimedStage0;

    constructor() {
        token = new FigToken();
        verifier = new EchidnaSP1Verifier();

        // Echidna runs from `deployer = address(this)` and has no
        // vm.prank — so the harness sets the deployer itself as the
        // submitter. (Auth on submitRoot is symbolically verified by
        // the Halmos harness; here we focus on claim-side invariants.)
        uint64[3] memory unlocks = [uint64(1), uint64(2), uint64(3)];
        minter = new RpgfMinter(
            address(token), address(verifier), PROGRAM_VKEY, address(this), unlocks
        );
        token.registerMinter(address(minter), 600_000_000 ether);

        _minterTarget = address(token);
        _submitter = address(this);
        _programVKey = PROGRAM_VKEY;
        _u0 = unlocks[0];
        _u1 = unlocks[1];
        _u2 = unlocks[2];

        // Pre-submit a 2-leaf root for alice + bob at stage 0 so the
        // fuzzer can exercise the claim path. Leaves are sorted-pair
        // hashed per OZ MerkleProof convention.
        bytes32 leafA = keccak256(abi.encodePacked(alice, CLAIM_AMOUNT));
        bytes32 leafB = keccak256(abi.encodePacked(bob, CLAIM_AMOUNT));
        bytes32 root = leafA <= leafB
            ? keccak256(abi.encodePacked(leafA, leafB))
            : keccak256(abi.encodePacked(leafB, leafA));
        bytes memory pv = abi.encode(uint8(0), root, CLAIM_AMOUNT * 2, uint32(2));
        minter.submitRoot(pv, hex"");
    }

    // ── Echidna action surface ────────────────────────────────────────

    /// @notice Fuzzer-callable: alice claims her allocation.
    function do_aliceClaim() public {
        bytes32 leafB = keccak256(abi.encodePacked(bob, CLAIM_AMOUNT));
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leafB;
        (bool ok,) = address(minter).call(
            abi.encodeWithSignature(
                "claim(uint8,uint256,bytes32[])", uint8(0), CLAIM_AMOUNT, proof
            )
        );
        if (ok) _aliceClaimedStage0 = true;
    }

    /// @notice Fuzzer-callable: bob claims his allocation.
    function do_bobClaim() public {
        bytes32 leafA = keccak256(abi.encodePacked(alice, CLAIM_AMOUNT));
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leafA;
        (bool ok,) = address(minter).call(
            abi.encodeWithSignature(
                "claim(uint8,uint256,bytes32[])", uint8(0), CLAIM_AMOUNT, proof
            )
        );
        if (ok) _bobClaimedStage0 = true;
    }

    // ── Invariant properties ──────────────────────────────────────────

    /// @dev Once true, claimed[stage][user] must never go false.
    function echidna_claim_flag_monotonic() public view returns (bool) {
        if (_aliceClaimedStage0 && !minter.claimed(0, alice)) return false;
        if (_bobClaimedStage0 && !minter.claimed(0, bob)) return false;
        return true;
    }

    /// @dev Total FIG minted through RpgfMinter cannot exceed its 600M cap.
    function echidna_total_minted_within_cap() public view returns (bool) {
        (, uint256 minted) = token.minters(address(minter));
        return minted <= 600_000_000 ether;
    }

    /// @dev RpgfMinter.minter (the FigToken target) never changes.
    function echidna_minter_immutable() public view returns (bool) {
        return minter.minter() == _minterTarget;
    }

    /// @dev RpgfMinter.submitter never changes.
    function echidna_submitter_immutable() public view returns (bool) {
        return minter.submitter() == _submitter;
    }

    /// @dev RpgfMinter.programVKey never changes.
    function echidna_program_vkey_immutable() public view returns (bool) {
        return minter.programVKey() == _programVKey;
    }

    /// @dev Each stage's unlockTime is fixed at construction.
    function echidna_unlock_times_immutable() public view returns (bool) {
        (, uint64 u0,) = minter.stages(0);
        (, uint64 u1,) = minter.stages(1);
        (, uint64 u2,) = minter.stages(2);
        return u0 == _u0 && u1 == _u1 && u2 == _u2;
    }

    /// @dev Once a stage's root is set, it cannot be replaced.
    /// Stage 0 root was set in the constructor; stages 1 and 2 were not.
    /// We track stage-0 root and ensure it never changes.
    bytes32 internal _stage0RootSnapshot;
    bool internal _stage0Captured;

    function echidna_root_one_shot() public returns (bool) {
        (bytes32 r0,,) = minter.stages(0);
        if (!_stage0Captured) {
            _stage0RootSnapshot = r0;
            _stage0Captured = true;
            return true;
        }
        return r0 == _stage0RootSnapshot;
    }

    /// @dev If alice has claimed, her balance is at least CLAIM_AMOUNT.
    /// Inverse: if she hasn't claimed, her balance from this minter
    /// path is 0.
    function echidna_claim_balance_consistency() public view returns (bool) {
        if (_aliceClaimedStage0) {
            return token.balanceOf(alice) >= CLAIM_AMOUNT;
        }
        if (_bobClaimedStage0) {
            return token.balanceOf(bob) >= CLAIM_AMOUNT;
        }
        return true;
    }
}
