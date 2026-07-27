// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FigaroCore} from "src/kernel/FigaroCore.sol";
import {CommitmentTypes} from "src/kernel/CommitmentTypes.sol";
import {EchidnaToken} from "./EchidnaToken.sol";

// ── HEVM cheatcodes (Echidna 2.0+ / Foundry) ────────────────────────

interface IHevm {
    function sign(uint256 privateKey, bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
    function addr(uint256 privateKey) external pure returns (address);
    function prank(address msgSender) external;
}

// ── Test token with owner-controlled approvals ───────────────────────

/// @dev Actors here are EOAs (private keys for EIP-712 signing). The
///      harness sets allowances via approveFor() at deploy time.
contract EchidnaApproveToken is EchidnaToken {
    constructor(address owner) EchidnaToken(owner) {}

    function approveFor(address owner_, address spender, uint256 amount) external onlyOwner {
        _approve(owner_, spender, amount);
    }
}

// ── Echidna Fuzzer ───────────────────────────────────────────────────

/// @title EchidnaFuzzer — Property-based fuzzing for FigaroCore
/// @notice Fuzz-tests the protocol kernel via HEVM-signed commitments.
///
///         Kernel invariants exercised (7):
///         - SOLV:  core token balance >= sum of outstanding bonds
///         - COUNT: activeOrderCount matches actual committed order count
///         - CUM:   process accumulator == sum of all order payments
///         - MONO:  orderStatus only progresses forward (0 → 1 → 2)
///         - BUYER: non-buyer cannot resolve (buyer dominance)
///         - ATOM:  incomplete commitment list cannot resolve
///         - CONS:  token conservation — total supply is constant
contract EchidnaFuzzer {
    using CommitmentTypes for CommitmentTypes.Commitment;

    IHevm private constant hevm = IHevm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    uint256 private constant MAX_PAYMENT = 10_000 ether;
    uint256 private constant MAX_MINT = 1_000_000 ether;
    uint256 private constant MAX_TRACKED_ORDERS = 128;
    uint256 private constant MAX_TRACKED_PROCESSES = 32;

    // Known test private keys (HEVM-derived addresses)
    uint256 private constant BUYER_KEY = 0xB0001;
    uint256 private constant BUYER2_KEY = 0xB0002;
    uint256 private constant SELLER1_KEY = 0xA0001;
    uint256 private constant SELLER2_KEY = 0xA0002;
    uint256 private constant SELLER3_KEY = 0xA0003;

    FigaroCore public immutable core;
    EchidnaApproveToken public immutable token;

    address public immutable buyer;
    address public immutable buyer2;
    address[3] public sellers;
    uint256[3] private sellerKeys;

    bytes32 private immutable domainSep;

    uint256 public immutable initialTokenSupply;

    // ── Tracking state ──────────────────────────────────────────

    struct TrackedOrder {
        bytes32 orderHash;
        bytes32 processId;
        CommitmentTypes.Commitment commitment;
    }

    TrackedOrder[] private trackedOrders;
    bytes32[] private processIds;

    /// @dev Highest observed orderStatus per order. Must be monotonically
    ///      non-decreasing: 0 → 1 → 2.
    mapping(bytes32 => uint8) private maxObservedStatus;

    uint256 private saltCounter;

    /// @dev Negative-test violation flags.
    bool private buyerDominanceViolated;
    bool private atomicResolutionViolated;

    // ── Constructor ─────────────────────────────────────────────

    constructor() {
        core = new FigaroCore();
        token = new EchidnaApproveToken(address(this));

        buyer = hevm.addr(BUYER_KEY);
        buyer2 = hevm.addr(BUYER2_KEY);
        sellerKeys = [SELLER1_KEY, SELLER2_KEY, SELLER3_KEY];
        sellers[0] = hevm.addr(SELLER1_KEY);
        sellers[1] = hevm.addr(SELLER2_KEY);
        sellers[2] = hevm.addr(SELLER3_KEY);

        // EIP-712 domain separator (matches FigaroCore V5: "FigaroCore", "3")
        domainSep = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("FigaroCore"),
                keccak256("3"),
                block.chainid,
                address(core)
            )
        );

        // Fund all participants and approve the core
        uint256 perActor = 100_000_000 ether;
        token.mint(buyer, perActor);
        token.approveFor(buyer, address(core), type(uint256).max);

        token.mint(buyer2, perActor);
        token.approveFor(buyer2, address(core), type(uint256).max);

        for (uint256 i = 0; i < 3; i++) {
            token.mint(sellers[i], perActor);
            token.approveFor(sellers[i], address(core), type(uint256).max);
        }

        initialTokenSupply = token.totalSupply();
    }

    // ═════════════════════════════════════════════════════════════
    // ACTIONS (fuzzed by Echidna)
    // ═════════════════════════════════════════════════════════════

    /// @notice Replenish buyer funds.
    function action_mint_buyer(uint256 amount) external {
        token.mint(buyer, _bound(amount, 0, MAX_MINT));
    }

    /// @notice Replenish buyer2 funds.
    function action_mint_buyer2(uint256 amount) external {
        token.mint(buyer2, _bound(amount, 0, MAX_MINT));
    }

    /// @notice Replenish seller funds.
    function action_mint_seller(uint8 sellerIdx, uint256 amount) external {
        token.mint(sellers[sellerIdx % 3], _bound(amount, 0, MAX_MINT));
    }

    /// @notice Create a new root order with buyer2 (cross-buyer coverage).
    function action_commitRoot_buyer2(uint8 sellerIdx, uint256 payment) external {
        if (trackedOrders.length >= MAX_TRACKED_ORDERS) return;
        if (processIds.length >= MAX_TRACKED_PROCESSES) return;

        uint256 p = _bound(payment, 1, MAX_PAYMENT);
        uint256 sIdx = sellerIdx % 3;
        address seller = sellers[sIdx];

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer2,
            seller: seller,
            currency: address(token),
            payment: p,
            expectedCumulativeValue: p,
            agreementHash: keccak256(abi.encodePacked("fuzz-b2", saltCounter)),
            salt: ++saltCounter,
            deadline: block.timestamp + 1 hours
        });

        bytes32 structHash = c.hashStruct();
        bytes32 digest = _digest(structHash);

        bytes memory buyerSig = _sign(BUYER2_KEY, digest);
        bytes memory sellerSig = _sign(sellerKeys[sIdx], digest);

        try core.commit(c, buyerSig, sellerSig) returns (bytes32 processId, bytes32 orderHash) {
            processIds.push(processId);
            trackedOrders.push(TrackedOrder({orderHash: orderHash, processId: processId, commitment: c}));
            _updateStatus(orderHash);
        } catch {}
    }

    /// @notice Create a new root order (new process).
    function action_commitRoot(uint8 sellerIdx, uint256 payment) external {
        if (trackedOrders.length >= MAX_TRACKED_ORDERS) return;
        if (processIds.length >= MAX_TRACKED_PROCESSES) return;

        uint256 p = _bound(payment, 1, MAX_PAYMENT);
        uint256 sIdx = sellerIdx % 3;
        address seller = sellers[sIdx];

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: bytes32(0), // root order
            buyer: buyer,
            seller: seller,
            currency: address(token),
            payment: p,
            expectedCumulativeValue: p, // root: cumVal == payment
            agreementHash: keccak256(abi.encodePacked("fuzz", saltCounter)),
            salt: ++saltCounter,
            deadline: block.timestamp + 1 hours
        });

        bytes32 structHash = c.hashStruct();
        bytes32 digest = _digest(structHash);

        bytes memory buyerSig = _sign(BUYER_KEY, digest);
        bytes memory sellerSig = _sign(sellerKeys[sIdx], digest);

        try core.commit(c, buyerSig, sellerSig) returns (bytes32 processId, bytes32 orderHash) {
            processIds.push(processId);
            trackedOrders.push(TrackedOrder({orderHash: orderHash, processId: processId, commitment: c}));
            _updateStatus(orderHash);
        } catch {}
    }

    /// @notice Add a sub-order to an existing process.
    function action_commitSub(uint8 processIdx, uint8 sellerIdx, uint256 payment) external {
        if (processIds.length == 0) return;
        if (trackedOrders.length >= MAX_TRACKED_ORDERS) return;

        bytes32 processId = processIds[processIdx % processIds.length];
        uint256 p = _bound(payment, 1, MAX_PAYMENT);
        uint256 sIdx = sellerIdx % 3;
        address seller = sellers[sIdx];

        // Read current accumulator to build a valid commitment
        (,, uint256 currentCum,) = core.processes(processId);
        uint256 expectedCum = currentCum + p;

        CommitmentTypes.Commitment memory c = CommitmentTypes.Commitment({
            processId: processId, // sub-order: non-zero processId
            buyer: buyer,
            seller: seller,
            currency: address(token),
            payment: p,
            expectedCumulativeValue: expectedCum,
            agreementHash: keccak256(abi.encodePacked("fuzz-sub", saltCounter)),
            salt: ++saltCounter,
            deadline: block.timestamp + 1 hours
        });

        bytes32 structHash = c.hashStruct();
        bytes32 digest = _digest(structHash);

        bytes memory buyerSig = _sign(BUYER_KEY, digest);
        bytes memory sellerSig = _sign(sellerKeys[sIdx], digest);

        try core.commit(c, buyerSig, sellerSig) returns (bytes32, bytes32 orderHash) {
            trackedOrders.push(TrackedOrder({orderHash: orderHash, processId: processId, commitment: c}));
            _updateStatus(orderHash);
        } catch {}
    }

    /// @notice Create a root + sub-order in one action, guaranteeing
    ///         a process with activeOrderCount >= 2.
    function action_commitRootAndSub(uint256 payment1, uint256 payment2) external {
        if (trackedOrders.length + 2 > MAX_TRACKED_ORDERS) return;
        if (processIds.length >= MAX_TRACKED_PROCESSES) return;

        uint256 p1 = _bound(payment1, 1, MAX_PAYMENT / 2);
        uint256 p2 = _bound(payment2, 1, MAX_PAYMENT / 2);

        // ── Root order ──
        CommitmentTypes.Commitment memory root = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: sellers[0],
            currency: address(token),
            payment: p1,
            expectedCumulativeValue: p1,
            agreementHash: keccak256(abi.encodePacked("fuzz-multi", saltCounter)),
            salt: ++saltCounter,
            deadline: block.timestamp + 1 hours
        });

        bytes32 rootStructHash = root.hashStruct();
        bytes32 rootDigest = _digest(rootStructHash);

        bytes32 processId;
        bytes32 rootHash;
        try core.commit(root, _sign(BUYER_KEY, rootDigest), _sign(SELLER1_KEY, rootDigest)) returns (
            bytes32 pid, bytes32 oh
        ) {
            processId = pid;
            rootHash = oh;
        } catch {
            return;
        }
        processIds.push(processId);
        trackedOrders.push(TrackedOrder({orderHash: rootHash, processId: processId, commitment: root}));
        _updateStatus(rootHash);

        // ── Sub-order (same process, different seller) ──
        (,, uint256 currentCum,) = core.processes(processId);
        uint256 expectedCum = currentCum + p2;

        CommitmentTypes.Commitment memory sub = CommitmentTypes.Commitment({
            processId: processId,
            buyer: buyer,
            seller: sellers[1],
            currency: address(token),
            payment: p2,
            expectedCumulativeValue: expectedCum,
            agreementHash: keccak256(abi.encodePacked("fuzz-multi-sub", saltCounter)),
            salt: ++saltCounter,
            deadline: block.timestamp + 1 hours
        });

        bytes32 subStructHash = sub.hashStruct();
        bytes32 subDigest = _digest(subStructHash);

        try core.commit(sub, _sign(BUYER_KEY, subDigest), _sign(SELLER2_KEY, subDigest)) returns (
            bytes32, bytes32 subHash
        ) {
            trackedOrders.push(TrackedOrder({orderHash: subHash, processId: processId, commitment: sub}));
            _updateStatus(subHash);
        } catch {}
    }

    /// @notice Resolve a process (buyer dominance — prank as the process root buyer).
    function action_resolve(uint8 processIdx) external {
        if (processIds.length == 0) return;

        bytes32 processId = processIds[processIdx % processIds.length];
        (address rootBuyer,,, uint256 activeCount) = core.processes(processId);
        if (activeCount == 0) return;
        if (rootBuyer == address(0)) return;

        CommitmentTypes.Commitment[] memory commitments = _collectActive(processId, activeCount);
        if (commitments.length != activeCount) return;

        hevm.prank(rootBuyer);
        try core.resolveProcess(processId, commitments) {
            // Update status for all resolved orders
            for (uint256 i = 0; i < trackedOrders.length; i++) {
                if (trackedOrders[i].processId == processId) {
                    _updateStatus(trackedOrders[i].orderHash);
                }
            }
        } catch {}
    }

    // ═════════════════════════════════════════════════════════════
    // NEGATIVE TESTS (set violation flag if guard bypassed)
    // ═════════════════════════════════════════════════════════════

    /// @notice Non-buyer cannot resolve (buyer dominance).
    function action_resolve_wrong_sender(uint8 sellerIdx, uint8 processIdx) external {
        if (processIds.length == 0) return;

        bytes32 processId = processIds[processIdx % processIds.length];
        (address rootBuyer,,, uint256 activeCount) = core.processes(processId);
        if (activeCount == 0) return;
        if (rootBuyer == address(0)) return;

        address wrongSender = sellers[sellerIdx % 3];
        if (wrongSender == rootBuyer) return;

        CommitmentTypes.Commitment[] memory commitments = _collectActive(processId, activeCount);
        if (commitments.length != activeCount) return;

        hevm.prank(wrongSender);
        try core.resolveProcess(processId, commitments) {
            buyerDominanceViolated = true; // Should never reach here
        } catch {}
    }

    /// @notice Incomplete commitment list must revert (atomic resolution).
    function action_resolve_incomplete(uint8 processIdx) external {
        if (processIds.length == 0) return;

        bytes32 processId = processIds[processIdx % processIds.length];
        (address rootBuyer,,, uint256 activeCount) = core.processes(processId);
        if (activeCount < 2) return; // Need >= 2 to drop one
        if (rootBuyer == address(0)) return;

        CommitmentTypes.Commitment[] memory full = _collectActive(processId, activeCount);
        if (full.length != activeCount) return;

        // Drop the last element
        CommitmentTypes.Commitment[] memory incomplete = new CommitmentTypes.Commitment[](activeCount - 1);
        for (uint256 i = 0; i < incomplete.length; i++) {
            incomplete[i] = full[i];
        }

        hevm.prank(rootBuyer);
        try core.resolveProcess(processId, incomplete) {
            atomicResolutionViolated = true; // Should never reach here
        } catch {}
    }

    // ═════════════════════════════════════════════════════════════
    // PROPERTIES (checked by Echidna after each test sequence)
    // ═════════════════════════════════════════════════════════════

    /// @notice Solvency: core holds enough tokens to cover all outstanding
    ///         bonds. buyerBond = 2 × payment, sellerBond = 2 × cumVal.
    function echidna_solvency() external view returns (bool) {
        uint256 expectedBonds = 0;
        for (uint256 i = 0; i < trackedOrders.length; i++) {
            bytes32 h = trackedOrders[i].orderHash;
            if (core.orderStatus(h) == 1) {
                // committed (active)
                CommitmentTypes.Commitment memory c = trackedOrders[i].commitment;
                expectedBonds += 2 * c.payment; // buyer bond
                expectedBonds += 2 * c.expectedCumulativeValue; // seller bond
            }
        }
        return token.balanceOf(address(core)) >= expectedBonds;
    }

    /// @notice Active count consistency: stored activeOrderCount matches
    ///         the actual count of committed orders for each tracked process.
    function echidna_active_count_consistent() external view returns (bool) {
        for (uint256 p = 0; p < processIds.length; p++) {
            bytes32 pid = processIds[p];
            uint256 counted = 0;
            for (uint256 i = 0; i < trackedOrders.length; i++) {
                if (trackedOrders[i].processId == pid && core.orderStatus(trackedOrders[i].orderHash) == 1) {
                    counted++;
                }
            }
            (,,, uint256 stored) = core.processes(pid);
            if (stored != counted) return false;
        }
        return true;
    }

    /// @notice Cumulative value accounting: process accumulator equals
    ///         the sum of all order payments in that process (active + resolved).
    function echidna_cumulative_accounting() external view returns (bool) {
        for (uint256 p = 0; p < processIds.length; p++) {
            bytes32 pid = processIds[p];
            uint256 sumPayments = 0;
            for (uint256 i = 0; i < trackedOrders.length; i++) {
                if (trackedOrders[i].processId == pid) {
                    uint8 status = core.orderStatus(trackedOrders[i].orderHash);
                    if (status >= 1) {
                        // committed or resolved
                        sumPayments += trackedOrders[i].commitment.payment;
                    }
                }
            }
            (,, uint256 storedCum,) = core.processes(pid);
            if (storedCum != sumPayments) return false;
        }
        return true;
    }

    /// @notice State monotonicity: orderStatus can only move forward
    ///         (0 → 1 → 2), never backwards. Catches storage collision
    ///         or resurrection bugs.
    function echidna_state_monotonicity() external view returns (bool) {
        for (uint256 i = 0; i < trackedOrders.length; i++) {
            bytes32 h = trackedOrders[i].orderHash;
            uint8 current = core.orderStatus(h);
            if (current < maxObservedStatus[h]) return false;
        }
        return true;
    }

    /// @notice Token conservation: total supply of the test token never
    ///         changes purely from core operations (mint actions excluded
    ///         by checking ERC-20 totalSupply minus tracked mints).
    ///         Simplified: sum of all wallets + core balance = totalSupply.
    function echidna_token_conservation() external view returns (bool) {
        uint256 walletSum = token.balanceOf(buyer) + token.balanceOf(buyer2);
        for (uint256 i = 0; i < 3; i++) {
            walletSum += token.balanceOf(sellers[i]);
        }
        walletSum += token.balanceOf(address(core));
        return walletSum == token.totalSupply();
    }

    /// @notice Buyer dominance: non-buyer resolve must always revert.
    function echidna_buyer_dominance() external view returns (bool) {
        return !buyerDominanceViolated;
    }

    /// @notice Atomic resolution: incomplete commitment list must always revert.
    function echidna_atomic_resolution() external view returns (bool) {
        return !atomicResolutionViolated;
    }

    // ═════════════════════════════════════════════════════════════
    // INTERNALS
    // ═════════════════════════════════════════════════════════════

    /// @dev Compute EIP-712 digest from struct hash.
    function _digest(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));
    }

    /// @dev Sign a digest with a known private key via HEVM.
    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = hevm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _bound(uint256 x, uint256 min, uint256 max) internal pure returns (uint256) {
        if (max < min) return min;
        if (x < min) return min;
        if (x > max) return max;
        return x;
    }

    /// @dev Record the highest observed status for an order.
    function _updateStatus(bytes32 h) internal {
        uint8 current = core.orderStatus(h);
        if (current > maxObservedStatus[h]) {
            maxObservedStatus[h] = current;
        }
    }

    /// @dev Collect all active (committed) commitments for a process.
    ///      Returns the Commitment structs needed by resolveProcess().
    function _collectActive(bytes32 processId, uint256 required)
        internal
        view
        returns (CommitmentTypes.Commitment[] memory)
    {
        CommitmentTypes.Commitment[] memory result = new CommitmentTypes.Commitment[](required);
        uint256 j = 0;
        for (uint256 i = 0; i < trackedOrders.length; i++) {
            if (trackedOrders[i].processId == processId && core.orderStatus(trackedOrders[i].orderHash) == 1) {
                if (j >= required) return new CommitmentTypes.Commitment[](0);
                result[j++] = trackedOrders[i].commitment;
            }
        }
        if (j != required) return new CommitmentTypes.Commitment[](0);
        return result;
    }
}
