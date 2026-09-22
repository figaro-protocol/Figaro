// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {Deploy} from "script/Deploy.s.sol";
import {DeployMainnet} from "script/DeployMainnet.s.sol";
import {FigaroCore} from "src/core/kernel/FigaroCore.sol";
import {AttestationCoordinator} from "src/core/attestation/AttestationCoordinator.sol";
import {WitnessSwapAndCommitCoordinator} from "src/app/WitnessSwapAndCommitCoordinator.sol";
import {FigaroBatchVerifier} from "src/core/verifier/FigaroBatchVerifier.sol";
import {UsageCounter} from "src/build/rewards/UsageCounter.sol";
import {RpgfMinter} from "src/build/rewards/RpgfMinter.sol";
import {ClauseRegistry} from "src/build/registries/ClauseRegistry.sol";
import {AssemblyRegistry} from "src/build/registries/AssemblyRegistry.sol";
import {MembersRegistry} from "src/app/MembersRegistry.sol";
import {FlorinToken} from "src/build/florin/FlorinToken.sol";
import {MockWitnessPermit2} from "src/mocks/MockWitnessPermit2.sol";
import {MockSP1Verifier} from "src/mocks/MockSP1Verifier.sol";

/// @dev Exposes what the devnet script deploys. Its state is internal by
///      design (the script keeps long-lived addresses off the stack); the
///      harness adds getters and nothing else.
contract DevnetDeployHarness is Deploy {
    function core() external view returns (FigaroCore) {
        return _core;
    }

    function attestation() external view returns (AttestationCoordinator) {
        return _attestation;
    }

    function permit2() external view returns (address) {
        return address(_permit2);
    }

    function router() external view returns (address) {
        return address(_router);
    }

    function swapCoordinator() external view returns (WitnessSwapAndCommitCoordinator) {
        return _swapCoordinator;
    }

    function clauses() external view returns (ClauseRegistry) {
        return _clauses;
    }

    function assemblies() external view returns (AssemblyRegistry) {
        return _assemblies;
    }

    function members() external view returns (MembersRegistry) {
        return _members;
    }

    function florin() external view returns (FlorinToken) {
        return _florin;
    }

    function batchVerifier() external view returns (address) {
        return _batchVerifier;
    }

    function usageCounter() external view returns (address) {
        return _usageCounter;
    }
}

/// @dev The same for the mainnet script.
contract MainnetDeployHarness is DeployMainnet {
    function core() external view returns (address) {
        return _core;
    }

    function attestation() external view returns (address) {
        return _attestation;
    }

    function swapCoordinator() external view returns (address) {
        return _swapCoordinator;
    }

    function clauses() external view returns (address) {
        return _clauses;
    }

    function members() external view returns (address) {
        return _members;
    }

    function florin() external view returns (address) {
        return _florin;
    }

    function assemblies() external view returns (address) {
        return _assemblies;
    }

    function usageCounter() external view returns (address) {
        return _usageCounter;
    }

    function rpgfMinter() external view returns (address) {
        return _rpgfMinter;
    }

    function batchVerifier() external view returns (address) {
        return _batchVerifier;
    }
}

/// @dev What the mainnet script requires of SWAP_ROUTER: a SwapRouter02
///      shape whose `factory()` and `WETH9()` name contracts.
contract SwapRouterShape {
    function factory() external view returns (address) {
        return address(this);
    }

    function WETH9() external view returns (address) {
        return address(this);
    }
}

/// @title DeployWiringTest — the deploy scripts, run, then read back
/// @notice Nothing in the stack can be upgraded, paused or re-parameterised
///         after deployment, so the deploy scripts are the one place a wrong
///         immutable is cheap to catch. Each script runs here exactly as it
///         would broadcast, and every immutable and genesis parameter is then
///         read back from the deployed contracts and compared with what the
///         script was given: the mutual counter↔verifier binding, the
///         coordinator's kernel, Permit2 and router, the verifier's gateway,
///         vkey, registry and derived genesis root, the counter's gates and
///         schedule, the registries' deposits and cooldown, and the florin's
///         genesis mints, minter cap and renounced deployer.
contract DeployWiringTest is Test {
    /// Anvil account 0 — the devnet deployer, and a stand-in here.
    uint256 internal constant DEPLOYER_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    bytes32 internal constant PROV_KEY = keccak256(abi.encode("figaro-assembly-provenance", uint64(1)));

    /// The genesis root both scripts derive: one keccak256("") per kernel
    /// state map plus the usage leg over three zero-length sections.
    function _genesisRoot() internal pure returns (bytes32) {
        bytes32 emptyMap = keccak256("");
        bytes32 emptyUsage = keccak256(abi.encodePacked(uint64(0), uint64(0), uint64(0)));
        return keccak256(abi.encodePacked(emptyMap, emptyMap, emptyMap, emptyUsage));
    }

    struct MainnetInputs {
        address founder;
        address supporters;
        address dao;
        address permit2;
        address router;
        address gateway;
        bytes32 vkey;
    }

    // ── Devnet ───────────────────────────────────────────────────

    function test_devnetDeploy_wiresEveryImmutable() public {
        vm.setEnv("PRIVATE_KEY", vm.toString(DEPLOYER_KEY));
        DevnetDeployHarness d = new DevnetDeployHarness();
        d.run();

        _assertDevnetProtocol(d);
        _assertDevnetVerifierAndCounter(d);
        _assertDevnetRegistriesAndFlorin(d);
    }

    function _assertDevnetProtocol(DevnetDeployHarness d) internal view {
        address core = address(d.core());
        assertEq(address(d.attestation().core()), core, "attestation -> kernel");
        WitnessSwapAndCommitCoordinator swap = d.swapCoordinator();
        assertEq(address(swap.figaroCore()), core, "swap coordinator -> kernel");
        assertEq(address(swap.permit2()), d.permit2(), "swap coordinator -> permit2");
        assertEq(swap.router(), d.router(), "swap coordinator -> router");
    }

    function _assertDevnetVerifierAndCounter(DevnetDeployHarness d) internal view {
        FigaroBatchVerifier bv = FigaroBatchVerifier(d.batchVerifier());
        UsageCounter uc = UsageCounter(d.usageCounter());
        assertEq(address(bv.usageCounter()), address(uc), "verifier -> counter");
        assertEq(uc.batchVerifier(), address(bv), "counter -> verifier (the adjacent pair)");
        assertEq(address(bv.clauseRegistry()), address(d.clauses()), "verifier -> clause registry");
        assertGt(address(bv.verifier()).code.length, 0, "verifier -> a gateway with code");
        assertEq(bv.programVKey(), keccak256(abi.encodePacked("figaro-kernel-dev")), "devnet vkey");
        assertEq(bv.stateRoot(), _genesisRoot(), "derived genesis root");
        assertEq(bv.batchCount(), 0);

        assertEq(address(uc.core()), address(d.core()), "counter -> kernel");
        assertEq(address(uc.members()), address(d.members()), "counter -> members");
        assertEq(address(uc.clauses()), address(d.clauses()), "counter -> clauses");
        assertEq(address(uc.assemblies()), address(d.assemblies()), "counter -> assemblies");
        assertEq(uc.provenanceClause(), PROV_KEY, "provenance clause");
        assertTrue(uc.excludedClauseOrAssembly(PROV_KEY), "only the provenance clause is excluded");
        assertEq(uc.periodCount(), 9, "nine periods");
        assertEq(uc.minSellers(), 3, "the minimum-support floor");
    }

    function _assertDevnetRegistriesAndFlorin(DevnetDeployHarness d) internal view {
        assertEq(d.clauses().registrationDeposit(), 0.001 ether, "devnet clause deposit");
        assertEq(d.assemblies().registrationDeposit(), 0.001 ether, "devnet assembly deposit");
        assertEq(d.members().registrationDeposit(), 0.001 ether, "devnet member deposit");
        assertEq(d.members().withdrawalCooldown(), 0, "devnet cooldown");

        FlorinToken f = d.florin();
        assertTrue(f.deployerMintRenounced(), "deployer mint renounced");
        assertEq(f.totalRegisteredCap(), 1_000_000_000 ether, "every florin is spoken for");
        assertEq(f.balanceOf(vm.addr(DEPLOYER_KEY)), 100_000_000 ether, "founder + supporters, lumped on devnet");
        assertEq(f.totalSupply(), 400_000_000 ether, "the genesis 400M minted");
    }

    // ── Mainnet ──────────────────────────────────────────────────

    function test_mainnetDeploy_wiresEveryImmutable() public {
        MainnetInputs memory in_ = MainnetInputs({
            founder: makeAddr("founder"),
            supporters: makeAddr("supporters"),
            dao: makeAddr("dao"),
            permit2: address(new MockWitnessPermit2()),
            router: address(new SwapRouterShape()),
            gateway: address(new MockSP1Verifier()),
            vkey: keccak256("mainnet-vkey")
        });

        vm.setEnv("PRIVATE_KEY", vm.toString(DEPLOYER_KEY));
        vm.setEnv("FOUNDER_WALLET", vm.toString(in_.founder));
        vm.setEnv("SUPPORTERS_WALLET", vm.toString(in_.supporters));
        vm.setEnv("DAO_WALLET", vm.toString(in_.dao));
        vm.setEnv("RPGF_GENESIS", vm.toString(block.timestamp));
        vm.setEnv("PERMIT2", vm.toString(in_.permit2));
        vm.setEnv("SWAP_ROUTER", vm.toString(in_.router));
        vm.setEnv("SP1_VERIFIER_GATEWAY", vm.toString(in_.gateway));
        vm.setEnv("SP1_PROGRAM_VKEY", vm.toString(in_.vkey));

        MainnetDeployHarness d = new MainnetDeployHarness();
        d.run();

        _assertMainnetProtocol(d, in_);
        _assertMainnetVerifierAndCounter(d, in_);
        _assertMainnetRegistries(d);
        _assertMainnetMinterAndFlorin(d, in_);
    }

    function _assertMainnetProtocol(MainnetDeployHarness d, MainnetInputs memory in_) internal view {
        address core = d.core();
        assertEq(address(AttestationCoordinator(d.attestation()).core()), core, "attestation -> kernel");
        WitnessSwapAndCommitCoordinator swap = WitnessSwapAndCommitCoordinator(d.swapCoordinator());
        assertEq(address(swap.figaroCore()), core, "swap coordinator -> kernel");
        assertEq(address(swap.permit2()), in_.permit2, "swap coordinator -> PERMIT2");
        assertEq(swap.router(), in_.router, "swap coordinator -> SWAP_ROUTER");
    }

    function _assertMainnetVerifierAndCounter(MainnetDeployHarness d, MainnetInputs memory in_) internal view {
        FigaroBatchVerifier bv = FigaroBatchVerifier(d.batchVerifier());
        UsageCounter uc = UsageCounter(d.usageCounter());
        assertEq(address(bv.usageCounter()), address(uc), "verifier -> counter");
        assertEq(uc.batchVerifier(), address(bv), "counter -> verifier (the adjacent pair)");
        assertEq(address(bv.clauseRegistry()), d.clauses(), "verifier -> clause registry");
        assertEq(address(bv.verifier()), in_.gateway, "verifier -> SP1_VERIFIER_GATEWAY");
        assertEq(bv.programVKey(), in_.vkey, "verifier -> SP1_PROGRAM_VKEY");
        assertEq(bv.stateRoot(), _genesisRoot(), "derived genesis root");

        assertEq(address(uc.core()), d.core(), "counter -> kernel");
        assertEq(address(uc.members()), d.members(), "counter -> members");
        assertEq(address(uc.clauses()), d.clauses(), "counter -> clauses");
        assertEq(address(uc.assemblies()), d.assemblies(), "counter -> assemblies");
        assertEq(uc.provenanceClause(), PROV_KEY, "provenance clause");
        assertTrue(uc.excludedClauseOrAssembly(PROV_KEY), "only the provenance clause is excluded");
        assertEq(uc.periodCount(), 9, "nine annual periods");
        assertEq(uc.minSellers(), 3, "the minimum-support floor");
        assertEq(uc.currentPeriod(), 0, "the schedule starts at genesis");
    }

    function _assertMainnetRegistries(MainnetDeployHarness d) internal view {
        assertEq(ClauseRegistry(d.clauses()).registrationDeposit(), 0.05 ether, "mainnet clause deposit");
        assertEq(AssemblyRegistry(d.assemblies()).registrationDeposit(), 0.05 ether, "mainnet assembly deposit");
        assertEq(MembersRegistry(d.members()).registrationDeposit(), 0.05 ether, "mainnet member deposit");
        assertEq(MembersRegistry(d.members()).withdrawalCooldown(), 28 days, "mainnet cooldown");
    }

    function _assertMainnetMinterAndFlorin(MainnetDeployHarness d, MainnetInputs memory in_) internal view {
        RpgfMinter m = RpgfMinter(d.rpgfMinter());
        assertEq(address(m.florin()), d.florin(), "minter -> florin");
        assertEq(address(m.counter()), d.usageCounter(), "minter -> counter");
        assertEq(address(m.clauses()), d.clauses(), "minter -> clauses");
        assertEq(address(m.assemblies()), d.assemblies(), "minter -> assemblies");
        assertEq(m.periodCount(), 9, "one schedule");
        uint256 budget;
        for (uint256 i = 0; i < 9; i++) {
            budget += m.periodAmount(i);
        }
        assertEq(budget, 600_000_000 ether, "the period budgets sum to the 600M");

        FlorinToken f = FlorinToken(d.florin());
        (uint256 minterCap, uint256 minterMinted) = f.minters(address(m));
        assertEq(minterCap, 600_000_000 ether, "the minter's cap is the 600M");
        assertEq(minterMinted, 0, "nothing minted at genesis");
        assertTrue(f.deployerMintRenounced(), "deployer mint renounced");
        assertEq(f.totalRegisteredCap(), 1_000_000_000 ether, "every florin is spoken for");
        assertEq(f.balanceOf(in_.founder), 70_000_000 ether, "founder 7%");
        assertEq(f.balanceOf(in_.supporters), 30_000_000 ether, "supporters 3%");
        assertEq(f.balanceOf(in_.dao), 300_000_000 ether, "DAO 30%");
        assertEq(f.totalSupply(), 400_000_000 ether, "the genesis 400M minted, the 600M reserved");
    }
}
