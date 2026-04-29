// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IMockKlerosArbitrator {
    function arbitrationCost(bytes calldata extraData) external view returns (uint256);
}

/// @title MockKlerosArbitrableProxy — Stores submissions, no real arbitration (devnet / Anvil only)
/// @notice Stand-in for Kleros's ArbitrableProxy on private testnets. Implements
///         the same interface the production `klerosProxy.ts` calls
///         (`createDispute`, `submitEvidence`, `disputes`, `arbitrator`,
///         `externalIDtoLocalID`) so the dispute UI exercises the full flow
///         end-to-end without a real Kleros stack on chain.
///
///         Submissions are stored locally; no jurors, no rulings, no real
///         arbitration. The Project Operator can manually set a ruling via
///         `mockSetRuling` for testing UI states.
///
/// @dev    NEVER deploy on a real network — constructor reverts unless
///         `block.chainid == 31337`. The frontend should display a clear
///         "TESTNET — Kleros submission simulated" banner whenever this
///         contract is in the address allowlist.
contract MockKlerosArbitrableProxy {
    address public immutable arbitrator;
    address public immutable owner;

    struct DisputeRecord {
        bytes extraData;
        bool isRuled;
        uint256 ruling;
        uint256 disputeIDOnArbitratorSide;
        string metaEvidenceURI;
        address creator;
        uint256 createdAt;
    }

    mapping(uint256 => DisputeRecord) private _disputes;
    uint256 public nextLocalID;

    // ── Events (mirror Kleros's ERC-1497 / ArbitrableProxy events) ─────────

    event MetaEvidence(uint256 indexed metaEvidenceID, string evidence);
    event Evidence(address indexed arbitrator, uint256 indexed evidenceGroupID, address indexed party, string evidence);
    event Dispute(
        address indexed arbitrator, uint256 indexed disputeID, uint256 metaEvidenceID, uint256 evidenceGroupID
    );
    event Ruling(address indexed arbitrator, uint256 indexed disputeID, uint256 ruling);

    // ── Errors ────────────────────────────────────────────────────────────

    error MockOnlyOnAnvil();
    error InsufficientArbitrationCost();
    error UnknownDispute();
    error AlreadyRuled();
    error OwnerOnly();
    error InvalidArbitrator();

    constructor(address _arbitrator) {
        if (block.chainid != 31337) revert MockOnlyOnAnvil();
        if (_arbitrator == address(0)) revert InvalidArbitrator();
        arbitrator = _arbitrator;
        owner = msg.sender;
    }

    // ── Production-shaped interface ───────────────────────────────────────

    /// @notice Create a dispute. Mirrors Kleros's signature exactly.
    /// @dev    Returns a monotonically-increasing local ID.
    function createDispute(
        bytes calldata _arbitratorExtraData,
        string calldata _metaevidenceURI,
        uint256 /* _numberOfRulingOptions */
    )
        external
        payable
        returns (uint256 localDisputeID)
    {
        uint256 cost = IMockKlerosArbitrator(arbitrator).arbitrationCost(_arbitratorExtraData);
        if (msg.value < cost) revert InsufficientArbitrationCost();

        localDisputeID = nextLocalID;
        unchecked {
            nextLocalID = localDisputeID + 1;
        }

        _disputes[localDisputeID] = DisputeRecord({
            extraData: _arbitratorExtraData,
            isRuled: false,
            ruling: 0,
            disputeIDOnArbitratorSide: localDisputeID, // mock identity mapping
            metaEvidenceURI: _metaevidenceURI,
            creator: msg.sender,
            createdAt: block.timestamp
        });

        emit MetaEvidence(localDisputeID, _metaevidenceURI);
        emit Dispute(arbitrator, localDisputeID, localDisputeID, localDisputeID);
    }

    /// @notice Submit evidence to an existing dispute. Mirrors Kleros's signature.
    function submitEvidence(uint256 _localDisputeID, string calldata _evidenceURI) external {
        if (_localDisputeID >= nextLocalID) revert UnknownDispute();
        emit Evidence(arbitrator, _localDisputeID, msg.sender, _evidenceURI);
    }

    /// @notice Mirrors Kleros's `disputes` getter shape.
    function disputes(uint256 _localID)
        external
        view
        returns (bytes memory extraData, bool isRuled, uint256 ruling, uint256 disputeIDOnArbitratorSide)
    {
        DisputeRecord storage d = _disputes[_localID];
        return (d.extraData, d.isRuled, d.ruling, d.disputeIDOnArbitratorSide);
    }

    /// @notice Mock identity mapping: external ID == local ID.
    function externalIDtoLocalID(uint256 _externalID) external pure returns (uint256) {
        return _externalID;
    }

    // ── Mock-only interface (operator UI testing) ────────────────────────

    /// @notice Operator-only: simulate a ruling for UI-state testing.
    /// @dev    No equivalent in production; real Kleros rulings come from
    ///         juror voting. This exists so the operator can drive the
    ///         UI through "ruled / not ruled" states during beta testing.
    function mockSetRuling(uint256 _localID, uint256 _ruling) external {
        if (msg.sender != owner) revert OwnerOnly();
        if (_localID >= nextLocalID) revert UnknownDispute();
        DisputeRecord storage d = _disputes[_localID];
        if (d.isRuled) revert AlreadyRuled();

        d.isRuled = true;
        d.ruling = _ruling;
        emit Ruling(arbitrator, _localID, _ruling);
    }

    /// @notice Read the full dispute record (mock-only — exposes fields not
    ///         in the Kleros production interface, useful for UI testing).
    function mockReadDispute(uint256 _localID) external view returns (DisputeRecord memory) {
        return _disputes[_localID];
    }
}
