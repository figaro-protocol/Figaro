// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FlorinToken} from "../rewards/FlorinToken.sol";

/// @notice A registered minter the harness drives: `FlorinToken.mint` reads
///         its minter from `msg.sender`, so each minter is a contract of its
///         own, and the harness (the token's deployer) registers it. It also
///         holds florins and transfers them, so transfers run between
///         contracts the harness controls.
contract FlorinMinterActor {
    FlorinToken internal immutable token;
    address internal immutable harness;

    constructor(FlorinToken token_) {
        token = token_;
        harness = msg.sender;
    }

    function mint(address to, uint256 amount) external returns (bool ok) {
        require(msg.sender == harness, "harness only");
        try token.mint(to, amount) {
            ok = true;
        } catch {}
    }

    function transfer(address to, uint256 amount) external returns (bool ok) {
        require(msg.sender == harness, "harness only");
        try token.transfer(to, amount) returns (bool r) {
            ok = r;
        } catch {}
    }
}

/// @title Echidna property-based tests for FlorinToken
/// @notice The harness is the token's deployer. Its actions register minters
///         with fuzzed caps, mint fuzzed amounts as a registered minter (the
///         harness itself or a `FlorinMinterActor`), transfer between holders,
///         and renounce the deployer's power; the properties read the state
///         those actions reach. `EchidnaHarnessesLiveTest` calls each action
///         once and asserts the state moved, so an action that always reverts
///         fails a Foundry test rather than leaving the fuzzer nothing to
///         explore.
contract EchidnaFlorinToken {
    FlorinToken public token;
    address public deployer = address(this);
    address public user1 = address(0xCAFE);
    address public user2 = address(0xF00D);

    /// @dev The harness's own minter cap: a tenth of the supply, so the rest
    ///      is left for `action_registerMinter` to hand out.
    uint256 public constant HARNESS_CAP = 100_000_000 ether;
    uint256 internal constant MAX_ACTORS = 8;

    FlorinMinterActor[] public actors;
    mapping(address => uint256) public ghostCap;
    mapping(address => uint256) public ghostMinted;
    uint256 public ghostSupply;
    bool public renounced;

    // Violation flags: an action that saw the token accept what it must refuse.
    bool public mintPastCapAccepted;
    bool public registerAfterRenounceAccepted;
    bool public transferMovedSupply;

    constructor() {
        token = new FlorinToken();
        token.registerMinter(address(this), HARNESS_CAP);
        ghostCap[address(this)] = HARNESS_CAP;
        // Mint some tokens to users for testing (deployer is msg.sender)
        token.mint(user1, 1_000_000 ether);
        token.mint(user2, 1_000_000 ether);
        ghostMinted[address(this)] = 2_000_000 ether;
        ghostSupply = 2_000_000 ether;
    }

    // ═════════════════════════════════════════════════════════════
    // ACTIONS
    // ═════════════════════════════════════════════════════════════

    /// Registers a new minter with a fuzzed cap within what is left of the
    /// supply. After a renounce the token must refuse it.
    function action_registerMinter(uint256 cap) public {
        if (actors.length >= MAX_ACTORS) return;
        uint256 left = token.MAX_SUPPLY() - token.totalRegisteredCap();
        if (left == 0) return;
        cap = 1 + (cap % left);
        FlorinMinterActor actor = new FlorinMinterActor(token);
        try token.registerMinter(address(actor), cap) {
            if (renounced) registerAfterRenounceAccepted = true;
            actors.push(actor);
            ghostCap[address(actor)] = cap;
        } catch {}
    }

    /// Mints a fuzzed amount, up to a little past what the minter has left,
    /// as a registered minter: the harness when `who` is zero, else an actor.
    function action_mint(uint8 who, uint8 to, uint256 amount) public {
        address minter = _minter(who);
        uint256 left = ghostCap[minter] - ghostMinted[minter];
        amount = amount % (left + 2 ether);
        address recipient = _holder(to);
        bool ok;
        if (minter == address(this)) {
            try token.mint(recipient, amount) {
                ok = true;
            } catch {}
        } else {
            ok = FlorinMinterActor(minter).mint(recipient, amount);
        }
        if (!ok) return;
        if (amount > left) mintPastCapAccepted = true;
        ghostMinted[minter] += amount;
        ghostSupply += amount;
    }

    /// Transfers a fuzzed share of a holder's balance to another holder.
    function action_transfer(uint8 from, uint8 to, uint256 amount) public {
        address sender = _minter(from);
        uint256 balance = token.balanceOf(sender);
        if (balance == 0) return;
        amount = amount % (balance + 1);
        uint256 supplyBefore = token.totalSupply();
        if (sender == address(this)) {
            token.transfer(_holder(to), amount);
        } else {
            FlorinMinterActor(sender).transfer(_holder(to), amount);
        }
        if (token.totalSupply() != supplyBefore) transferMovedSupply = true;
    }

    /// The deployer renounces: no minter can be registered afterwards, and
    /// the deployer can no longer mint.
    function action_renounce() public {
        token.renounceDeployerMint();
        renounced = true;
    }

    // ═════════════════════════════════════════════════════════════
    // PROPERTIES
    // ═════════════════════════════════════════════════════════════

    // Property: MAX_SUPPLY is never exceeded
    function echidna_max_supply_never_exceeded() public view returns (bool) {
        return token.totalSupply() <= token.MAX_SUPPLY();
    }

    // Property: Deployer can always renounce without revert
    function echidna_deployer_can_renounce() public returns (bool) {
        // Should never revert
        token.renounceDeployerMint();
        return true;
    }

    // Property: Deployer cannot mint after renouncing
    function echidna_deployer_cannot_mint_after_renounce() public returns (bool) {
        // Renounce deployer minting (idempotent)
        token.renounceDeployerMint();
        // Now minting as deployer should always fail
        (bool ok,) = address(token).call(abi.encodeWithSignature("mint(address,uint256)", deployer, 1 ether));
        return !ok;
    }

    // Property: no minter has minted past its cap, the token's count of each
    // minter's mints is the count of the mints the actions saw accepted, no
    // mint past a cap was accepted, and no minter was registered after the
    // deployer renounced.
    function echidna_minter_cap_enforced() public view returns (bool) {
        if (mintPastCapAccepted || registerAfterRenounceAccepted) return false;
        if (!_minterAgrees(address(this))) return false;
        for (uint256 i = 0; i < actors.length; i++) {
            if (!_minterAgrees(address(actors[i]))) return false;
        }
        return true;
    }

    // Property: Cannot register zero address as minter
    function echidna_no_zero_address_minter() public returns (bool) {
        (bool ok,) =
            address(token).call(abi.encodeWithSignature("registerMinter(address,uint256)", address(0), 1 ether));
        return !ok;
    }

    // Property: Minting to zero address fails
    function echidna_no_mint_to_zero_address() public returns (bool) {
        (bool ok,) = address(token).call(abi.encodeWithSignature("mint(address,uint256)", address(0), 1 ether));
        return !ok;
    }

    // Property: Total supply always equals sum of all balances
    function echidna_total_supply_matches_balances() public view returns (bool) {
        uint256 total = token.balanceOf(deployer) + token.balanceOf(user1) + token.balanceOf(user2);
        for (uint256 i = 0; i < actors.length; i++) {
            total += token.balanceOf(address(actors[i]));
        }
        return total == token.totalSupply();
    }

    // Property: no transfer moved the supply, and the supply is exactly the
    // sum of the mints the actions saw accepted.
    function echidna_contract_transfer_preserves_supply() public view returns (bool) {
        return !transferMovedSupply && token.totalSupply() == ghostSupply;
    }

    // ═════════════════════════════════════════════════════════════
    // INTERNALS
    // ═════════════════════════════════════════════════════════════

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _minterAgrees(address minter) internal view returns (bool) {
        (uint256 cap, uint256 minted) = token.minters(minter);
        return minted <= cap && cap == ghostCap[minter] && minted == ghostMinted[minter];
    }

    /// @dev The harness when `who % (n + 1)` is zero, else actor `who % (n + 1) - 1`.
    function _minter(uint8 who) internal view returns (address) {
        uint256 k = uint256(who) % (actors.length + 1);
        return k == 0 ? address(this) : address(actors[k - 1]);
    }

    /// @dev A holder: the harness, either user, or an actor.
    function _holder(uint8 to) internal view returns (address) {
        uint256 k = uint256(to) % (actors.length + 3);
        if (k == 0) return address(this);
        if (k == 1) return user1;
        if (k == 2) return user2;
        return address(actors[k - 3]);
    }
}
