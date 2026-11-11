// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "test/core/verifier/OperationStreamVectorsTest.t.sol";

/// @notice FigaroBatchVerifier with the three steps of `settleBatch` that
///         `certora/BatchVerifierStateRoot.spec` summarizes exposed as they
///         are written: the operation stream's walk, the token step and the
///         registry anchor check.
contract VerifierSteps is FigaroBatchVerifier {
    constructor(address _verifier, bytes32 _programVKey, address _clauseRegistry, address _usageCounter)
        FigaroBatchVerifier(_verifier, _programVKey, _clauseRegistry, _usageCounter)
    {}

    function walk(bytes calldata operations, bool publish) external {
        _walkOperations(operations, publish);
    }

    function executePositions(NetPosition[] calldata positions) external {
        _executePositions(positions);
    }

    /// Not `view`, so a version of the step that writes storage still
    /// compiles here and fails the test rather than the build.
    function checkSpecBindings(SpecBinding[] calldata bindings) external {
        _checkSpecBindings(bindings);
    }
}

/// @title The state-root spec's summaries hold: the three steps write no verifier storage
/// @notice `certora/BatchVerifierStateRoot.spec` summarizes `_walkOperations`,
///         `_executePositions` and `_checkSpecBindings` as NONDET, so its three
///         rules hold only if none of them writes the verifier's storage; the
///         prover cannot check that itself (with `_walkOperations` read as
///         written, no rule is processed within its two-hour budget). Each test
///         here runs one step, as written, on real inputs under `vm.record`, and
///         requires that the verifier's address recorded no storage write. The
///         token step's writes land in the token's storage, never the verifier's.
contract BatchVerifierStepsWriteNoStorageTest is OperationStreamVectorsTest {
    VerifierSteps steps;
    address payer = address(0xB0B);
    address payee = address(0xCAFE);

    /// The steps contract replaces the verifier, so the wallet-code digests the
    /// inherited helpers derive are under its domain. The counter names its
    /// verifier immutably; the constructor's binding check reads the steps
    /// contract's own address back from it.
    function _deploySteps() internal {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        vm.mockCall(address(counter), abi.encodeWithSignature("batchVerifier()"), abi.encode(predicted));
        steps = new VerifierSteps(address(sp1), VKEY, address(registry), address(counter));
        vm.clearMockedCalls();
        verifier = FigaroBatchVerifier(address(steps));
    }

    function _assertNoVerifierWrite(string memory what) internal {
        (, bytes32[] memory writes) = vm.accesses(address(steps));
        assertEq(writes.length, 0, what);
    }

    function test_theStreamWalkWritesNoVerifierStorage() public {
        _deploySteps();
        string memory json = vm.readFile(FIXTURE);
        uint256 streams = vm.parseJsonUint(json, ".streamCount");
        assertGt(streams, 0, "the fixture carries streams");
        for (uint256 s = 0; s < streams; s++) {
            string memory sb = string.concat(".streams[", vm.toString(s), "]");
            bytes memory stream = vm.parseJsonBytes(json, string.concat(sb, ".stream"));
            uint256 entries = vm.parseJsonUint(json, string.concat(sb, ".entryCount"));
            for (uint256 e = 0; e < entries; e++) {
                string memory eb = string.concat(sb, ".entries[", vm.toString(e), "]");
                if (
                    keccak256(bytes(vm.parseJsonString(json, string.concat(eb, ".kind"))))
                        == keccak256("resolveByWalletCode")
                ) {
                    _approveWalletCode(json, eb);
                }
            }
            string memory name = vm.parseJsonString(json, string.concat(sb, ".name"));
            // Step 4's walk (the wallet-code questions), then step 6's (the events).
            vm.record();
            steps.walk(stream, false);
            _assertNoVerifierWrite(string.concat("the asking walk wrote verifier storage: ", name));
            vm.record();
            steps.walk(stream, true);
            _assertNoVerifierWrite(string.concat("the publishing walk wrote verifier storage: ", name));
        }
    }

    function test_theTokenStepWritesNoVerifierStorage() public {
        _deploySteps();
        token.mint(payer, 100 ether);
        vm.prank(payer);
        token.approve(address(steps), type(uint256).max);
        // A payout listed before the pull that funds it: the two passes run both.
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](3);
        positions[0] = FigaroBatchVerifier.NetPosition(address(token), payee, 10 ether, 70 ether);
        positions[1] = FigaroBatchVerifier.NetPosition(address(token), payer, 90 ether, 30 ether);
        positions[2] = FigaroBatchVerifier.NetPosition(address(token), address(0xD0D), 5 ether, 5 ether);

        vm.record();
        steps.executePositions(positions);
        _assertNoVerifierWrite("the token step wrote verifier storage");

        assertEq(token.balanceOf(payee), 60 ether, "the payout landed");
        assertEq(token.balanceOf(payer), 40 ether, "the pull landed");
        assertEq(token.balanceOf(address(steps)), 0, "the verifier holds the batch's net");
    }

    function test_theRegistryAnchorCheckWritesNoVerifierStorage() public {
        _deploySteps();
        bytes32 key = keccak256("a registered clause spec");
        vm.deal(address(this), 1 ether);
        registry.registerClause{value: 0.001 ether}(key, "ipfs://spec");
        FigaroBatchVerifier.SpecBinding[] memory bindings = new FigaroBatchVerifier.SpecBinding[](2);
        bindings[0] = FigaroBatchVerifier.SpecBinding(key, key);
        bindings[1] = FigaroBatchVerifier.SpecBinding(key, key);

        vm.record();
        steps.checkSpecBindings(bindings);
        _assertNoVerifierWrite("the registry anchor check wrote verifier storage");
    }
}
