// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice A rebasing ERC-20 — the stETH shape. Balances are shares scaled
///         by a multiplier the issuer moves with `rebase`; a transfer moves
///         the shares worth `amount` at the current multiplier. At a
///         multiplier of 1e18 every transfer is exact. Foundry tests only.
contract MockERC20Rebasing {
    string public constant name = "Rebasing";
    string public constant symbol = "RBS";
    uint8 public constant decimals = 18;
    uint256 public multiplier = 1e18;
    uint256 public totalShares;
    mapping(address => uint256) public sharesOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function rebase(uint256 newMultiplier) external {
        multiplier = newMultiplier;
    }

    function totalSupply() external view returns (uint256) {
        return totalShares * multiplier / 1e18;
    }

    function balanceOf(address who) public view returns (uint256) {
        return sharesOf[who] * multiplier / 1e18;
    }

    function mint(address to, uint256 amount) external {
        uint256 shares = amount * 1e18 / multiplier;
        totalShares += shares;
        sharesOf[to] += shares;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "RBS: allowance");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        uint256 shares = amount * 1e18 / multiplier;
        require(sharesOf[from] >= shares, "RBS: balance");
        sharesOf[from] -= shares;
        sharesOf[to] += shares;
        emit Transfer(from, to, amount);
    }
}
