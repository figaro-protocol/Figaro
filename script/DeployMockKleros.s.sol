// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import "../src/mocks/MockKlerosArbitrator.sol";
import "../src/mocks/MockKlerosArbitrableProxy.sol";

/// @title DeployMockKleros — Stand up the mock Kleros stack on Anvil
/// @notice Deploys MockKlerosArbitrator + MockKlerosArbitrableProxy on the
///         local Anvil chain so the /dispute UI can exercise the full
///         submission flow end-to-end without a real Kleros stack.
/// @dev    Standalone from the main Deploy.s.sol because the mock Kleros
///         is dev-only and doesn't need to clutter the main bring-up.
///         Run separately:
///
///           forge script --via-ir --rpc-url http://127.0.0.1:8545 \
///             --private-key $DEPLOYER_PRIVATE_KEY --broadcast \
///             script/DeployMockKleros.s.sol:DeployMockKleros
///
///         Then set the resulting addresses as frontend env:
///           NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY=<MockKlerosArbitrableProxy>
///           NEXT_PUBLIC_KLEROS_ARBITRATOR_EXTRA_DATA=0x  (any default)
///           NEXT_PUBLIC_KLEROS_MOCK_BANNER=true
///
///         The mainnet build uses a different proxy address and unsets
///         NEXT_PUBLIC_KLEROS_MOCK_BANNER; same UI code path.
contract DeployMockKleros is Script {
    function run() external {
        require(block.chainid == 31337, "DeployMockKleros: Anvil only");

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        MockKlerosArbitrator arbitrator = new MockKlerosArbitrator();
        MockKlerosArbitrableProxy proxy = new MockKlerosArbitrableProxy(address(arbitrator));

        vm.stopBroadcast();

        console.log("============================================");
        console.log("Mock Kleros deployed");
        console.log("============================================");
        console.log("MockKlerosArbitrator:        ", address(arbitrator));
        console.log("MockKlerosArbitrableProxy:   ", address(proxy));
        console.log("");
        console.log("Set in frontend .env.local:");
        console.log("  NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY=", address(proxy));
        console.log("  NEXT_PUBLIC_KLEROS_MOCK_BANNER=true");
        console.log("");
        console.log("Operator can simulate a ruling for UI testing:");
        console.log("  cast send", address(proxy));
        console.log("    'mockSetRuling(uint256,uint256)' <localID> <rulingValue>");
        console.log("    --rpc-url http://127.0.0.1:8545");
        console.log("    --private-key $DEPLOYER_PRIVATE_KEY");
    }
}
