// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IRpgfArbitrator} from "./IRpgfArbitrator.sol";

/// @notice Minimal local binding of the arbitrator side of Kleros's ERC-792
///         Arbitration Standard, per their developer docs
///         (developer.kleros.io): `createDispute` is paid at least
///         `arbitrationCost(_extraData)` and returns the dispute id; ruling 0
///         is reserved for "refused to arbitrate", choices run 1..N.
///         Local-minimal interface per the coordinator exemplar — never a
///         vendored dependency.
interface IKlerosArbitrator {
    function createDispute(uint256 _choices, bytes calldata _extraData) external payable returns (uint256 disputeID);
    function arbitrationCost(bytes calldata _extraData) external view returns (uint256);
}

/// @notice The one minter function the adapter calls back.
interface IRpgfMinterRulable {
    function rule(uint256 caseId, uint8 ruling) external;
}

/// @title KlerosRpgfAdapter — the composed Kleros forum behind IRpgfArbitrator
/// @notice Translates the RpgfMinter's bond-case dispute seam into Kleros's
///         ERC-792 arbitration flow (their own authored standard, per their
///         developer docs): `createDispute(caseId)` from the minter forwards
///         the fee to the court as `createDispute(2, extraData)`; the court's
///         final `rule(disputeID, ruling)` callback routes back as
///         `minter.rule(caseId, ruling)`. The ruling codes map 1:1 — 0
///         refused / 1 poster / 2 challenger on BOTH sides, by construction.
///         The forum settles BOND CASES ONLY: the minter never lets any forum
///         decide whether a mint happens.
/// @dev    `extraData` (subcourt routing, juror count, …) is OPAQUE bytes per
///         the ERC-792 docs, fixed at deployment — the forum is config, never
///         code. Appeals live entirely on the court (parties appeal there by
///         `disputeOf(caseId)`); the court calls `rule` only when the ruling
///         is final. Deploy order: court → adapter → minter(adapter) →
///         `bindMinter(minter)` (deployer-gated, first-write-wins — the same
///         one-shot pattern as FlorinToken's registerMinter-before-renounce).
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any
///      kind, express or implied. No liability is accepted for loss, damages,
///      or bugs. Use at your own risk.
contract KlerosRpgfAdapter is IRpgfArbitrator {
    error NotDeployer();
    error NotMinter();
    error NotCourt();
    error ZeroAddress();
    error MinterAlreadyBound();
    error DisputeAlreadyCreated(uint256 caseId);
    error UnknownDispute(uint256 disputeID);
    error InvalidRuling(uint256 ruling);

    /// @notice ERC-792 arbitrable event, required by the standard: emitted on
    ///         every final ruling the court delivers.
    event Ruling(IKlerosArbitrator indexed _arbitrator, uint256 indexed _disputeID, uint256 _ruling);
    /// @notice The caseId ↔ disputeID linkage, for parties who appeal on the
    ///         court directly.
    event DisputeMapped(uint256 indexed caseId, uint256 indexed disputeID);
    event MinterBound(address indexed minter);

    /// @notice 1 = poster takes both bonds, 2 = challenger takes both bonds;
    ///         0 stays reserved (refused → each side's bond returns).
    uint256 public constant RULING_CHOICES = 2;

    IKlerosArbitrator public immutable court;
    address public immutable deployer;
    /// @notice Court routing config (opaque per ERC-792), fixed at deployment.
    bytes public extraData;
    /// @notice Bound once by the deployer; immutable thereafter.
    IRpgfMinterRulable public minter;

    /// @notice disputeOf[caseId] — the court dispute a case escalated into
    ///         (meaningful iff disputeCreated[caseId]).
    mapping(uint256 => uint256) public disputeOf;
    mapping(uint256 => bool) public disputeCreated;
    /// @notice caseOf[disputeID] — the minter bond case behind a court dispute
    ///         (meaningful iff disputePending[disputeID]).
    mapping(uint256 => uint256) public caseOf;
    mapping(uint256 => bool) public disputePending;

    constructor(address _court, bytes memory _extraData) {
        if (_court == address(0)) revert ZeroAddress();
        court = IKlerosArbitrator(_court);
        extraData = _extraData;
        deployer = msg.sender;
    }

    /// @notice One-shot minter binding (deploy-order circularity: the minter's
    ///         constructor takes this adapter's address). Deployer-gated,
    ///         first-write-wins.
    function bindMinter(address _minter) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (_minter == address(0)) revert ZeroAddress();
        if (address(minter) != address(0)) revert MinterAlreadyBound();
        minter = IRpgfMinterRulable(_minter);
        emit MinterBound(_minter);
    }

    /// @notice The minter escalates a bond case: forward the fee to the court
    ///         as a 2-choice ERC-792 dispute and record the linkage.
    function createDispute(uint256 caseId) external payable {
        if (msg.sender != address(minter)) revert NotMinter();
        if (disputeCreated[caseId]) revert DisputeAlreadyCreated(caseId);
        disputeCreated[caseId] = true;
        uint256 disputeID = court.createDispute{value: msg.value}(RULING_CHOICES, extraData);
        disputeOf[caseId] = disputeID;
        caseOf[disputeID] = caseId;
        disputePending[disputeID] = true;
        emit DisputeMapped(caseId, disputeID);
    }

    /// @notice ERC-792 callback: the court delivers the FINAL ruling (appeals
    ///         exhausted on the court itself). Routes the bonds through
    ///         `minter.rule` under the shared 0/1/2 code meaning.
    function rule(uint256 _disputeID, uint256 _ruling) external {
        if (msg.sender != address(court)) revert NotCourt();
        if (!disputePending[_disputeID]) revert UnknownDispute(_disputeID);
        if (_ruling > RULING_CHOICES) revert InvalidRuling(_ruling);
        disputePending[_disputeID] = false;
        emit Ruling(court, _disputeID, _ruling);
        minter.rule(caseOf[_disputeID], uint8(_ruling));
    }

    /// @notice The court's current fee for this adapter's routing config —
    ///         what the poster must send with `disputeChallenge`.
    function arbitrationCost() external view returns (uint256) {
        return court.arbitrationCost(extraData);
    }
}
