// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "src/core/kernel/FigaroCore.sol";
import "src/core/kernel/CommitmentTypes.sol";
import "src/core/attestation/AttestationCoordinator.sol";
import "src/mocks/MockReentrantToken.sol";
import {UsageCounter} from "src/rewards/UsageCounter.sol";
import {MembersRegistry} from "src/registries/MembersRegistry.sol";
import {MockClauseOrAssemblyStake} from "test/helpers/MockClauseOrAssemblyStake.sol";

/// @title ResolutionWindowAgent — the buyer's wallet code, called back by the bond token
/// @notice Etched at the buyer's address, as code an EIP-7702 delegation
///         installs. `MockReentrantToken` calls `act` before each token
///         movement of a resolution; `act` re-arms the token, so it runs once
///         per transfer, up to `maxCallbacks`. On each call it reads every
///         order's status in `FigaroCore`, attests on every order as the buyer
///         through `AttestationCoordinator`, and claims the clause's use for
///         every order through `UsageCounter`, and keeps each answer. The
///         storage is the buyer's own: set it with `configure` after the etch.
contract ResolutionWindowAgent {
    /// @dev What one callback saw of one order. A zero selector is a call
    ///      that succeeded; any other is the first four bytes it reverted with.
    struct Seen {
        uint8 status;
        bytes4 attest;
        bytes4 count;
    }

    MockReentrantToken public token;
    FigaroCore public core;
    AttestationCoordinator public coordinator;
    UsageCounter public counter;
    bytes32 public clauseId;
    bytes32 public clauseDataHash;
    uint256 public maxCallbacks;
    uint256 public callbacks;
    CommitmentTypes.Commitment[] internal orders;
    bytes32[] internal orderHashes;
    /// @notice callback index => order index => what that callback saw.
    mapping(uint256 => mapping(uint256 => Seen)) public seen;
    /// @notice callback index => each seller's balance at that callback.
    mapping(uint256 => mapping(uint256 => uint256)) public sellerBalance;

    function configure(
        MockReentrantToken token_,
        FigaroCore core_,
        AttestationCoordinator coordinator_,
        UsageCounter counter_,
        bytes32 clauseId_,
        bytes32 clauseDataHash_,
        uint256 maxCallbacks_
    ) external {
        (token, core, coordinator, counter) = (token_, core_, coordinator_, counter_);
        (clauseId, clauseDataHash, maxCallbacks) = (clauseId_, clauseDataHash_, maxCallbacks_);
    }

    function addOrder(CommitmentTypes.Commitment calldata c, bytes32 orderHash) external {
        orders.push(c);
        orderHashes.push(orderHash);
    }

    function act() external {
        uint256 k = callbacks++;
        bytes32[] memory proof = new bytes32[](0);
        for (uint256 i = 0; i < orders.length; i++) {
            CommitmentTypes.Commitment memory c = orders[i];
            Seen storage s = seen[k][i];
            s.status = core.orderStatus(orderHashes[i]);
            sellerBalance[k][i] = token.balanceOf(c.seller);
            try coordinator.attestAsBuyer(c, clauseId, 1, clauseDataHash, proof, keccak256(abi.encode(k, i))) {}
            catch (bytes memory reason) {
                s.attest = _selector(reason);
            }
            try counter.recordClauseUsage(c, clauseId, clauseDataHash, proof) {}
            catch (bytes memory reason) {
                s.count = _selector(reason);
            }
        }
        if (callbacks < maxCallbacks) token.arm(address(this), abi.encodeCall(this.act, ()));
    }

    function _selector(bytes memory reason) internal pure returns (bytes4) {
        // A revert with no data still reads as a refusal, never as success.
        return reason.length >= 4 ? bytes4(reason) : bytes4(0xffffffff);
    }
}

/// @title ResolutionWindowReadersTest — the two outside readers of `orderStatus` inside a resolution
/// @notice `FigaroCore.resolveProcess` sends an order's two payouts before it
///         sets the order's status to 2 (`docs/DESIGN_DECISIONS.md`, the entry
///         on `resolveProcess` paying before it marks). The entry holds that
///         each reader of the status is safe in that window. `FigaroCore`'s own
///         readers are held by `ReentrancyAdversarialTest`. This suite holds
///         the other two: a bond token whose every transfer calls back into the
///         buyer's wallet code, which attests through `AttestationCoordinator`
///         and claims a use through `UsageCounter` on every order of the
///         process being resolved.
///
///         What the entry says, each asserted here:
///         1. The coordinator accepts an attestation on an order at status 1,
///            including one whose seller payout has already left; it refuses
///            an order at status 2. The attestation is emitted before that
///            order's `OrderResolved`, and the resolution pays as it would
///            without it.
///         2. The counter counts an order only at status 2, so only an order
///            the loop has finished. The count is the one a later transaction
///            would make, and `processCounted` stops a second count, in the
///            window and after it.
///         3. When the resolution reverts, the attestation and the count made
///            inside it revert with it.
contract ResolutionWindowReadersTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore internal core;
    AttestationCoordinator internal coordinator;
    UsageCounter internal counter;
    MockReentrantToken internal token;

    uint256 internal constant BUYER_KEY = 0xB0B;
    uint256[3] internal sellerKeys = [uint256(0x5E11), 0x5E12, 0x5E13];
    address internal buyer;
    address[3] internal sellers;

    bytes32 internal constant CLAUSE = keccak256("resolution-window-clause");
    bytes32 internal constant CLAUSE_DATA_HASH = keccak256("resolution-window-clause-data");
    uint8 internal constant KIND_CLAUSE = 0;

    bytes4 internal constant OK = bytes4(0);

    function setUp() public {
        buyer = vm.addr(BUYER_KEY);
        token = new MockReentrantToken();
        core = new FigaroCore();
        coordinator = new AttestationCoordinator(address(core));

        MockClauseOrAssemblyStake stake = new MockClauseOrAssemblyStake();
        MembersRegistry members = new MembersRegistry(0, 0);
        uint64[] memory periods = new uint64[](1);
        periods[0] = uint64(block.timestamp + 365 days);
        counter = new UsageCounter(
            address(core),
            address(members),
            address(stake),
            address(stake),
            address(stake),
            address(0xBA7C4),
            1,
            periods
        );

        token.mint(buyer, 100_000 ether);
        vm.prank(buyer);
        token.approve(address(core), type(uint256).max);
        for (uint256 i = 0; i < sellers.length; i++) {
            sellers[i] = vm.addr(sellerKeys[i]);
            token.mint(sellers[i], 100_000 ether);
            vm.startPrank(sellers[i]);
            token.approve(address(core), type(uint256).max);
            members.register("ipfs://seller");
            vm.stopPrank();
        }

        // The buyer's wallet carries code; its key still signs.
        vm.etch(buyer, address(new ResolutionWindowAgent()).code);
        _agent().configure(token, core, coordinator, counter, CLAUSE, CLAUSE_DATA_HASH, 0);
    }

    function _agent() internal view returns (ResolutionWindowAgent) {
        return ResolutionWindowAgent(buyer);
    }

    // ── A process of n orders, each carrying the one clause ─────────────

    /// Orders of 10, 20 and 30 ether, one per seller, each extending the
    /// running total; every order's agreement is the one clause leaf, so its
    /// inclusion proof is empty.
    function _openProcess(uint256 n)
        internal
        returns (bytes32 pid, CommitmentTypes.Commitment[] memory o, bytes32[] memory h)
    {
        o = new CommitmentTypes.Commitment[](n);
        h = new bytes32[](n);
        uint256 runningTotal;
        for (uint256 i = 0; i < n; i++) {
            uint256 payment = (i + 1) * 10 ether;
            runningTotal += payment;
            o[i] = CommitmentTypes.Commitment({
                processId: pid,
                buyer: buyer,
                seller: sellers[i],
                token: address(token),
                payment: payment,
                runningTotal: runningTotal,
                checkoutHash: CommitmentTypes.clauseLeaf(CLAUSE, CLAUSE_DATA_HASH),
                salt: i + 1,
                commitDeadline: block.timestamp + 1 hours
            });
            bytes32 digest = keccak256(abi.encodePacked("\x19\x01", core.DOMAIN_SEPARATOR(), o[i].hashStruct()));
            bytes32 processId;
            (processId, h[i]) = core.commit(o[i], _sig(BUYER_KEY, digest), _sig(sellerKeys[i], digest));
            if (i == 0) pid = processId;
            _agent().addOrder(o[i], h[i]);
        }
    }

    function _sig(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _arm(uint256 maxCallbacks) internal {
        _agent().configure(token, core, coordinator, counter, CLAUSE, CLAUSE_DATA_HASH, maxCallbacks);
        token.arm(buyer, abi.encodeCall(ResolutionWindowAgent.act, ()));
    }

    function _seen(uint256 k, uint256 i) internal view returns (uint8 status, bytes4 attest, bytes4 count) {
        return _agent().seen(k, i);
    }

    function _expectSeen(uint256 k, uint256 i, uint8 status, bytes4 attest, bytes4 count) internal view {
        (uint8 s, bytes4 a, bytes4 c) = _seen(k, i);
        string memory at = string.concat("callback ", vm.toString(k), ", order ", vm.toString(i));
        assertEq(s, status, string.concat(at, ": status"));
        assertEq(a, attest, string.concat(at, ": the coordinator's answer"));
        assertEq(c, count, string.concat(at, ": the counter's answer"));
    }

    // ═══════════════════════════════════════════════════════════════
    // Both readers, called back from every transfer of a resolution
    // ═══════════════════════════════════════════════════════════════

    struct LaterCount {
        uint64 c;
        uint64 d;
        uint256 score;
    }

    function test_eachReaderInsideAResolutionsTransfers_readsWhatTheEntrySays() public {
        (bytes32 pid, CommitmentTypes.Commitment[] memory o, bytes32[] memory h) = _openProcess(2);
        LaterCount memory later = _laterCount(pid, o);

        uint256[4] memory before = [
            token.balanceOf(buyer),
            token.balanceOf(sellers[0]),
            token.balanceOf(sellers[1]),
            token.balanceOf(address(core))
        ];

        _arm(4);
        vm.recordLogs();
        vm.prank(buyer);
        core.resolveProcess(pid, o);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        _expectCallbacks(before[1]);
        _expectOutcome(pid, h, before, later);
        _expectWindowClosed(o);
        _expectEventSequence(logs, h, pid);
    }

    /// What a later transaction counts, from the same state without the
    /// callbacks: resolve, then claim the root order's use.
    function _laterCount(bytes32 pid, CommitmentTypes.Commitment[] memory o)
        internal
        returns (LaterCount memory later)
    {
        uint256 snap = vm.snapshotState();
        vm.prank(buyer);
        core.resolveProcess(pid, o);
        counter.recordClauseUsage(o[0], CLAUSE, CLAUSE_DATA_HASH, new bytes32[](0));
        (later.c, later.d, later.score) = counter.accrualOf(KIND_CLAUSE, CLAUSE, 0);
        assertEq(later.c, 1, "the later transaction counts the process");
        vm.revertToState(snap);
    }

    /// Four transfers, four callbacks: order 0's seller then buyer payout,
    /// then order 1's. Each callback runs before its own transfer.
    function _expectCallbacks(uint256 seller0Before) internal view {
        assertEq(_agent().callbacks(), 4, "one callback per transfer");
        bytes4 resolved = AttestationCoordinator.OrderAlreadyResolved.selector;
        bytes4 notResolved = UsageCounter.OrderNotResolved.selector;
        bytes4 counted = UsageCounter.AlreadyCounted.selector;
        // Callback 0, before order 0's seller payout: both orders open.
        _expectSeen(0, 0, 1, OK, notResolved);
        _expectSeen(0, 1, 1, OK, notResolved);
        // Callback 1, before order 0's buyer payout. Order 0's seller payout
        // has left (2 × 10 + 10), its status still reads 1, and the
        // coordinator accepts an attestation on it.
        assertEq(_agent().sellerBalance(1, 0) - seller0Before, 30 ether, "order 0's seller payout has left");
        _expectSeen(1, 0, 1, OK, notResolved);
        _expectSeen(1, 1, 1, OK, notResolved);
        // Callback 2, before order 1's seller payout: order 0 is finished.
        // The coordinator refuses it and the counter counts it, once.
        _expectSeen(2, 0, 2, resolved, OK);
        _expectSeen(2, 1, 1, OK, notResolved);
        // Callback 3: the process is counted, and no second count lands.
        _expectSeen(3, 0, 2, resolved, counted);
        _expectSeen(3, 1, 1, OK, notResolved);
    }

    /// The resolution's outcome is the one with no callback, and the count
    /// made in the window is the count a later transaction makes.
    function _expectOutcome(bytes32 pid, bytes32[] memory h, uint256[4] memory before, LaterCount memory later)
        internal
        view
    {
        assertEq(token.balanceOf(sellers[0]) - before[1], 30 ether, "seller 0: 2 x 10 + 10, once");
        assertEq(token.balanceOf(sellers[1]) - before[2], 80 ether, "seller 1: 2 x 30 + 20, once");
        assertEq(token.balanceOf(buyer) - before[0], 30 ether, "buyer: 10 + 20, once");
        assertEq(before[3] - token.balanceOf(address(core)), before[3], "FigaroCore holds nothing after");
        assertEq(core.orderStatus(h[0]), 2, "order 0 resolved");
        assertEq(core.orderStatus(h[1]), 2, "order 1 resolved");
        (,,, uint256 open) = core.processes(pid);
        assertEq(open, 0, "no open order");
        (uint64 c, uint64 d, uint256 score) = counter.accrualOf(KIND_CLAUSE, CLAUSE, 0);
        assertEq(c, later.c, "c: as a later transaction");
        assertEq(d, later.d, "d: as a later transaction");
        assertEq(score, later.score, "score: as a later transaction");
        assertTrue(counter.processCounted(KIND_CLAUSE, CLAUSE, pid), "the process is counted");
    }

    /// The window has closed: no attestation on either order, no second count.
    function _expectWindowClosed(CommitmentTypes.Commitment[] memory o) internal {
        for (uint256 i = 0; i < 2; i++) {
            vm.prank(buyer);
            vm.expectRevert(AttestationCoordinator.OrderAlreadyResolved.selector);
            coordinator.attestAsBuyer(o[i], CLAUSE, 1, CLAUSE_DATA_HASH, new bytes32[](0), bytes32(0));
            vm.expectRevert(UsageCounter.AlreadyCounted.selector);
            counter.recordClauseUsage(o[i], CLAUSE, CLAUSE_DATA_HASH, new bytes32[](0));
        }
    }

    /// Every attestation on an order is emitted before that order's
    /// `OrderResolved`; the one count is emitted after order 0's
    /// `OrderResolved` and before order 1's; `ProcessResolved` is last.
    function _expectEventSequence(Vm.Log[] memory logs, bytes32[] memory h, bytes32 pid) internal view {
        bytes32 attestation = AttestationCoordinator.Attestation.selector;
        bytes32 orderResolved = FigaroCore.OrderResolved.selector;
        bytes32 usage = UsageCounter.UsageRecorded.selector;
        uint256[2] memory resolvedAt = [type(uint256).max, type(uint256).max];
        uint256[2] memory attestations;
        uint256 usageAt = type(uint256).max;
        uint256 usages;
        for (uint256 j = 0; j < logs.length; j++) {
            Vm.Log memory l = logs[j];
            if (l.emitter == address(core) && l.topics[0] == orderResolved) {
                resolvedAt[l.topics[1] == h[0] ? 0 : 1] = j;
            } else if (l.emitter == address(coordinator) && l.topics[0] == attestation) {
                uint256 i = l.topics[1] == h[0] ? 0 : 1;
                assertEq(l.topics[1], h[i], "an attestation names an order of the process");
                assertEq(resolvedAt[i], type(uint256).max, "an attestation precedes its order's OrderResolved");
                attestations[i]++;
            } else if (l.emitter == address(counter) && l.topics[0] == usage) {
                usageAt = j;
                usages++;
            }
        }
        assertEq(attestations[0], 2, "order 0: attested at callbacks 0 and 1");
        assertEq(attestations[1], 4, "order 1: attested at every callback");
        assertEq(usages, 1, "one count");
        assertGt(usageAt, resolvedAt[0], "the count follows order 0's OrderResolved");
        assertLt(usageAt, resolvedAt[1], "the count precedes order 1's OrderResolved");
        Vm.Log memory last = logs[logs.length - 1];
        assertEq(last.topics[0], FigaroCore.ProcessResolved.selector, "ProcessResolved is last");
        assertEq(last.topics[1], pid, "ProcessResolved names the process");
    }

    // ═══════════════════════════════════════════════════════════════
    // A resolution that reverts takes the callbacks' work with it
    // ═══════════════════════════════════════════════════════════════

    /// A three-order process resolved with order 0 listed again in the last
    /// place: orders 0 and 1 are paid and marked, their four transfers call
    /// back (an attestation on every open order each time, a count of order
    /// 0 at callback 2), then order 0's second listing reverts the call.
    function test_aResolutionThatReverts_takesTheCallbacksAttestationsAndCountWithIt() public {
        (bytes32 pid, CommitmentTypes.Commitment[] memory o, bytes32[] memory h) = _openProcess(3);
        CommitmentTypes.Commitment[] memory list = new CommitmentTypes.Commitment[](3);
        (list[0], list[1], list[2]) = (o[0], o[1], o[0]);

        uint256[5] memory before = [
            token.balanceOf(buyer),
            token.balanceOf(sellers[0]),
            token.balanceOf(sellers[1]),
            token.balanceOf(sellers[2]),
            token.balanceOf(address(core))
        ];

        _arm(4);
        vm.recordLogs();
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(FigaroCore.OrderNotCommitted.selector, h[0]));
        core.resolveProcess(pid, list);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // The callbacks ran inside the reverted call: their writes are gone.
        assertEq(_agent().callbacks(), 0, "the callbacks' writes reverted");
        (uint8 status,,) = _seen(2, 0);
        assertEq(status, 0, "nothing the callbacks kept remains");
        // The count reverted with the resolution.
        assertFalse(counter.processCounted(KIND_CLAUSE, CLAUSE, pid), "the count reverted");
        (uint64 c, uint64 d, uint256 score) = counter.accrualOf(KIND_CLAUSE, CLAUSE, 0);
        assertEq(c + d + score, 0, "the accrual is untouched");
        // The callbacks did attest and count inside the call: `recordLogs`
        // keeps each log as it is emitted, a reverted frame's included.
        // Callbacks 0 and 1 attest on all three orders, 2 and 3 on orders 1
        // and 2; callback 2 counts order 0. A receipt carries none of them,
        // since the transaction reverted; the state above shows what was undone.
        uint256 attestations;
        uint256 counts;
        for (uint256 j = 0; j < logs.length; j++) {
            if (logs[j].emitter == address(coordinator)) attestations++;
            if (logs[j].emitter == address(counter)) counts++;
        }
        assertEq(attestations, 10, "the callbacks attested inside the reverted call");
        assertEq(counts, 1, "the callbacks counted inside the reverted call");
        // And the resolution itself: every order open, no token moved.
        for (uint256 i = 0; i < 3; i++) {
            assertEq(core.orderStatus(h[i]), 1, "every order still committed");
        }
        assertEq(token.balanceOf(buyer), before[0], "buyer unchanged");
        assertEq(token.balanceOf(sellers[0]), before[1], "seller 0 unchanged");
        assertEq(token.balanceOf(sellers[1]), before[2], "seller 1 unchanged");
        assertEq(token.balanceOf(sellers[2]), before[3], "seller 2 unchanged");
        assertEq(token.balanceOf(address(core)), before[4], "FigaroCore unchanged");

        // The process is as it was: the true list resolves, the token still
        // armed (its arming was undone with the call), and the callbacks
        // count the use once.
        vm.prank(buyer);
        core.resolveProcess(pid, o);
        (c,,) = counter.accrualOf(KIND_CLAUSE, CLAUSE, 0);
        assertEq(c, 1, "counted once");
        vm.expectRevert(UsageCounter.AlreadyCounted.selector);
        counter.recordClauseUsage(o[0], CLAUSE, CLAUSE_DATA_HASH, new bytes32[](0));
    }
}
