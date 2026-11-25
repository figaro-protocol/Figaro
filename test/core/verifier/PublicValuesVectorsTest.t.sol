// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import "src/core/verifier/FigaroBatchVerifier.sol";
import "src/mocks/MockSP1Verifier.sol";
import {MockClauseOrAssemblyStake} from "test/helpers/MockClauseOrAssemblyStake.sol";
import {MembersRegistry} from "src/registries/MembersRegistry.sol";
import "src/rewards/UsageCounter.sol";
import "src/core/kernel/FigaroCore.sol";

/// @dev The verifier with its public-values reader exposed, so a vector's
///      nine words are read by the contract's own `_decodePV`.
contract PublicValuesReader is FigaroBatchVerifier {
    constructor(address sp1, bytes32 vkey, address counter) FigaroBatchVerifier(sp1, vkey, counter) {}

    function decode(bytes calldata publicValues) external pure returns (DecodedPV memory) {
        return _decodePV(publicValues);
    }
}

/// @title The public values' cross-language lock, chain side
/// @notice `test/fixtures/public-values-vectors.json` is written by the
///         guest's encoder, `PublicValues::abi_encode`
///         (`prover/lib/tests/public_values_vectors.rs`): the bytes the guest
///         commits and the relay submits. Here the contract reads them.
///         The `distinctWords` vector, nine distinct recognizable words, is
///         read by `_decodePV` and each field is held to the word the
///         fixture names for it. Each settlement vector is fed to a real
///         `settleBatch` on a verifier deployed at the fixture's address, at
///         the fixture's block time, holding the genesis root, with an empty
///         batch: every word matches that chain but the one under test, so
///         the batch lands (and its new root becomes `stateRoot()`) or
///         reverts with the error of exactly that word. Two words swapped by
///         either reader fail here or in the Rust test.
contract PublicValuesVectorsTest is Test {
    string constant FIXTURE = "test/fixtures/public-values-vectors.json";
    bytes32 constant VKEY = bytes32(uint256(0xF16A20));

    string json;
    MockSP1Verifier sp1;
    FigaroCore core;
    MembersRegistry members;
    MockClauseOrAssemblyStake stakeGate;
    uint64[] periods;

    function setUp() public {
        json = vm.readFile(FIXTURE);
        assertEq(block.chainid, _uint(".chainId"), "the vectors' chain is the test's");
        sp1 = new MockSP1Verifier();
        core = new FigaroCore();
        members = new MembersRegistry(0, 0);
        stakeGate = new MockClauseOrAssemblyStake();
        periods.push(uint64(_uint(".blockTimestamp") + 1_000_000));
    }

    function _uint(string memory at) internal view returns (uint256) {
        return vm.parseUint(vm.parseJsonString(json, at));
    }

    function _at(uint256 i, string memory field) internal pure returns (string memory) {
        return string.concat(".vectors[", vm.toString(i), "].", field);
    }

    function _counterFor(address verifier) internal returns (UsageCounter) {
        return new UsageCounter(
            address(core),
            address(members),
            address(stakeGate),
            address(stakeGate),
            address(stakeGate),
            verifier,
            1,
            periods
        );
    }

    /// A verifier at the fixture's address, on the genesis root.
    function _verifierAtTheFixturesAddress() internal returns (FigaroBatchVerifier verifier) {
        address at = vm.parseJsonAddress(json, ".verifyingContract");
        UsageCounter counter = _counterFor(at);
        deployCodeTo(
            "src/core/verifier/FigaroBatchVerifier.sol:FigaroBatchVerifier",
            abi.encode(address(sp1), VKEY, address(counter)),
            at
        );
        verifier = FigaroBatchVerifier(at);
        assertEq(verifier.stateRoot(), bytes32(0), "the genesis root");
    }

    function _named(uint256 i, string memory name) internal view returns (bool) {
        return keccak256(bytes(vm.parseJsonString(json, _at(i, "name")))) == keccak256(bytes(name));
    }

    function _vector(string memory name) internal view returns (uint256) {
        uint256 count = _uint(".vectorCount");
        for (uint256 i = 0; i < count; i++) {
            if (_named(i, name)) return i;
        }
        revert(string.concat("no vector ", name));
    }

    /// The nine words, each read where the contract reads it.
    function test_theDistinctWordsLandInTheirFields() public {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        UsageCounter counter = _counterFor(predicted);
        PublicValuesReader reader = new PublicValuesReader(address(sp1), VKEY, address(counter));
        uint256 i = _vector("distinctWords");
        bytes memory pv = vm.parseJsonBytes(json, _at(i, "publicValues"));
        assertEq(pv.length, 288, "nine words");

        FigaroBatchVerifier.DecodedPV memory d = reader.decode(pv);
        assertEq(d.prevRoot, vm.parseJsonBytes32(json, _at(i, "prevStateRoot")), "word 0: the previous root");
        assertEq(d.newRoot, vm.parseJsonBytes32(json, _at(i, "newStateRoot")), "word 1: the new root");
        assertEq(d.chainId, _uint(_at(i, "chainId")), "word 2: the chain id");
        assertEq(
            d.verifyingContract,
            vm.parseJsonAddress(json, _at(i, "verifyingContract")),
            "word 3: the verifying contract"
        );
        assertEq(d.tokenOpsHash, vm.parseJsonBytes32(json, _at(i, "tokenOpsHash")), "word 4: the positions hash");
        assertEq(
            d.attEventsHash, vm.parseJsonBytes32(json, _at(i, "attestationEventsHash")), "word 5: the attestations hash"
        );
        assertEq(d.usageAccrualHash, vm.parseJsonBytes32(json, _at(i, "usageAccrualHash")), "word 6: the usage hash");
        assertEq(d.blockTimestamp, _uint(_at(i, "blockTimestamp")), "word 7: the block time");
        assertEq(d.operationsHash, vm.parseJsonBytes32(json, _at(i, "operationsHash")), "word 8: the operations hash");
    }

    /// The batch the settlement vectors describe: no position, no
    /// attestation, no use, no operation, under the fixture's usage period
    /// and provenance leaf.
    function _settle(FigaroBatchVerifier verifier, bytes memory pv) internal {
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](0);
        FigaroBatchVerifier.BatchEventData memory events =
            FigaroBatchVerifier.BatchEventData(new FigaroBatchVerifier.AttestationData[](0));
        FigaroBatchVerifier.BatchUsageData memory usage;
        usage.period = uint8(_uint(".usagePeriod"));
        usage.provenanceLeaf = vm.parseJsonBytes32(json, ".usageProvenanceLeaf");
        usage.uses = new IUsageCounter.BatchUse[](0);
        verifier.settleBatch(hex"", pv, positions, events, usage, hex"");
    }

    /// Feed vector `name` to a fresh verifier at the fixture's address and
    /// time, expecting `revertData` (empty: the batch lands).
    function _feed(string memory name, bytes memory revertData) internal {
        vm.warp(_uint(".blockTimestamp"));
        FigaroBatchVerifier verifier = _verifierAtTheFixturesAddress();
        uint256 i = _vector(name);
        bytes memory pv = vm.parseJsonBytes(json, _at(i, "publicValues"));
        if (revertData.length == 0) {
            _settle(verifier, pv);
            assertEq(
                verifier.stateRoot(),
                vm.parseJsonBytes32(json, _at(i, "newStateRoot")),
                "word 1 becomes the stored root"
            );
            assertEq(verifier.batchCount(), 1, "the batch landed");
        } else {
            vm.expectRevert(revertData);
            _settle(verifier, pv);
        }
    }

    function test_aBatchOnTheStoredRootLandsOnItsNewRoot() public {
        _feed("lands", "");
    }

    function test_wordZeroIsThePreviousRoot() public {
        uint256 i = _vector("previousRootIsNotTheStoredRoot");
        _feed(
            "previousRootIsNotTheStoredRoot",
            abi.encodeWithSelector(
                FigaroBatchVerifier.StateRootMismatch.selector,
                bytes32(0),
                vm.parseJsonBytes32(json, _at(i, "prevStateRoot"))
            )
        );
    }

    function test_wordTwoIsTheChainId() public {
        uint256 i = _vector("chainIdIsNotTheChain");
        _feed(
            "chainIdIsNotTheChain",
            abi.encodeWithSelector(
                FigaroBatchVerifier.ChainIdMismatch.selector, uint64(block.chainid), uint64(_uint(_at(i, "chainId")))
            )
        );
    }

    function test_wordThreeIsTheVerifyingContract() public {
        uint256 i = _vector("verifyingContractIsNotTheVerifier");
        _feed(
            "verifyingContractIsNotTheVerifier",
            abi.encodeWithSelector(
                FigaroBatchVerifier.VerifyingContractMismatch.selector,
                vm.parseJsonAddress(json, ".verifyingContract"),
                vm.parseJsonAddress(json, _at(i, "verifyingContract"))
            )
        );
    }

    function test_wordSevenIsTheBlockTime() public {
        uint256 i = _vector("timestampIsAheadOfTheBlock");
        _feed(
            "timestampIsAheadOfTheBlock",
            abi.encodeWithSelector(
                FigaroBatchVerifier.BatchTimestampOutOfRange.selector,
                uint64(_uint(_at(i, "blockTimestamp"))),
                uint64(_uint(".blockTimestamp"))
            )
        );
    }

    function test_wordFourIsThePositionsHash() public {
        _feed(
            "positionsHashIsNotThePositions", abi.encodeWithSelector(FigaroBatchVerifier.PositionHashMismatch.selector)
        );
    }

    function test_wordFiveIsTheAttestationsHash() public {
        _feed(
            "attestationsHashIsNotTheAttestations",
            abi.encodeWithSelector(FigaroBatchVerifier.AttestationHashMismatch.selector)
        );
    }

    function test_wordSixIsTheUsageHash() public {
        _feed("usageHashIsNotTheUsage", abi.encodeWithSelector(FigaroBatchVerifier.UsageAccrualHashMismatch.selector));
    }

    function test_wordEightIsTheOperationsHash() public {
        _feed(
            "operationsHashIsNotTheStream", abi.encodeWithSelector(FigaroBatchVerifier.OperationsHashMismatch.selector)
        );
    }

    /// Every vector the fixture carries is fed by one test above.
    function test_theFixtureCarriesExactlyTheseVectors() public view {
        assertEq(_uint(".vectorCount"), 10, "nine words, one vector each, and the landing one");
    }
}
