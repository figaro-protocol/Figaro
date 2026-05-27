// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../src/FigaroCore.sol";
import "../src/CommitmentTypes.sol";
import "../src/mocks/MockPermitToken.sol";

/// @title GasCeilingTest — Empirical gas ceiling for resolveProcess
/// @notice Builds a process with N sub-orders and binary-searches the
///         maximum N resolvable within the Ethereum 30M gas limit.
///         Also explicitly verifies atomic enforcement (all-or-nothing).
contract GasCeilingTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore internal core;
    MockPermitToken internal token;

    uint256 internal constant BUYER_KEY = 0xB0B;
    address internal buyer;

    uint256 internal constant GAS_BUDGET = 30_000_000;
    uint256 internal constant MAX_ORDERS_TO_BUILD = 1800;
    uint256 internal constant PAYMENT = 1 ether;
    uint256 internal constant INITIAL_BALANCE = 1_000_000 ether;

    // ── Per-order gas anchors (mirror frontend/lib/shared/chainGasCeilings.ts) ──
    // The frontend reads `RESOLVE_GAS_PER_ORDER` and `COMMIT_GAS_PER_ORDER`
    // to derive per-process and per-block ceilings on whatever chain the
    // user is connected to. These constants are the canonical empirical
    // anchors; `scripts/lint-chain-gas.sh` asserts the TS module's
    // matching constants are byte-equal so either side moves the other
    // moves too. If you bump one, bump both.
    uint256 internal constant RESOLVE_GAS_PER_ORDER = 14_000;
    uint256 internal constant COMMIT_GAS_PER_ORDER = 224_000;

    function setUp() public {
        buyer = vm.addr(BUYER_KEY);
        token = new MockPermitToken();
        core = new FigaroCore();

        token.mint(buyer, INITIAL_BALANCE);
        vm.prank(buyer);
        token.approve(address(core), type(uint256).max);
    }

    // ── Helpers ───────────────────────────────────────────────────

    function _typedDataHash(bytes32 structHash) internal view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("FigaroCore"),
                keccak256("3"),
                block.chainid,
                address(core)
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _sign(CommitmentTypes.Commitment memory c, uint256 key) internal view returns (bytes memory) {
        bytes32 digest = _typedDataHash(c.hashStruct());
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    // ── Build a process with N sub-orders, snapshot after each ───

    function _buildProcess(uint256 n)
        internal
        returns (bytes32 processId, CommitmentTypes.Commitment[] memory commitments, uint256[] memory snapshots)
    {
        commitments = new CommitmentTypes.Commitment[](n);
        snapshots = new uint256[](n + 1);

        // ── Root order (seller = fresh address) ─────────────────
        uint256 sellerKey = 0x5E0001;
        address seller = vm.addr(sellerKey);
        token.mint(seller, INITIAL_BALANCE);
        vm.prank(seller);
        token.approve(address(core), type(uint256).max);

        CommitmentTypes.Commitment memory root = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            currency: address(token),
            payment: PAYMENT,
            expectedCumulativeValue: PAYMENT,
            agreementHash: keccak256("root"),
            salt: 1,
            deadline: block.timestamp + 1 hours
        });

        (processId,) = core.commit(root, _sign(root, BUYER_KEY), _sign(root, sellerKey));

        // Keep processId = bytes32(0) in the stored commitment — that's
        // what was signed.  resolveProcess uses the processId parameter,
        // not the commitment's field, for the first hash component.
        commitments[0] = root;
        snapshots[1] = vm.snapshotState();

        // ── Sub-orders ──────────────────────────────────────────
        uint256 cumulative = PAYMENT;
        for (uint256 i = 1; i < n; i++) {
            uint256 subKey = 0x5E0001 + i;
            address subSeller = vm.addr(subKey);
            token.mint(subSeller, INITIAL_BALANCE);
            vm.prank(subSeller);
            token.approve(address(core), type(uint256).max);

            cumulative += PAYMENT;

            CommitmentTypes.Commitment memory sub = CommitmentTypes.Commitment({
                processId: processId,
                buyer: buyer,
                seller: subSeller,
                currency: address(token),
                payment: PAYMENT,
                expectedCumulativeValue: cumulative,
                agreementHash: keccak256(abi.encodePacked("sub-", i)),
                salt: i + 1,
                deadline: block.timestamp + 1 hours
            });

            core.commit(sub, _sign(sub, BUYER_KEY), _sign(sub, subKey));
            commitments[i] = sub;
            snapshots[i + 1] = vm.snapshotState();
        }
    }

    // ── Binary search: max orders resolvable under GAS_BUDGET ───

    function test_Gas_MaxOrdersResolvableUnder30MGas() public {
        (bytes32 processId, CommitmentTypes.Commitment[] memory commitments, uint256[] memory snapshots) =
            _buildProcess(MAX_ORDERS_TO_BUILD);

        uint256 lo = 1;
        uint256 hi = MAX_ORDERS_TO_BUILD;
        uint256 gasUsedAtLo = 0;

        while (lo < hi) {
            uint256 mid = (lo + hi + 1) / 2;
            (bool ok, uint256 gasUsed, uint256 refreshedSnapshotId) =
                _tryResolve(processId, commitments, snapshots[mid], mid);
            snapshots[mid] = refreshedSnapshotId;
            if (ok) {
                lo = mid;
                gasUsedAtLo = gasUsed;
            } else {
                hi = mid - 1;
            }
        }

        emit log_named_uint("resolveProcess_gasBudget", GAS_BUDGET);
        emit log_named_uint("resolveProcess_maxOrders", lo);
        emit log_named_uint("resolveProcess_gasUsed_atMax", gasUsedAtLo);

        // Empirical finding: ~2,145 orders fit in 30M gas (~14k gas/order).
        // This test builds up to 1,800 orders (Foundry's default test-function
        // gas limit constrains how many we can construct). Assert >1,500 to
        // catch per-order cost regressions. Full ceiling verified with:
        //   forge test --match-test test_Gas_MaxOrders -vv --gas-limit 9999999999
        assertGt(lo, 1500, "Must resolve >1500 orders within 30M gas");

        // Anchor the chain-aware ceiling computation in
        // frontend/lib/shared/chainGasCeilings.ts: the per-order gas cost
        // observed here must not exceed `RESOLVE_GAS_PER_ORDER`. If this
        // ever fails, the TS constant + this constant both need bumping
        // (the lint script catches drift between them; this assertion
        // catches the underlying empirical drift).
        uint256 perOrder = gasUsedAtLo / lo;
        assertLe(
            perOrder,
            RESOLVE_GAS_PER_ORDER,
            "Per-order resolve cost exceeds RESOLVE_GAS_PER_ORDER; bump the constant in lockstep with chainGasCeilings.ts"
        );
    }

    // ── Atomic enforcement: partial submission always reverts ────

    function test_AtomicResolution_partialCommitmentListReverts() public {
        uint256 n = 5;
        (bytes32 processId, CommitmentTypes.Commitment[] memory commitments,) = _buildProcess(n);

        // Submit only 3 of 5 commitments — must revert with IncompleteOrderList
        CommitmentTypes.Commitment[] memory subset = new CommitmentTypes.Commitment[](3);
        subset[0] = commitments[0];
        subset[1] = commitments[1];
        subset[2] = commitments[2];

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(FigaroCore.IncompleteOrderList.selector, n, 3));
        core.resolveProcess(processId, subset);
    }

    function test_AtomicResolution_emptyCommitmentListReverts() public {
        uint256 n = 3;
        (bytes32 processId,,) = _buildProcess(n);

        CommitmentTypes.Commitment[] memory empty = new CommitmentTypes.Commitment[](0);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(FigaroCore.IncompleteOrderList.selector, n, 0));
        core.resolveProcess(processId, empty);
    }

    // ── Internal ─────────────────────────────────────────────────

    function _tryResolve(
        bytes32 processId,
        CommitmentTypes.Commitment[] memory commitments,
        uint256 snapshotId,
        uint256 n
    ) internal returns (bool ok, uint256 gasUsed, uint256 refreshedSnapshotId) {
        assertTrue(vm.revertToState(snapshotId), "snapshot restore failed");
        refreshedSnapshotId = vm.snapshotState();

        // Build calldata with first n commitments
        CommitmentTypes.Commitment[] memory slice = new CommitmentTypes.Commitment[](n);
        for (uint256 i = 0; i < n; i++) {
            slice[i] = commitments[i];
        }

        bytes memory data = abi.encodeCall(core.resolveProcess, (processId, slice));
        vm.prank(buyer);
        uint256 gasBefore = gasleft();
        (ok,) = address(core).call{gas: GAS_BUDGET}(data);
        gasUsed = gasBefore - gasleft();
    }
}
