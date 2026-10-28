// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import "src/core/verifier/FigaroBatchVerifier.sol";
import "src/core/kernel/CommitmentTypes.sol";
import "src/mocks/MockSP1Verifier.sol";
import "src/mocks/MockERC20.sol";
import {MockClauseOrAssemblyStake} from "test/helpers/MockClauseOrAssemblyStake.sol";
import "src/build/registries/ClauseRegistry.sol";
import {MembersRegistry} from "src/app/MembersRegistry.sol";
import "src/build/rewards/UsageCounter.sol";
import "src/core/kernel/FigaroCore.sol";
import {MockERC1271Wallet} from "src/mocks/MockERC1271Wallet.sol";

/// @title The operation stream's cross-language lock, chain side
/// @notice `test/fixtures/operation-stream-vectors.json` is written by the
///         guest's encoder (`prover/lib/tests/operation_stream_vectors.rs`).
///         Each stream is fed to `settleBatch` under a proof the mock
///         accepts, and the verifier must emit, for every commit and resolve
///         entry, the events `FigaroCore` emits for the same commitment:
///         the same fields, and ids derived under THIS verifier's domain
///         (the one the batch's signatures were made under). A byte the two
///         readers disagree on fails here or in the Rust test.
contract OperationStreamVectorsTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroBatchVerifier verifier;
    MockSP1Verifier sp1;
    ClauseRegistry registry;
    UsageCounter counter;
    MembersRegistry members;
    FigaroCore core;
    MockERC20 token;

    string constant FIXTURE = "test/fixtures/operation-stream-vectors.json";
    bytes32 constant VKEY = bytes32(uint256(0xF16A20));
    uint64 constant PERIOD_END = 1_000_000;
    bytes32 nextRoot = keccak256("stream-root-0");

    function setUp() public {
        sp1 = new MockSP1Verifier();
        registry = new ClauseRegistry(0.001 ether);
        core = new FigaroCore();
        members = new MembersRegistry(0, 0);
        uint64[] memory periods = new uint64[](1);
        periods[0] = PERIOD_END;
        MockClauseOrAssemblyStake stakeGate = new MockClauseOrAssemblyStake();
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        counter = new UsageCounter(
            address(core),
            address(members),
            address(stakeGate),
            address(stakeGate),
            address(stakeGate),
            predicted,
            1,
            periods
        );
        verifier = new FigaroBatchVerifier(address(sp1), VKEY, address(registry), address(counter));
        vm.warp(PERIOD_END - 1000);
        token = new MockERC20("Mock", "MOCK");
    }

    // ── The ids FigaroCore derives, under the verifier's domain ──────

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("FigaroCore"),
                keccak256("3"),
                block.chainid,
                address(verifier)
            )
        );
    }

    function _ids(CommitmentTypes.Commitment memory c) internal view returns (bytes32 orderHash, bytes32 processId) {
        bytes32 structHash = c.hashStruct();
        processId = c.processId == bytes32(0)
            ? keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash))
            : c.processId;
        orderHash = keccak256(abi.encodePacked(processId, structHash));
    }

    function _commitment(string memory json, string memory at)
        internal
        pure
        returns (CommitmentTypes.Commitment memory c)
    {
        c.processId = vm.parseJsonBytes32(json, string.concat(at, ".processId"));
        c.buyer = vm.parseJsonAddress(json, string.concat(at, ".buyer"));
        c.seller = vm.parseJsonAddress(json, string.concat(at, ".seller"));
        c.currency = vm.parseJsonAddress(json, string.concat(at, ".currency"));
        c.payment = _uint(json, string.concat(at, ".payment"));
        c.expectedCumulativeValue = _uint(json, string.concat(at, ".expectedCumulativeValue"));
        c.checkoutHash = vm.parseJsonBytes32(json, string.concat(at, ".checkoutHash"));
        c.salt = _uint(json, string.concat(at, ".salt"));
        c.deadline = _uint(json, string.concat(at, ".deadline"));
    }

    /// @dev The fixture writes numbers as decimal strings (a uint256 does not
    ///      fit JSON's number).
    function _uint(string memory json, string memory at) internal pure returns (uint256) {
        return vm.parseUint(vm.parseJsonString(json, at));
    }

    function _settle(bytes memory stream) internal {
        bytes32 prev = verifier.stateRoot();
        nextRoot = keccak256(abi.encode(nextRoot));
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](0);
        FigaroBatchVerifier.BatchEventData memory events = FigaroBatchVerifier.BatchEventData(
            new FigaroBatchVerifier.AttestationData[](0), new FigaroBatchVerifier.SpecBinding[](0)
        );
        FigaroBatchVerifier.BatchUsageData memory usage;
        usage.uses = new IUsageCounter.BatchUse[](0);
        bytes memory pv = abi.encode(
            prev,
            nextRoot,
            uint64(block.chainid),
            address(verifier),
            keccak256(""),
            keccak256(""),
            keccak256(""),
            keccak256(abi.encodePacked(uint8(0), bytes32(0), uint64(0))),
            uint64(block.timestamp),
            keccak256(stream)
        );
        verifier.settleBatch(hex"", pv, positions, events, usage, stream);
    }

    function _expectCommitted(CommitmentTypes.Commitment memory c) internal {
        (bytes32 orderHash, bytes32 processId) = _ids(c);
        vm.expectEmit(true, true, true, true, address(verifier));
        emit FigaroBatchVerifier.OrderSeller(orderHash, c.seller);
        vm.expectEmit(true, true, true, true, address(verifier));
        emit FigaroBatchVerifier.OrderCurrency(orderHash, c.currency);
        vm.expectEmit(true, true, true, true, address(verifier));
        emit FigaroBatchVerifier.OrderCommitted(
            orderHash,
            processId,
            c.buyer,
            c.seller,
            c.currency,
            c.payment,
            c.expectedCumulativeValue,
            c.checkoutHash,
            c.salt,
            c.deadline
        );
    }

    function _expectResolved(bytes32 processId, CommitmentTypes.Commitment memory c) internal {
        bytes32 orderHash = keccak256(abi.encodePacked(processId, c.hashStruct()));
        vm.expectEmit(true, true, true, true, address(verifier));
        emit FigaroBatchVerifier.OrderResolved(
            orderHash, processId, c.expectedCumulativeValue * 2 + c.payment, c.payment
        );
    }

    function test_everyStreamEmitsTheCoreEventsForItsEntries() public {
        string memory json = vm.readFile(FIXTURE);
        uint256 streams = vm.parseJsonUint(json, ".streamCount");
        assertGt(streams, 0, "the fixture carries streams");
        for (uint256 s = 0; s < streams; s++) {
            string memory sb = string.concat(".streams[", vm.toString(s), "]");
            bytes memory stream = vm.parseJsonBytes(json, string.concat(sb, ".stream"));
            uint256 entries = vm.parseJsonUint(json, string.concat(sb, ".entryCount"));
            // A wallet-code resolve's buyer carries code that validates the
            // entry's bytes for the digest the verifier derives: set before
            // the expectations, which bind the next call (the settle).
            for (uint256 e = 0; e < entries; e++) {
                string memory eb = string.concat(sb, ".entries[", vm.toString(e), "]");
                if (
                    keccak256(bytes(vm.parseJsonString(json, string.concat(eb, ".kind"))))
                        == keccak256("resolveByWalletCode")
                ) {
                    _approveWalletCode(json, eb);
                }
            }
            for (uint256 e = 0; e < entries; e++) {
                string memory eb = string.concat(sb, ".entries[", vm.toString(e), "]");
                string memory kind = vm.parseJsonString(json, string.concat(eb, ".kind"));
                if (keccak256(bytes(kind)) == keccak256("commit")) {
                    _expectCommitted(_commitment(json, string.concat(eb, ".commitment")));
                } else {
                    bytes32 processId = vm.parseJsonBytes32(json, string.concat(eb, ".processId"));
                    uint256 count = 0;
                    address buyer;
                    while (vm.keyExistsJson(json, string.concat(eb, ".commitments[", vm.toString(count), "]"))) {
                        CommitmentTypes.Commitment memory c =
                            _commitment(json, string.concat(eb, ".commitments[", vm.toString(count), "]"));
                        _expectResolved(processId, c);
                        buyer = c.buyer;
                        count++;
                    }
                    vm.expectEmit(true, true, true, true, address(verifier));
                    emit FigaroBatchVerifier.ProcessResolved(processId, buyer, count);
                }
            }
            _settle(stream);
            assertEq(
                verifier.stateRoot(),
                nextRoot,
                string.concat("stream landed: ", vm.parseJsonString(json, string.concat(sb, ".name")))
            );
        }
    }

    /// @dev `ResolveProcess` over the entry's process and the sum of its listed
    ///      payments, under the verifier's domain, approved by mock code
    ///      etched at the listed orders' buyer.
    function _approveWalletCode(string memory json, string memory eb) internal {
        bytes32 processId = vm.parseJsonBytes32(json, string.concat(eb, ".processId"));
        address buyer = vm.parseJsonAddress(json, string.concat(eb, ".commitments[0].buyer"));
        uint256 cumulativeValue;
        for (uint256 i = 0; vm.keyExistsJson(json, string.concat(eb, ".commitments[", vm.toString(i), "]")); i++) {
            cumulativeValue += _uint(json, string.concat(eb, ".commitments[", vm.toString(i), "].payment"));
        }
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                _domainSeparator(),
                keccak256(
                    abi.encode(
                        keccak256("ResolveProcess(bytes32 processId,uint256 cumulativeValue)"),
                        processId,
                        cumulativeValue
                    )
                )
            )
        );
        vm.etch(buyer, type(MockERC1271Wallet).runtimeCode);
        MockERC1271Wallet(buyer).approve(digest, vm.parseJsonBytes(json, string.concat(eb, ".authorization")));
    }

    function test_theStreamIsInTheLogsWhateverTheCallPath() public {
        // A batch submitted through another contract: the stream is in this
        // verifier's logs all the same, so a rebuild reads no call trace.
        string memory json = vm.readFile(FIXTURE);
        bytes memory stream = vm.parseJsonBytes(json, ".streams[1].stream");
        Forwarder fwd = new Forwarder();
        bytes32 prev = verifier.stateRoot();
        bytes32 next = keccak256("via-forwarder");
        bytes memory data = _settleCalldata(prev, next, stream);
        vm.recordLogs();
        fwd.forward(address(verifier), data);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (
                logs[i].emitter == address(verifier)
                    && logs[i].topics[0] == FigaroBatchVerifier.BatchOperations.selector
            ) {
                (uint64 ts, uint8 period, bytes32 leaf, bytes memory ops) =
                    abi.decode(logs[i].data, (uint64, uint8, bytes32, bytes));
                assertEq(ts, uint64(block.timestamp), "the clock the guest checked");
                assertEq(period, 0);
                assertEq(leaf, bytes32(0));
                assertEq(keccak256(ops), keccak256(stream), "the logged stream is the bound one");
                found = true;
            }
        }
        assertTrue(found, "the verifier logs the stream");
        assertEq(verifier.stateRoot(), next);
    }

    function _settleCalldata(bytes32 prev, bytes32 next, bytes memory stream) internal view returns (bytes memory) {
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](0);
        FigaroBatchVerifier.BatchEventData memory events = FigaroBatchVerifier.BatchEventData(
            new FigaroBatchVerifier.AttestationData[](0), new FigaroBatchVerifier.SpecBinding[](0)
        );
        FigaroBatchVerifier.BatchUsageData memory usage;
        usage.uses = new IUsageCounter.BatchUse[](0);
        bytes memory pv = abi.encode(
            prev,
            next,
            uint64(block.chainid),
            address(verifier),
            keccak256(""),
            keccak256(""),
            keccak256(""),
            keccak256(abi.encodePacked(uint8(0), bytes32(0), uint64(0))),
            uint64(block.timestamp),
            keccak256(stream)
        );
        return abi.encodeCall(verifier.settleBatch, (hex"", pv, positions, events, usage, stream));
    }

    function test_aStreamTheProofDidNotCommitIsRefusedBeforeAnyEvent() public {
        string memory json = vm.readFile(FIXTURE);
        bytes memory stream = vm.parseJsonBytes(json, ".streams[0].stream");
        bytes memory other = bytes.concat(stream, hex"00");
        bytes32 prev = verifier.stateRoot();
        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](0);
        FigaroBatchVerifier.BatchEventData memory events = FigaroBatchVerifier.BatchEventData(
            new FigaroBatchVerifier.AttestationData[](0), new FigaroBatchVerifier.SpecBinding[](0)
        );
        FigaroBatchVerifier.BatchUsageData memory usage;
        usage.uses = new IUsageCounter.BatchUse[](0);
        bytes memory pv = abi.encode(
            prev,
            keccak256("next"),
            uint64(block.chainid),
            address(verifier),
            keccak256(""),
            keccak256(""),
            keccak256(""),
            keccak256(abi.encodePacked(uint8(0), bytes32(0), uint64(0))),
            uint64(block.timestamp),
            keccak256(stream)
        );
        vm.expectRevert(FigaroBatchVerifier.OperationsHashMismatch.selector);
        verifier.settleBatch(hex"", pv, positions, events, usage, other);
    }

    function test_theGenesisRootIsTheEmptyStatesAndNeverSupplied() public view {
        bytes32 emptyMap = keccak256("");
        assertEq(verifier.genesisRoot(), keccak256(abi.encodePacked(emptyMap, emptyMap, emptyMap)));
        assertEq(verifier.stateRoot(), verifier.genesisRoot());
    }

    function test_aVerifierWithoutACircuitHashIsRefused() public {
        // The gateway's shape: a contract with code but no VERIFIER_HASH().
        vm.expectRevert(FigaroBatchVerifier.VerifierNotPinned.selector);
        new FigaroBatchVerifier(address(token), VKEY, address(registry), address(counter));
    }
}

/// @dev Any contract that forwards a call: a multisig, a 7702-delegated
///      wallet, a batching relay.
contract Forwarder {
    function forward(address to, bytes calldata data) external {
        (bool ok, bytes memory ret) = to.call(data);
        if (!ok) {
            assembly ("memory-safe") {
                revert(add(ret, 32), mload(ret))
            }
        }
    }
}
