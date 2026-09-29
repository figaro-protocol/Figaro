// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "src/core/kernel/FigaroCore.sol";
import "src/core/kernel/CommitmentTypes.sol";
import "src/mocks/MockPermitToken.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title KernelDifferentialFuzzTest — the seeded operation stream the kernel
///        and its Rust mirror must agree on
/// @notice `KernelTransitionVectorsTest` locks six hand-written scenarios.
///         This test GENERATES a stream: `KERNEL_FUZZ_STEPS` operations drawn
///         from `KERNEL_FUZZ_SEED`, each a commit or a resolve, valid or
///         deliberately malformed (an expired deadline, a wrong signer, a
///         cumulative value off by one, a replay, a foreign order in a
///         resolution list, a payment in the overflow window, ...). Every
///         operation runs on the live kernel; what the kernel did — the ids it
///         returned, or the error it reverted with — is written to
///         `cache/kernel-fuzz-stream.json`, one JSON object per line: a
///         header, the steps, then every wallet's deposits and payouts and
///         every process's final state.
///         `prover/lib/tests/fuzz_stream.rs` replays the same stream through
///         the mirror, one operation per batch, and must accept what the
///         kernel accepted, reject what it rejected with the same error, and
///         arrive at the same figures. `scripts/test-cross-impl-fuzz.sh` runs
///         the two halves under one seed.
///
///         The generator asserts nothing about WHICH error a malformed
///         operation earns: the kernel's answer is the oracle, recorded as it
///         comes.
contract KernelDifferentialFuzzTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    string internal constant STREAM = "cache/kernel-fuzz-stream.json";
    uint256 internal constant KEY_COUNT = 5;

    FigaroCore internal core;
    MockPermitToken internal tokenA;
    MockPermitToken internal tokenB;

    uint256[KEY_COUNT] internal keys = [uint256(0xB0B), 0x5E11, 0x5E12, 0x5E13, 0xB0B2];
    address[KEY_COUNT] internal wallets;

    struct Proc {
        bytes32 id;
        address buyer;
        uint256 buyerKey;
        address currency;
        uint256 cumulative;
        bool resolved;
        uint256[] steps; // the stream steps whose commits this process holds
    }

    Proc[] internal procs;
    mapping(uint256 => CommitmentTypes.Commitment) internal committedAt;
    uint256[] internal committedSteps;

    // deposits and payouts per (token, wallet), from balance deltas
    mapping(address => mapping(address => uint256)) internal deposited;
    mapping(address => mapping(address => uint256)) internal paidOut;

    uint256 internal rng;
    uint256 internal saltCounter;

    function setUp() public {
        tokenA = new MockPermitToken();
        tokenB = new MockPermitToken();
        core = new FigaroCore();
        for (uint256 i = 0; i < KEY_COUNT; i++) {
            wallets[i] = vm.addr(keys[i]);
            tokenA.mint(wallets[i], 1 << 200);
            tokenB.mint(wallets[i], 1 << 200);
            vm.startPrank(wallets[i]);
            tokenA.approve(address(core), type(uint256).max);
            tokenB.approve(address(core), type(uint256).max);
            vm.stopPrank();
        }
    }

    // ── The stream ───────────────────────────────────────────────

    function test_kernelStream_isWrittenForTheMirror() public {
        uint256 seed = vm.envOr("KERNEL_FUZZ_SEED", uint256(1));
        uint256 steps = vm.envOr("KERNEL_FUZZ_STEPS", uint256(200));
        rng = uint256(keccak256(abi.encode("figaro-kernel-fuzz", seed)));

        if (vm.exists(STREAM)) vm.removeFile(STREAM);
        string memory header = "header";
        vm.serializeString(header, "type", "header");
        vm.serializeString(header, "seed", vm.toString(seed));
        vm.serializeString(header, "chainId", vm.toString(block.chainid));
        vm.serializeAddress(header, "verifyingContract", address(core));
        vm.writeLine(STREAM, vm.serializeString(header, "stepCount", vm.toString(steps)));

        uint256 accepted;
        uint256 rejected;
        uint256 timestamp = 1000;
        for (uint256 i = 0; i < steps; i++) {
            timestamp += _next() % 50;
            vm.warp(timestamp);
            (string memory stepJson, bool ok) = _step(i, timestamp);
            vm.writeLine(STREAM, stepJson);
            if (ok) accepted++;
            else rejected++;
        }
        assertGt(accepted, 0, "the stream holds accepted operations");
        assertGt(rejected, 0, "the stream holds rejected operations");

        _writeParties();
        _writeProcesses();
    }

    function _step(uint256 i, uint256 timestamp) internal returns (string memory, bool) {
        uint256 roll = _next() % 100;
        bool haveOpen = _openCount() > 0;
        if (roll < 22 || (!haveOpen && roll < 70)) return _commitStep(i, timestamp, _validRoot(timestamp));
        if (roll < 52) return _commitStep(i, timestamp, _validExtension(timestamp));
        if (roll < 70) return _resolveStep(i, timestamp, 0);
        if (roll < 88) return _commitStep(i, timestamp, _malformedCommit(timestamp));
        return _resolveStep(i, timestamp, 1 + _next() % 5);
    }

    // ── Commits ──────────────────────────────────────────────────

    /// A commit as the stream carries it: the commitment and the two keys
    /// that sign it (which a malformed commit may choose wrongly).
    struct Draft {
        CommitmentTypes.Commitment c;
        uint256 buyerSignerKey;
        uint256 sellerSignerKey;
        uint256 sigForm; // 0 canonical; 1 high-s; 2 v as 0/1; 3 zeroed — applied to the buyer's signature
    }

    function _validRoot(uint256 timestamp) internal returns (Draft memory d) {
        uint256 b = _next() % KEY_COUNT;
        uint256 s = _next() % KEY_COUNT; // may equal b: buyer == seller is allowed
        uint256 payment = _payment();
        d.c = CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: wallets[b],
            seller: wallets[s],
            currency: _next() % 4 == 0 ? address(tokenB) : address(tokenA),
            payment: payment,
            expectedCumulativeValue: payment,
            agreementHash: bytes32(_next()),
            salt: ++saltCounter,
            deadline: timestamp + _next() % 1000
        });
        d.buyerSignerKey = keys[b];
        d.sellerSignerKey = keys[s];
    }

    function _validExtension(uint256 timestamp) internal returns (Draft memory d) {
        (bool found, uint256 pi) = _pickProc(false);
        if (!found) return _validRoot(timestamp);
        Proc storage p = procs[pi];
        uint256 s = _next() % KEY_COUNT;
        uint256 payment = _payment();
        d.c = CommitmentTypes.Commitment({
            processId: p.id,
            buyer: p.buyer,
            seller: wallets[s],
            currency: p.currency,
            payment: payment,
            expectedCumulativeValue: p.cumulative + payment,
            agreementHash: bytes32(_next()),
            salt: ++saltCounter,
            deadline: timestamp + _next() % 1000
        });
        d.buyerSignerKey = p.buyerKey;
        d.sellerSignerKey = keys[s];
    }

    function _malformedCommit(uint256 timestamp) internal returns (Draft memory d) {
        uint256 variant = _next() % 15;
        d = _next() % 2 == 0 ? _validRoot(timestamp) : _validExtension(timestamp);
        if (variant == 0) {
            d.c.deadline = timestamp - 1 - _next() % 500;
        } else if (variant == 1) {
            d.c.payment = 0;
        } else if (variant == 2) {
            d.buyerSignerKey = keys[_next() % KEY_COUNT];
        } else if (variant == 3) {
            d.sellerSignerKey = keys[_next() % KEY_COUNT];
        } else if (variant == 4) {
            d.c.expectedCumulativeValue += 1;
        } else if (variant == 5) {
            d.c.expectedCumulativeValue = d.c.expectedCumulativeValue > 1 ? d.c.expectedCumulativeValue - 1 : 0;
        } else if (variant == 6) {
            d.c.processId = bytes32(_next()); // a process nobody opened
        } else if (variant == 7) {
            (bool found, uint256 pi) = _pickProc(true); // a resolved process
            if (found) {
                d.c.processId = procs[pi].id;
                d.c.buyer = procs[pi].buyer;
                d.buyerSignerKey = procs[pi].buyerKey;
                d.c.currency = procs[pi].currency;
                d.c.expectedCumulativeValue = procs[pi].cumulative + d.c.payment;
            }
        } else if (variant == 8) {
            uint256 b = _next() % KEY_COUNT; // another wallet extends as buyer
            d.c.buyer = wallets[b];
            d.buyerSignerKey = keys[b];
        } else if (variant == 9) {
            d.c.currency = d.c.currency == address(tokenA) ? address(tokenB) : address(tokenA);
        } else if (variant == 10) {
            if (committedSteps.length > 0) {
                uint256 at = committedSteps[_next() % committedSteps.length]; // a replay
                d.c = committedAt[at];
                d.buyerSignerKey = _keyOf(d.c.buyer);
                d.sellerSignerKey = _keyOf(d.c.seller);
            }
        } else if (variant == 11) {
            // the overflow window: a payment whose bond cannot be represented
            d.c.payment = (1 << 255) + _next() % (1 << 64);
            d.c.expectedCumulativeValue = d.c.payment;
        } else {
            d.sigForm = variant - 11; // 1 high-s, 2 v as 0/1, 3 zeroed
        }
    }

    function _commitStep(uint256 i, uint256 timestamp, Draft memory d) internal returns (string memory, bool) {
        string memory key = string.concat("step", vm.toString(i));
        vm.serializeString(key, "type", "step");
        vm.serializeString(key, "index", vm.toString(i));
        vm.serializeString(key, "kind", "commit");
        vm.serializeString(key, "timestamp", vm.toString(timestamp));
        vm.serializeBytes32(key, "commitmentProcessId", d.c.processId);
        vm.serializeAddress(key, "buyer", d.c.buyer);
        vm.serializeAddress(key, "seller", d.c.seller);
        vm.serializeAddress(key, "currency", d.c.currency);
        vm.serializeString(key, "payment", vm.toString(d.c.payment));
        vm.serializeString(key, "expectedCumulativeValue", vm.toString(d.c.expectedCumulativeValue));
        vm.serializeBytes32(key, "agreementHash", d.c.agreementHash);
        vm.serializeString(key, "salt", vm.toString(d.c.salt));
        vm.serializeString(key, "deadline", vm.toString(d.c.deadline));
        bytes memory buyerSig = _reform(_sign(d.c, d.buyerSignerKey), d.sigForm);
        bytes memory sellerSig = _sign(d.c, d.sellerSignerKey);
        vm.serializeBytes(key, "buyerSig", buyerSig);
        vm.serializeBytes(key, "sellerSig", sellerSig);
        _snapshot();
        try core.commit(d.c, buyerSig, sellerSig) returns (bytes32 processId, bytes32 orderHash) {
            _settleDeltas();
            committedAt[i] = d.c;
            committedSteps.push(i);
            _recordCommit(i, d.c, processId);
            vm.serializeBytes32(key, "processId", processId);
            vm.serializeBytes32(key, "orderHash", orderHash);
            return (vm.serializeString(key, "outcome", "ok"), true);
        } catch (bytes memory reason) {
            return (vm.serializeString(key, "outcome", _errorName(reason)), false);
        }
    }

    function _recordCommit(uint256 i, CommitmentTypes.Commitment memory c, bytes32 processId) internal {
        if (c.processId == bytes32(0)) {
            procs.push();
            Proc storage p = procs[procs.length - 1];
            p.id = processId;
            p.buyer = c.buyer;
            p.buyerKey = _keyOf(c.buyer);
            p.currency = c.currency;
            p.cumulative = c.payment;
            p.steps.push(i);
            return;
        }
        for (uint256 k = 0; k < procs.length; k++) {
            if (procs[k].id == processId) {
                procs[k].cumulative = c.expectedCumulativeValue;
                procs[k].steps.push(i);
                return;
            }
        }
    }

    // ── Resolutions ──────────────────────────────────────────────

    /// A resolution as the stream carries it.
    struct Resolution {
        uint256 procIndex;
        bytes32 processId;
        address caller;
        uint256[] refs; // the stream steps whose commitments are passed
    }

    /// variant 0 is the valid resolution; 1..5 are malformed:
    /// 1 a caller who is not the buyer, 2 a list one order short, 3 a foreign
    /// order in the list, 4 a process already resolved, 5 a process nobody opened.
    function _resolveStep(uint256 i, uint256 timestamp, uint256 variant) internal returns (string memory, bool) {
        (bool found, uint256 pi) = _pickProc(variant == 4);
        if (!found) return _commitStep(i, timestamp, _validRoot(timestamp));
        Resolution memory r = _draftResolution(pi, variant);

        string memory key = string.concat("step", vm.toString(i));
        vm.serializeString(key, "type", "step");
        vm.serializeString(key, "index", vm.toString(i));
        vm.serializeString(key, "kind", "resolve");
        vm.serializeString(key, "timestamp", vm.toString(timestamp));
        vm.serializeBytes32(key, "processId", r.processId);
        vm.serializeAddress(key, "caller", r.caller);
        vm.serializeString(key, "orderCount", vm.toString(r.refs.length));
        return _runResolution(key, r);
    }

    function _draftResolution(uint256 pi, uint256 variant) internal returns (Resolution memory r) {
        Proc storage p = procs[pi];
        r.procIndex = pi;
        r.processId = p.id;
        r.caller = p.buyer;
        r.refs = p.steps;
        if (variant == 1) {
            r.caller = wallets[_next() % KEY_COUNT];
        } else if (variant == 2 && r.refs.length > 0) {
            uint256[] memory shorter = new uint256[](r.refs.length - 1);
            for (uint256 k = 0; k < shorter.length; k++) {
                shorter[k] = r.refs[k];
            }
            r.refs = shorter;
        } else if (variant == 3 && committedSteps.length > 0) {
            r.refs[_next() % r.refs.length] = committedSteps[_next() % committedSteps.length];
        } else if (variant == 5) {
            r.processId = bytes32(_next());
        }
    }

    function _runResolution(string memory key, Resolution memory r) internal returns (string memory, bool) {
        CommitmentTypes.Commitment[] memory list = new CommitmentTypes.Commitment[](r.refs.length);
        for (uint256 k = 0; k < r.refs.length; k++) {
            list[k] = committedAt[r.refs[k]];
            vm.serializeString(key, string.concat("r", vm.toString(k)), vm.toString(r.refs[k]));
        }
        _snapshot();
        vm.prank(r.caller);
        try core.resolveProcess(r.processId, list) {
            _settleDeltas();
            procs[r.procIndex].resolved = true;
            return (vm.serializeString(key, "outcome", "ok"), true);
        } catch (bytes memory reason) {
            return (vm.serializeString(key, "outcome", _errorName(reason)), false);
        }
    }

    // ── What the stream ends on ──────────────────────────────────

    function _writeParties() internal {
        address[2] memory tokens = [address(tokenA), address(tokenB)];
        uint256 n;
        for (uint256 t = 0; t < 2; t++) {
            for (uint256 w = 0; w < KEY_COUNT; w++) {
                string memory pk = string.concat("party", vm.toString(n++));
                vm.serializeString(pk, "type", "party");
                vm.serializeAddress(pk, "token", tokens[t]);
                vm.serializeAddress(pk, "address", wallets[w]);
                vm.serializeString(pk, "deposit", vm.toString(deposited[tokens[t]][wallets[w]]));
                vm.writeLine(STREAM, vm.serializeString(pk, "payout", vm.toString(paidOut[tokens[t]][wallets[w]])));
            }
        }
    }

    function _writeProcesses() internal {
        for (uint256 k = 0; k < procs.length; k++) {
            (,, uint256 cumulativeValue, uint256 activeOrderCount) = core.processes(procs[k].id);
            string memory rk = string.concat("process", vm.toString(k));
            vm.serializeString(rk, "type", "process");
            vm.serializeBytes32(rk, "processId", procs[k].id);
            vm.serializeString(rk, "cumulativeValue", vm.toString(cumulativeValue));
            vm.writeLine(STREAM, vm.serializeString(rk, "activeOrderCount", vm.toString(activeOrderCount)));
        }
    }

    // ── Balance deltas ───────────────────────────────────────────

    uint256[KEY_COUNT][2] internal snap;

    function _snapshot() internal {
        for (uint256 w = 0; w < KEY_COUNT; w++) {
            snap[0][w] = tokenA.balanceOf(wallets[w]);
            snap[1][w] = tokenB.balanceOf(wallets[w]);
        }
    }

    function _settleDeltas() internal {
        address[2] memory tokens = [address(tokenA), address(tokenB)];
        for (uint256 t = 0; t < 2; t++) {
            for (uint256 w = 0; w < KEY_COUNT; w++) {
                uint256 nowBal = IERC20(tokens[t]).balanceOf(wallets[w]);
                if (nowBal < snap[t][w]) deposited[tokens[t]][wallets[w]] += snap[t][w] - nowBal;
                else paidOut[tokens[t]][wallets[w]] += nowBal - snap[t][w];
            }
        }
    }

    // ── Helpers ──────────────────────────────────────────────────

    function _next() internal returns (uint256) {
        rng = uint256(keccak256(abi.encode(rng)));
        return rng;
    }

    /// Payments across the magnitudes: one unit, small, token-scale, large.
    function _payment() internal returns (uint256) {
        uint256 class = _next() % 4;
        if (class == 0) return 1;
        if (class == 1) return 1 + _next() % 1000;
        if (class == 2) return 1 + _next() % (1_000_000 ether);
        return 1 + _next() % (1 << 128);
    }

    function _openCount() internal view returns (uint256 n) {
        for (uint256 k = 0; k < procs.length; k++) {
            if (!procs[k].resolved) n++;
        }
    }

    function _pickProc(bool resolved) internal returns (bool, uint256) {
        uint256 n;
        for (uint256 k = 0; k < procs.length; k++) {
            if (procs[k].resolved == resolved) n++;
        }
        if (n == 0) return (false, 0);
        uint256 pick = _next() % n;
        for (uint256 k = 0; k < procs.length; k++) {
            if (procs[k].resolved != resolved) continue;
            if (pick == 0) return (true, k);
            pick--;
        }
        return (false, 0);
    }

    function _keyOf(address wallet) internal view returns (uint256) {
        for (uint256 k = 0; k < KEY_COUNT; k++) {
            if (wallets[k] == wallet) return keys[k];
        }
        revert("wallet outside the keyring");
    }

    function _errorName(bytes memory reason) internal pure returns (string memory) {
        if (reason.length < 4) return "Unknown";
        bytes4 sel = bytes4(reason);
        if (sel == FigaroCore.DeadlineExpired.selector) return "DeadlineExpired";
        if (sel == FigaroCore.InvalidBuyerSignature.selector) return "InvalidBuyerSignature";
        if (sel == FigaroCore.InvalidSellerSignature.selector) return "InvalidSellerSignature";
        if (sel == FigaroCore.ZeroPayment.selector) return "ZeroPayment";
        if (sel == FigaroCore.ProcessAlreadyExists.selector) return "ProcessAlreadyExists";
        if (sel == FigaroCore.UnknownProcess.selector) return "UnknownProcess";
        if (sel == FigaroCore.CumulativeValueMismatch.selector) return "CumulativeValueMismatch";
        if (sel == FigaroCore.NotProcessBuyer.selector) return "NotProcessBuyer";
        if (sel == FigaroCore.CurrencyMismatch.selector) return "CurrencyMismatch";
        if (sel == FigaroCore.OrderNotCommitted.selector) return "OrderNotCommitted";
        if (sel == FigaroCore.NoActiveOrders.selector) return "NoActiveOrders";
        if (sel == FigaroCore.IncompleteOrderList.selector) return "IncompleteOrderList";
        if (sel == FigaroCore.DuplicateCommitment.selector) return "DuplicateCommitment";
        if (sel == FigaroCore.InvalidRootCumulativeValue.selector) return "InvalidRootCumulativeValue";
        if (sel == FigaroCore.ProcessAlreadyResolved.selector) return "ProcessAlreadyResolved";
        if (sel == bytes4(keccak256("Panic(uint256)"))) return "Panic";
        if (sel == ECDSA.ECDSAInvalidSignature.selector) return "ECDSAInvalidSignature";
        if (sel == ECDSA.ECDSAInvalidSignatureS.selector) return "ECDSAInvalidSignatureS";
        if (sel == ECDSA.ECDSAInvalidSignatureLength.selector) return "ECDSAInvalidSignatureLength";
        return "Unknown";
    }

    /// The same signature in another form: the high-s twin of the canonical
    /// signature, the recovery id written 0/1, or sixty-five zero bytes.
    function _reform(bytes memory sig, uint256 form) internal pure returns (bytes memory) {
        if (form == 0) return sig;
        if (form == 3) return new bytes(65);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (form == 1) {
            uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
            return abi.encodePacked(r, bytes32(n - uint256(s)), v == 27 ? uint8(28) : uint8(27));
        }
        return abi.encodePacked(r, s, v - 27);
    }

    /// The domain is read from the kernel by external call, never rebuilt
    /// from block.chainid here (see FigaroCoreTest's chain-id test).
    function _sign(CommitmentTypes.Commitment memory c, uint256 privateKey) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", core.DOMAIN_SEPARATOR(), c.hashStruct()));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
