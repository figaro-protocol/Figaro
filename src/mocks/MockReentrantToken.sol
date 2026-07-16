// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockReentrantToken — an ERC-20 that re-enters a target on transfer
/// @notice TEST-ONLY. A malicious token that attempts to re-enter a chosen
///         contract during `transfer`/`transferFrom`, the classic hook a
///         fee-on-transfer or ERC-777-style token gives an attacker. It exists
///         to prove the kernel's (and the batch verifier's) `nonReentrant`
///         guard actually holds under an adversarial settlement token — the
///         guard is load-bearing and was otherwise untested against a live
///         re-entry attempt.
///
///         Arm it with `armCommit` / `armResolve` / `armSettleBatch`, pointing
///         at the target contract with the exact calldata to replay. On the
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
    }

    /// @dev The re-entry hook. Fires once, on the first token movement after
    ///      arming. Catches the inner revert so the OUTER settlement can still
    ///      complete — the test asserts on `reentryBlocked`, mirroring how a
    ///      real attacker's token would swallow the guard revert to avoid
    ///      bricking its own transfer.
    function _attemptReentry() internal {
        if (!armed) return;
        armed = false; // single-shot: the inner call must not re-arm
        reentryAttempted = true;
        (bool ok,) = reentryTarget.call(reentryCalldata);
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
