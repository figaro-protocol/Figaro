// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockReentrantToken — an ERC-20 that re-enters a target on transfer
/// @notice TEST-ONLY. A malicious token that attempts to re-enter a chosen
///         contract during `transfer`/`transferFrom`, the classic hook a
///         fee-on-transfer or ERC-777-style token gives an attacker. It exists
///         to prove FigaroCore's (and the batch verifier's) `nonReentrant`
///         guard actually holds under an adversarial denomination token — the
///         guard is load-bearing and was otherwise untested against a live
///         re-entry attempt.
///
///         Arm it with `arm(target, data)`: the target contract and the exact
///         calldata to replay (a `commit`, a `resolveProcess`, or a `settleBatch`). On the
///         next token movement the token calls back into the target; a working
///         ReentrancyGuard makes that inner call revert, and this token
///         surfaces the revert so the test can assert the guard fired
///         (`ReentryObserved` / `ReentryBlocked`).
contract MockReentrantToken is ERC20 {
    /// @dev Which transfer hook re-enters, and with what calldata.
    address public reentryTarget;
    bytes public reentryCalldata;
    bool public armed;

    /// @notice Set true iff a re-entry attempt was made AND the inner call
    ///         reverted (i.e. the guard blocked it). Read by tests.
    bool public reentryBlocked;
    /// @dev The first four bytes of the nested call's revert data: the test asserts the guard's own
    ///      error, since any other revert (an order already committed, a failed pull) would also
    ///      read as "blocked" and prove nothing about the guard.
    bytes4 public reentryRevertSelector;
    /// @notice Set true iff a re-entry attempt was made at all.
    bool public reentryAttempted;

    constructor() ERC20("Reentrant", "REENT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Arm the token to re-enter `target` with `data` on the NEXT
    ///         transfer/transferFrom, then disarm (single-shot, so the
    ///         re-entry itself doesn't recurse infinitely).
    function arm(address target, bytes calldata data) external {
        reentryTarget = target;
        reentryCalldata = data;
        armed = true;
        reentryBlocked = false;
        reentryAttempted = false;
        reentryRevertSelector = bytes4(0);
    }

    /// @dev The re-entry hook. Fires once, on the first token movement after
    ///      arming. Catches the inner revert so the OUTER call can still
    ///      complete — the test asserts on `reentryBlocked`, mirroring how a
    ///      real attacker's token would swallow the guard revert to avoid
    ///      bricking its own transfer.
    function _attemptReentry() internal {
        if (!armed) return;
        armed = false; // single-shot: the inner call must not re-arm
        reentryAttempted = true;
        (bool ok, bytes memory ret) = reentryTarget.call(reentryCalldata);
        if (!ok && ret.length >= 4) reentryRevertSelector = bytes4(ret);
        // ok == false means the guard (or any other check) rejected the
        // nested call — the property we want. A malicious token would ignore
        // this and let its own transfer succeed; so do we.
        reentryBlocked = !ok;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        _attemptReentry();
        return super.transfer(to, value);
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        _attemptReentry();
        return super.transferFrom(from, to, value);
    }
}
