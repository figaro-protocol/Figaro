// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "src/core/kernel/FigaroCore.sol";
import "src/core/kernel/CommitmentTypes.sol";
import "src/mocks/MockPermitToken.sol";

/// @title KernelTransitionVectorsTest — the state-transition lock between the
///        kernel and its Rust mirror
/// @notice The batch path resolves through `prover/lib/src/kernel.rs`, a mirror
///         of `FigaroCore` that must compute the same transition: the same
///         process ids and order hashes, the same bonds pulled at commit, the
///         same payouts at resolution, the same accumulator and active count.
///         Until now the mirror's payout expectations were hand-written
///         constants. This test RUNS the scenarios below through the frozen
///         kernel and writes what happened — every commitment, every party's
///         deposit and payout, every process's final state — to
///         `test/fixtures/kernel-transition-vectors.json`;
///         `prover/lib/tests/transition_vectors.rs` replays the same
///         commitments through the mirror and asserts every figure.
///
///         Two jobs, like the EIP-712 and Merkle locks:
///           1. `HARVEST_KERNEL_VECTORS=true` regenerates the fixture.
///           2. Otherwise the run must reproduce the frozen bytes — the kernel
///              is frozen, so a diff here is a harness change, never a kernel one.
///
///         The token and kernel deploy at the addresses the Rust mirror's
///         parity vectors pin (the domain separator binds the kernel address),
///         and the keys are the parity keys, so the fixture's ids are
///         comparable across the two languages without translation.
contract KernelTransitionVectorsTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    string internal constant FIXTURE = "test/fixtures/kernel-transition-vectors.json";
    address internal constant PINNED_TOKEN = 0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f;
    address internal constant PINNED_CORE = 0x2e234DAe75C793f67A35089C9d99245E1C58470b;

    uint256 internal constant BUYER_KEY = 0xB0B;
    uint256 internal constant SELLER1_KEY = 0x5E11;
    uint256 internal constant SELLER2_KEY = 0x5E12;
    uint256 internal constant SELLER3_KEY = 0x5E13;
    uint256 internal constant DEADLINE = 2000;

    FigaroCore internal core;
    MockPermitToken internal token;
    address internal buyer;
    address internal seller1;
    address internal seller2;
    address internal seller3;

    /// One order of a scenario: its seller (and key), its payment, and the
    /// index of the order that roots its process (itself for a root).
    struct Order {
        address seller;
        uint256 sellerKey;
        uint256 payment;
        uint256 rootIndex;
    }

    function setUp() public {
        buyer = vm.addr(BUYER_KEY);
        seller1 = vm.addr(SELLER1_KEY);
        seller2 = vm.addr(SELLER2_KEY);
        seller3 = vm.addr(SELLER3_KEY);

        token = new MockPermitToken();
        core = new FigaroCore();
        assertEq(address(token), PINNED_TOKEN, "the token deploys at the parity address");
        assertEq(address(core), PINNED_CORE, "the kernel deploys at the parity address");

        address[4] memory parties = [buyer, seller1, seller2, seller3];
        for (uint256 i = 0; i < parties.length; i++) {
            token.mint(parties[i], 100_000 ether);
            vm.prank(parties[i]);
            token.approve(address(core), type(uint256).max);
        }
    }

    // ── The scenarios ────────────────────────────────────────────

    function test_transitionVectors_matchTheFrozenFixture() public {
        string memory top = "top";
        vm.serializeString(top, "chainId", vm.toString(block.chainid));
        vm.serializeAddress(top, "verifyingContract", address(core));
        vm.serializeAddress(top, "token", address(token));
        vm.serializeString(top, "scenarioCount", "6");

        Order[] memory o;

        // 0: one root order, left open — the bonds sit in the kernel.
        o = new Order[](1);
        o[0] = Order(seller1, SELLER1_KEY, 100 ether, 0);
        vm.serializeString(top, "s0", _run(0, "root-open", o, false));

        // 1: root and one sub-order, resolved — the parity vectors' shape.
        o = new Order[](2);
        o[0] = Order(seller1, SELLER1_KEY, 100 ether, 0);
        o[1] = Order(seller2, SELLER2_KEY, 50 ether, 0);
        vm.serializeString(top, "s1", _run(1, "root-and-sub-resolved", o, true));

        // 2: three sellers along one process — the accumulator across links.
        o = new Order[](3);
        o[0] = Order(seller1, SELLER1_KEY, 10 ether, 0);
        o[1] = Order(seller2, SELLER2_KEY, 20 ether, 0);
        o[2] = Order(seller3, SELLER3_KEY, 15 ether, 0);
        vm.serializeString(top, "s2", _run(2, "three-links-resolved", o, true));

        // 3: one seller on two orders of the same process — positions aggregate.
        o = new Order[](2);
        o[0] = Order(seller1, SELLER1_KEY, 7 ether, 0);
        o[1] = Order(seller1, SELLER1_KEY, 5 ether, 0);
        vm.serializeString(top, "s3", _run(3, "one-seller-two-orders", o, true));

        // 4: buyer and seller are the same wallet (DESIGN_DECISIONS #3) — net zero.
        o = new Order[](1);
        o[0] = Order(buyer, BUYER_KEY, 3 ether, 0);
        vm.serializeString(top, "s4", _run(4, "self-deal", o, true));

        // 5: two processes of the same buyer in one batch, both resolved.
        o = new Order[](3);
        o[0] = Order(seller1, SELLER1_KEY, 4 ether, 0);
        o[1] = Order(seller2, SELLER2_KEY, 6 ether, 1);
        o[2] = Order(seller3, SELLER3_KEY, 2 ether, 1);
        string memory json = vm.serializeString(top, "s5", _run(5, "two-processes", o, true));

        if (vm.envOr("HARVEST_KERNEL_VECTORS", false)) {
            vm.writeFile(FIXTURE, json);
            return;
        }
        assertEq(
            keccak256(bytes(json)),
            keccak256(bytes(vm.readFile(FIXTURE))),
            "the kernel reproduces the frozen fixture; re-harvest deliberately with HARVEST_KERNEL_VECTORS=true"
        );
    }

    // ── The runner ───────────────────────────────────────────────

    /// One scenario's state, in memory so the phases below stay shallow on
    /// the stack (the hook builds without --via-ir).
    struct Run {
        string key;
        string name;
        Order[] orders;
        bool resolve;
        CommitmentTypes.Commitment[] cs;
        bytes32[] processIds;
        bytes32[] orderHashes;
        address[] parties;
        uint256[] before;
        uint256[] afterCommit;
        uint256[] afterResolve;
        uint256 coreBefore;
    }

    /// Runs one scenario on the live kernel and returns its JSON: the
    /// commitments as committed (with the ids the kernel returned), each
    /// party's deposit at commit and payout at resolution, the kernel's
    /// balance delta, and each process's final accumulator and active count.
    function _run(uint256 idx, string memory name, Order[] memory orders, bool resolve)
        internal
        returns (string memory)
    {
        Run memory r;
        r.key = string.concat("s", vm.toString(idx));
        r.name = name;
        r.orders = orders;
        r.resolve = resolve;
        r.parties = _parties(orders);
        r.before = _balances(r.parties);
        r.coreBefore = token.balanceOf(address(core));
        r.cs = new CommitmentTypes.Commitment[](orders.length);
        r.processIds = new bytes32[](orders.length);
        r.orderHashes = new bytes32[](orders.length);

        _commitAll(r);
        r.afterCommit = _balances(r.parties);
        r.afterResolve = r.afterCommit;
        if (resolve) {
            _resolveAll(r);
            r.afterResolve = _balances(r.parties);
        }

        vm.serializeString(r.key, "name", name);
        vm.serializeString(r.key, "resolve", resolve ? "true" : "false");
        _serializeOrders(r);
        _serializeParties(r);
        return _serializeProcesses(r);
    }

    function _commitAll(Run memory r) internal {
        uint256[] memory cumulative = new uint256[](r.orders.length);
        for (uint256 i = 0; i < r.orders.length; i++) {
            Order memory ord = r.orders[i];
            bool isRoot = ord.rootIndex == i;
            cumulative[i] = isRoot ? ord.payment : cumulative[ord.rootIndex] + ord.payment;
            if (!isRoot) cumulative[ord.rootIndex] = cumulative[i];
            r.cs[i] = CommitmentTypes.Commitment({
                processId: isRoot ? bytes32(0) : r.processIds[ord.rootIndex],
                buyer: buyer,
                seller: ord.seller,
                currency: address(token),
                payment: ord.payment,
                expectedCumulativeValue: cumulative[i],
                agreementHash: keccak256(abi.encodePacked("agreement-", r.name, "-", vm.toString(i))),
                salt: i + 1,
                deadline: DEADLINE
            });
            (r.processIds[i], r.orderHashes[i]) =
                core.commit(r.cs[i], _sign(r.cs[i], BUYER_KEY), _sign(r.cs[i], ord.sellerKey));
        }
    }

    function _resolveAll(Run memory r) internal {
        for (uint256 root = 0; root < r.orders.length; root++) {
            if (r.orders[root].rootIndex != root) continue;
            uint256 n;
            for (uint256 i = 0; i < r.orders.length; i++) {
                if (r.orders[i].rootIndex == root) n++;
            }
            CommitmentTypes.Commitment[] memory list = new CommitmentTypes.Commitment[](n);
            uint256 k;
            for (uint256 i = 0; i < r.orders.length; i++) {
                if (r.orders[i].rootIndex == root) list[k++] = r.cs[i];
            }
            vm.prank(buyer);
            core.resolveProcess(r.processIds[root], list);
        }
    }

    function _serializeOrders(Run memory r) internal {
        vm.serializeString(r.key, "orderCount", vm.toString(r.orders.length));
        for (uint256 i = 0; i < r.orders.length; i++) {
            string memory ok = string.concat(r.key, ".o", vm.toString(i));
            CommitmentTypes.Commitment memory c = r.cs[i];
            vm.serializeBytes32(ok, "processId", r.processIds[i]);
            vm.serializeBytes32(ok, "orderHash", r.orderHashes[i]);
            vm.serializeBytes32(ok, "commitmentProcessId", c.processId);
            vm.serializeAddress(ok, "buyer", c.buyer);
            vm.serializeAddress(ok, "seller", c.seller);
            vm.serializeAddress(ok, "currency", c.currency);
            vm.serializeString(ok, "payment", vm.toString(c.payment));
            vm.serializeString(ok, "expectedCumulativeValue", vm.toString(c.expectedCumulativeValue));
            vm.serializeBytes32(ok, "agreementHash", c.agreementHash);
            vm.serializeString(ok, "salt", vm.toString(c.salt));
            string memory oj = vm.serializeString(ok, "deadline", vm.toString(c.deadline));
            vm.serializeString(r.key, string.concat("o", vm.toString(i)), oj);
        }
    }

    function _serializeParties(Run memory r) internal {
        vm.serializeString(r.key, "partyCount", vm.toString(r.parties.length));
        for (uint256 p = 0; p < r.parties.length; p++) {
            string memory pk = string.concat(r.key, ".p", vm.toString(p));
            vm.serializeAddress(pk, "address", r.parties[p]);
            vm.serializeString(pk, "deposit", vm.toString(r.before[p] - r.afterCommit[p]));
            string memory pj = vm.serializeString(pk, "payout", vm.toString(r.afterResolve[p] - r.afterCommit[p]));
            vm.serializeString(r.key, string.concat("p", vm.toString(p)), pj);
        }
        uint256 coreAfter = token.balanceOf(address(core));
        vm.serializeString(
            r.key,
            "kernelDelta",
            coreAfter >= r.coreBefore
                ? vm.toString(coreAfter - r.coreBefore)
                : string.concat("-", vm.toString(r.coreBefore - coreAfter))
        );
    }

    function _serializeProcesses(Run memory r) internal returns (string memory out) {
        uint256 processCount;
        for (uint256 root = 0; root < r.orders.length; root++) {
            if (r.orders[root].rootIndex == root) processCount++;
        }
        out = vm.serializeString(r.key, "processCount", vm.toString(processCount));
        uint256 pc;
        for (uint256 root = 0; root < r.orders.length; root++) {
            if (r.orders[root].rootIndex != root) continue;
            (,, uint256 cumulativeValue, uint256 activeOrderCount) = core.processes(r.processIds[root]);
            string memory rk = string.concat(r.key, ".pr", vm.toString(pc));
            vm.serializeBytes32(rk, "processId", r.processIds[root]);
            vm.serializeString(rk, "cumulativeValue", vm.toString(cumulativeValue));
            string memory rj = vm.serializeString(rk, "activeOrderCount", vm.toString(activeOrderCount));
            out = vm.serializeString(r.key, string.concat("pr", vm.toString(pc)), rj);
            pc++;
        }
    }

    // ── Helpers ──────────────────────────────────────────────────

    /// The buyer and every distinct seller, in first-seen order.
    function _parties(Order[] memory orders) internal view returns (address[] memory) {
        address[] memory tmp = new address[](orders.length + 1);
        uint256 n;
        tmp[n++] = buyer;
        for (uint256 i = 0; i < orders.length; i++) {
            bool seen;
            for (uint256 j = 0; j < n; j++) {
                if (tmp[j] == orders[i].seller) seen = true;
            }
            if (!seen) tmp[n++] = orders[i].seller;
        }
        address[] memory parties = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            parties[i] = tmp[i];
        }
        return parties;
    }

    function _balances(address[] memory parties) internal view returns (uint256[] memory b) {
        b = new uint256[](parties.length);
        for (uint256 i = 0; i < parties.length; i++) {
            b[i] = token.balanceOf(parties[i]);
        }
    }

    /// The domain is read from the kernel by external call, never rebuilt
    /// from block.chainid here (see FigaroCoreTest's chain-id test).
    function _sign(CommitmentTypes.Commitment memory c, uint256 privateKey) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", core.DOMAIN_SEPARATOR(), c.hashStruct()));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
