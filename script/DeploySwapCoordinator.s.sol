// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import {WitnessSwapAndCommitCoordinator} from "../src/protocol/coordinators/WitnessSwapAndCommitCoordinator.sol";

/// @title DeploySwapCoordinator — the swap-funded on-ramp joins a LIVE stack
///
/// @notice Deploys `WitnessSwapAndCommitCoordinator` against an already-deployed
///         `FigaroCore` and the chain's canonical Permit2 + Uniswap SwapRouter02.
///         The coordinator is a fifth-noun composition: it points at the kernel
///         (immutably) and nothing points back at it, so it deploys ALONE onto a
///         stack that is already live — no redeploy of anything else (2026-08-18:
///         it had been omitted from the public deploy scripts since it landed on
///         2026-07-12; this script closes that on Sepolia, then mainnet).
///
/// @dev The venue is SwapRouter02, not the Universal Router: the coordinator
///      approves the router for the input token and forwards the party's signed
///      calldata verbatim, so the router must PULL by ERC-20 allowance —
///      SwapRouter02's `exactInputSingle` does; the Universal Router pulls via
///      Permit2 or spends pre-sent balances and would not. The router is probed
///      for BEHAVIOUR before broadcast (`factory()` and `WETH9()` must answer with
///      contracts) — an address is never trusted for existing alone (the SP1
///      gateway lesson, RELEASE_READINESS 7.3(c)).
///
///   Env: FIGARO_CORE (the live kernel — from deployments/<chainId>.json),
///        PERMIT2 (0x000000000022D473030F116dDEE9F6B43aC78BA3 on Ethereum + Sepolia),
///        SWAP_ROUTER (Uniswap SwapRouter02 on the target chain), PRIVATE_KEY.
contract DeploySwapCoordinator is Script {
    function run() external {
        address core = vm.envAddress("FIGARO_CORE");
        address permit2 = vm.envAddress("PERMIT2");
        address router = vm.envAddress("SWAP_ROUTER");
        require(core != address(0) && permit2 != address(0) && router != address(0), "env address is zero");
        require(core.code.length != 0, "FIGARO_CORE has no code on this chain");
        require(permit2.code.length != 0, "PERMIT2 has no code on this chain");
        // Behaviour, not existence: SwapRouter02 answers factory() and WETH9() with contracts.
        (bool okF, bytes memory f) = router.staticcall(abi.encodeWithSignature("factory()"));
        (bool okW, bytes memory w) = router.staticcall(abi.encodeWithSignature("WETH9()"));
        require(
            okF && f.length == 32 && abi.decode(f, (address)).code.length != 0,
            "SWAP_ROUTER: factory() is not a contract - not SwapRouter02"
        );
        require(
            okW && w.length == 32 && abi.decode(w, (address)).code.length != 0,
            "SWAP_ROUTER: WETH9() is not a contract - not SwapRouter02"
        );

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        WitnessSwapAndCommitCoordinator coordinator = new WitnessSwapAndCommitCoordinator(core, permit2, router);
        vm.stopBroadcast();

        console.log("WitnessSwapAndCommitCoordinator:", address(coordinator));
        console.log("  NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR=", address(coordinator));
        console.log("  NEXT_PUBLIC_SWAP_ROUTER=", router);
        console.log("  NEXT_PUBLIC_PERMIT2=", permit2);
    }
}
