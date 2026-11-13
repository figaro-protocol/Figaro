// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroBatchVerifier} from "src/core/verifier/FigaroBatchVerifier.sol";
import {ClauseRegistry} from "src/registries/ClauseRegistry.sol";

/// A contract that does call a registry's register function: the control that
/// shows the scan below sees such a call.
contract CallsRegisterClause {
    function go(address registry) external payable {
        ClauseRegistry(registry).registerClause{value: msg.value}(bytes32(uint256(1)), "ipfs://x");
    }
}

/// "Registering never enters a batch" on the contract side: `FigaroBatchVerifier`
/// holds one registry handle, `IClauseRegistryAnchor`, whose only function is the
/// read `registered(bytes32)`. A call to a registry's write function needs that
/// function's 4-byte selector in the caller's code, so the verifier's runtime
/// code is searched for the selector of every write the four registries expose.
/// The operation stream's own tags are the proof program's side (not tested here).
contract BatchVerifierNeverRegistersTest is Test {
    function _contains(bytes memory code, bytes4 sel) internal pure returns (bool) {
        for (uint256 i = 0; i + 4 <= code.length; i++) {
            if (code[i] == sel[0] && code[i + 1] == sel[1] && code[i + 2] == sel[2] && code[i + 3] == sel[3]) {
                return true;
            }
        }
        return false;
    }

    function _writes() internal pure returns (string[8] memory sigs) {
        sigs = [
            "registerClause(bytes32,string)",
            "registerAgreement(bytes32,string)",
            "registerAssembly(bytes32,string)",
            "register(string)",
            "updateProfile(string)",
            "withdrawDeposit(bytes32)",
            "withdraw()",
            "setMechanismClause(bytes32)"
        ];
    }

    function test_theVerifierNeverCallsARegistrysWriteFunction() public view {
        // The compiled runtime code (the verifier has immutables, so `runtimeCode` is unavailable).
        bytes memory code = vm.getDeployedCode("FigaroBatchVerifier.sol:FigaroBatchVerifier");
        // The scan sees selectors: the verifier's own entry point and its one registry read are there.
        assertTrue(_contains(code, bytes4(keccak256("registered(bytes32)"))), "the anchor read is in the code");
        assertTrue(_contains(code, FigaroBatchVerifier.settleBatch.selector), "the scan finds a selector that is there");

        string[8] memory sigs = _writes();
        for (uint256 i = 0; i < sigs.length; i++) {
            assertFalse(_contains(code, bytes4(keccak256(bytes(sigs[i])))), sigs[i]);
        }
    }

    function test_theScanSeesAContractThatDoesCallRegisterClause() public pure {
        bytes memory code = type(CallsRegisterClause).runtimeCode;
        assertTrue(
            _contains(code, ClauseRegistry.registerClause.selector), "a caller of registerClause carries its selector"
        );
    }
}
