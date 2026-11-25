// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/console.sol";
import {DeployBase} from "./DeployBase.s.sol";

/// @title DeploySwapCoordinator — the swap-funded on-ramp joins a LIVE stack
///
/// @notice Deploys `WitnessSwapAndCommitCoordinator` against an already-deployed
///         `FigaroCore` and the chain's canonical Permit2 + Uniswap SwapRouter02.
///         The coordinator is a fifth-noun composition: it points at FigaroCore
///         (immutably) and nothing points back at it, so it deploys ALONE onto a
///         stack that is already live — no redeploy of anything else. The probe
///         and the deployment are the ones the full stack runs
///         (`DeployBase._requireSwapVenue`, `DeployBase._deploySwapCoordinator`).
///
/// @dev The venue is SwapRouter02, not the Universal Router: the coordinator
///      approves the router for the input token and forwards the party's signed
///      calldata verbatim, so the router must PULL by ERC-20 allowance —
///      SwapRouter02's `exactInputSingle` does; the Universal Router pulls via
///      Permit2 or spends pre-sent balances and would not.
///
///   Env: FIGARO_CORE (the live FigaroCore — from deployments/<chainId>.json),
///        PERMIT2 (the wrapper defaults it to CANONICAL_PERMIT2 in
///        scripts/deploy-common.sh), SWAP_ROUTER (Uniswap SwapRouter02 on the
///        target chain), PRIVATE_KEY.
contract DeploySwapCoordinator is DeployBase {
    function run() external {
        address core = vm.envAddress("FIGARO_CORE");
        address permit2 = vm.envAddress("PERMIT2");
        address router = vm.envAddress("SWAP_ROUTER");
        require(core != address(0) && permit2 != address(0) && router != address(0), "env address is zero");
        require(core.code.length != 0, "FIGARO_CORE has no code on this chain");
        _requireSwapVenue(permit2, router);

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        _deploySwapCoordinator(core, permit2, router);
        vm.stopBroadcast();

        console.log("WitnessSwapAndCommitCoordinator:", _swapCoordinator);
        console.log("  NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR=", _swapCoordinator);
        console.log("  NEXT_PUBLIC_SWAP_ROUTER=", router);
        console.log("  NEXT_PUBLIC_PERMIT2=", permit2);
    }
}
