// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {Deploy} from "script/Deploy.s.sol";
import {DeployMainnet} from "script/DeployMainnet.s.sol";
import {DeploySepolia} from "script/DeploySepolia.s.sol";
import {DeploySepoliaPair} from "script/DeploySepoliaPair.s.sol";
import {DeploySwapCoordinator} from "script/DeploySwapCoordinator.s.sol";
import {MintTokensScript} from "script/MintTokens.s.sol";
import {FigaroCore} from "src/core/kernel/FigaroCore.sol";
import {AttestationCoordinator} from "src/core/attestation/AttestationCoordinator.sol";
import {WitnessSwapAndCommitCoordinator} from "src/composability/WitnessSwapAndCommitCoordinator.sol";
import {FigaroBatchVerifier} from "src/core/verifier/FigaroBatchVerifier.sol";
import {UsageCounter} from "src/rewards/UsageCounter.sol";
import {RpgfMinter} from "src/rewards/RpgfMinter.sol";
import {ClauseRegistry} from "src/registries/ClauseRegistry.sol";
import {ProcessRegistry} from "src/registries/ProcessRegistry.sol";
import {AgreementRegistry} from "src/registries/AgreementRegistry.sol";
import {MembersRegistry} from "src/registries/MembersRegistry.sol";
import {FlorinToken} from "src/rewards/FlorinToken.sol";
import {MockERC20} from "src/mocks/MockERC20.sol";
import {MockWitnessPermit2} from "src/mocks/MockWitnessPermit2.sol";
import {MockSP1Verifier} from "src/mocks/MockSP1Verifier.sol";
import {MockTreasuryMultisig} from "src/mocks/MockTreasuryMultisig.sol";

/// @dev The addresses one deploy script produced. Each harness below fills it
///      from its script's state; the test reads every parameter back from it.
struct Stack {
    address core;
    address attestation;
    address swapCoordinator;
    address permit2;
    address router;
    address clauses;
    address assemblies;
    address agreements;
    address members;
    address usageCounter;
    address batchVerifier;
    address florin;
    address rpgfMinter;
}

/// @dev Exposes what the devnet script deploys. Its state is internal by
///      design (the script keeps long-lived addresses off the stack); the
///      harness adds getters and nothing else. Every getter casts to an
///      address, so the harness reads the script whatever type it keeps.
contract DevnetDeployHarness is Deploy {
    function stack() external view returns (Stack memory s) {
        s.core = address(_core);
        s.attestation = address(_attestation);
        s.swapCoordinator = address(_swapCoordinator);
        s.permit2 = address(_permit2);
        s.router = address(_router);
        s.clauses = address(_clauses);
        s.assemblies = address(_assemblies);
        s.agreements = address(_agreements);
        s.members = address(_members);
        s.usageCounter = address(_usageCounter);
        s.batchVerifier = address(_batchVerifier);
        s.florin = address(_florin);
        // The devnet script keeps no minter in its state: the test takes it
        // from the deployer's address sequence.
    }

    function token() external view returns (address) {
        return address(_token);
    }

    function permitToken() external view returns (address) {
        return address(_permitToken);
    }
}

/// @dev The same for the mainnet script.
contract MainnetDeployHarness is DeployMainnet {
    function stack() external view returns (Stack memory s) {
        s.core = address(_core);
        s.attestation = address(_attestation);
        s.swapCoordinator = address(_swapCoordinator);
        s.clauses = address(_clauses);
        s.assemblies = address(_assemblies);
        s.agreements = address(_agreements);
        s.members = address(_members);
        s.usageCounter = address(_usageCounter);
        s.batchVerifier = address(_batchVerifier);
        s.florin = address(_florin);
        s.rpgfMinter = address(_rpgfMinter);
    }
}

/// @dev The same for the full Sepolia script, with the treasury address the
///      script read from DAO_WALLET.
contract SepoliaDeployHarness is DeploySepolia {
    function stack() external view returns (Stack memory s) {
        s.core = address(_core);
        s.attestation = address(_attestation);
        s.swapCoordinator = address(_swapCoordinator);
        s.clauses = address(_clauses);
        s.assemblies = address(_assemblies);
        s.agreements = address(_agreements);
        s.members = address(_members);
        s.usageCounter = address(_usageCounter);
        s.batchVerifier = address(_batchVerifier);
        s.florin = address(_florin);
        s.rpgfMinter = address(_rpgfMinter);
    }

    function daoTreasury() external view returns (address) {
        return _daoTreasury;
    }
}

/// @dev The same for the Sepolia pair-only script.
contract SepoliaPairDeployHarness is DeploySepoliaPair {
    function usageCounter() external view returns (address) {
        return address(_usageCounter);
    }

    function batchVerifier() external view returns (address) {
        return address(_batchVerifier);
    }
}

/// @dev What the public scripts require of SWAP_ROUTER: a SwapRouter02
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
/// @notice Nothing in the stack can be upgraded, paused or re-parameterized
///         after deployment, so the deploy scripts are the one place a wrong
///         immutable is cheap to catch. Each script runs here exactly as it
///         would broadcast, and three things are then checked against ONE
///         schedule and ONE set of parameters stated below in literals:
///
///         1. Every parameter read back from the deployed contracts: each
///            period's end and budget, the period count, the support floor,
///            the stakes and the cooldown, the mutual counter↔verifier
///            binding, every address the counter, the minter, the verifier and
///            the coordinator hold, and the florin's genesis.
///         2. The deployer's address sequence: from a fixed deployer at nonce
///            zero, the n-th creation lands at a fixed address, so the list of
///            roles by nonce fixes the deployment order, and the deployer's
///            final nonce fixes the number of transactions.
///         3. The code at each address: the contract is deployed again, in a
///            snapshot, at the same address and from the same deployer, with
///            the constructor arguments stated here, and the two runtime code
///            hashes must agree. Immutables are part of the runtime code, so
///            this pins each contract's kind and its constructor arguments,
///            under whatever compiler profile the suite runs.
///         Where a chain legitimately differs, its expected value says so.
contract DeployWiringTest is Test {
    /// Anvil account 0 — the devnet deployer, and a stand-in here.
    uint256 internal constant DEPLOYER_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address internal constant DEPLOYER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    bytes32 internal constant PROVENANCE_LEAF = keccak256("figaro-agreement-provenance");
    bytes32 internal constant DEV_VKEY = keccak256(abi.encodePacked("figaro-kernel-dev"));

    // ── The one schedule, in literals ───────────────────────────────

    /// One accrual period: a year, on every chain.
    uint256 internal constant PERIOD = 365 days;
    uint256 internal constant PERIOD_COUNT = 9;
    uint256 internal constant MIN_SELLERS = 3;
    uint256 internal constant RPGF_CAP = 600_000_000 ether;
    uint256 internal constant GENESIS_SUPPLY = 400_000_000 ether;
    uint256 internal constant MAX_SUPPLY = 1_000_000_000 ether;

    /// The nine annual budgets: three rising tranches, equal within each.
    function _budget(uint256 i) internal pure returns (uint256) {
        uint256[9] memory b = [
            uint256(45_000_000 ether),
            45_000_000 ether,
            60_000_000 ether,
            60_000_000 ether,
            60_000_000 ether,
            82_500_000 ether,
            82_500_000 ether,
            82_500_000 ether,
            82_500_000 ether
        ];
        return b[i];
    }

    /// The period ends a counter must hold for a genesis.
    function _periodEnds(uint256 genesis) internal pure returns (uint64[] memory ends) {
        ends = new uint64[](PERIOD_COUNT);
        for (uint256 i = 0; i < PERIOD_COUNT; ++i) {
            ends[i] = uint64(genesis + (i + 1) * PERIOD);
        }
    }

    function _budgets() internal pure returns (uint256[] memory amounts) {
        amounts = new uint256[](PERIOD_COUNT);
        for (uint256 i = 0; i < PERIOD_COUNT; ++i) {
            amounts[i] = _budget(i);
        }
    }

    // ── The deployer's address sequence, in literals ────────────────
    // `cast compute-address 0xf39F…2266 --nonce n`: the address the deployer's
    // creation at nonce n lands at.

    address internal constant AT_0 = 0x5FbDB2315678afecb367f032d93F642f64180aa3;
    address internal constant AT_1 = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512;
    address internal constant AT_2 = 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0;
    address internal constant AT_3 = 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9;
    address internal constant AT_4 = 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9;
    address internal constant AT_5 = 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707;
    address internal constant AT_6 = 0x0165878A594ca255338adfa4d48449f69242Eb8F;
    address internal constant AT_7 = 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853;
    address internal constant AT_8 = 0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6;
    address internal constant AT_9 = 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318;
    address internal constant AT_10 = 0x610178dA211FEF7D417bC0e6FeD39F05609AD788;
    address internal constant AT_11 = 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e;
    address internal constant AT_12 = 0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0;
    address internal constant AT_13 = 0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82;
    address internal constant AT_14 = 0x9A676e781A523b5d0C0e43731313A708CB607508;
    address internal constant AT_15 = 0x0B306BF915C4d645ff596e518fAf3F9669b97016;
    address internal constant AT_16 = 0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1;
    address internal constant AT_17 = 0x9A9f2CCfdE556A7E9Ff0848998Aa4a0CFD8863AE;
    address internal constant AT_18 = 0x68B1D87F95878fE05B998F19b66F4baba5De1aed;
    address internal constant AT_20 = 0xc6e7DF5E7b4f2A278906862b61205850344D4e7d;

    /// The genesis root: the guest's state tree over no entries
    /// (`prover/lib/src/state_tree.rs`), zero.
    function _genesisRoot() internal pure returns (bytes32) {
        return bytes32(0);
    }

    /// What one chain's deployment must hold.
    struct Expected {
        uint256 designerStake;
        uint256 memberStake;
        uint256 cooldown;
        address sp1Verifier;
        bytes32 vkey;
        uint256 genesis;
        address[] holders;
        uint256[] balances;
    }

    struct PublicInputs {
        address founder;
        address supporters;
        address dao;
        address permit2;
        address router;
        address gateway;
    }

    /// @dev The public scripts' environment. vm.setEnv is process-global and
    ///      the tests run in parallel, so every test that sets these names
    ///      sets the same values: the same labels, and the same contracts
    ///      created by this test contract in the same order (permit2, router,
    ///      gateway — the first three creations of every such test).
    function _publicInputs() internal returns (PublicInputs memory in_) {
        in_.founder = makeAddr("founder");
        in_.supporters = makeAddr("supporters");
        in_.dao = makeAddr("dao");
        in_.permit2 = address(new MockWitnessPermit2());
        in_.router = address(new SwapRouterShape());
        in_.gateway = address(new MockSP1Verifier());

        vm.setEnv("PRIVATE_KEY", vm.toString(DEPLOYER_KEY));
        vm.setEnv("FOUNDER_WALLET", vm.toString(in_.founder));
        vm.setEnv("SUPPORTERS_WALLET", vm.toString(in_.supporters));
        vm.setEnv("DAO_WALLET", vm.toString(in_.dao));
        vm.setEnv("RPGF_GENESIS", vm.toString(block.timestamp));
        vm.setEnv("PERMIT2", vm.toString(in_.permit2));
        vm.setEnv("SWAP_ROUTER", vm.toString(in_.router));
        // The wrapper resolves the routed verifier on the gateway and exports it
        // as SP1_VERIFIER; the script binds that. The mock names a circuit, as a
        // routed verifier does.
        vm.setEnv("SP1_VERIFIER", vm.toString(in_.gateway));
        // The devnet default too, so whichever test's setEnv lands last, every
        // deploy reads one value.
        vm.setEnv("SP1_PROGRAM_VKEY", vm.toString(DEV_VKEY));
    }

    /// @dev Mainnet and Sepolia: one parameter set, the founder 70M, the
    ///      supporters 30M and the DAO 300M.
    function _publicExpected(PublicInputs memory in_) internal view returns (Expected memory e) {
        e.designerStake = 0.05 ether;
        e.memberStake = 0.05 ether;
        e.cooldown = 28 days;
        e.sp1Verifier = in_.gateway;
        e.vkey = DEV_VKEY;
        e.genesis = block.timestamp;
        e.holders = new address[](3);
        e.balances = new uint256[](3);
        (e.holders[0], e.balances[0]) = (in_.founder, 70_000_000 ether);
        (e.holders[1], e.balances[1]) = (in_.supporters, 30_000_000 ether);
        (e.holders[2], e.balances[2]) = (in_.dao, 300_000_000 ether);
    }

    // ── Devnet ───────────────────────────────────────────────────

    function test_devnetDeploy_wiresEveryImmutable() public {
        vm.setEnv("PRIVATE_KEY", vm.toString(DEPLOYER_KEY));
        // The process environment is shared by every test in this file, and
        // the public tests set their own key: pin the devnet default here so
        // the assertion below reads what this deploy was given.
        vm.setEnv("SP1_PROGRAM_VKEY", vm.toString(DEV_VKEY));
        DevnetDeployHarness d = new DevnetDeployHarness();
        d.run();

        Stack memory s = d.stack();
        // Devnet's deployer nonces: 0 MockERC20, 1 MockPermitToken, 2 Core,
        // 3 attestation, 4 MockWitnessPermit2, 5 MockSwapVenue, 6 coordinator,
        // 7–8 router liquidity mints, 9 clauses, 10 process designs,
        // 11 agreements, 12 members, 13 MockDisperse, 14 MockSP1Verifier,
        // 15 counter, 16 verifier, 17 florin, 18 minter, 19 the minter's
        // registration, 20 MockTreasuryMultisig, 21 the deployer's
        // registration, 22–23 the genesis mints, 24 the renounce, 25–64 the
        // test-token mints to anvil[0..19].
        assertEq(d.token(), AT_0, "nonce 0: MockERC20");
        assertEq(d.permitToken(), AT_1, "nonce 1: MockPermitToken");
        assertEq(s.core, AT_2, "nonce 2: FigaroCore");
        assertEq(s.attestation, AT_3, "nonce 3: AttestationCoordinator");
        assertEq(s.permit2, AT_4, "nonce 4: MockWitnessPermit2");
        assertEq(s.router, AT_5, "nonce 5: MockSwapVenue");
        assertEq(s.swapCoordinator, AT_6, "nonce 6: WitnessSwapAndCommitCoordinator");
        assertEq(s.clauses, AT_9, "nonce 9: ClauseRegistry");
        assertEq(s.assemblies, AT_10, "nonce 10: ProcessRegistry");
        assertEq(s.agreements, AT_11, "nonce 11: AgreementRegistry");
        assertEq(s.members, AT_12, "nonce 12: MembersRegistry");
        address disperse = AT_13;
        address mockSp1 = AT_14;
        assertEq(s.usageCounter, AT_15, "nonce 15: UsageCounter");
        assertEq(s.batchVerifier, AT_16, "nonce 16: FigaroBatchVerifier");
        assertEq(s.florin, AT_17, "nonce 17: FlorinToken");
        s.rpgfMinter = AT_18;
        address treasury = AT_20;
        assertEq(vm.getNonce(DEPLOYER), 65, "devnet: 65 transactions");

        Expected memory e;
        // Devnet: 0.001 ETH stakes and no cooldown, for test wallets.
        e.designerStake = 0.001 ether;
        e.memberStake = 0.001 ether;
        e.cooldown = 0;
        // Devnet: a mock SP1 verifier, and the dev key.
        e.sp1Verifier = mockSp1;
        e.vkey = DEV_VKEY;
        // Devnet: the schedule starts at the deploy block's time.
        e.genesis = block.timestamp;
        // Devnet: founder and supporters lumped on the deployer (100M), the
        // DAO's 300M to a mock multisig.
        e.holders = new address[](2);
        e.balances = new uint256[](2);
        (e.holders[0], e.balances[0]) = (DEPLOYER, 100_000_000 ether);
        (e.holders[1], e.balances[1]) = (treasury, 300_000_000 ether);

        _assertStack(s, e);
        _assertStackCode(s, e);

        // The devnet's own contracts.
        _assertCode(d.token(), "MockERC20.sol:MockERC20", abi.encode("Mock Token", "MOCK"), "MockERC20");
        _assertCode(d.permitToken(), "MockPermitToken.sol:MockPermitToken", "", "MockPermitToken");
        _assertCode(s.permit2, "MockWitnessPermit2.sol:MockWitnessPermit2", "", "MockWitnessPermit2");
        _assertCode(s.router, "MockSwapVenue.sol:MockSwapVenue", "", "MockSwapVenue");
        _assertCode(disperse, "MockDisperse.sol:MockDisperse", "", "MockDisperse");
        _assertCode(mockSp1, "MockSP1Verifier.sol:MockSP1Verifier", "", "MockSP1Verifier");
        address[] memory owners = new address[](3);
        owners[0] = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
        owners[1] = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        owners[2] = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
        // The multisig's constructor refuses an owner its storage already
        // holds, and it caches neither its address nor its sender: its
        // reference copy is deployed at a fresh address.
        assertEq(
            treasury.codehash,
            deployCode("MockTreasuryMultisig.sol:MockTreasuryMultisig", abi.encode(owners, uint256(2))).codehash,
            "treasury: code or constructor arguments differ"
        );
        for (uint256 i = 0; i < 3; ++i) {
            assertEq(MockTreasuryMultisig(payable(treasury)).owners(i), owners[i], "treasury owner");
        }
        assertEq(MockTreasuryMultisig(payable(treasury)).threshold(), 2, "treasury 2-of-3");

        // Router liquidity, and 100k of each test token to anvil[0..19].
        assertEq(MockERC20(d.token()).balanceOf(s.router), 10_000_000 ether, "router liquidity, token");
        assertEq(MockERC20(d.permitToken()).balanceOf(s.router), 10_000_000 ether, "router liquidity, permit token");
        assertEq(MockERC20(d.token()).totalSupply(), 10_000_000 ether + 20 * 100_000 ether, "token supply");
        // anvil[0] is the deployer here, so it also holds the permit token's
        // 1M constructor mint.
        assertEq(
            MockERC20(d.permitToken()).balanceOf(DEPLOYER), 1_000_000 ether + 100_000 ether, "anvil[0] permit token"
        );
        assertEq(MockERC20(d.token()).balanceOf(0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199), 100_000 ether, "anvil[19]");
    }

    // ── Mainnet ──────────────────────────────────────────────────

    function test_mainnetDeploy_wiresEveryImmutable() public {
        PublicInputs memory in_ = _publicInputs();
        MainnetDeployHarness d = new MainnetDeployHarness();
        d.run();

        Stack memory s = d.stack();
        s.permit2 = in_.permit2;
        s.router = in_.router;
        _assertPublicSequence(s);
        Expected memory e = _publicExpected(in_);
        _assertStack(s, e);
        _assertStackCode(s, e);
    }

    // ── Sepolia full deploy ──────────────────────────────────────

    /// @dev The full Sepolia script, run as it broadcasts: the same sequence,
    ///      parameters and code as mainnet, and the treasury the address
    ///      DAO_WALLET names. Then the florin is read back: the deployer's
    ///      minter right is renounced, so neither a mint nor a new minter can
    ///      follow the genesis.
    function test_sepoliaDeploy_renouncesTheDeployerMint() public {
        PublicInputs memory in_ = _publicInputs();
        SepoliaDeployHarness d = new SepoliaDeployHarness();
        d.run();

        Stack memory s = d.stack();
        s.permit2 = in_.permit2;
        s.router = in_.router;
        _assertPublicSequence(s);
        Expected memory e = _publicExpected(in_);
        _assertStack(s, e);
        _assertStackCode(s, e);

        assertEq(d.daoTreasury(), in_.dao, "the treasury is the address DAO_WALLET names");
        assertEq(in_.dao.code.length, 0, "the script deploys nothing at the treasury's address");

        FlorinToken f = FlorinToken(s.florin);
        vm.startPrank(DEPLOYER);
        vm.expectRevert(FlorinToken.DeployerMintRenounced.selector);
        f.mint(DEPLOYER, 1);
        vm.expectRevert(FlorinToken.DeployerMintRenounced.selector);
        f.registerMinter(makeAddr("late-minter"), 1);
        vm.stopPrank();
    }

    /// @dev Mainnet and Sepolia: 0 Core, 1 attestation, 2 coordinator,
    ///      3 clauses, 4 process designs, 5 agreements, 6 members, 7 counter,
    ///      8 verifier, 9 florin, 10 minter, 11 the minter's registration,
    ///      12 the deployer's registration, 13–15 the three genesis mints,
    ///      16 the renounce.
    function _assertPublicSequence(Stack memory s) internal view {
        assertEq(s.core, AT_0, "nonce 0: FigaroCore");
        assertEq(s.attestation, AT_1, "nonce 1: AttestationCoordinator");
        assertEq(s.swapCoordinator, AT_2, "nonce 2: WitnessSwapAndCommitCoordinator");
        assertEq(s.clauses, AT_3, "nonce 3: ClauseRegistry");
        assertEq(s.assemblies, AT_4, "nonce 4: ProcessRegistry");
        assertEq(s.agreements, AT_5, "nonce 5: AgreementRegistry");
        assertEq(s.members, AT_6, "nonce 6: MembersRegistry");
        assertEq(s.usageCounter, AT_7, "nonce 7: UsageCounter");
        assertEq(s.batchVerifier, AT_8, "nonce 8: FigaroBatchVerifier");
        assertEq(s.florin, AT_9, "nonce 9: FlorinToken");
        assertEq(s.rpgfMinter, AT_10, "nonce 10: RpgfMinter");
        assertEq(vm.getNonce(DEPLOYER), 17, "public stack: 17 transactions");
    }

    // ── Sepolia pair-only redeploy ───────────────────────────────

    /// @dev The pair script against a stack that already stands: real Core and
    ///      registries deployed here as the EXISTING set, a mock gateway, and
    ///      the live schedule's shape. `runWith` is called directly
    ///      (vm.setEnv is process-global and tests run in parallel). Read back:
    ///      the mutual counter↔verifier binding, every address the pair binds
    ///      to the EXISTING set, the vkey, the derived genesis root, and the
    ///      schedule, period by period (the value a pair redeploy could lose).
    function test_sepoliaPairDeploy_wiresThePairToTheExistingStack() public {
        Stack memory s;
        s.core = address(new FigaroCore());
        s.members = address(new MembersRegistry(0.05 ether, 28 days));
        s.clauses = address(new ClauseRegistry(0.05 ether));
        s.assemblies = address(new ProcessRegistry(0.05 ether));
        s.agreements = address(new AgreementRegistry(0.05 ether));
        address gateway = address(new MockSP1Verifier());
        bytes32 vkey = keccak256("pair-vkey");
        // A genesis in the past, as a live schedule's is: the derived value is
        // carried, never re-anchored at the redeploy.
        vm.warp(1_000_000);
        uint64 genesis = uint64(block.timestamp - 1000);

        SepoliaPairDeployHarness d = new SepoliaPairDeployHarness();
        d.runWith(DEPLOYER_KEY, s.core, s.members, s.clauses, s.assemblies, s.agreements, gateway, vkey, genesis);

        s.usageCounter = d.usageCounter();
        s.batchVerifier = d.batchVerifier();
        // The pair: counter at the deployer's nonce 0, verifier at 1, nothing else.
        assertEq(s.usageCounter, AT_0, "nonce 0: UsageCounter");
        assertEq(s.batchVerifier, AT_1, "nonce 1: FigaroBatchVerifier");
        assertEq(vm.getNonce(DEPLOYER), 2, "pair: 2 transactions");

        _assertPair(s, gateway, vkey, genesis);
        _assertPairCode(s, gateway, vkey, genesis);
        assertEq(UsageCounter(s.usageCounter).currentPeriod(), 0, "the schedule's first period is open");
    }

    /// @dev An EXISTING address without code refuses the whole run — the
    ///      pair must never bind to an address that merely exists.
    function test_sepoliaPairDeploy_refusesAnExistingAddressWithoutCode() public {
        MembersRegistry members = new MembersRegistry(0.05 ether, 28 days);
        ClauseRegistry clauses = new ClauseRegistry(0.05 ether);
        ProcessRegistry assemblies = new ProcessRegistry(0.05 ether);
        AgreementRegistry agreements = new AgreementRegistry(0.05 ether);
        address gateway = address(new MockSP1Verifier());

        SepoliaPairDeployHarness d = new SepoliaPairDeployHarness();
        vm.expectRevert(bytes("EXISTING_FIGARO_CORE has no code on this chain"));
        d.runWith(
            DEPLOYER_KEY,
            makeAddr("no-code-core"),
            address(members),
            address(clauses),
            address(assemblies),
            address(agreements),
            gateway,
            keccak256("pair-vkey"),
            uint64(block.timestamp)
        );
    }

    // ── The swap coordinator alone, onto a live stack ────────────

    function test_swapCoordinatorDeploy_wiresTheLiveCore() public {
        PublicInputs memory in_ = _publicInputs();
        address core = address(new FigaroCore());
        // FIGARO_CORE is read by this script alone, so no other test races it.
        vm.setEnv("FIGARO_CORE", vm.toString(core));

        DeploySwapCoordinator d = new DeploySwapCoordinator();
        d.run();

        address coordinator = AT_0;
        assertEq(vm.getNonce(DEPLOYER), 1, "the coordinator alone: 1 transaction");
        WitnessSwapAndCommitCoordinator swap = WitnessSwapAndCommitCoordinator(coordinator);
        assertEq(address(swap.figaroCore()), core, "coordinator -> FIGARO_CORE");
        assertEq(address(swap.permit2()), in_.permit2, "coordinator -> PERMIT2");
        assertEq(swap.router(), in_.router, "coordinator -> SWAP_ROUTER");
        _assertCode(
            coordinator,
            "WitnessSwapAndCommitCoordinator.sol:WitnessSwapAndCommitCoordinator",
            abi.encode(core, in_.permit2, in_.router),
            "WitnessSwapAndCommitCoordinator"
        );
    }

    // ── The devnet test-token top-up ─────────────────────────────

    function test_mintTokens_mintsToTheTenAnvilAccounts() public {
        vm.setEnv("PRIVATE_KEY", vm.toString(DEPLOYER_KEY));
        MockERC20 token = new MockERC20("Mock Token", "MOCK");
        // TOKEN_ADDRESS is read by this script alone.
        vm.setEnv("TOKEN_ADDRESS", vm.toString(address(token)));

        MintTokensScript d = new MintTokensScript();
        d.run();

        assertEq(vm.getNonce(DEPLOYER), 10, "ten mints, nothing created");
        assertEq(token.totalSupply(), 10 * 100_000 ether, "100k to each of ten accounts");
        assertEq(token.balanceOf(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266), 100_000 ether, "anvil[0]");
        assertEq(token.balanceOf(0xa0Ee7A142d267C1f36714E4a8F75612F20a79720), 100_000 ether, "anvil[9]");
    }

    // ── The read-back ────────────────────────────────────────────

    function _assertStack(Stack memory s, Expected memory e) internal view {
        // The Core's compositions.
        assertEq(address(AttestationCoordinator(s.attestation).core()), s.core, "attestation -> FigaroCore");
        WitnessSwapAndCommitCoordinator swap = WitnessSwapAndCommitCoordinator(s.swapCoordinator);
        assertEq(address(swap.figaroCore()), s.core, "swap coordinator -> FigaroCore");
        assertEq(address(swap.permit2()), s.permit2, "swap coordinator -> permit2");
        assertEq(swap.router(), s.router, "swap coordinator -> router");

        // The registries.
        assertEq(ClauseRegistry(s.clauses).registrationDeposit(), e.designerStake, "clause stake");
        assertEq(ProcessRegistry(s.assemblies).registrationDeposit(), e.designerStake, "process design stake");
        assertEq(AgreementRegistry(s.agreements).registrationDeposit(), e.designerStake, "agreement stake");
        assertEq(MembersRegistry(s.members).registrationDeposit(), e.memberStake, "member stake");
        assertEq(MembersRegistry(s.members).withdrawalCooldown(), e.cooldown, "member cooldown");

        _assertPair(s, e.sp1Verifier, e.vkey, e.genesis);
        _assertMinterAndFlorin(s, e);
    }

    function _assertPair(Stack memory s, address sp1Verifier, bytes32 vkey, uint256 genesis) internal view {
        FigaroBatchVerifier bv = FigaroBatchVerifier(s.batchVerifier);
        UsageCounter uc = UsageCounter(s.usageCounter);
        assertEq(address(bv.usageCounter()), address(uc), "verifier -> counter");
        assertEq(uc.batchVerifier(), address(bv), "counter -> verifier (the adjacent pair)");
        assertEq(address(bv.verifier()), sp1Verifier, "verifier -> SP1 verifier");
        assertEq(bv.programVKey(), vkey, "verifier -> program key");
        assertEq(bv.stateRoot(), _genesisRoot(), "derived genesis root");
        assertEq(bv.batchCount(), 0, "a fresh verifier");

        assertEq(address(uc.core()), s.core, "counter -> FigaroCore");
        assertEq(address(uc.members()), s.members, "counter -> members");
        assertEq(address(uc.clauses()), s.clauses, "counter -> clauses");
        assertEq(address(uc.processDesigns()), s.assemblies, "counter -> process designs");
        assertEq(address(uc.agreements()), s.agreements, "counter -> agreements");
        assertEq(uc.provenanceLeaf(), PROVENANCE_LEAF, "the agreement format's provenance leaf");
        assertEq(uc.minSellers(), MIN_SELLERS, "the minimum-support floor");
        assertEq(uc.periodCount(), PERIOD_COUNT, "nine periods");
        for (uint256 i = 0; i < PERIOD_COUNT; ++i) {
            assertEq(uc.periodEnd(i), genesis + (i + 1) * PERIOD, string.concat("periodEnd ", vm.toString(i)));
        }
    }

    function _assertMinterAndFlorin(Stack memory s, Expected memory e) internal view {
        RpgfMinter m = RpgfMinter(s.rpgfMinter);
        assertEq(address(m.florin()), s.florin, "minter -> florin");
        assertEq(address(m.counter()), s.usageCounter, "minter -> counter");
        assertEq(address(m.members()), s.members, "minter -> members");
        assertEq(address(m.clauses()), s.clauses, "minter -> clauses");
        assertEq(address(m.processDesigns()), s.assemblies, "minter -> process designs");
        assertEq(address(m.agreements()), s.agreements, "minter -> agreements");
        assertEq(m.periodCount(), PERIOD_COUNT, "one schedule");
        for (uint256 i = 0; i < PERIOD_COUNT; ++i) {
            assertEq(m.periodAmount(i), _budget(i), string.concat("periodAmount ", vm.toString(i)));
        }

        FlorinToken f = FlorinToken(s.florin);
        (uint256 minterCap, uint256 minterMinted) = f.minters(s.rpgfMinter);
        assertEq(minterCap, RPGF_CAP, "the minter's cap is the 600M");
        assertEq(minterMinted, 0, "nothing minted by the minter at genesis");
        (uint256 deployerCap, uint256 deployerMinted) = f.minters(DEPLOYER);
        assertEq(deployerCap, GENESIS_SUPPLY, "the deployer's one-shot cap is the genesis 400M");
        assertEq(deployerMinted, GENESIS_SUPPLY, "the deployer minted exactly its cap");
        assertEq(f.deployer(), DEPLOYER, "the florin's deployer is the deploy key");
        assertTrue(f.deployerMintRenounced(), "deployer mint renounced");
        assertEq(f.totalRegisteredCap(), MAX_SUPPLY, "every florin is spoken for");
        uint256 sum;
        for (uint256 i = 0; i < e.holders.length; ++i) {
            assertEq(f.balanceOf(e.holders[i]), e.balances[i], "genesis balance");
            sum += e.balances[i];
        }
        assertEq(sum, GENESIS_SUPPLY, "the expected genesis is the 400M");
        assertEq(f.totalSupply(), GENESIS_SUPPLY, "the genesis 400M minted, the 600M reserved");
    }

    // ── The code at each address ─────────────────────────────────

    function _assertStackCode(Stack memory s, Expected memory e) internal {
        _assertCode(s.core, "FigaroCore.sol:FigaroCore", "", "FigaroCore");
        _assertCode(
            s.attestation,
            "AttestationCoordinator.sol:AttestationCoordinator",
            abi.encode(s.core),
            "AttestationCoordinator"
        );
        _assertCode(
            s.swapCoordinator,
            "WitnessSwapAndCommitCoordinator.sol:WitnessSwapAndCommitCoordinator",
            abi.encode(s.core, s.permit2, s.router),
            "WitnessSwapAndCommitCoordinator"
        );
        _assertCode(s.clauses, "ClauseRegistry.sol:ClauseRegistry", abi.encode(e.designerStake), "ClauseRegistry");
        _assertCode(s.assemblies, "ProcessRegistry.sol:ProcessRegistry", abi.encode(e.designerStake), "ProcessRegistry");
        _assertCode(
            s.agreements, "AgreementRegistry.sol:AgreementRegistry", abi.encode(e.designerStake), "AgreementRegistry"
        );
        _assertCode(
            s.members, "MembersRegistry.sol:MembersRegistry", abi.encode(e.memberStake, e.cooldown), "MembersRegistry"
        );
        _assertPairCode(s, e.sp1Verifier, e.vkey, e.genesis);
        _assertCode(s.florin, "FlorinToken.sol:FlorinToken", "", "FlorinToken");
        _assertCode(
            s.rpgfMinter,
            "RpgfMinter.sol:RpgfMinter",
            abi.encode(s.florin, s.usageCounter, s.members, s.clauses, s.assemblies, s.agreements, _budgets()),
            "RpgfMinter"
        );
    }

    function _assertPairCode(Stack memory s, address sp1Verifier, bytes32 vkey, uint256 genesis) internal {
        _assertCode(
            s.usageCounter,
            "UsageCounter.sol:UsageCounter",
            abi.encode(
                s.core,
                s.members,
                s.clauses,
                s.assemblies,
                s.agreements,
                s.batchVerifier,
                uint64(MIN_SELLERS),
                _periodEnds(genesis)
            ),
            "UsageCounter"
        );
        _assertCode(
            s.batchVerifier,
            "FigaroBatchVerifier.sol:FigaroBatchVerifier",
            abi.encode(sp1Verifier, vkey, s.usageCounter),
            "FigaroBatchVerifier"
        );
    }

    /// @dev Deploys `artifact` again at `at`, from the deployer, with `args`,
    ///      in a snapshot, and requires the runtime code to equal what the
    ///      script left there. The address is the same, so an immutable that
    ///      caches `address(this)` (an EIP-712 domain) agrees; the sender is
    ///      the same, so one that stores `msg.sender` (the florin's deployer)
    ///      agrees too.
    function _assertCode(address at, string memory artifact, bytes memory args, string memory label) internal {
        bytes32 got = at.codehash;
        assertTrue(at.code.length != 0, string.concat(label, ": no code"));
        uint256 snap = vm.snapshotState();
        vm.startPrank(DEPLOYER);
        deployCodeTo(artifact, args, at);
        vm.stopPrank();
        bytes32 want = at.codehash;
        vm.revertToState(snap);
        assertEq(got, want, string.concat(label, ": code or constructor arguments differ"));
    }
}
