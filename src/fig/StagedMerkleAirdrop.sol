// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IFigMinter} from "./IFigMinter.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title StagedMerkleAirdrop
/// @custom:security-contact security@figaro.org
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice Three-stage merkle-claim airdrop for FIG. Each stage has its own
///         merkle root and unlock timestamp. Each address can claim at most
///         once per stage. Claims mint FIG to msg.sender via IFigMinter.
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any
///      kind, express or implied. No liability is accepted for loss, damages,
///      or bugs. Use at your own risk.
///
///      Canonical FIG allocation uses this contract for the 60% community
///      airdrop bucket, staged at:
///        - stage 0 (year 2): 30% of MAX_SUPPLY
///        - stage 1 (year 5): 20% of MAX_SUPPLY
///        - stage 2 (year 9): 10% of MAX_SUPPLY
///      Per-stage cap enforcement is delegated to the minter registry on
///      FigToken — this contract only enforces unlock time, merkle inclusion,
///      and one-shot per (stage, address).
contract StagedMerkleAirdrop {
    uint8 public constant STAGE_COUNT = 3;

    address public immutable minter;

    struct Stage {
        bytes32 root;
        uint64 unlockTime;
    }

    /// @notice Immutable stage configuration. Indexed 0..STAGE_COUNT-1.
    /// @dev Solidity does not allow immutable arrays, so we expose each stage
    ///      through the public getter while storing them in regular storage.
    ///      Stages are written once in the constructor and never mutated.
    Stage[STAGE_COUNT] public stages;

    /// @notice claimed[stageIndex][account] = true once the account has claimed.
    mapping(uint8 => mapping(address => bool)) public claimed;

    error ZeroMinter();
    error ZeroRoot(uint8 stageIndex);
    error InvalidStage(uint8 stageIndex);
    error NotUnlocked(uint8 stageIndex);
    error AlreadyClaimed(uint8 stageIndex, address account);
    error InvalidProof();

    event Claimed(uint8 indexed stageIndex, address indexed account, uint256 amount);

    /// @param _minter        The IFigMinter (FigToken) used for minting.
    /// @param _roots         Merkle roots for stages 0, 1, 2.
    /// @param _unlockTimes   Unlock timestamps (seconds since epoch) for each stage.
    constructor(address _minter, bytes32[STAGE_COUNT] memory _roots, uint64[STAGE_COUNT] memory _unlockTimes) {
        if (_minter == address(0)) revert ZeroMinter();
        for (uint8 i = 0; i < STAGE_COUNT; i++) {
            if (_roots[i] == bytes32(0)) revert ZeroRoot(i);
            stages[i] = Stage({root: _roots[i], unlockTime: _unlockTimes[i]});
        }
        minter = _minter;
    }

    /// @notice Claim a stage allocation with a merkle proof.
    /// @param stageIndex The stage to claim from (0, 1, or 2).
    /// @param amount     The amount of FIG to mint to msg.sender.
    /// @param proof      The merkle proof for (msg.sender, amount) against stages[stageIndex].root.
    function claim(uint8 stageIndex, uint256 amount, bytes32[] calldata proof) external {
        if (stageIndex >= STAGE_COUNT) revert InvalidStage(stageIndex);
        Stage storage s = stages[stageIndex];
        if (block.timestamp < s.unlockTime) revert NotUnlocked(stageIndex);
        if (claimed[stageIndex][msg.sender]) {
            revert AlreadyClaimed(stageIndex, msg.sender);
        }

        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
        if (!MerkleProof.verify(proof, s.root, leaf)) revert InvalidProof();

        claimed[stageIndex][msg.sender] = true;
        IFigMinter(minter).mint(msg.sender, amount);
        emit Claimed(stageIndex, msg.sender, amount);
    }
}
