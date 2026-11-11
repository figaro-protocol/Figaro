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

    // ── The stream walk over generated streams ─────────────────────────
    //
    // The vectors above are the guest's encoder's bytes; these streams are
    // drawn from a fuzzed seed, in the format of `prover/lib/src/operation_stream.rs`:
    // zero to six commits and resolves (`0x01`, `0x02`, `0x04`), then zero to
    // three wallet-code attestations (`0x05`), then zero to four usage claims
    // (`0x03`) of the three kinds, with proofs of zero to four words. Each one
    // goes through `settleBatch`, so the verifier's walk reads it twice: at
    // step 4 and at step 6.

    /// @dev One draw from the seed: a word for each `(seed, tag, i)`.
    function _draw(uint256 seed, bytes32 tag, uint256 i) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(seed, tag, i)));
    }

    /// @dev A commitment from the draw `h`. Its payment and expected cumulative
    ///      value stay below 2^128, so a resolve's listed payments sum without
    ///      overflow.
    function _drawCommitment(uint256 h, address buyer) internal pure returns (CommitmentTypes.Commitment memory c) {
        c.processId = h % 4 == 0 ? bytes32(0) : keccak256(abi.encode(h, 0));
        c.buyer = buyer;
        c.seller = address(uint160(uint256(keccak256(abi.encode(h, 2)))));
        c.currency = address(uint160(uint256(keccak256(abi.encode(h, 3)))));
        c.payment = uint128(uint256(keccak256(abi.encode(h, 4))));
        c.expectedCumulativeValue = uint128(uint256(keccak256(abi.encode(h, 5))));
        c.checkoutHash = keccak256(abi.encode(h, 6));
        c.salt = uint256(keccak256(abi.encode(h, 7)));
        c.deadline = uint256(keccak256(abi.encode(h, 8)));
    }

    function _packCommitment(CommitmentTypes.Commitment memory c) internal pure returns (bytes memory) {
        return abi.encodePacked(
            c.processId,
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

    /// @dev A 65-byte signature `r ‖ s ‖ v` drawn from `(h, who)`; the walk
    ///      reads none of it.
    function _signature(uint256 h, bytes32 who) internal pure returns (bytes memory) {
        return abi.encodePacked(keccak256(abi.encode(h, who, "r")), keccak256(abi.encode(h, who, "s")), uint8(h >> 40));
    }

    /// @dev `n` words from the draw `h`, count-prefixed.
    function _packWords(uint256 h, uint256 n) internal pure returns (bytes memory w) {
        w = abi.encodePacked(uint16(n));
        for (uint256 i = 0; i < n; i++) {
            w = bytes.concat(w, keccak256(abi.encode(h, "word", i)));
        }
    }

    /// @dev Generate the stream of `seed` and the offset where each entry ends.
    ///      With `expect` false, the code of every wallet-code resolve's buyer
    ///      and of every wallet-code attestation's party is etched to validate
    ///      the entry's bytes; with `expect` true, the events the walk must
    ///      emit are expected: each wallet-code attestation's `Attestation`
    ///      (step 4), then the Core's events (step 6), each in stream order.
    function _generate(uint256 seed, bool expect) internal returns (bytes memory s, uint256[] memory ends) {
        uint256 ops = seed % 7;
        uint256 atts = (seed >> 8) % 4;
        uint256 claims = (seed >> 16) % 5;
        ends = new uint256[](ops + atts + claims);
        // Step 4 emits before step 6, so the attestations are expected first.
        for (uint256 i = 0; expect && i < atts; i++) {
            _attestationEntry(_draw(seed, "attestation", i), true, false);
        }
        for (uint256 i = 0; i < ops; i++) {
            uint256 h = _draw(seed, "op", i);
            if (h % 3 == 0) {
                CommitmentTypes.Commitment memory c = _drawCommitment(h, address(uint160(h >> 96)));
                s = bytes.concat(s, hex"01", _packCommitment(c), _signature(h, "buyer"), _signature(h, "seller"));
                if (expect) _expectCommitted(c);
            } else {
                s = bytes.concat(s, _resolveEntry(h, h % 3 == 2, expect));
            }
            ends[i] = s.length;
        }
        for (uint256 i = 0; i < atts; i++) {
            s = bytes.concat(s, _attestationEntry(_draw(seed, "attestation", i), false, !expect));
            ends[ops + i] = s.length;
        }
        for (uint256 i = 0; i < claims; i++) {
            uint256 h = _draw(seed, "claim", i);
            uint256 kind = h % 3;
            bytes memory claim = abi.encodePacked(
                hex"03",
                _packCommitment(_drawCommitment(h, address(uint160(h >> 96)))),
                keccak256(abi.encode(h, "key")),
                uint8(kind),
                keccak256(abi.encode(h, "first"))
            );
            if (kind == 1) {
                claim = bytes.concat(claim, keccak256(abi.encode(h, "slot")), _packWords(h, (h >> 8) % 5));
            }
            s = bytes.concat(s, claim, _packWords(h >> 1, (h >> 16) % 5));
            ends[ops + atts + i] = s.length;
        }
    }

    /// @dev A wallet-code attestation (`0x05`) from the draw `h`, by the
    ///      order's seller or its buyer. With `expect` true its `Attestation`
    ///      is expected; with `validate` true the party's code is etched to
    ///      validate the entry's bytes for the role's digest.
    function _attestationEntry(uint256 h, bool expect, bool validate) internal returns (bytes memory e) {
        CommitmentTypes.Commitment memory c = _drawCommitment(h, address(uint160(h >> 96)));
        bool asSeller = h % 2 == 0;
        address party = asSeller ? c.seller : c.buyer;
        bytes32 clauseId = keccak256(abi.encode(h, "clause"));
        uint8 stage = uint8(h >> 8);
        bytes32 contentRef = keccak256(abi.encode(h, "content"));
        bytes memory authorization = _authorization(h);
        (bytes32 orderHash, bytes32 processId) = _ids(c);
        if (expect) {
            vm.expectEmit(true, true, true, true, address(verifier));
            emit FigaroBatchVerifier.Attestation(orderHash, processId, party, clauseId, stage, contentRef);
        }
        if (validate) {
            bytes32 structHash = asSeller
                ? keccak256(
                    abi.encode(
                        keccak256("AttestSeller(bytes32 orderHash,bytes32 clauseId,uint8 stage,bytes32 contentRef)"),
                        orderHash,
                        clauseId,
                        stage,
                        contentRef
                    )
                )
                : keccak256(
                    abi.encode(
                        keccak256(
                            "AttestBuyer(bytes32 processId,bytes32 orderHash,bytes32 clauseId,uint8 stage,bytes32 contentRef)"
                        ),
                        processId,
                        orderHash,
                        clauseId,
                        stage,
                        contentRef
                    )
                );
            vm.etch(party, type(MockERC1271Wallet).runtimeCode);
            MockERC1271Wallet(party)
                .approve(keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash)), authorization);
        }
        return bytes.concat(
            abi.encodePacked(hex"05", uint8(asSeller ? 0 : 1), _packCommitment(c)),
            abi.encodePacked(clauseId, stage, contentRef),
            abi.encodePacked(uint16(authorization.length), authorization)
        );
    }

    /// @dev Authorization bytes of 0, 1, 17 or 300 bytes from the draw `h`.
    function _authorization(uint256 h) internal pure returns (bytes memory a) {
        uint256[4] memory lengths = [uint256(0), 1, 17, 300];
        a = new bytes(lengths[(h >> 32) % 4]);
        for (uint256 i = 0; i < a.length; i++) {
            a[i] = bytes1(uint8(uint256(keccak256(abi.encode(h, "auth", i)))));
        }
    }

    /// @dev A signed resolve (`0x02`, zero to three orders) or a wallet-code
    ///      resolve (`0x04`, one to three orders) from the draw `h`, every
    ///      listed order its process's buyer's.
    function _resolveEntry(uint256 h, bool byWalletCode, bool expect) internal returns (bytes memory e) {
        bytes32 processId = keccak256(abi.encode(h, "process"));
        address buyer = address(uint160(uint256(keccak256(abi.encode(h, "buyer")))));
        uint256 count = byWalletCode ? 1 + (h >> 8) % 3 : (h >> 8) % 4;
        bytes memory listed;
        uint256 sum;
        for (uint256 j = 0; j < count; j++) {
            CommitmentTypes.Commitment memory c = _drawCommitment(uint256(keccak256(abi.encode(h, "listed", j))), buyer);
            listed = bytes.concat(listed, _packCommitment(c));
            sum += c.payment;
            if (expect) _expectResolved(processId, c);
        }
        if (expect) {
            vm.expectEmit(true, true, true, true, address(verifier));
            emit FigaroBatchVerifier.ProcessResolved(processId, count == 0 ? address(0) : buyer, count);
        }
        if (!byWalletCode) {
            return bytes.concat(hex"02", processId, _signature(h, "resolve"), abi.encodePacked(uint16(count)), listed);
        }
        bytes memory authorization = _authorization(h);
        if (!expect) {
            vm.etch(buyer, type(MockERC1271Wallet).runtimeCode);
            MockERC1271Wallet(buyer).approve(_resolveDigest(processId, sum), authorization);
        }
        return bytes.concat(
            hex"04",
            processId,
            abi.encodePacked(uint16(authorization.length)),
            authorization,
            abi.encodePacked(uint16(count)),
            listed
        );
    }

    function _resolveDigest(bytes32 processId, uint256 cumulativeValue) internal view returns (bytes32) {
        return keccak256(
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
    }

    /// Every generated stream lands, and the walk emits the `Attestation` of
    /// each wallet-code attestation and the Core's events for each commit and
    /// resolve entry, in stream order, with the ids derived under this
    /// verifier's domain.
    function testFuzz_everyGeneratedStreamLandsAndEmitsItsEntries(uint256 seed) public {
        (bytes memory stream,) = _generate(seed, false);
        _generate(seed, true);
        _settle(stream);
        assertEq(verifier.stateRoot(), nextRoot, "the generated stream landed");
    }

    /// A generated stream cut inside any entry is refused by name
    /// (`MalformedOperationStream`), the proof committing the cut bytes.
    function testFuzz_aGeneratedStreamCutInsideAnEntryIsRefused(uint256 seed, uint256 cut) public {
        (bytes memory stream, uint256[] memory ends) = _generate(seed, false);
        vm.assume(stream.length > 1);
        cut = bound(cut, 1, stream.length - 1);
        for (uint256 i = 0; i < ends.length; i++) {
            // A cut on an entry's end is a whole stream; one byte on is
            // inside the next entry, which is at least two bytes long.
            if (ends[i] == cut) cut += 1;
        }
        bytes memory prefix = new bytes(cut);
        for (uint256 i = 0; i < cut; i++) {
            prefix[i] = stream[i];
        }
        (bool ok, bytes memory reason) =
            address(verifier).call(_settleCalldata(verifier.stateRoot(), keccak256("cut"), prefix));
        assertFalse(ok, "a cut stream never lands");
        assertEq(bytes4(reason), FigaroBatchVerifier.MalformedOperationStream.selector, "refused as malformed");
    }

    /// The generated streams meet every entry kind: a kind-2 (agreement)
    /// claim and a claim carrying a non-empty inclusion proof among them.
    function test_theGeneratedStreamsMeetEveryEntryKind() public {
        uint256[8] memory seen;
        for (uint256 seed = 0; seed < 64; seed++) {
            (bytes memory s, uint256[] memory ends) = _generate(uint256(keccak256(abi.encode(seed))), false);
            uint256 start = 0;
            for (uint256 i = 0; i < ends.length; i++) {
                uint8 tag = uint8(s[start]);
                if (tag == 0x03) {
                    uint8 kind = uint8(s[start + 1 + 252 + 32]);
                    seen[4 + kind]++;
                    // The inclusion proof's count is the entry's last words' prefix.
                    uint256 proofAt = start + 1 + 252 + 32 + 1 + 32 + (kind == 1 ? 32 : 0);
                    if (kind == 1) proofAt += 2 + 32 * (uint256(uint8(s[proofAt])) << 8 | uint8(s[proofAt + 1]));
                    if ((uint256(uint8(s[proofAt])) << 8 | uint8(s[proofAt + 1])) > 0) seen[7]++;
                } else {
                    seen[tag == 0x01 ? 0 : tag == 0x02 ? 1 : tag == 0x04 ? 2 : 3]++;
                }
                start = ends[i];
            }
        }
        string[8] memory names = [
            "commit",
            "signed resolve",
            "wallet-code resolve",
            "wallet-code attestation",
            "clause claim",
            "assembly claim",
            "agreement claim (kind 2)",
            "claim with an inclusion proof"
        ];
        for (uint256 i = 0; i < 8; i++) {
            assertGt(seen[i], 0, names[i]);
        }
    }

    function test_theGenesisRootIsTheEmptyStatesAndNeverSupplied() public view {
        // The guest's state tree over no entries (`prover/lib/src/state_tree.rs`).
        assertEq(verifier.genesisRoot(), bytes32(0));
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
