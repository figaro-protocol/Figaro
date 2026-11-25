// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {BatchHashes} from "test/helpers/BatchHashes.sol";
import {MockClauseOrAssemblyStake} from "test/helpers/MockClauseOrAssemblyStake.sol";
import {FigaroBatchVerifier} from "src/core/verifier/FigaroBatchVerifier.sol";
import {IUsageCounter} from "src/core/verifier/FigaroBatchVerifier.sol";
import {UsageCounter} from "src/rewards/UsageCounter.sol";
import {FigaroCore} from "src/core/kernel/FigaroCore.sol";
import {CommitmentTypes} from "src/core/kernel/CommitmentTypes.sol";
import {ClauseRegistry} from "src/registries/ClauseRegistry.sol";
import {AgreementRegistry} from "src/registries/AgreementRegistry.sol";
import {ProcessRegistry} from "src/registries/ProcessRegistry.sol";
import {MembersRegistry} from "src/registries/MembersRegistry.sol";
import {MockSP1Verifier} from "src/mocks/MockSP1Verifier.sol";
import {MockERC20} from "src/mocks/MockERC20.sol";
import {MockERC1271Wallet} from "src/mocks/MockERC1271Wallet.sol";
import {SigningTestHelper} from "test/helpers/SigningTestHelper.sol";

/// A contract that does call a registry's register function: the control that
/// shows the recording below catches such a call.
contract CallsRegisterClause {
    function go(address registry) external payable {
        ClauseRegistry(registry).registerClause{value: msg.value}(bytes32(uint256(1)), "ipfs://x");
    }
}

/// "Registering never enters a batch" on the contract side, proved by what a
/// batch does and not by how the code is compiled. A real batch runs through
/// `settleBatch` (a deposit leg, a payout leg, an attestation of a clause key no
/// registry holds, and a resolution) under Foundry's state-diff recording, which
/// lists every call made during it. The test reads that list: no one calls a
/// write function of any of the four registries, and the verifier itself makes
/// no call at all, read or write, to any of them. The usage counter the
/// verifier hands each batch's uses to reads the registries on its own account;
/// the assertion on reads is about the verifier's own calls only. The operation
/// stream's own tags are the proof program's side (not tested here).
contract BatchVerifierNeverRegistersTest is Test {
    bytes32 constant VKEY = bytes32(uint256(0xF16A20));
    uint256 constant DEPOSIT = 0.001 ether;
    uint64 constant PERIOD_END = 1_000_000;
    /// A clause key no registry holds: the batch attests it all the same.
    bytes32 constant CLAUSE_KEY = keccak256("a clause no registry holds");
    bytes32 constant PROCESS = keccak256("never-registers-process");
    uint256 constant PAYMENT = 10 ether;

    FigaroBatchVerifier verifier;
    ClauseRegistry clauses;
    AgreementRegistry agreements;
    ProcessRegistry assemblies;
    MembersRegistry members;
    MockERC20 token;

    address buyer = address(0xB0B);
    address seller = address(0x5E11);
    address depositor = address(0xDE9);

    function setUp() public {
        MockSP1Verifier sp1 = new MockSP1Verifier();
        clauses = new ClauseRegistry(DEPOSIT);
        agreements = new AgreementRegistry(0);
        assemblies = new ProcessRegistry(0);
        members = new MembersRegistry(0, 0);
        FigaroCore core = new FigaroCore();

        uint64[] memory periods = new uint64[](1);
        periods[0] = PERIOD_END;
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        UsageCounter counter = new UsageCounter(
            address(core),
            address(members),
            address(clauses),
            address(assemblies),
            address(agreements),
            predicted,
            1,
            periods
        );
        verifier = new FigaroBatchVerifier(address(sp1), VKEY, address(counter));
        assertEq(address(verifier), predicted, "verifier address prediction");

        vm.warp(PERIOD_END - 1000);

        token = new MockERC20("Mock", "MOCK");
        token.mint(depositor, 1_000 ether);
        token.mint(address(verifier), 1_000 ether);
        vm.prank(depositor);
        token.approve(address(verifier), type(uint256).max);
    }

    /// Every write function of the four registries: the signature of each.
    function _writes() internal pure returns (bytes4[10] memory sels) {
        sels = [
            ClauseRegistry.registerClause.selector,
            ClauseRegistry.withdrawDeposit.selector,
            AgreementRegistry.registerAgreement.selector,
            AgreementRegistry.withdrawDeposit.selector,
            ProcessRegistry.registerProcess.selector,
            ProcessRegistry.withdrawDeposit.selector,
            MembersRegistry.register.selector,
            MembersRegistry.updateProfile.selector,
            MembersRegistry.requestWithdrawal.selector,
            MembersRegistry.withdraw.selector
        ];
    }

    function _selectorOf(bytes memory data) internal pure returns (bytes4 sel) {
        if (data.length >= 4) {
            sel = bytes4(data[0]) | (bytes4(data[1]) >> 8) | (bytes4(data[2]) >> 16) | (bytes4(data[3]) >> 24);
        }
    }

    function _isCall(VmSafe.AccountAccessKind k) internal pure returns (bool) {
        return k == VmSafe.AccountAccessKind.Call || k == VmSafe.AccountAccessKind.StaticCall
            || k == VmSafe.AccountAccessKind.DelegateCall || k == VmSafe.AccountAccessKind.CallCode;
    }

    /// How many recorded calls, made by `caller` (any caller when zero) to `target`
    /// (any target when zero), carry `sel` (any selector when zero).
    function _count(VmSafe.AccountAccess[] memory log, address caller, address target, bytes4 sel)
        internal
        pure
        returns (uint256 n)
    {
        for (uint256 i = 0; i < log.length; i++) {
            VmSafe.AccountAccess memory a = log[i];
            if (!_isCall(a.kind)) continue;
            if (caller != address(0) && a.accessor != caller) continue;
            if (target != address(0) && a.account != target) continue;
            if (sel != bytes4(0) && _selectorOf(a.data) != sel) continue;
            n++;
        }
    }

    /// Calls in the log, by anyone, to any registry in `regs`, carrying a write selector.
    function _registryWrites(VmSafe.AccountAccess[] memory log, address[4] memory regs)
        internal
        pure
        returns (uint256 n)
    {
        bytes4[10] memory sels = _writes();
        for (uint256 r = 0; r < regs.length; r++) {
            for (uint256 s = 0; s < sels.length; s++) {
                n += _count(log, address(0), regs[r], sels[s]);
            }
        }
    }

    function _registries() internal view returns (address[4] memory) {
        return [address(clauses), address(agreements), address(assemblies), address(members)];
    }

    /// The `0x04` resolve entry the stream carries: processId, len(2), authorization, count(2), commitment.
    function _resolveEntry(CommitmentTypes.Commitment memory c, bytes memory authorization)
        internal
        pure
        returns (bytes memory)
    {
        return bytes.concat(
            hex"04",
            c.processId,
            bytes2(uint16(authorization.length)),
            authorization,
            bytes2(uint16(1)),
            abi.encodePacked(
                c.processId,
                c.buyer,
                c.seller,
                c.token,
                c.payment,
                c.runningTotal,
                c.checkoutHash,
                c.salt,
                c.commitDeadline
            )
        );
    }

    function _resolveDigest() internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(keccak256("ResolveProcess(bytes32 processId,uint256 runningTotal)"), PROCESS, PAYMENT)
        );
        return SigningTestHelper.typedDataHash(SigningTestHelper.domainOf(address(verifier)), structHash);
    }

    /// Run one batch: a deposit leg, the resolution's payout legs, an attestation
    /// of an unregistered clause key, and a resolve entry; return the recorded calls.
    function _runBatchRecorded() internal returns (VmSafe.AccountAccess[] memory log) {
        CommitmentTypes.Commitment memory c;
        c.processId = PROCESS;
        c.buyer = buyer;
        c.seller = seller;
        c.token = address(token);
        c.payment = PAYMENT;
        c.runningTotal = PAYMENT;
        c.checkoutHash = keccak256("never-registers-checkout");
        c.salt = 7;
        c.commitDeadline = 4_000_000_000;

        bytes memory authorization = bytes("guardian-approval");
        vm.etch(buyer, type(MockERC1271Wallet).runtimeCode);
        MockERC1271Wallet(buyer).approve(_resolveDigest(), authorization);

        FigaroBatchVerifier.NetPosition[] memory positions = new FigaroBatchVerifier.NetPosition[](3);
        positions[0] = FigaroBatchVerifier.NetPosition(address(token), depositor, 200 ether, 0);
        positions[1] = FigaroBatchVerifier.NetPosition(address(token), buyer, 0, PAYMENT);
        positions[2] = FigaroBatchVerifier.NetPosition(address(token), seller, 0, 3 * PAYMENT);

        FigaroBatchVerifier.AttestationData[] memory atts = new FigaroBatchVerifier.AttestationData[](1);
        atts[0] = FigaroBatchVerifier.AttestationData(
            keccak256("order"), PROCESS, seller, CLAUSE_KEY, 0, keccak256("content")
        );
        FigaroBatchVerifier.BatchEventData memory events = FigaroBatchVerifier.BatchEventData(atts);
        FigaroBatchVerifier.BatchUsageData memory usage;
        usage.uses = new IUsageCounter.BatchUse[](0);

        bytes memory operations = _resolveEntry(c, authorization);
        bytes memory pv = abi.encode(
            verifier.genesisRoot(),
            keccak256("never-registers-root"),
            uint64(block.chainid),
            address(verifier),
            BatchHashes.positions(positions),
            BatchHashes.attestations(atts),
            keccak256(abi.encodePacked(uint8(0), bytes32(0), uint64(0))),
            uint64(block.timestamp),
            keccak256(operations)
        );

        vm.startStateDiffRecording();
        verifier.settleBatch(hex"", pv, positions, events, usage, operations);
        log = vm.stopAndReturnStateDiff();
        assertEq(verifier.stateRoot(), keccak256("never-registers-root"), "the batch lands");
    }

    function test_aBatchMakesNoCallToARegistrysWriteFunction() public {
        VmSafe.AccountAccess[] memory log = _runBatchRecorded();
        assertGt(_count(log, address(verifier), address(0), bytes4(0)), 0, "the recording sees the verifier's calls");
        assertEq(_registryWrites(log, _registries()), 0, "no call to a registry's write function, by anyone");
    }

    function test_theVerifierMakesNoCallToAnyRegistryReadOrWrite() public {
        VmSafe.AccountAccess[] memory log = _runBatchRecorded();
        address v = address(verifier);
        assertGt(_count(log, v, address(0), bytes4(0)), 0, "the recording sees the verifier's calls");
        assertEq(verifier.batchCount(), 1, "the batch attested an unregistered clause key and landed");
        assertEq(_count(log, v, address(clauses), bytes4(0)), 0, "no call to the clause registry");
        assertEq(_count(log, v, address(agreements), bytes4(0)), 0, "no call to the agreement registry");
        assertEq(_count(log, v, address(assemblies), bytes4(0)), 0, "no call to the process registry");
        assertEq(_count(log, v, address(members), bytes4(0)), 0, "no call to the members registry");
    }

    function test_theRecordingCatchesAContractThatDoesCallRegisterClause() public {
        CallsRegisterClause caller = new CallsRegisterClause();
        vm.deal(address(this), 1 ether);
        vm.startStateDiffRecording();
        caller.go{value: DEPOSIT}(address(clauses));
        VmSafe.AccountAccess[] memory log = vm.stopAndReturnStateDiff();
        assertEq(
            _count(log, address(caller), address(clauses), ClauseRegistry.registerClause.selector),
            1,
            "the recording sees the caller's registerClause"
        );
        assertEq(_registryWrites(log, _registries()), 1, "the registry-write count is not zero for a writer");
    }
}
