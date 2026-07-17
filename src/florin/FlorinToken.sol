// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title FlorinToken
/// @notice Canonical ERC-20 + EIP-2612 permit token for the Figaro protocol: the florin.
/// @notice Market stance, permanent as of deployment: neither the DAO treasury nor the
///         founder will ever sell, buy, or provide liquidity for this token on any market.
///         The first price is a stranger's to name; value arises from use.
/// @dev Minter registry: deployer can register emission/vesting contracts as minters (one-shot, capped, non-upgradeable). No legacy emission logic remains.
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any kind, express or implied. No liability is accepted for loss, damages, or bugs. Use at your own risk.
contract FlorinToken is ERC20Permit, ReentrancyGuard {
    error NotMinter();
    error DeployerMintRenounced();
    error ZeroAddress();
    error SupplyCapExceeded();
    error MinterAlreadySet();
    error MinterNotRegistered();
    error MinterCapExceeded();

    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether;
    address public immutable deployer;
    bool public deployerMintRenounced;

    struct Minter {
        uint256 cap;
        uint256 minted;
    }
    mapping(address => Minter) public minters;

    /// @notice Sum of all registered minter caps. Enforced to not exceed MAX_SUPPLY.
    /// @dev Makes registration-time cap semantics real: caps sum to <= MAX_SUPPLY
    ///      by construction, so the allocation plan cannot be over-committed even
    ///      before any minting occurs.
    uint256 public totalRegisteredCap;

    event MinterRegistered(address indexed minter, uint256 cap);

    constructor() ERC20("Florin", "FLORIN") ERC20Permit("Florin") {
        deployer = msg.sender;
    }

    /// @notice Register a minter contract and its cap. Deployer only, before renounce.
    /// @dev Each minter can only be registered once. The sum of all registered
    ///      caps cannot exceed MAX_SUPPLY. Cannot register after renouncing.
    function registerMinter(address minter, uint256 cap) external {
        if (msg.sender != deployer) revert NotMinter();
        if (deployerMintRenounced) revert DeployerMintRenounced();
        if (minter == address(0)) revert ZeroAddress();
        if (minters[minter].cap != 0) revert MinterAlreadySet();
        if (totalRegisteredCap + cap > MAX_SUPPLY) revert SupplyCapExceeded();
        minters[minter].cap = cap;
        totalRegisteredCap += cap;
        emit MinterRegistered(minter, cap);
    }

    /// @notice Mint tokens. Only callable by registered minters, up to their cap.
    /// @dev Each minter can mint up to its cap. Global MAX_SUPPLY is enforced. Non-reentrant.
    function mint(address to, uint256 amount) external nonReentrant {
        // Block deployer from minting after renounce
        if (msg.sender == deployer && deployerMintRenounced) {
            revert DeployerMintRenounced();
        }
        Minter storage m = minters[msg.sender];
        if (m.cap == 0) revert MinterNotRegistered();
        if (m.minted + amount > m.cap) revert MinterCapExceeded();
        if (totalSupply() + amount > MAX_SUPPLY) revert SupplyCapExceeded();
        m.minted += amount;
        _mint(to, amount);
    }

    /// @notice Permanently renounce the deployer's ability to register minters.
    /// @dev This action cannot be undone. After renouncing, no new minters can be registered.
    function renounceDeployerMint() external {
        if (msg.sender != deployer) revert NotMinter();
        deployerMintRenounced = true;
    }
}
