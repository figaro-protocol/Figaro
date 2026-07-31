// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import "../src/kernel/FigaroCore.sol";
import "../src/protocol/coordinators/AttestationCoordinator.sol";
import "../src/protocol/registries/ClauseRegistry.sol";
import "../src/protocol/registries/MembersRegistry.sol";
import "../src/florin/FlorinToken.sol";
import {RpgfMinter} from "../src/rpgf/RpgfMinter.sol";
import {UsageCounter} from "../src/protocol/usage/UsageCounter.sol";
import {AssemblyRegistry} from "../src/protocol/registries/AssemblyRegistry.sol";
import "../src/protocol/verifier/FigaroBatchVerifier.sol";

/// @title DeployMainnet — Mainnet deployment of the full Figaro V5 protocol stack
///
/// @notice Deploys all production contracts with no mocks. All security-sensitive
///         parameters are read from environment variables so they can be verified
///         independently before broadcast.
///
/// Required environment variables:
///   PRIVATE_KEY                — deployer private key (or use hardware wallet via flags)
///   FOUNDER_WALLET             — address receiving the 70M founder allocation at genesis
///   SUPPORTERS_WALLET          — address receiving the 30M supporters (friends & family /
///                                early supporters) allocation at genesis
///   DAO_WALLET                 — address receiving the 300M DAO allocation at genesis
///   RPGF_PERIOD_END_1/2/3      — ascending unix timestamps closing each accrual
///                                period. Tranche i pays for period i, so these
///                                are ONE schedule (testnet compresses years
///                                2/5/9 to weeks 2/5/9 — time compresses when
///                                time is involved; ruled 2026-07-15)
///
/// florin allocation (1B cap):
///    70M   (7%)  founders   — genesis mint to FOUNDER_WALLET    (no vesting, no unlock)
///    30M   (3%)  supporters — genesis mint to SUPPORTERS_WALLET (no vesting, no unlock)
///   300M  (30%)  DAO        — genesis mint to DAO_WALLET        (no vesting, no unlock)
///   600M  (60%)  RPGF       — RpgfMinter registered at genesis (registerMinter
///                           precedes renounce, so the minter MUST exist here);
///                           paid pro rata from UsageCounter accrual to clause
///                           authors + assembly designers of record, capped at
///                           15% per wallet.
///
/// @dev There is NO on-chain clause-content validation and NO batch settlement
///      proof path. The chain binds an attestation to its signed agreement
///      (merkle inclusion) and to its content (keccak256); content well-formedness
///      is an off-chain SDK / read-time concern. Any registered clause is
///      attestable with no per-clause on-chain code.
///
/// @dev Deployer renounces minting rights at the end of this script. No new minters
///      can ever be registered afterward.
contract DeployMainnet is Script {
    uint256 constant FOUNDER_ALLOC = 70_000_000 ether; // 7%
    uint256 constant SUPPORTERS_ALLOC = 30_000_000 ether; // 3% — friends & family / early supporters
    uint256 constant DAO_ALLOC = 300_000_000 ether; // 30%
    uint256 constant RPGF_ALLOC = 600_000_000 ether; // 60%

    // Deployment output addresses — populated by run(), logged at the end.
    address internal _core;
    address internal _attestation;
    address internal _clauses;
    address internal _members;
    address internal _florin;
    address internal _assemblies;
    address internal _usageCounter;
    address internal _rpgfMinter;
    address internal _batchVerifier;

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");

        _validateEnv();

        vm.startBroadcast(privateKey);

        _deployProtocol(privateKey);
        _deployFlorinEcosystem(privateKey);

        vm.stopBroadcast();

        _logAddresses();
    }

    // ── Environment validation ───────────────────────────────────────

    function _validateEnv() internal view {
        require(vm.envAddress("FOUNDER_WALLET") != address(0), "FOUNDER_WALLET not set");
        require(vm.envAddress("SUPPORTERS_WALLET") != address(0), "SUPPORTERS_WALLET not set");
        require(vm.envAddress("DAO_WALLET") != address(0), "DAO_WALLET not set");
        require(
            vm.envUint("RPGF_PERIOD_END_1") > block.timestamp
                && vm.envUint("RPGF_PERIOD_END_2") > vm.envUint("RPGF_PERIOD_END_1")
                && vm.envUint("RPGF_PERIOD_END_3") > vm.envUint("RPGF_PERIOD_END_2"),
            "RPGF_PERIOD_END_1/2/3 must be ascending future timestamps"
        );
    }

    // ── Protocol kernel + compositions ────────────────────────────────

    function _deployProtocol(uint256 privateKey) internal {
        FigaroCore core = new FigaroCore();
        _core = address(core);
        console.log("FigaroCore:             ", _core);

        AttestationCoordinator attestation = new AttestationCoordinator(_core);
        _attestation = address(attestation);
        console.log("AttestationCoordinator: ", _attestation);

        // PLACEHOLDER deposit — review before mainnet broadcast (the
        // MembersRegistry reasoning below applies to clause stakes too).
        ClauseRegistry clauses = new ClauseRegistry(0.001 ether);
        _clauses = address(clauses);
        console.log("ClauseRegistry:         ", _clauses);

        // AssemblyRegistry — the assembly artifact family's anchor, parallel to
        // ClauseRegistry and MembersRegistry. RpgfMinter reads it for the
        // assembly author of record.
        AssemblyRegistry assemblies = new AssemblyRegistry(0.001 ether);
        _assemblies = address(assemblies);
        console.log("AssemblyRegistry:       ", _assemblies);

        // Clauses are NOT registered here. Their content is pinned to IPFS +
        // anchored on ClauseRegistry by frontend/scripts/populate-clauses.mjs —
        // the single clause-population path for prod/testnet/mainnet, so each
        // on-chain (contentHash, metadataURI) points at a REAL pinned spec, not a
        // placeholder hash. There is no per-clause on-chain validator to bind:
        // the chain merkle-binds and content-hash-binds attestations and does not
        // validate content shape. Run populate-clauses.mjs after broadcast.

        // ── MembersRegistry ────────────────────────────────────────
        // PLACEHOLDER VALUES — DO NOT SHIP TO MAINNET WITHOUT REVIEW.
        // These two parameters are ONE Sybil price and must be picked together:
        //   - registrationDeposit: $X target in ETH at deploy-time price?
        //     Too low → cheap Sybil farms; too high → locks out small sellers.
        //   - withdrawalCooldown: the deposit only prices identity if it cannot
        //     be recycled. At cooldown 0 one deposit serves N identities in
        //     sequence, so capital cost is O(1) however much breadth is
        //     fabricated; at cooldown T the cost of sustaining N identities over
        //     a reward period P is `deposit · N · T / P`. A cooldown at or above
        //     one accrual period is what makes fabricated breadth cost capital
        //     rather than gas.
        // Both feed the RPGF Sybil bound, which the batch-usage bridge will move
        // sharply: batched recording drops the per-fabricated-pair gas cost by
        // roughly 15×, and the deposit/cooldown have to absorb that. Do not fix
        // these before that lands.
        // Devnet uses 0.001 ether / 0 as ergonomic defaults.
        MembersRegistry members = new MembersRegistry(0.001 ether, 0);
        _members = address(members);
        console.log("MembersRegistry:       ", _members);

        // ── FigaroBatchVerifier (proof-based batch settlement) ─────
        // SP1_VERIFIER_GATEWAY: Succinct's canonical SP1 verifier gateway
        // on the target chain (their contract-addresses docs list the
        // deployments; a chain with none can host the verifier directly).
        // SP1_PROGRAM_VKEY: the guest program's verification key —
        // `SP1_VKEY_ONLY=1 cargo run -p figaro-prove-test --release`.
        // The genesis root is DERIVED (one keccak256("") per kernel state
        // map), matching the Rust KernelState::compute_root on the empty
        // state. ClauseRegistry anchors the witness specs: settleBatch
        // checks each proof's (clause key → spec hash) binding against
        // contentHashOf. Not a florin minter, never will be.
        require(vm.envAddress("SP1_VERIFIER_GATEWAY") != address(0), "SP1_VERIFIER_GATEWAY not set");
        require(vm.envBytes32("SP1_PROGRAM_VKEY") != bytes32(0), "SP1_PROGRAM_VKEY not set");

        // The counter and the verifier reference each other, so they deploy as
        // an ADJACENT PAIR with the verifier's address predicted and then
        // asserted — a wrong guess fails the deploy rather than producing a
        // counter no verifier can ever write to. Order: counter, then verifier.
        address deployer = vm.addr(privateKey);
        address predictedVerifier = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 1);
        _deployUsageCounter(predictedVerifier);

        // The genesis root is DERIVED: one keccak256("") per kernel state map
        // plus the usage leg (itself keccak over three zero-length sections),
        // matching the Rust KernelState::compute_root on the empty state.
        bytes32 emptyMapHash = keccak256("");
        bytes32 emptyUsageHash = keccak256(abi.encodePacked(uint64(0), uint64(0), uint64(0)));
        FigaroBatchVerifier batchVerifier = new FigaroBatchVerifier(
            vm.envAddress("SP1_VERIFIER_GATEWAY"),
            vm.envBytes32("SP1_PROGRAM_VKEY"),
            _clauses,
            _usageCounter,
            keccak256(abi.encodePacked(emptyMapHash, emptyMapHash, emptyMapHash, emptyUsageHash))
        );
        _batchVerifier = address(batchVerifier);
        require(_batchVerifier == predictedVerifier, "verifier address prediction failed");
        console.log("FigaroBatchVerifier:    ", _batchVerifier);
    }

    /// @dev Accrual periods and RPGF tranches are ONE schedule — tranche i pays
    ///      for period i. Deployed here, beside the verifier, because the two
    ///      reference each other; the minter that reads it follows in
    ///      `_deployFlorinEcosystem`.
    function _deployUsageCounter(address batchVerifier_) internal {
        uint64[] memory periods = new uint64[](3);
        periods[0] = uint64(vm.envUint("RPGF_PERIOD_END_1"));
        periods[1] = uint64(vm.envUint("RPGF_PERIOD_END_2"));
        periods[2] = uint64(vm.envUint("RPGF_PERIOD_END_3"));

        // Protocol floor earns nothing — the two order-mandatory clauses plus the
        // assembly-provenance clause (see UsageCounter.excludedArtifact). Assembly
        // designers still accrue via recordAssemblyUsage (credits the compositionHash).
        bytes32[] memory excluded = new bytes32[](3);
        excluded[0] = keccak256(abi.encode("figaro-commerce", uint64(1)));
        excluded[1] = keccak256(abi.encode("figaro-topology", uint64(1)));
        excluded[2] = keccak256(abi.encode("figaro-assembly-provenance", uint64(1)));

        UsageCounter usageCounter = new UsageCounter(
            _core,
            _members, // seller-side live-stake gate: usage counts only for live-staked sellers
            batchVerifier_, // proof-gated writer of the batch-path accrual
            keccak256(abi.encode("figaro-assembly-provenance", uint64(1))),
            excluded,
            3, // minimum-support floor (ruled 2026-07-31): d' >= 3 distinct staked sellers before an artifact scores
            periods
        );
        _usageCounter = address(usageCounter);
        console.log("UsageCounter:           ", _usageCounter);
    }

    // ── florin token + genesis distribution ─────────────────────────

    function _deployFlorinEcosystem(uint256 privateKey) internal {
        FlorinToken florin = new FlorinToken();
        _florin = address(florin);
        console.log("FlorinToken:               ", _florin);

        // The RPGF minter must exist at genesis: registerMinter only works
        // before renounce, and renounce is irreversible. Nothing is posted,
        // bonded, or challenged: the counter (already deployed beside the
        // batch verifier) records verified usage as it happens and the minter
        // pays pro rata from a period that has closed.
        RpgfMinter rpgfMinter = new RpgfMinter(
            address(florin),
            _usageCounter,
            _clauses,
            _assemblies,
            [uint256(300_000_000 ether), 200_000_000 ether, 100_000_000 ether]
        );
        _rpgfMinter = address(rpgfMinter);
        console.log("RpgfMinter:             ", _rpgfMinter);
        florin.registerMinter(_rpgfMinter, RPGF_ALLOC);

        // Genesis distribution: mint 70M + 30M + 300M directly to the founder,
        // supporters, and DAO wallets. Register the deployer as a one-shot genesis
        // minter with cap exactly 400M so that this script is the ONLY entity that
        // can ever exercise deployer-side minting, and only for these three transfers.
        address deployer = vm.addr(privateKey);
        florin.registerMinter(deployer, FOUNDER_ALLOC + SUPPORTERS_ALLOC + DAO_ALLOC);
        florin.mint(vm.envAddress("FOUNDER_WALLET"), FOUNDER_ALLOC);
        florin.mint(vm.envAddress("SUPPORTERS_WALLET"), SUPPORTERS_ALLOC);
        florin.mint(vm.envAddress("DAO_WALLET"), DAO_ALLOC);
        console.log("FlorinToken: genesis mint complete (founder + supporters + DAO)");

        // After renounce, no new minters can ever be registered and the
        // deployer cannot mint again. At this point the full 1B cap is
        // spoken for: 400M exactly exhausted by the genesis mints, 600M
        // mintable only through the RpgfMinter's uniform pro-rata tranche
        // claims (each from a closed accrual period).
        florin.renounceDeployerMint();
        console.log("FlorinToken: deployer mint renounced (permanent)");
    }

    // ── Address summary ──────────────────────────────────────────────

    function _logAddresses() internal view {
        console.log("---");
        console.log("Set these in your .env:");
        console.log("  NEXT_PUBLIC_FIGARO_CORE=              ", _core);
        console.log("  NEXT_PUBLIC_ATTESTATION_COORDINATOR=  ", _attestation);
        console.log("  NEXT_PUBLIC_CLAUSE_REGISTRY=          ", _clauses);
        console.log("  NEXT_PUBLIC_ASSEMBLY_REGISTRY=        ", _assemblies);
        console.log("  NEXT_PUBLIC_MEMBERS_REGISTRY=       ", _members);
        console.log("  NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS=        ", _florin);
        console.log("  NEXT_PUBLIC_USAGE_COUNTER=            ", _usageCounter);
        console.log("  NEXT_PUBLIC_RPGF_MINTER=              ", _rpgfMinter);
        console.log("  NEXT_PUBLIC_BATCH_VERIFIER=           ", _batchVerifier);
        console.log("---");
    }
}
