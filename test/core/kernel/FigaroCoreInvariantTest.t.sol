// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {CommonBase} from "forge-std/Base.sol";
import "src/core/kernel/FigaroCore.sol";
import "src/core/kernel/CommitmentTypes.sol";
import "src/mocks/MockPermitToken.sol";
import {SigningTestHelper} from "test/helpers/SigningTestHelper.sol";

/// @title FigaroCoreHandler — the sequences FigaroCoreInvariantTest walks
/// @notice Two buyers and three sellers commit roots and sub-orders and
///         resolve, with at most two processes open at once; a resolved
///         process frees its place for a new root. Each call is one that
///         FigaroCore accepts: the handler signs every commitment with the
///         parties' keys, extends a process at its running total, and has
///         the root buyer resolve with the process's full list. The ghost
///         `openBonds` adds each order's two bonds at commit and removes them
///         at resolve; it never reads FigaroCore.
contract FigaroCoreHandler is CommonBase, StdCheats, StdUtils {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore internal immutable core;
    MockPermitToken internal immutable token;

    uint256[2] internal buyerKeys = [uint256(0xB0B), 0xB0C];
    uint256[3] internal sellerKeys = [uint256(0x5E11), 0x5E12, 0x5E13];

    struct Process {
        bytes32 id;
        uint256 buyerKey;
        uint256 cumulative;
        bool open;
    }

    Process[] internal processes;
    mapping(uint256 => CommitmentTypes.Commitment[]) internal ordersOf;
    uint256 internal nextSalt = 1;

    uint256 public openBonds;
    uint256 public commits;
    uint256 public resolves;
    /// @dev Sub-orders committed, by the walk or by `closeOut`.
    uint256 public subCommits;
    /// @dev The most processes open at one time.
    uint256 public maxOpen;

    constructor(FigaroCore core_, MockPermitToken token_) {
        core = core_;
        token = token_;
    }

    // ── Actions ─────────────────────────────────────────────────────

    /// Opens a root when fewer than two processes are open.
    function commitRoot(uint256 buyerSeed, uint256 sellerSeed, uint256 payment) external {
        if (_openCount() >= 2) return;
        _commitRoot(buyerSeed, sellerSeed, payment);
    }

    /// Extends an open process; with none open, opens a root instead, so
    /// every call of the walk commits or resolves and no run is empty.
    function commitSub(uint256 processSeed, uint256 sellerSeed, uint256 payment) external {
        (bool found, uint256 at) = _pickOpen(processSeed);
        if (found) _commitSub(at, sellerSeed, payment);
        else _commitRoot(processSeed, sellerSeed, payment);
    }

    /// Resolves an open process; with none open, opens a root instead.
    function resolve(uint256 processSeed) external {
        (bool found, uint256 at) = _pickOpen(processSeed);
        if (found) _resolve(at);
        else _commitRoot(processSeed, processSeed >> 8, processSeed >> 16);
    }

    /// The deterministic close of a run, through the real Core: when the walk
    /// committed no sub-order, one is committed; when it never held two
    /// processes open at once, roots are opened until it does; then the root
    /// buyer resolves every open process. Whatever the seed drew, every run
    /// thereby commits a root and a sub-order, holds two processes open at
    /// once, and resolves, and the invariants are asserted on the closed state.
    function closeOut() external {
        if (subCommits == 0) {
            (bool found, uint256 at) = _pickOpen(0);
            if (!found) {
                _commitRoot(0, 0, 1 ether);
                at = processes.length - 1;
            }
            _commitSub(at, 1, 1 ether);
        }
        while (maxOpen < 2) {
            _commitRoot(maxOpen + 1, maxOpen + 2, 1 ether);
        }
        for (uint256 i = 0; i < processes.length; i++) {
            if (processes[i].open) _resolve(i);
        }
    }

    // ── The actions' bodies ─────────────────────────────────────────

    function _commitRoot(uint256 buyerSeed, uint256 sellerSeed, uint256 payment) internal {
        payment = bound(payment, 1, 1_000 ether);
        uint256 buyerKey = buyerKeys[buyerSeed % 2];
        uint256 sellerKey = sellerKeys[sellerSeed % 3];

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: vm.addr(buyerKey),
            seller: vm.addr(sellerKey),
            token: address(token),
            payment: payment,
            runningTotal: payment,
            checkoutHash: keccak256(abi.encode("invariant-root", nextSalt)),
            salt: nextSalt++,
            commitDeadline: block.timestamp + 1 hours
        });
        (bytes32 processId,) = _commit(c, buyerKey, sellerKey);

        processes.push(Process({id: processId, buyerKey: buyerKey, cumulative: payment, open: true}));
        ordersOf[processes.length - 1].push(c);
        uint256 open = _openCount();
        if (open > maxOpen) maxOpen = open;
    }

    function _commitSub(uint256 at, uint256 sellerSeed, uint256 payment) internal {
        payment = bound(payment, 1, 1_000 ether);
        Process storage p = processes[at];
        uint256 sellerKey = sellerKeys[sellerSeed % 3];

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: p.id,
            buyer: vm.addr(p.buyerKey),
            seller: vm.addr(sellerKey),
            token: address(token),
            payment: payment,
            runningTotal: p.cumulative + payment,
            checkoutHash: keccak256(abi.encode("invariant-sub", nextSalt)),
            salt: nextSalt++,
            commitDeadline: block.timestamp + 1 hours
        });
        _commit(c, p.buyerKey, sellerKey);

        p.cumulative = c.runningTotal;
        ordersOf[at].push(c);
        subCommits++;
    }

    function _resolve(uint256 at) internal {
        Process storage p = processes[at];
        CommitmentTypes.Commitment[] memory list = ordersOf[at];

        vm.prank(vm.addr(p.buyerKey));
        core.resolveProcess(p.id, list);

        for (uint256 i = 0; i < list.length; i++) {
            openBonds -= 2 * list[i].payment + 2 * list[i].runningTotal;
        }
        p.open = false;
        resolves++;
    }

    // ── Reads for the invariants ────────────────────────────────────

    function processCount() external view returns (uint256) {
        return processes.length;
    }

    function processAt(uint256 at) external view returns (bytes32 id, bool open, uint256 orderCount) {
        return (processes[at].id, processes[at].open, ordersOf[at].length);
    }

    /// What resolving every order of the process pays out, from the
    /// commitments as signed: each seller 2 × its running total + the
    /// payment, the buyer the payment.
    function payoutOf(uint256 at) external view returns (uint256 total) {
        CommitmentTypes.Commitment[] storage list = ordersOf[at];
        for (uint256 i = 0; i < list.length; i++) {
            total += 2 * list[i].runningTotal + list[i].payment + list[i].payment;
        }
    }

    /// The sum of the payments of every order committed to the process.
    function paymentsOf(uint256 at) external view returns (uint256 total) {
        CommitmentTypes.Commitment[] storage list = ordersOf[at];
        for (uint256 i = 0; i < list.length; i++) {
            total += list[i].payment;
        }
    }

    function wallets() external view returns (address[] memory all) {
        all = new address[](5);
        all[0] = vm.addr(buyerKeys[0]);
        all[1] = vm.addr(buyerKeys[1]);
        for (uint256 i = 0; i < 3; i++) {
            all[2 + i] = vm.addr(sellerKeys[i]);
        }
    }

    // ── Internals ───────────────────────────────────────────────────

    function _commit(CommitmentTypes.Commitment memory c, uint256 buyerKey, uint256 sellerKey)
        internal
        returns (bytes32 processId, bytes32 orderHash)
    {
        bytes32 digest = SigningTestHelper.typedDataHash(core.DOMAIN_SEPARATOR(), c.hashStruct());
        (processId, orderHash) =
            core.commit(c, SigningTestHelper.sign(buyerKey, digest), SigningTestHelper.sign(sellerKey, digest));
        openBonds += 2 * c.payment + 2 * c.runningTotal;
        commits++;
    }

    function _openCount() internal view returns (uint256 n) {
        for (uint256 i = 0; i < processes.length; i++) {
            if (processes[i].open) n++;
        }
    }

    function _pickOpen(uint256 seed) internal view returns (bool found, uint256 at) {
        uint256 n = _openCount();
        if (n == 0) return (false, 0);
        uint256 k = seed % n;
        for (uint256 i = 0; i < processes.length; i++) {
            if (!processes[i].open) continue;
            if (k == 0) return (true, i);
            k--;
        }
    }
}

/// @title FigaroCoreInvariantTest — conservation and solvency over sequences
/// @notice The Halmos checks hold conservation and solvency after one root
///         commit. This walks sequences of commits and resolutions across two
///         open processes, two buyers and three sellers, and after every step
///         asserts: no token is created or lost (the five wallets and
///         FigaroCore add up to what was minted); FigaroCore holds exactly
///         the bonds of the open orders; it holds enough to resolve every open
///         process, counted from the signed commitments; each open
///         process's open-order count is its number of committed orders; and
///         each process's running total is the sum of its orders' payments.
/// forge-config: default.invariant.runs = 64
/// forge-config: default.invariant.depth = 32
/// forge-config: default.invariant.fail-on-revert = true
contract FigaroCoreInvariantTest is Test {
    FigaroCore internal core;
    MockPermitToken internal token;
    FigaroCoreHandler internal handler;

    uint256 internal constant EACH = 1_000_000_000 ether;
    uint256 internal minted;
    uint256 internal supply;

    function setUp() public {
        core = new FigaroCore();
        token = new MockPermitToken();
        handler = new FigaroCoreHandler(core, token);

        address[] memory all = handler.wallets();
        for (uint256 i = 0; i < all.length; i++) {
            token.mint(all[i], EACH);
            minted += EACH;
            vm.prank(all[i]);
            token.approve(address(core), type(uint256).max);
        }
        supply = token.totalSupply();
        targetContract(address(handler));
        bytes4[] memory actions = new bytes4[](3);
        actions[0] = FigaroCoreHandler.commitRoot.selector;
        actions[1] = FigaroCoreHandler.commitSub.selector;
        actions[2] = FigaroCoreHandler.resolve.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: actions}));
    }

    /// The walk is not empty, whatever the seed: every action commits or
    /// resolves (a sub-order or a resolve with no process open opens a root),
    /// so the walk's first call commits. The run then closes through the real
    /// Core (`FigaroCoreHandler.closeOut`): it holds a sub-order and two open
    /// processes by then, and every open process resolves. The invariants are
    /// asserted once more on the closed state, where FigaroCore holds nothing.
    function afterInvariant() public {
        assertGt(handler.commits(), 0, "the walk committed");
        handler.closeOut();

        invariant_noTokenIsCreatedOrLost();
        invariant_coreHoldsExactlyTheOpenBonds();
        invariant_coreCanResolveEveryOpenProcess();
        invariant_runningTotalIsTheSumOfThePayments();

        assertGt(handler.resolves(), 0, "the run resolved");
        assertGt(handler.subCommits(), 0, "the run committed a sub-order");
        assertEq(handler.maxOpen(), 2, "the run held two processes open at once");
        assertEq(handler.openBonds(), 0, "no bond is open once every process resolved");
        assertEq(token.balanceOf(address(core)), 0, "FigaroCore holds nothing once every process resolved");
    }

    function invariant_noTokenIsCreatedOrLost() public view {
        address[] memory all = handler.wallets();
        uint256 sum = token.balanceOf(address(core));
        for (uint256 i = 0; i < all.length; i++) {
            sum += token.balanceOf(all[i]);
        }
        assertEq(sum, minted, "the wallets and FigaroCore add up to what was minted");
        assertEq(token.totalSupply(), supply, "no token minted or burned");
    }

    function invariant_coreHoldsExactlyTheOpenBonds() public view {
        assertEq(token.balanceOf(address(core)), handler.openBonds(), "FigaroCore holds the open orders' bonds");
    }

    function invariant_coreCanResolveEveryOpenProcess() public view {
        uint256 owed;
        for (uint256 i = 0; i < handler.processCount(); i++) {
            (bytes32 id, bool open, uint256 orderCount) = handler.processAt(i);
            (,,, uint256 active) = core.processes(id);
            if (!open) {
                assertEq(active, 0, "a resolved process has no open order");
                continue;
            }
            assertEq(active, orderCount, "the open-order count is the committed orders");
            owed += handler.payoutOf(i);
        }
        assertGe(token.balanceOf(address(core)), owed, "FigaroCore can pay every open process");
    }

    function invariant_runningTotalIsTheSumOfThePayments() public view {
        for (uint256 i = 0; i < handler.processCount(); i++) {
            (bytes32 id,,) = handler.processAt(i);
            (,, uint256 cumulative,) = core.processes(id);
            assertEq(cumulative, handler.paymentsOf(i), "the running total is the sum of the payments");
        }
    }
}
