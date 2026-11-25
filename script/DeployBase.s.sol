// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import "../src/core/kernel/FigaroCore.sol";
import "../src/core/attestation/AttestationCoordinator.sol";
// Named import: the coordinator declares its own local-minimal `IFigaroCore`
// (the coordinator exemplar), which would collide with AttestationCoordinator's.
import {WitnessSwapAndCommitCoordinator} from "../src/composability/WitnessSwapAndCommitCoordinator.sol";
import {ClauseRegistry} from "../src/registries/ClauseRegistry.sol";
import {MembersRegistry} from "../src/registries/MembersRegistry.sol";
import {ProcessRegistry} from "../src/registries/ProcessRegistry.sol";
import {AgreementRegistry} from "../src/registries/AgreementRegistry.sol";
import {FlorinToken} from "../src/rewards/FlorinToken.sol";
import {RpgfMinter} from "../src/rewards/RpgfMinter.sol";
import {UsageCounter} from "../src/rewards/UsageCounter.sol";
import "../src/core/verifier/FigaroBatchVerifier.sol";

/// @title DeployBase — the one deployment every chain's script runs
///
/// @notice Holds, once, what every deploy script shares: the reward schedule
///         (nine annual periods and their budgets), the florin allocation, the
///         registries, the counter↔verifier pair with its address prediction,
///         the minter, the florin and its genesis, the swap-router probe and the
///         coordinator. A chain's script adds its own parameters and its genuine
///         differences only. No function here logs: each script prints its own
///         lines, which the deploy wrappers parse, after the call that deployed
///         what they name. test/script/DeployWiringTest.t.sol runs every script
///         and reads each parameter back against one schedule stated in literals.
///
///         The schedule: nine ANNUAL accrual periods ending at genesis + 1..9
///         years. The per-period budgets group into three RISING tranches — 15%
///         over years 1–2, 30% over 3–5, 55% over 6–9, equal slices within each
///         — so the largest share pays on the most-measured evidence and the
///         cold-start years carry the smallest budgets. 45+45+60·3+82.5·4 = 600M.
///         Every network, the devnet included, runs this same year: a test that
///         needs a closed period advances the chain's clock past its end.
///
/// florin allocation (1B cap):
///    70M   (7%)  founders   — genesis mint (no vesting, no unlock)
///    30M   (3%)  supporters — genesis mint (no vesting, no unlock)
///   300M  (30%)  DAO        — genesis mint (no vesting, no unlock)
///   600M  (60%)  RPGF       — RpgfMinter registered at genesis (registerMinter
///                           precedes renounce, so the minter MUST exist here);
///                           paid pro rata from UsageCounter accrual to the
///                           designers of record — uniform, no per-wallet cap;
///                           each key claimed once per closed annual period.
abstract contract DeployBase is Script {
    // ── The schedule ────────────────────────────────────────────────

    /// @dev One accrual period: a year, on every chain.
    uint64 internal constant PERIOD = 365 days;
    uint256 internal constant PERIOD_COUNT = 9;
    /// @dev The minimum-support floor: d' >= 3 distinct staked sellers before
    ///      a clause, agreement or process design scores.
    uint64 internal constant MIN_SELLERS = 3;

    // ── The florin allocation ───────────────────────────────────────

    uint256 internal constant FOUNDER_ALLOC = 70_000_000 ether; // 7%
    uint256 internal constant SUPPORTERS_ALLOC = 30_000_000 ether; // 3% — friends & family / early supporters
    uint256 internal constant DAO_ALLOC = 300_000_000 ether; // 30%
    uint256 internal constant RPGF_ALLOC = 600_000_000 ether; // 60%
    /// @dev The deployer's one-shot genesis cap: exactly the three genesis mints.
    uint256 internal constant GENESIS_ALLOC = FOUNDER_ALLOC + SUPPORTERS_ALLOC + DAO_ALLOC;

    // ── Deployment output addresses — set by the functions below ────

    address internal _core;
    address internal _attestation;
    address internal _swapCoordinator;
    address internal _clauses;
    address internal _assemblies;
    address internal _agreements;
    address internal _members;
    address internal _usageCounter;
    address internal _batchVerifier;
    address internal _florin;
    address internal _rpgfMinter;

    // ── The schedule's values ───────────────────────────────────────

    /// @dev The period ends for a genesis: genesis + (i + 1) years.
    function _periodEnds(uint64 genesis) internal pure returns (uint64[] memory periods) {
        periods = new uint64[](PERIOD_COUNT);
        for (uint256 i = 0; i < PERIOD_COUNT; ++i) {
            periods[i] = genesis + uint64(i + 1) * PERIOD;
        }
    }

    /// @dev The per-period RPGF budgets. They must sum to the registered
    ///      minter cap (RPGF_ALLOC): the FlorinToken cap is the outer backstop,
    ///      but an over-committed schedule would turn late-period claims into a
    ///      first-come race, so the two are asserted to agree at deploy.
    function _rpgfAmounts() internal pure returns (uint256[] memory a) {
        a = new uint256[](PERIOD_COUNT);
        a[0] = 45_000_000 ether;
        a[1] = 45_000_000 ether;
        a[2] = 60_000_000 ether;
        a[3] = 60_000_000 ether;
        a[4] = 60_000_000 ether;
        a[5] = 82_500_000 ether;
        a[6] = 82_500_000 ether;
        a[7] = 82_500_000 ether;
        a[8] = 82_500_000 ether;
        uint256 sum;
        for (uint256 i = 0; i < a.length; ++i) {
            sum += a[i];
        }
        require(sum == RPGF_ALLOC, "RPGF period budgets must sum to the allocation");
    }

    /// @dev A genesis whose first period has already ended would open the
    ///      schedule on a closed period.
    function _requireFirstPeriodEndsInFuture(uint256 genesis) internal view {
        require(genesis + PERIOD > block.timestamp, "RPGF_GENESIS must place the first annual period end in the future");
    }

    // ── The swap venue ──────────────────────────────────────────────

    /// @dev Permit2 must hold code, and the router is probed for BEHAVIOR:
    ///      SwapRouter02 answers factory() and WETH9() with contracts. An
    ///      address is never trusted for existing alone (the SP1 gateway
    ///      lesson, RELEASE_READINESS 7.3(c)).
    function _requireSwapVenue(address permit2, address router) internal view {
        require(permit2.code.length != 0, "PERMIT2 has no code on this chain");
        (bool okF, bytes memory f) = router.staticcall(abi.encodeWithSignature("factory()"));
        (bool okW, bytes memory w) = router.staticcall(abi.encodeWithSignature("WETH9()"));
        require(
            okF && f.length == 32 && abi.decode(f, (address)).code.length != 0,
            "SWAP_ROUTER: factory() is not a contract - not SwapRouter02"
        );
        require(
            okW && w.length == 32 && abi.decode(w, (address)).code.length != 0,
            "SWAP_ROUTER: WETH9() is not a contract - not SwapRouter02"
        );
    }

    // ── The deployment, in the order every script runs it ───────────

    /// @dev FigaroCore, then the AttestationCoordinator that reads it.
    function _deployCore() internal {
        _core = address(new FigaroCore());
        _attestation = address(new AttestationCoordinator(_core));
    }

    /// @dev The swap-funded on-ramp. Composition, not Core: it points at
    ///      FigaroCore, Permit2 and a SwapRouter02, and nothing points back.
    function _deploySwapCoordinator(address core, address permit2, address router) internal {
        _swapCoordinator = address(new WitnessSwapAndCommitCoordinator(core, permit2, router));
    }

    /// @dev The four registries, in one order: clauses, process designs,
    ///      agreements, members. The three designer-side registries share one
    ///      stake; the members registry has its own stake and cooldown.
    function _deployRegistries(uint256 designerStake, uint256 memberStake, uint256 memberCooldown) internal {
        _clauses = address(new ClauseRegistry(designerStake));
        _assemblies = address(new ProcessRegistry(designerStake));
        _agreements = address(new AgreementRegistry(designerStake));
        _members = address(new MembersRegistry(memberStake, memberCooldown));
    }

    /// @dev The counter and the verifier REFERENCE EACH OTHER — the verifier
    ///      writes the batch-path accrual, and the counter accepts that write
    ///      from no other address — so they deploy as an ADJACENT PAIR: the
    ///      counter binds the verifier's predicted address, the verifier binds
    ///      the counter's real one, and the prediction is required to have
    ///      held. A wrong guess fails the deploy instead of producing a counter
    ///      no verifier can write to. Reads `_core` and the four registries.
    ///      The verifier's genesis root is its own (`genesisRoot()`, zero: the
    ///      guest's state tree over no entries). Not a florin minter, never will be.
    function _deployPair(address deployer, address sp1Verifier, bytes32 vkey, uint64 genesis) internal {
        // The next two CREATEs from this deployer, in order: the counter,
        // then the verifier.
        address predictedVerifier = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 1);
        _usageCounter = address(
            new UsageCounter(
                _core,
                _members, // seller-side live-stake gate: usage counts only for live-staked sellers
                _clauses, // registration-side gate: a clause earns only while its stake is live
                _assemblies, // registration-side gate: a process design earns only while its stake is live
                _agreements, // registration-side gate: an agreement earns only while its stake is live
                predictedVerifier, // proof-gated writer of the batch-path accrual
                MIN_SELLERS,
                _periodEnds(genesis)
            )
        );
        _batchVerifier = address(new FigaroBatchVerifier(sp1Verifier, vkey, _usageCounter));
        require(_batchVerifier == predictedVerifier, "verifier address prediction failed");
    }

    /// @dev The florin, then the RPGF minter registered at its 600M cap. The
    ///      minter must exist at genesis: registerMinter only works before
    ///      renounce, and renounce is irreversible. Nothing is posted, bonded or
    ///      challenged: the counter records verified usage as it happens and the
    ///      minter pays pro rata from a period that has closed.
    function _deployFlorinAndMinter() internal {
        FlorinToken florin = new FlorinToken();
        _florin = address(florin);
        _rpgfMinter = address(
            new RpgfMinter(_florin, _usageCounter, _members, _clauses, _assemblies, _agreements, _rpgfAmounts())
        );
        florin.registerMinter(_rpgfMinter, RPGF_ALLOC);
    }

    /// @dev The genesis distribution, then the renounce. The deployer is
    ///      registered as a one-shot minter capped at exactly the genesis 400M,
    ///      so this is the ONLY deployer-side minting there can ever be. After
    ///      the renounce no minter can be registered and the deployer cannot
    ///      mint again: the full 1B cap is spoken for, 400M by these mints and
    ///      600M through the RpgfMinter's per-period claims.
    function _mintGenesisAndRenounce(address deployer, address[] memory to, uint256[] memory amounts) internal {
        FlorinToken florin = FlorinToken(_florin);
        florin.registerMinter(deployer, GENESIS_ALLOC);
        uint256 sum;
        for (uint256 i = 0; i < to.length; ++i) {
            florin.mint(to[i], amounts[i]);
            sum += amounts[i];
        }
        require(sum == GENESIS_ALLOC, "the genesis mints must exhaust the genesis allocation");
        florin.renounceDeployerMint();
    }
}

/// @title DeployPublicStack — the full stack on a public network
///
/// @notice Mainnet and Sepolia run this one deployment: Sepolia is the mainnet
///         rehearsal, with the same parameters, the real yearly schedule and the
///         real 28-day cooldown (compressed-time claim rehearsal is the
///         devnet's job). No mock is deployed.
///
/// Required environment variables:
///   PRIVATE_KEY        — deployer private key
///   FOUNDER_WALLET     — receives the 70M founder allocation at genesis
///   SUPPORTERS_WALLET  — receives the 30M supporters allocation at genesis
///   DAO_WALLET         — receives the 300M DAO allocation: the treasury's Safe,
///                        which stands on the chain before the script runs
///   RPGF_GENESIS       — unix timestamp anchoring the reward schedule
///   PERMIT2            — Permit2 on the target chain
///   SWAP_ROUTER        — Uniswap SwapRouter02 on the target chain
///   SP1_VERIFIER       — the SP1 verifier Succinct's gateway routes for this
///                        release's proofs, resolved by the wrapper on
///                        SP1_VERIFIER_GATEWAY and bound here, never the gateway
///   SP1_PROGRAM_VKEY   — the guest program's verification key
///
/// @dev Both paths bind an attestation the same way: to its signed agreement
///      (merkle inclusion) and to its content (keccak256), and neither
///      validates the content's shape — well-formedness is an off-chain SDK /
///      read-time concern. Neither `AttestationCoordinator` nor
///      `FigaroBatchVerifier` reads a registry, so any clause key is
///      attestable — and batch-resolvable — with no per-clause on-chain code.
///
/// @dev Deployer renounces minting rights at the end of this script. No new minters
///      can ever be registered afterward.
abstract contract DeployPublicStack is DeployBase {
    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");

        _validateEnv();

        vm.startBroadcast(privateKey);

        _deployProtocol(privateKey);
        _deployFlorinEcosystem(privateKey);

        vm.stopBroadcast();

        _logAddresses();
    }

    /// @dev A chain's treasury line, printed after the minter is registered.
    function _logTreasury() internal virtual {}

    /// @dev A chain's treasury line in the address summary.
    function _logTreasurySummary() internal view virtual {}

    // ── Environment validation ───────────────────────────────────────

    function _validateEnv() internal view {
        require(vm.envAddress("FOUNDER_WALLET") != address(0), "FOUNDER_WALLET not set");
        require(vm.envAddress("SUPPORTERS_WALLET") != address(0), "SUPPORTERS_WALLET not set");
        require(vm.envAddress("DAO_WALLET") != address(0), "DAO_WALLET not set");
        _requireFirstPeriodEndsInFuture(vm.envUint("RPGF_GENESIS"));
    }

    // ── The Core + compositions ────────────────────────────────

    function _deployProtocol(uint256 privateKey) internal {
        _deployCore();
        console.log("FigaroCore:             ", _core);
        console.log("AttestationCoordinator: ", _attestation);

        // ── WitnessSwapAndCommitCoordinator (the swap-funded on-ramp) ──────
        // Points at FigaroCore, canonical Permit2 and the chain's Uniswap
        // SwapRouter02 (env — from Uniswap's deployment docs), the router
        // probed for behavior first. A stack already live without it takes it
        // alone via script/DeploySwapCoordinator.s.sol.
        {
            address permit2 = vm.envAddress("PERMIT2");
            address router = vm.envAddress("SWAP_ROUTER");
            _requireSwapVenue(permit2, router);
            _deploySwapCoordinator(_core, permit2, router);
            console.log("WitnessSwapAndCommitCoordinator:", _swapCoordinator);
        }

        // ── Designer-side stakes (Clause / Process / Agreement) ──
        // 0.05 ETH per registration, returned in one call with no wait: a key
        // is the hash of its content and holds no name, so there is nothing to
        // take but bytes (DESIGN_DECISIONS § 7, § 41).
        // What sizes the stake: designer-side RPGF eligibility requires the
        // deposit LIVE AT CLAIM (RpgfMinter._isAuthor), so unlike the member
        // stake this capital is held for the WHOLE accrual period,
        // undiscounted — and it is the price of the registration-REPLICATION
        // lever: an adversary multiplying score across m self-registered
        // clauses committed into the same fabricated agreements holds m of
        // these for the full period. The spam floor is cleared ~100× over
        // registration gas; the bound itself is the RPGF paper §7.
        //
        // ── MembersRegistry — sized from the published bound ──
        // The two parameters are ONE Sybil price (RPGF paper §7 is the proof;
        // RELEASE_READINESS "Resolve Mainnet Registry Parameters" the working):
        // a fabricated staked-seller identity costs δ = D·T/P of committed
        // capital per annual period (one deposit recycles through at most P/T
        // identities), and the attacker's committed capital per unit of
        // fabricated score is γ = δ + g below δ = 2g, else ≈1.89·δ^(2/3)·g^(1/3)
        // — linear in score, published, recomputable by anyone.
        //   - D = 0.05 ether: ~100× the registration gas (the spam floor) while
        //     staying inside what a genuine small seller commits to be
        //     discoverable at all; denominated in ETH only — no fiat anchor.
        //   - T = 28 days: against P = 365 days this makes P/T ≈ 13, so
        //     δ = D/13 ≈ 3.8e-3 ETH per identity-period. De-surfacing stays
        //     immediate at request; only the ETH release waits. Costless to a
        //     seller who stays; only identity churn pays it.
        // Stated honestly, as §7 does: above δ = 2g the deposit's bite grows
        // only as δ^(2/3) (gas-bought volume substitutes under the cube root),
        // so these values buy a published, convex capture-cost curve — not
        // farm-proofness, which no scoring shape can buy.
        //
        // Clauses are NOT registered here. Their content is pinned to IPFS +
        // anchored on ClauseRegistry by frontend/scripts/populate-clauses.mjs —
        // the single clause-population path, so each on-chain (clauseKey,
        // contentURI) points at a REAL pinned spec whose bytes hash to the key.
        // There is no per-clause on-chain validator to bind. Run
        // populate-clauses.mjs after broadcast.
        _deployRegistries(0.05 ether, 0.05 ether, 28 days);
        console.log("ClauseRegistry:         ", _clauses);
        console.log("ProcessRegistry:       ", _assemblies);
        console.log("AgreementRegistry:      ", _agreements);
        console.log("MembersRegistry:       ", _members);

        // ── FigaroBatchVerifier (proof-based batch resolution) ─────
        // SP1_VERIFIER: the SP1 verifier contract Succinct's gateway routes
        // for this release's proofs, resolved by the deploy wrapper on
        // SP1_VERIFIER_GATEWAY and bound here immutably — never the gateway,
        // whose owner can freeze a route; the constructor probes
        // VERIFIER_HASH() and refuses a gateway.
        // SP1_PROGRAM_VKEY: the guest program's verification key —
        // `SP1_VKEY_ONLY=1 cargo run -p figaro-prove-test --release`.
        require(vm.envAddress("SP1_VERIFIER") != address(0), "SP1_VERIFIER not set");
        require(vm.envBytes32("SP1_PROGRAM_VKEY") != bytes32(0), "SP1_PROGRAM_VKEY not set");
        _deployPair(
            vm.addr(privateKey),
            vm.envAddress("SP1_VERIFIER"),
            vm.envBytes32("SP1_PROGRAM_VKEY"),
            uint64(vm.envUint("RPGF_GENESIS"))
        );
        console.log("UsageCounter:           ", _usageCounter);
        console.log("FigaroBatchVerifier:    ", _batchVerifier);
    }

    // ── florin token + genesis distribution ─────────────────────────

    function _deployFlorinEcosystem(uint256 privateKey) internal {
        _deployFlorinAndMinter();
        console.log("FlorinToken:               ", _florin);
        console.log("RpgfMinter:             ", _rpgfMinter);

        _logTreasury();

        address[] memory to = new address[](3);
        uint256[] memory amounts = new uint256[](3);
        (to[0], amounts[0]) = (vm.envAddress("FOUNDER_WALLET"), FOUNDER_ALLOC);
        (to[1], amounts[1]) = (vm.envAddress("SUPPORTERS_WALLET"), SUPPORTERS_ALLOC);
        (to[2], amounts[2]) = (vm.envAddress("DAO_WALLET"), DAO_ALLOC);
        _mintGenesisAndRenounce(vm.addr(privateKey), to, amounts);
        console.log("FlorinToken: genesis mint complete (founder + supporters + DAO)");
        // The balances the wrapper reads back from the chain, printed from
        // the one allocation above rather than restated in the wrapper.
        console.log("  FLORIN_GENESIS_FOUNDER_WEI=", FOUNDER_ALLOC);
        console.log("  FLORIN_GENESIS_SUPPORTERS_WEI=", SUPPORTERS_ALLOC);
        console.log("  FLORIN_GENESIS_DAO_WEI=", DAO_ALLOC);
        console.log("FlorinToken: deployer mint renounced (permanent)");
    }

    // ── Address summary ──────────────────────────────────────────────

    function _logAddresses() internal view {
        console.log("---");
        console.log("Set these in your .env:");
        console.log("  NEXT_PUBLIC_FIGARO_CORE=              ", _core);
        console.log("  NEXT_PUBLIC_ATTESTATION_COORDINATOR=  ", _attestation);
        console.log("  NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR=", _swapCoordinator);
        console.log("  NEXT_PUBLIC_SWAP_ROUTER=", vm.envAddress("SWAP_ROUTER"));
        console.log("  NEXT_PUBLIC_PERMIT2=", vm.envAddress("PERMIT2"));
        console.log("  NEXT_PUBLIC_CLAUSE_REGISTRY=          ", _clauses);
        console.log("  NEXT_PUBLIC_PROCESS_REGISTRY=        ", _assemblies);
        console.log("  NEXT_PUBLIC_AGREEMENT_REGISTRY=       ", _agreements);
        console.log("  NEXT_PUBLIC_MEMBERS_REGISTRY=       ", _members);
        console.log("  NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS=        ", _florin);
        console.log("  NEXT_PUBLIC_USAGE_COUNTER=            ", _usageCounter);
        console.log("  NEXT_PUBLIC_RPGF_MINTER=              ", _rpgfMinter);
        console.log("  NEXT_PUBLIC_BATCH_VERIFIER=           ", _batchVerifier);
        _logTreasurySummary();
        console.log("---");
    }
}
