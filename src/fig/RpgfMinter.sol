// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IFigMinter} from "./IFigMinter.sol";
import {ISP1Verifier} from "../interfaces/ISP1Verifier.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title RpgfMinter
/// @custom:security-contact security@figaro.org
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice Three-stage retroactive public-goods funding minter for FIG.
///         Per-tranche merkle roots are submitted at tranche time after
///         an SP1 proof attests they correctly aggregate the substrate-
///         broadening formula over the population's per-clause state.
///         Claims use `keccak256(abi.encodePacked(msg.sender, amount))`
///         leaves verified via OpenZeppelin's sorted-pair MerkleProof —
///         any wallet on the leaf list can mint its allocation.
///
/// @dev DISCLAIMER: This contract is provided as-is, without warranty
///      of any kind, express or implied. No liability is accepted for
///      loss, damages, or bugs. Use at your own risk.
///
///      Per FIG_TOKEN.md, the canonical FIG allocation reserves 60%
///      (600M of 1B) for the staged community airdrop, distributed
///      across three tranches: stage 0 (yr 2) = 30%, stage 1 (yr 5) =
///      20%, stage 2 (yr 9) = 10% of MAX_SUPPLY. Per-stage budget
///      enforcement is delegated to the FigToken minter registry —
///      this contract only enforces unlock time, merkle inclusion,
///      one-shot per (stage, address), and the SP1 proof gate on the
///      root itself.
///
/// @dev Trust model (phase 1):
///      A `submitter` role (the sequencer wallet) is the only address
///      that can call `submitRoot`. The SP1 proof attests the root is
///      correct GIVEN the input snapshots, but it does not attest
///      that the input matches chain state — that is the sequencer's
///      job. A future phase could replace the submitter role with
///      permissionless first-write-wins if the SP1 program commits to
///      an input-integrity hash that anyone can verify against the
///      canonical event window. Until then, trust is in the submitter.
///
///      Reference implementation: `prover/rpgf/` (Rust aggregator)
///      and `sdk/scripts/rpgf-simulator/` (TS conformance spec).
contract RpgfMinter {
    uint8 public constant STAGE_COUNT = 3;

    address public immutable minter;
    ISP1Verifier public immutable verifier;
    bytes32 public immutable programVKey;
    address public immutable submitter;

    struct Stage {
        bytes32 root;
        uint64 unlockTime;
        uint256 totalAllocated;
    }

    /// @notice Per-stage configuration. `root` and `totalAllocated`
    ///         start at zero and are set once via `submitRoot`;
    ///         `unlockTime` is written in the constructor and never
    ///         changes thereafter.
    Stage[STAGE_COUNT] public stages;

    /// @notice claimed[stageIndex][account] = true once the account has claimed.
    mapping(uint8 => mapping(address => bool)) public claimed;

    // ── Errors ──────────────────────────────────────────────────────

    error ZeroMinter();
    error ZeroVerifier();
    error ZeroSubmitter();
    error VerifierNotContract();
    error InvalidStage(uint8 stageIndex);
    error NotSubmitter(address caller);
    error RootAlreadySet(uint8 stageIndex);
    error ZeroRoot();
    error RootNotSet(uint8 stageIndex);
    error NotUnlocked(uint8 stageIndex);
    error AlreadyClaimed(uint8 stageIndex, address account);
    error InvalidProof();

    // ── Events ──────────────────────────────────────────────────────

    event RootSubmitted(uint8 indexed stageIndex, bytes32 indexed root, uint256 totalAllocated, uint32 clauseCount);

    event Claimed(uint8 indexed stageIndex, address indexed account, uint256 amount);

    // ── Constructor ─────────────────────────────────────────────────

    /// @param _minter        The IFigMinter (FigToken) used for minting.
    /// @param _verifier      The SP1 verifier gateway (or mock on devnet).
    /// @param _programVKey   The verification key of the figaro-rpgf-prover SP1 program.
    /// @param _submitter     The address authorized to call submitRoot.
    ///                       In production this is the sequencer wallet.
    /// @param _unlockTimes   Unlock timestamps (seconds since epoch) for each stage.
    constructor(
        address _minter,
        address _verifier,
        bytes32 _programVKey,
        address _submitter,
        uint64[STAGE_COUNT] memory _unlockTimes
    ) {
        if (_minter == address(0)) revert ZeroMinter();
        if (_verifier == address(0)) revert ZeroVerifier();
        if (_verifier.code.length == 0) revert VerifierNotContract();
        if (_submitter == address(0)) revert ZeroSubmitter();
        minter = _minter;
        verifier = ISP1Verifier(_verifier);
        programVKey = _programVKey;
        submitter = _submitter;
        for (uint8 i = 0; i < STAGE_COUNT; i++) {
            stages[i].unlockTime = _unlockTimes[i];
        }
    }

    // ── Root submission ─────────────────────────────────────────────

    /// @notice Submit the merkle root for a tranche, attested by an SP1 proof.
    /// @param publicValues ABI-encoded:
    ///         (uint8 stageIndex, bytes32 root, uint256 totalAllocated, uint32 clauseCount).
    /// @param proof       The serialized SP1 proof bytes.
    /// @dev Submitter-only, one-shot per stage. The verifier MUST revert
    ///      if the proof does not verify against `programVKey` and these
    ///      public values; we rely on the verifier's revert and do not
    ///      double-check return values.
    function submitRoot(bytes calldata publicValues, bytes calldata proof) external {
        if (msg.sender != submitter) revert NotSubmitter(msg.sender);

        verifier.verifyProof(programVKey, publicValues, proof);

        (uint8 stageIndex, bytes32 root, uint256 totalAllocated, uint32 clauseCount) =
            abi.decode(publicValues, (uint8, bytes32, uint256, uint32));

        if (stageIndex >= STAGE_COUNT) revert InvalidStage(stageIndex);
        if (root == bytes32(0)) revert ZeroRoot();

        Stage storage s = stages[stageIndex];
        if (s.root != bytes32(0)) revert RootAlreadySet(stageIndex);

        s.root = root;
        s.totalAllocated = totalAllocated;

        emit RootSubmitted(stageIndex, root, totalAllocated, clauseCount);
    }

    // ── Claim ───────────────────────────────────────────────────────

    /// @notice Claim a stage allocation with a merkle proof.
    /// @param stageIndex The stage to claim from (0, 1, or 2).
    /// @param amount     The amount of FIG to mint to msg.sender.
    /// @param proof      The merkle proof for (msg.sender, amount) against stages[stageIndex].root.
    function claim(uint8 stageIndex, uint256 amount, bytes32[] calldata proof) external {
        if (stageIndex >= STAGE_COUNT) revert InvalidStage(stageIndex);
        Stage storage s = stages[stageIndex];
        if (s.root == bytes32(0)) revert RootNotSet(stageIndex);
        if (block.timestamp < s.unlockTime) revert NotUnlocked(stageIndex);
        if (claimed[stageIndex][msg.sender]) revert AlreadyClaimed(stageIndex, msg.sender);

        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
        if (!MerkleProof.verify(proof, s.root, leaf)) revert InvalidProof();

        claimed[stageIndex][msg.sender] = true;
        IFigMinter(minter).mint(msg.sender, amount);
        emit Claimed(stageIndex, msg.sender, amount);
    }
}
