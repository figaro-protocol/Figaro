// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "src/kernel/FigaroCore.sol";
import "src/kernel/CommitmentTypes.sol";
import "src/protocol/verifier/FigaroBatchVerifier.sol";
import "src/protocol/registries/ClauseRegistry.sol";
import "src/mocks/MockSP1Verifier.sol";
import "src/mocks/MockReentrantToken.sol";
import {UsageCounter} from "src/protocol/usage/UsageCounter.sol";
import {MembersRegistry} from "src/protocol/registries/MembersRegistry.sol";
import {MockArtifactStake} from "test/helpers/MockArtifactStake.sol";

/// @title ReentrancyAdversarialTest — a malicious settlement token tries to
///        re-enter the kernel and the batch verifier during a token movement.
/// @notice The kernel's and verifier's `nonReentrant` guards are load-bearing
///         but were adversarially untested: no test ever handed the protocol a
///         token that calls back mid-transfer. This does exactly that, and
///         asserts the guard fires (the nested call reverts) while the outer
///         settlement still completes with correct balances.
contract ReentrancyAdversarialTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore internal core;
    MockReentrantToken internal token;

    uint256 internal constant BUYER_KEY = 0xB0B;
    uint256 internal constant SELLER_KEY = 0x5E11;
    address internal buyer;
    address internal seller;

    function setUp() public {
        buyer = vm.addr(BUYER_KEY);
        seller = vm.addr(SELLER_KEY);

        token = new MockReentrantToken();
        core = new FigaroCore();

        token.mint(buyer, 100_000 ether);
        token.mint(seller, 100_000 ether);
        vm.prank(buyer);
        token.approve(address(core), type(uint256).max);
        vm.prank(seller);
        token.approve(address(core), type(uint256).max);
    }

    // ── Signing helpers (kernel EIP-712) ─────────────────────────────

    function _typedDataHash(bytes32 structHash, address verifyingContract) internal view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("FigaroCore"),
                keccak256("3"),
                block.chainid,
                verifyingContract
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _sign(CommitmentTypes.Commitment memory c, uint256 key) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, _typedDataHash(c.hashStruct(), address(core)));
        return abi.encodePacked(r, s, v);
    }

    function _root(uint256 payment) internal view returns (CommitmentTypes.Commitment memory) {
        return CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            currency: address(token),
            payment: payment,
            expectedCumulativeValue: payment,
            agreementHash: keccak256("reentry-agreement"),
            salt: 1,
            deadline: block.timestamp + 1 hours
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // commit: the token re-enters during the bond pull
    // ═══════════════════════════════════════════════════════════════

    function test_commit_reentry_isBlocked_settlementStillCorrect() public {
        CommitmentTypes.Commitment memory c = _root(50 ether);
        bytes memory buyerSig = _sign(c, BUYER_KEY);
        bytes memory sellerSig = _sign(c, SELLER_KEY);

        // Arm the token to re-enter commit() with the SAME (would-be valid)
        // args during the buyer-bond pull. A working guard makes the nested
        // commit revert (ReentrancyGuardReentrantCall); the token records that.
        token.arm(address(core), abi.encodeCall(core.commit, (c, buyerSig, sellerSig)));

        uint256 buyerBefore = token.balanceOf(buyer);
        uint256 sellerBefore = token.balanceOf(seller);

        core.commit(c, buyerSig, sellerSig);

        assertTrue(token.reentryAttempted(), "the token must have attempted re-entry");
        assertTrue(token.reentryBlocked(), "the nonReentrant guard must block the nested commit");

        // The outer commit still settled correctly, exactly once: buyer bonds
        // 2×payment, seller bonds 2×cumulativeValue — no double-pull.
        assertEq(buyerBefore - token.balanceOf(buyer), 100 ether, "buyer bonds 2x payment, once");
        assertEq(sellerBefore - token.balanceOf(seller), 100 ether, "seller bonds 2x cumulative, once");
    }

    // ═══════════════════════════════════════════════════════════════
    // resolveProcess: the token re-enters during a payout
    // ═══════════════════════════════════════════════════════════════

    function test_resolve_reentry_isBlocked_payoutsStillCorrect() public {
        CommitmentTypes.Commitment memory c = _root(50 ether);
        (bytes32 processId,) = core.commit(c, _sign(c, BUYER_KEY), _sign(c, SELLER_KEY));

        CommitmentTypes.Commitment[] memory commitments = new CommitmentTypes.Commitment[](1);
        commitments[0] = c;

        // Arm the token to re-enter resolveProcess during the first payout
        // transfer. The nested resolve must be blocked by the guard.
        token.arm(address(core), abi.encodeCall(core.resolveProcess, (processId, commitments)));

        uint256 sellerBefore = token.balanceOf(seller);
        uint256 buyerBefore = token.balanceOf(buyer);

        vm.prank(buyer);
        core.resolveProcess(processId, commitments);

        assertTrue(token.reentryAttempted(), "the token must have attempted re-entry");
        assertTrue(token.reentryBlocked(), "the nonReentrant guard must block the nested resolve");

        // Payouts are exactly once: seller 2×cum + payment = 150, buyer 50.
        assertEq(token.balanceOf(seller) - sellerBefore, 150 ether, "seller paid once");
        assertEq(token.balanceOf(buyer) - buyerBefore, 50 ether, "buyer paid once");
        assertEq(core.orderStatus(processId), 0, "process resolved");
    }

    // ═══════════════════════════════════════════════════════════════
    // FigaroBatchVerifier.settleBatch: the token re-enters during
    // net-position reconciliation
    // ═══════════════════════════════════════════════════════════════

    function test_settleBatch_reentry_isBlocked() public {
        // A minimal batch verifier over the malicious token. The mock SP1
        // verifier accepts any proof, so we drive settleBatch directly with
        // hand-built public values (this suite exercises the reentrancy guard,
        // not the proof — the proof path is covered in FigaroBatchVerifierTest).
        MockSP1Verifier sp1 = new MockSP1Verifier();
        ClauseRegistry registry = new ClauseRegistry(0);
        bytes32 genesis = keccak256("genesis");
        // A counter is required for construction; this batch credits no usage,
        // so the verifier's call to it is a no-op and only the guard is under
        // test here.
        uint64[] memory periods = new uint64[](1);
        periods[0] = type(uint64).max;
        UsageCounter usageCounter = new UsageCounter(
            address(new FigaroCore()),
            address(new MembersRegistry(0, 0)),
            address(new MockArtifactStake()),
            address(new MockArtifactStake()),
            vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1),
            keccak256("prov"),
            new bytes32[](0),
            1,
            periods
        );
        FigaroBatchVerifier verifier =
            new FigaroBatchVerifier(address(sp1), bytes32(uint256(1)), address(registry), address(usageCounter), genesis);

        // One payout position: the verifier pushes 10 tokens to `seller` from
        // its own balance. Fund the verifier and route the push through the
        // malicious token.
        token.mint(address(verifier), 1_000 ether);

        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](1);
        positions[0] = FigaroBatchVerifier.NetPosition(address(token), seller, 0, 10 ether);
        FigaroBatchVerifier.BatchEventData memory events = FigaroBatchVerifier.BatchEventData(
            new FigaroBatchVerifier.AttestationData[](0), new FigaroBatchVerifier.SpecBinding[](0)
        );

        bytes memory pv = abi.encode(
            genesis,
            keccak256("next"),
            uint64(block.chainid),
            address(verifier),
            _hashPositions(positions),
            keccak256(""), // empty attestations
            keccak256(""), // empty spec bindings
            keccak256(abi.encodePacked(uint8(0), bytes32(0), uint64(0), uint64(0))) // empty usage accrual
        );

        FigaroBatchVerifier.BatchUsageData memory usage;
        usage.accruals = new IUsageCounter.BatchAccrual[](0);
        usage.sellers = new address[](0);

        // Arm the token to re-enter settleBatch during the payout push.
        token.arm(address(verifier), abi.encodeCall(verifier.settleBatch, (hex"", pv, positions, events, usage)));

        uint256 sellerBefore = token.balanceOf(seller);
        verifier.settleBatch(hex"", pv, positions, events, usage);

        assertTrue(token.reentryAttempted(), "the token must have attempted re-entry");
        assertTrue(token.reentryBlocked(), "the nonReentrant guard must block the nested settleBatch");

        // The outer settlement paid the seller exactly once and advanced state.
        assertEq(token.balanceOf(seller) - sellerBefore, 10 ether, "seller paid once");
        assertEq(verifier.stateRoot(), keccak256("next"), "state advanced once");
        assertEq(verifier.batchCount(), 1, "one batch settled");
    }

    /// @dev Mirror of FigaroBatchVerifier._hashPositions (104-byte packing).
    function _hashPositions(FigaroBatchVerifier.NetPosition[] memory ps) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint256 i = 0; i < ps.length; i++) {
            packed = bytes.concat(packed, abi.encodePacked(ps[i].token, ps[i].user, ps[i].deposit, ps[i].payout));
        }
        return keccak256(packed);
    }
}
