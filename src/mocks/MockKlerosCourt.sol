// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IRulableArbitrable {
    function rule(uint256 _disputeID, uint256 _ruling) external;
}

/// @title MockKlerosCourt — Foundry-tests-only stand-in for a Kleros court
/// @notice Implements the arbitrator side of the ERC-792 Arbitration Standard
///         as Kleros's developer docs prescribe it: `createDispute` must be
///         paid at least `arbitrationCost(_extraData)` and returns a dispute
///         id; `executeRuling` plays the jurors' final decision arriving
///         (the court calling `rule` on the arbitrable). Records the
///         `extraData` it was routed with so tests can assert the adapter's
///         config passthrough. Never deployed — devnet composes
///         MockArbitrator directly behind the IRpgfArbitrator seam.
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any
///      kind, express or implied. No liability is accepted for loss, damages,
///      or bugs. Use at your own risk.
contract MockKlerosCourt {
    event DisputeCreation(uint256 indexed _disputeID, address indexed _arbitrable);

    uint256 public immutable cost;
    uint256 public nextDisputeID = 1;
    mapping(uint256 => address) public arbitrableOf;
    mapping(uint256 => uint256) public choicesOf;
    bytes public lastExtraData;

    constructor(uint256 _cost) {
        cost = _cost;
    }

    function arbitrationCost(bytes calldata) external view returns (uint256) {
        return cost;
    }

    function createDispute(uint256 _choices, bytes calldata _extraData) external payable returns (uint256 disputeID) {
        require(msg.value >= cost, "insufficient arbitration fee");
        disputeID = nextDisputeID++;
        arbitrableOf[disputeID] = msg.sender;
        choicesOf[disputeID] = _choices;
        lastExtraData = _extraData;
        emit DisputeCreation(disputeID, msg.sender);
    }

    /// @notice The jurors' final decision arriving — the court calls `rule`
    ///         on the arbitrable that opened the dispute.
    function executeRuling(uint256 _disputeID, uint256 _ruling) external {
        require(arbitrableOf[_disputeID] != address(0), "unknown dispute");
        IRulableArbitrable(arbitrableOf[_disputeID]).rule(_disputeID, _ruling);
    }
}
