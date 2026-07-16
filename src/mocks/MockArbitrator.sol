// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IRpgfArbitrator} from "../florin/IRpgfArbitrator.sol";

interface IRulable {
    function rule(uint256 caseId, uint8 ruling) external;
}

/// @title MockArbitrator — devnet/test stand-in for the composed bond-settlement forum
/// @notice Accepts disputes at zero fee and lets anyone deliver a ruling back
///         to the disputing contract. Devnet-only: a real deployment composes
///         an actual arbitration provider (e.g. Kleros via an adapter) behind
///         the same `IRpgfArbitrator` seam.
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any
///      kind, express or implied. No liability is accepted for loss, damages,
///      or bugs. Use at your own risk.
contract MockArbitrator is IRpgfArbitrator {
    event DisputeCreated(address indexed arbitrable, uint256 indexed caseId, uint256 fee);

    /// @notice disputes[arbitrable][caseId] = true once a dispute is open.
    mapping(address => mapping(uint256 => bool)) public disputes;

    function createDispute(uint256 caseId) external payable {
        disputes[msg.sender][caseId] = true;
        emit DisputeCreated(msg.sender, caseId, msg.value);
    }

    /// @notice Deliver a ruling to the arbitrable contract. Anyone may call —
    ///         devnet convenience, mirroring a juror decision arriving.
    function deliverRuling(address arbitrable, uint256 caseId, uint8 ruling) external {
        require(disputes[arbitrable][caseId], "unknown dispute");
        disputes[arbitrable][caseId] = false;
        IRulable(arbitrable).rule(caseId, ruling);
    }
}
