// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {BatchHashes} from "test/helpers/BatchHashes.sol";
import {MockClauseOrAssemblyStake} from "test/helpers/MockClauseOrAssemblyStake.sol";
import "src/core/kernel/FigaroCore.sol";
import "src/core/kernel/CommitmentTypes.sol";
import "src/core/attestation/AttestationCoordinator.sol";
import "src/core/verifier/FigaroBatchVerifier.sol";
import "src/build/registries/ClauseRegistry.sol";
import {UsageCounter} from "src/build/rewards/UsageCounter.sol";
import {MembersRegistry} from "src/app/MembersRegistry.sol";
import "src/mocks/MockSP1Verifier.sol";
import "src/mocks/MockERC20.sol";
import {MockERC1271Wallet} from "src/mocks/MockERC1271Wallet.sol";

/// @title The Core and the batch path, replayed from the model's own behaviors
/// @notice `test/fixtures/tlc-traces.json` is TLC's: `scripts/export-tlc-traces.sh`
///         runs the FigaroCore model (`formal/FigaroCore.tla`, `formal/MC.cfg`'s
///         constants) in random simulation and writes every behavior it walks,
///         one row per step — the action (CommitRoot, CommitSub, ResolveProcess)
///         and the model's state after it. Each trace runs twice from one
///         snapshot: through `FigaroCore` (with `AttestationCoordinator` and a
///         `UsageCounter`), and through `FigaroBatchVerifier` under the mock SP1
///         verifier (with its own `UsageCounter`), the steps grouped into batches
///         of one to three. Beside each commit both parties attest on the new
///         order; each resolution alternates between the buyer's ECDSA signature
///         and its wallet's code (ERC-1271 on the batch path, a call from the
///         buyer's address on the Core); each resolution claims the root order's
///         clause for designer rewards.
///
///         Compared, per row of `docs/VERIFICATION_MAP.md` § E-13's table: every
///         wallet and each contract's holding against the model and against the
///         other path (the Core after every step, the batch path after every
///         batch); the Core's process record against the model; and, per event
///         kind, the sequence of `OrderCommitted`, `OrderSeller`, `OrderCurrency`,
///         `OrderResolved`, `ProcessResolved`, `Attestation` and `UsageRecorded`,
///         each id checked against its own path's EIP-712 derivation and then
///         read as the model's order and process index.
///
///         The batch path's inputs a guest would compute — the net positions,
///         the attestation events, the uses and the stream — are computed here
///         from the guest's rules (`prover/lib/src/kernel.rs`,
///         `prover/lib/src/operation_stream.rs`); the guest itself is held to the
///         Core by `KernelDifferentialFuzzTest` with `prover/lib/tests/fuzz_stream.rs`.
///         `EQUIVALENCE_BREAK=payout` moves one token of each batched resolution's
///         buyer payout to its seller: the run must then fail on tokens.
contract CoreBatchEquivalenceTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    /// @dev The observable the two paths, or a path and the model, disagree on.
    error ObservableDiverges(string observable, uint256 trace, uint256 at);

    string internal constant TRACES = "test/fixtures/tlc-traces.json";
    bytes32 internal constant CLAUSE = keccak256("equivalence-clause");
    bytes32 internal constant OTHER_CLAUSE = keccak256("equivalence-other-clause");
    uint8 internal constant STAGE = 1;
    uint256 internal constant PARTIES = 4; // b1, b2, s1, s2, as the fixture's `parties`

    // Row columns, as the fixture's `columns`.
    uint256 internal constant C_ACTION = 0;
    uint256 internal constant C_PID = 1;
    uint256 internal constant C_BUYER = 2;
    uint256 internal constant C_SELLER = 3;
    uint256 internal constant C_PAYMENT = 4;
    uint256 internal constant C_CUMULATIVE = 5;
    uint256 internal constant C_WALLETS = 6;
    uint256 internal constant C_CONTRACT = 10;
    uint256 internal constant C_PROCESSES = 11;

    // The event kinds compared, one sequence each per path.
    uint256 internal constant E_COMMITTED = 0;
    uint256 internal constant E_SELLER = 1;
    uint256 internal constant E_CURRENCY = 2;
    uint256 internal constant E_RESOLVED = 3;
    uint256 internal constant E_PROCESS = 4;
    uint256 internal constant E_ATTESTATION = 5;
    uint256 internal constant E_USAGE = 6;
    uint256 internal constant E_KINDS = 7;
    uint256 internal constant DIRECT = 0;
    uint256 internal constant BATCH = 1;

    uint256[PARTIES] internal keys = [uint256(0xB1), 0xB2, 0x51, 0x52];
    address[PARTIES] internal party;

    // ── The direct path ─────────────────────────────────────────────
    FigaroCore internal core;
    AttestationCoordinator internal coordinator;
    UsageCounter internal counterD;
    MockERC20 internal tokenD;

    // ── The batch path ──────────────────────────────────────────────
    FigaroBatchVerifier internal verifier;
    UsageCounter internal counterB;
    MockERC20 internal tokenB;

    MembersRegistry internal members;
    MockClauseOrAssemblyStake internal stake;
    uint256 internal initialBalance;

    // ── Per trace (reset by the snapshot) ───────────────────────────
    struct Order {
        CommitmentTypes.Commitment d; // as signed for FigaroCore's domain
        CommitmentTypes.Commitment b; // as signed for the verifier's domain
        bytes32 dataHash;
        bytes32 sibling;
    }

    mapping(uint256 => Order) internal orders; // by the model's order index
    mapping(uint256 => uint256[]) internal processOrders; // by the model's process index
    mapping(uint256 => bytes32[2]) internal processIdOf; // [DIRECT, BATCH]
    mapping(bytes32 => uint256) internal oidOf; // either path's orderHash → model order index
    mapping(bytes32 => uint256) internal pidOf; // either path's processId → model process index
    uint256 internal nextOid;
    uint256 internal resolveCount;

    // The batch being built: what the guest would output for it.
    bytes internal opsStream;
    bytes internal claimStream;
    FigaroBatchVerifier.AttestationData[] internal pendingAttestations;
    IUsageCounter.BatchUse[] internal pendingUses;
    mapping(address => uint256) internal deposited;
    mapping(address => uint256) internal paidOut;
    address[] internal touched;
    bytes32 internal nextRoot;

    // The folded event sequences, [path][kind].
    bytes32[E_KINDS][2] internal chain;
    uint256[E_KINDS][2] internal count;

    // Totals over the run, for the report.
    uint256 internal totalSteps;
    uint256 internal totalBatches;
    uint256 internal totalWalletCodeResolves;
    uint256 internal totalSignedResolves;

    bool internal breakPayout;
    bool internal mixKinds;
    // Batches whose guest order lists a payout before the pull that funds it
    // (one pass in that order would push more than the verifier holds).
    uint256 internal totalPaysBeforeItPulls;
    uint256 internal constant MIXED_BATCHES_WANTED = 3;

    function setUp() public {
        string memory json = vm.readFile(TRACES);
        initialBalance = vm.parseJsonUint(json, ".initialBalance");
        string[] memory names = vm.parseJsonStringArray(json, ".parties");
        assertEq(names.length, PARTIES, "the model's four parties");

        stake = new MockClauseOrAssemblyStake();
        members = new MembersRegistry(0, 0);
        uint64[] memory periods = new uint64[](1);
        periods[0] = uint64(block.timestamp + 365 days);

        core = new FigaroCore();
        coordinator = new AttestationCoordinator(address(core));
        counterD = new UsageCounter(
            address(core),
            address(members),
            address(stake),
            address(stake),
            address(stake),
            address(0xBA7C4),
            1,
            periods
        );

        FigaroCore unusedCore = new FigaroCore();
        MockSP1Verifier sp1 = new MockSP1Verifier();
        ClauseRegistry registry = new ClauseRegistry(0.001 ether);
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        counterB = new UsageCounter(
            address(unusedCore), address(members), address(stake), address(stake), address(stake), predicted, 1, periods
        );
        verifier = new FigaroBatchVerifier(address(sp1), keccak256("vkey"), address(registry), address(counterB));
        assertEq(address(verifier), predicted, "the counter names this verifier");

        tokenD = new MockERC20("Direct", "D");
        tokenB = new MockERC20("Batch", "B");
        for (uint256 i = 0; i < PARTIES; i++) {
            party[i] = vm.addr(keys[i]);
            tokenD.mint(party[i], initialBalance);
            tokenB.mint(party[i], initialBalance);
            vm.startPrank(party[i]);
            tokenD.approve(address(core), type(uint256).max);
            tokenB.approve(address(verifier), type(uint256).max);
            if (i >= 2) members.register("ipfs://seller");
            vm.stopPrank();
        }
        // The buyers' wallets carry code that answers ERC-1271 for the batch
        // path's second resolve form; their keys still sign as before.
        vm.etch(party[0], type(MockERC1271Wallet).runtimeCode);
        vm.etch(party[1], type(MockERC1271Wallet).runtimeCode);
    }

    // ── The run ─────────────────────────────────────────────────────

    // The run, in four parts: one test's gas cannot hold every trace.
    uint256 internal constant PARTS = 4;

    function test_everyTlcTraceIsTheSameOnBothPathsAndTheModel_part1() public {
        _run(0);
    }

    function test_everyTlcTraceIsTheSameOnBothPathsAndTheModel_part2() public {
        _run(1);
    }

    function test_everyTlcTraceIsTheSameOnBothPathsAndTheModel_part3() public {
        _run(2);
    }

    function test_everyTlcTraceIsTheSameOnBothPathsAndTheModel_part4() public {
        _run(3);
    }

    function _run(uint256 part) internal {
        breakPayout = keccak256(bytes(vm.envOr("EQUIVALENCE_BREAK", string("")))) == keccak256("payout");
        uint256 traces = vm.parseJsonUint(vm.readFile(TRACES), ".traceCount");
        assertGt(traces, 0, "TLC wrote traces");
        uint256 from = traces * part / PARTS;
        uint256 to = traces * (part + 1) / PARTS;
        for (uint256 t = from; t < to; t++) {
            uint256 snap = vm.snapshotState();
            _replay(t);
            (uint256 steps, uint256 batches, uint256 wc, uint256 signed) =
                (totalSteps, totalBatches, totalWalletCodeResolves, totalSignedResolves);
            vm.revertToState(snap);
            (totalSteps, totalBatches, totalWalletCodeResolves, totalSignedResolves) = (steps, batches, wc, signed);
        }
        console.log("traces", from, "to", to);
        console.log("steps", totalSteps);
        console.log("batches", totalBatches);
        console.log("resolves by signature / by wallet code", totalSignedResolves, totalWalletCodeResolves);
        assertGt(totalWalletCodeResolves, 0, "both resolve forms ran");
        assertGt(totalSignedResolves, 0, "both resolve forms ran");
    }

    /// @dev The comparison is not vacuous: a batch path that pays one token
    ///      of a buyer's payout to its seller diverges, and on tokens.
    function test_aBrokenPayoutDivergesOnTokens() public {
        breakPayout = true;
        try this.replayOne(0) {
            fail();
        } catch (bytes memory reason) {
            assertEq(bytes4(reason), ObservableDiverges.selector, "a divergence, not another revert");
            bytes memory args = new bytes(reason.length - 4);
            for (uint256 i = 0; i < args.length; i++) {
                args[i] = reason[i + 4];
            }
            (string memory observable,,) = abi.decode(args, (string, uint256, uint256));
            assertEq(observable, "tokens: batch wallet");
        }
    }

    /// @dev The guest lists a batch's net positions ascending by (token, user)
    ///      address (`TokenTracker::net_positions`), so a commit and the resolve
    ///      of its process in one batch, with the seller's address below the
    ///      buyer's, lists the seller's payout before the buyer's pull that
    ///      funds it. The verifier moves every pull before any payout
    ///      (`_executePositions`), so every such batch lands, and every wallet
    ///      and the verifier's holding after it are the model's, which the Core
    ///      matched step by step in the same replay.
    function test_aBatchThatPaysBeforeItPullsLandsAsTheCoreDoes() public {
        mixKinds = true;
        uint256 traces = vm.parseJsonUint(vm.readFile(TRACES), ".traceCount");
        uint256 paysFirst;
        for (uint256 t = 0; t < traces; t++) {
            uint256 snap = vm.snapshotState();
            _replay(t);
            uint256 found = totalPaysBeforeItPulls;
            vm.revertToState(snap);
            totalPaysBeforeItPulls = found;
            if (found > paysFirst) {
                paysFirst = found;
                if (paysFirst >= MIXED_BATCHES_WANTED) break;
            }
        }
        console.log("batches whose guest order pays before it pulls, landed as the Core did", paysFirst);
        assertGe(paysFirst, MIXED_BATCHES_WANTED, "the run reached batches that pay before they pull");
    }

    function replayOne(uint256 t) external {
        _replay(t);
    }

    function _replay(uint256 t) internal {
        uint256[][] memory rows = abi.decode(
            vm.parseJson(vm.readFile(TRACES), string.concat(".traces[", vm.toString(t), "].rows")), (uint256[][])
        );
        vm.recordLogs();
        uint256 pending;
        bool pendingResolves;
        for (uint256 j = 0; j < rows.length; j++) {
            uint256[] memory row = rows[j];
            bool resolves = row[C_ACTION] == 2;
            // A batch carries commits or resolutions, never both, unless the
            // run mixes them on purpose (`test_aBatchThatPaysBeforeItPulls…`).
            if (!mixKinds && pending > 0 && resolves != pendingResolves) {
                _settleAndCheck(t, j - 1, rows[j - 1]);
                pending = 0;
            }
            if (resolves) _resolve(t, row);
            else _commit(t, row);
            _foldLogs(t);
            _checkDirect(t, j, row);
            pending++;
            pendingResolves = resolves;
            if ((j + t) % 3 == 2 || j + 1 == rows.length) {
                _settleAndCheck(t, j, row);
                pending = 0;
            }
        }
        totalSteps += rows.length;
        _compareEvents(t);
    }

    function _settleAndCheck(uint256 t, uint256 step, uint256[] memory row) internal {
        _settle(t);
        _foldLogs(t);
        _checkBatch(t, step, row);
    }

    // ── Commit, and the two attestations beside it ───────────────────

    function _commit(uint256 t, uint256[] memory row) internal {
        uint256 oid = ++nextOid;
        uint256 pid = row[C_PID];
        Order storage o = orders[oid];
        o.dataHash = keccak256(abi.encode("data", t, oid));
        o.sibling = CommitmentTypes.clauseLeaf(OTHER_CLAUSE, keccak256(abi.encode("other", t, oid)));
        bytes32 leaf = CommitmentTypes.clauseLeaf(CLAUSE, o.dataHash);
        bytes32 checkout = leaf < o.sibling
            ? keccak256(abi.encodePacked(leaf, o.sibling))
            : keccak256(abi.encodePacked(o.sibling, leaf));

        CommitmentTypes.Commitment memory c;
        c.buyer = party[row[C_BUYER]];
        c.seller = party[row[C_SELLER]];
        c.payment = row[C_PAYMENT];
        c.expectedCumulativeValue = row[C_CUMULATIVE];
        c.checkoutHash = checkout;
        c.salt = uint256(keccak256(abi.encode("salt", t, oid)));
        c.deadline = block.timestamp + 1 days;
        bool root = row[C_ACTION] == 0;

        c.currency = address(tokenD);
        c.processId = root ? bytes32(0) : processIdOf[pid][DIRECT];
        o.d = c;
        _commitDirect(oid, pid, row);

        c.currency = address(tokenB);
        c.processId = root ? bytes32(0) : processIdOf[pid][BATCH];
        o.b = c;
        _commitBatch(oid, pid, row);
        processOrders[pid].push(oid);
    }

    function _commitDirect(uint256 oid, uint256 pid, uint256[] memory row) internal {
        Order storage o = orders[oid];
        bytes32 digest = _typed(core.DOMAIN_SEPARATOR(), o.d.hashStruct());
        (bytes32 processId, bytes32 orderHash) =
            core.commit(o.d, _sign(keys[row[C_BUYER]], digest), _sign(keys[row[C_SELLER]], digest));
        _bind(DIRECT, oid, pid, processId, orderHash);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = o.sibling;
        bytes32 contentRef = keccak256(abi.encode("content", oid));
        vm.prank(o.d.seller);
        coordinator.attestAsSeller(o.d, CLAUSE, STAGE, o.dataHash, proof, contentRef);
        vm.prank(o.d.buyer);
        coordinator.attestAsBuyer(o.d, CLAUSE, STAGE, o.dataHash, proof, contentRef);
    }

    /// @dev The guest's `apply_commit` and `apply_attest_as_*` outputs: the
    ///      stream's `0x01` entry, the two bonds as deposits, the two events.
    function _commitBatch(uint256 oid, uint256 pid, uint256[] memory row) internal {
        Order storage o = orders[oid];
        bytes32 structHash = o.b.hashStruct();
        bytes32 digest = _typed(_verifierDomain(), structHash);
        bytes32 processId = o.b.processId == bytes32(0) ? digest : o.b.processId;
        bytes32 orderHash = keccak256(abi.encodePacked(processId, structHash));
        _bind(BATCH, oid, pid, processId, orderHash);

        opsStream = bytes.concat(
            opsStream,
            hex"01",
            _packCommitment(o.b),
            _sign(keys[row[C_BUYER]], digest),
            _sign(keys[row[C_SELLER]], digest)
        );
        _deposit(o.b.buyer, 2 * o.b.payment);
        _deposit(o.b.seller, 2 * o.b.expectedCumulativeValue);

        bytes32 contentRef = keccak256(abi.encode("content", oid));
        pendingAttestations.push(
            FigaroBatchVerifier.AttestationData(orderHash, processId, o.b.seller, CLAUSE, STAGE, contentRef)
        );
        pendingAttestations.push(
            FigaroBatchVerifier.AttestationData(orderHash, processId, o.b.buyer, CLAUSE, STAGE, contentRef)
        );
    }

    function _bind(uint256 path, uint256 oid, uint256 pid, bytes32 processId, bytes32 orderHash) internal {
        if (processIdOf[pid][path] == bytes32(0)) processIdOf[pid][path] = processId;
        if (processIdOf[pid][path] != processId) revert ObservableDiverges("ids: processId", path, oid);
        oidOf[orderHash] = oid;
        pidOf[processId] = pid;
    }

    // ── Resolve, and the usage claim after it ─────────────────────────

    function _resolve(uint256 t, uint256[] memory row) internal {
        uint256 pid = row[C_PID];
        uint256[] storage oids = processOrders[pid];
        bool byWalletCode = (t + resolveCount++) % 2 == 1;
        address buyer = party[row[C_BUYER]];

        CommitmentTypes.Commitment[] memory listD = new CommitmentTypes.Commitment[](oids.length);
        for (uint256 i = 0; i < oids.length; i++) {
            listD[i] = orders[oids[i]].d;
        }
        // The Core's one form: a call from the buyer's address, by its key or
        // by code its wallet installed (DESIGN_DECISIONS § 4); either is this.
        vm.prank(buyer);
        core.resolveProcess(processIdOf[pid][DIRECT], listD);

        Order storage root = orders[oids[0]];
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = root.sibling;
        counterD.recordClauseUsage(root.d, CLAUSE, root.dataHash, proof);

        _resolveBatch(t, pid, row, byWalletCode);
    }

    /// @dev The guest's `apply_resolve` output in the form the buyer picked,
    ///      the payouts as the guest's `resolution_payouts`, and the usage
    ///      claim the guest proves after every operation.
    function _resolveBatch(uint256 t, uint256 pid, uint256[] memory row, bool byWalletCode) internal {
        uint256[] storage oids = processOrders[pid];
        bytes32 processId = processIdOf[pid][BATCH];
        bytes memory listed;
        for (uint256 i = 0; i < oids.length; i++) {
            CommitmentTypes.Commitment storage c = orders[oids[i]].b;
            listed = bytes.concat(listed, _packCommitment(c));
            uint256 sellerPayout = 2 * c.expectedCumulativeValue + c.payment;
            uint256 buyerPayout = c.payment;
            if (breakPayout) (sellerPayout, buyerPayout) = (sellerPayout + 1, buyerPayout - 1);
            _payout(c.seller, sellerPayout);
            _payout(c.buyer, buyerPayout);
        }
        bytes32 digest = _typed(
            _verifierDomain(),
            keccak256(
                abi.encode(
                    keccak256("ResolveProcess(bytes32 processId,uint256 cumulativeValue)"), processId, row[C_CUMULATIVE]
                )
            )
        );
        bytes2 n = bytes2(uint16(oids.length));
        if (byWalletCode) {
            bytes memory authorization = abi.encode("wallet-code", t, pid);
            MockERC1271Wallet(party[row[C_BUYER]]).approve(digest, authorization);
            opsStream = bytes.concat(
                opsStream, hex"04", processId, bytes2(uint16(authorization.length)), authorization, n, listed
            );
            totalWalletCodeResolves++;
        } else {
            opsStream = bytes.concat(opsStream, hex"02", processId, _sign(keys[row[C_BUYER]], digest), n, listed);
            totalSignedResolves++;
        }

        Order storage root = orders[oids[0]];
        claimStream = bytes.concat(
            claimStream, hex"03", _packCommitment(root.b), CLAUSE, hex"00", root.dataHash, hex"0001", root.sibling
        );
        pendingUses.push(IUsageCounter.BatchUse(CLAUSE, counterB.KIND_CLAUSE(), processId, root.b.seller));
    }

    // ── The batch, landed ────────────────────────────────────────────

    function _settle(uint256 t) internal {
        FigaroBatchVerifier.NetPosition[] memory positions = _positions();
        FigaroBatchVerifier.BatchEventData memory events;
        events.attestations = pendingAttestations;
        events.specBindings = new FigaroBatchVerifier.SpecBinding[](0); // hash-only attestations bind no spec
        FigaroBatchVerifier.BatchUsageData memory usage;
        usage.period = counterB.currentPeriod();
        usage.provenanceLeaf = counterB.provenanceLeaf();
        usage.uses = pendingUses;
        bytes memory operations = bytes.concat(opsStream, claimStream);

        nextRoot = keccak256(abi.encode(nextRoot, t, totalBatches));
        bytes memory pv = abi.encode(
            verifier.stateRoot(),
            nextRoot,
            uint64(block.chainid),
            address(verifier),
            BatchHashes.positions(positions),
            BatchHashes.attestations(events.attestations),
            BatchHashes.bindings(events.specBindings),
            BatchHashes.usage(usage),
            uint64(block.timestamp),
            keccak256(operations)
        );
        if (_paysBeforeItPulls(positions)) totalPaysBeforeItPulls++;
        verifier.settleBatch(hex"", pv, positions, events, usage, operations);
        totalBatches++;

        delete opsStream;
        delete claimStream;
        delete pendingAttestations;
        delete pendingUses;
        for (uint256 i = 0; i < touched.length; i++) {
            delete deposited[touched[i]];
            delete paidOut[touched[i]];
        }
        delete touched;
    }

    /// @dev Whether one pass in the guest's order would push a payout the
    ///      verifier does not yet hold: the batch the two passes exist for.
    function _paysBeforeItPulls(FigaroBatchVerifier.NetPosition[] memory ps) internal view returns (bool) {
        uint256 held = tokenB.balanceOf(address(verifier));
        for (uint256 i = 0; i < ps.length; i++) {
            if (ps[i].deposit > ps[i].payout) {
                held += ps[i].deposit - ps[i].payout;
            } else {
                uint256 net = ps[i].payout - ps[i].deposit;
                if (net > held) return true;
                held -= net;
            }
        }
        return false;
    }

    function _deposit(address user, uint256 amount) internal {
        _touch(user);
        deposited[user] += amount;
    }

    function _payout(address user, uint256 amount) internal {
        _touch(user);
        paidOut[user] += amount;
    }

    function _touch(address user) internal {
        if (deposited[user] == 0 && paidOut[user] == 0) {
            for (uint256 i = 0; i < touched.length; i++) {
                if (touched[i] == user) return;
            }
            touched.push(user);
        }
    }

    /// @dev The guest's `TokenTracker::net_positions`: one entry per
    ///      (token, user) the batch touched, ascending, deposit and payout summed.
    function _positions() internal view returns (FigaroBatchVerifier.NetPosition[] memory ps) {
        address[] memory users = touched;
        for (uint256 i = 1; i < users.length; i++) {
            for (uint256 k = i; k > 0 && users[k - 1] > users[k]; k--) {
                (users[k - 1], users[k]) = (users[k], users[k - 1]);
            }
        }
        ps = new FigaroBatchVerifier.NetPosition[](users.length);
        for (uint256 i = 0; i < users.length; i++) {
            ps[i] = FigaroBatchVerifier.NetPosition(address(tokenB), users[i], deposited[users[i]], paidOut[users[i]]);
        }
    }

    // ── The observables ──────────────────────────────────────────────

    /// @dev The Core after every step: every wallet, the Core's holding and
    ///      the process records, against the model.
    function _checkDirect(uint256 t, uint256 step, uint256[] memory row) internal view {
        for (uint256 i = 0; i < PARTIES; i++) {
            if (tokenD.balanceOf(party[i]) != row[C_WALLETS + i]) {
                revert ObservableDiverges("tokens: direct wallet", t, step);
            }
        }
        if (tokenD.balanceOf(address(core)) != row[C_CONTRACT]) {
            revert ObservableDiverges("tokens: FigaroCore", t, step);
        }
        for (uint256 p = 1; p <= 2; p++) {
            if (processIdOf[p][DIRECT] == bytes32(0)) continue;
            (,, uint256 cumulative, uint256 active) = core.processes(processIdOf[p][DIRECT]);
            uint256 at = C_PROCESSES + 2 * (p - 1);
            if (cumulative != row[at] || active != row[at + 1]) revert ObservableDiverges("state: process", t, step);
        }
    }

    /// @dev The batch path after every batch: every wallet and the verifier's
    ///      holding, against the model and so against the Core.
    function _checkBatch(uint256 t, uint256 step, uint256[] memory row) internal view {
        for (uint256 i = 0; i < PARTIES; i++) {
            if (tokenB.balanceOf(party[i]) != row[C_WALLETS + i]) {
                revert ObservableDiverges("tokens: batch wallet", t, step);
            }
        }
        if (tokenB.balanceOf(address(verifier)) != row[C_CONTRACT]) {
            revert ObservableDiverges("tokens: FigaroBatchVerifier", t, step);
        }
    }

    /// @dev Fold the logs since the last call into the per-kind sequences of
    ///      the path that emitted them, each id read as the model's index.
    function _foldLogs(uint256 t) internal {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; i++) {
            Vm.Log memory l = logs[i];
            uint256 path;
            if (l.emitter == address(core) || l.emitter == address(coordinator) || l.emitter == address(counterD)) {
                path = DIRECT;
            } else if (l.emitter == address(verifier) || l.emitter == address(counterB)) {
                path = BATCH;
            } else {
                continue; // token transfers and approvals: compared as balances
            }
            (bool known, uint256 kind, bytes memory record) = _normalize(t, path, l);
            if (!known) continue;
            chain[path][kind] = keccak256(abi.encode(chain[path][kind], record));
            count[path][kind]++;
        }
    }

    function _normalize(uint256 t, uint256 path, Vm.Log memory l) internal view returns (bool, uint256, bytes memory) {
        bytes32 sig = l.topics[0];
        address token = path == DIRECT ? address(tokenD) : address(tokenB);
        if (sig == FigaroCore.OrderCommitted.selector) {
            return (true, E_COMMITTED, _committedRecord(t, path, l, token));
        }
        if (sig == FigaroCore.OrderSeller.selector) {
            return (true, E_SELLER, abi.encode(_oid(t, l.topics[1]), l.topics[2]));
        }
        if (sig == FigaroCore.OrderCurrency.selector) {
            if (address(uint160(uint256(l.topics[2]))) != token) {
                revert ObservableDiverges("events: OrderCurrency", t, path);
            }
            return (true, E_CURRENCY, abi.encode(_oid(t, l.topics[1])));
        }
        if (sig == FigaroCore.OrderResolved.selector) {
            return (true, E_RESOLVED, abi.encode(_oid(t, l.topics[1]), _pid(t, l.topics[2]), l.data));
        }
        if (sig == FigaroCore.ProcessResolved.selector) {
            return (true, E_PROCESS, abi.encode(_pid(t, l.topics[1]), l.topics[2], l.data));
        }
        if (sig == AttestationCoordinator.Attestation.selector) {
            return (true, E_ATTESTATION, abi.encode(_oid(t, l.topics[1]), _pid(t, l.topics[2]), l.topics[3], l.data));
        }
        if (sig == UsageCounter.UsageRecorded.selector) {
            // data: kind, seller, c, d, score — no id
            return (true, E_USAGE, abi.encode(l.topics[1], l.topics[2], _pid(t, l.topics[3]), l.data));
        }
        return (false, 0, "");
    }

    /// @dev `OrderCommitted` with its ids read as the model's indices and its
    ///      currency (the path's own token, checked) taken out of the data.
    function _committedRecord(uint256 t, uint256 path, Vm.Log memory l, address token)
        internal
        view
        returns (bytes memory)
    {
        bytes memory data = l.data; // seller, currency, payment, cumulativeValue, checkoutHash, salt, deadline
        address currency;
        assembly ("memory-safe") {
            currency := mload(add(data, 64))
            mstore(add(data, 64), 0)
        }
        if (currency != token) revert ObservableDiverges("events: OrderCommitted currency", t, path);
        return abi.encode(_oid(t, l.topics[1]), _pid(t, l.topics[2]), l.topics[3], data);
    }

    function _oid(uint256 t, bytes32 orderHash) internal view returns (uint256 oid) {
        oid = oidOf[orderHash];
        if (oid == 0) revert ObservableDiverges("ids: an orderHash neither path derived", t, uint256(orderHash));
    }

    function _pid(uint256 t, bytes32 processId) internal view returns (uint256 pid) {
        pid = pidOf[processId];
        if (pid == 0) revert ObservableDiverges("ids: a processId neither path derived", t, uint256(processId));
    }

    function _compareEvents(uint256 t) internal view {
        string[E_KINDS] memory names = [
            "events: OrderCommitted",
            "events: OrderSeller",
            "events: OrderCurrency",
            "events: OrderResolved",
            "events: ProcessResolved",
            "events: Attestation",
            "events: UsageRecorded"
        ];
        for (uint256 k = 0; k < E_KINDS; k++) {
            if (count[DIRECT][k] == 0 || chain[DIRECT][k] != chain[BATCH][k]) {
                revert ObservableDiverges(names[k], t, k);
            }
        }
    }

    // ── Encoding ─────────────────────────────────────────────────────

    /// @dev The stream's 252-byte commitment (`operation_stream.rs`).
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

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _typed(bytes32 domain, bytes32 structHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function _verifierDomain() internal view returns (bytes32) {
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
}
