// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import "../src/FigaroCore.sol";
import "../src/AttestationCoordinator.sol";
import "../src/ClauseRegistry.sol";
import "../src/SellerRegistry.sol";
import "../src/fig/FigToken.sol";
import {RpgfMinter} from "../src/fig/RpgfMinter.sol";
import "../src/FigaroBatchVerifier.sol";

/// @title DeployMainnet — Mainnet deployment of the full Figaro V5 protocol stack
///
/// @notice Deploys all production contracts with no mocks. All security-sensitive
///         parameters are read from environment variables so they can be verified
///         independently before broadcast.
///
/// Required environment variables:
///   PRIVATE_KEY                — deployer private key (or use hardware wallet via flags)
///   FOUNDER_WALLET             — address receiving the 100M founder allocation at genesis
///   DAO_WALLET                 — address receiving the 300M DAO allocation at genesis
///   RPGF_ARBITRATOR            — the composed bond-settlement forum (an arbitration
///                                provider adapter implementing IRpgfArbitrator; the
///                                forum is deployment config, never protocol code)
///   RPGF_BOND                  — post/challenge bond in wei
///   RPGF_CHALLENGE_WINDOW      — seconds a posted root must survive to finalize
///   RPGF_DISPUTE_WINDOW        — seconds the poster has to escalate a challenge
///   RPGF_EARLIEST_POST_1/2/3   — ascending unix timestamps for the tranche
///                                earliest-post times (testnet compresses years
///                                2/5/9 to weeks 2/5/9 — time compresses when
///                                time is involved; ruled 2026-07-15)
///
/// FIG allocation (1B cap):
///   100M  (10%)  founders — genesis mint to FOUNDER_WALLET (no vesting, no unlock)
///   300M  (30%)  DAO      — genesis mint to DAO_WALLET     (no vesting, no unlock)
///   600M  (60%)  RPGF     — RpgfMinter registered at genesis (registerMinter
///                           precedes renounce, so the minter MUST exist here);
///                           optimistic post/challenge/finalize/claim distribution
///                           to clause authors + assembly designers of record.
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
    uint256 constant FOUNDER_ALLOC = 100_000_000 ether; // 10%
    uint256 constant DAO_ALLOC = 300_000_000 ether; // 30%
    uint256 constant RPGF_ALLOC = 600_000_000 ether; // 60%

    // Deployment output addresses — populated by run(), logged at the end.
    address internal _core;
    address internal _attestation;
    address internal _clauses;
    address internal _sellers;
    address internal _fig;
    address internal _rpgfMinter;
    address internal _batchVerifier;

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");

        _validateEnv();

        vm.startBroadcast(privateKey);

        _deployProtocol();
        _deployFigEcosystem(privateKey);

        vm.stopBroadcast();

        _logAddresses();
    }

    // ── Environment validation ───────────────────────────────────────

    function _validateEnv() internal view {
        require(vm.envAddress("FOUNDER_WALLET") != address(0), "FOUNDER_WALLET not set");
        require(vm.envAddress("DAO_WALLET") != address(0), "DAO_WALLET not set");
        require(vm.envAddress("RPGF_ARBITRATOR") != address(0), "RPGF_ARBITRATOR not set");
        require(vm.envUint("RPGF_BOND") > 0, "RPGF_BOND not set");
        require(vm.envUint("RPGF_CHALLENGE_WINDOW") > 0, "RPGF_CHALLENGE_WINDOW not set");
        require(vm.envUint("RPGF_DISPUTE_WINDOW") > 0, "RPGF_DISPUTE_WINDOW not set");
        require(
            vm.envUint("RPGF_EARLIEST_POST_1") > block.timestamp
                && vm.envUint("RPGF_EARLIEST_POST_2") > vm.envUint("RPGF_EARLIEST_POST_1")
                && vm.envUint("RPGF_EARLIEST_POST_3") > vm.envUint("RPGF_EARLIEST_POST_2"),
            "RPGF_EARLIEST_POST_1/2/3 must be ascending future timestamps"
        );
    }

    // ── Protocol kernel + compositions ────────────────────────────────

    function _deployProtocol() internal {
        FigaroCore core = new FigaroCore();
        _core = address(core);
        console.log("FigaroCore:             ", _core);

        AttestationCoordinator attestation = new AttestationCoordinator(_core);
        _attestation = address(attestation);
        console.log("AttestationCoordinator: ", _attestation);

        // PLACEHOLDER deposit — review before mainnet broadcast (the
        // SellerRegistry reasoning below applies to clause stakes too).
        ClauseRegistry clauses = new ClauseRegistry(0.001 ether);
        _clauses = address(clauses);
        console.log("ClauseRegistry:         ", _clauses);

        // Clauses are NOT registered here. Their content is pinned to IPFS +
        // anchored on ClauseRegistry by frontend/scripts/populate-clauses.mjs —
        // the single clause-population path for prod/testnet/mainnet, so each
        // on-chain (contentHash, metadataURI) points at a REAL pinned spec, not a
        // placeholder hash. There is no per-clause on-chain validator to bind:
        // the chain merkle-binds and content-hash-binds attestations and does not
        // validate content shape. Run populate-clauses.mjs after broadcast.

        // ── SellerRegistry ────────────────────────────────────────
        // PLACEHOLDER VALUE — DO NOT SHIP TO MAINNET WITHOUT REVIEW.
        // The deposit is the Sybil-resistance stake (K4: no time lock —
        // withdraw de-surfaces, so pollution costs deposit × time-surfaced).
        // Picking the mainnet value needs explicit reasoning recorded here:
        //   - registrationDeposit: $X target in ETH at deploy-time price?
        //     Bonded participation cost is the floor of attacker
        //     discouragement. Too low → cheap Sybil farms; too high →
        //     locks out small sellers.
        // Devnet uses 0.001 ether as an ergonomic default.
        // Replace this before mainnet broadcast.
        SellerRegistry sellers = new SellerRegistry(0.001 ether);
        _sellers = address(sellers);
        console.log("SellerRegistry:       ", _sellers);

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
        // contentHashOf. Not a FIG minter, never will be.
        require(vm.envAddress("SP1_VERIFIER_GATEWAY") != address(0), "SP1_VERIFIER_GATEWAY not set");
        require(vm.envBytes32("SP1_PROGRAM_VKEY") != bytes32(0), "SP1_PROGRAM_VKEY not set");
        bytes32 emptyMapHash = keccak256("");
        FigaroBatchVerifier batchVerifier = new FigaroBatchVerifier(
            vm.envAddress("SP1_VERIFIER_GATEWAY"),
            vm.envBytes32("SP1_PROGRAM_VKEY"),
            _clauses,
            keccak256(abi.encodePacked(emptyMapHash, emptyMapHash, emptyMapHash))
        );
        _batchVerifier = address(batchVerifier);
        console.log("FigaroBatchVerifier:    ", _batchVerifier);
    }

    // ── FIG token + genesis distribution ────────────────────────────

    function _deployFigEcosystem(uint256 privateKey) internal {
        FigToken fig = new FigToken();
        _fig = address(fig);
        console.log("FigToken:               ", _fig);

        // The RPGF minter must exist at genesis: registerMinter only works
        // before renounce, and renounce is irreversible. formulaHash anchors
        // the exact bytes of the canonical formula spec; the composed forum
        // and every timing/bond parameter arrive via environment (config,
        // never code).
        bytes32 formulaHash = keccak256(bytes(vm.readFile("sdk/src/rpgf/formula.json")));
        RpgfMinter rpgfMinter = new RpgfMinter(
            address(fig),
            vm.envAddress("RPGF_ARBITRATOR"),
            formulaHash,
            vm.envUint("RPGF_BOND"),
            uint64(vm.envUint("RPGF_CHALLENGE_WINDOW")),
            uint64(vm.envUint("RPGF_DISPUTE_WINDOW")),
            [
                uint64(vm.envUint("RPGF_EARLIEST_POST_1")),
                uint64(vm.envUint("RPGF_EARLIEST_POST_2")),
                uint64(vm.envUint("RPGF_EARLIEST_POST_3"))
            ],
            [uint256(300_000_000 ether), 200_000_000 ether, 100_000_000 ether]
        );
        _rpgfMinter = address(rpgfMinter);
        console.log("RpgfMinter:             ", _rpgfMinter);
        fig.registerMinter(_rpgfMinter, RPGF_ALLOC);

        // Genesis distribution: mint 100M + 300M directly to the founder and
        // DAO wallets. Register the deployer as a one-shot genesis minter with
        // cap exactly 400M so that this script is the ONLY entity that can ever
        // exercise deployer-side minting, and only for these two transfers.
        address deployer = vm.addr(privateKey);
        fig.registerMinter(deployer, FOUNDER_ALLOC + DAO_ALLOC);
        fig.mint(vm.envAddress("FOUNDER_WALLET"), FOUNDER_ALLOC);
        fig.mint(vm.envAddress("DAO_WALLET"), DAO_ALLOC);
        console.log("FigToken: genesis mint complete (founder + DAO)");

        // After renounce, no new minters can ever be registered and the
        // deployer cannot mint again. At this point the full 1B cap is
        // spoken for: 400M exactly exhausted by the genesis mints, 600M
        // mintable only through the RpgfMinter's finalized merkle claims.
        fig.renounceDeployerMint();
        console.log("FigToken: deployer mint renounced (permanent)");
    }

    // ── Address summary ──────────────────────────────────────────────

    function _logAddresses() internal view {
        console.log("---");
        console.log("Set these in your .env:");
        console.log("  NEXT_PUBLIC_FIGARO_CORE=              ", _core);
        console.log("  NEXT_PUBLIC_ATTESTATION_COORDINATOR=  ", _attestation);
        console.log("  NEXT_PUBLIC_CLAUSE_REGISTRY=          ", _clauses);
        console.log("  NEXT_PUBLIC_SELLER_REGISTRY=        ", _sellers);
        console.log("  NEXT_PUBLIC_FIG_TOKEN_ADDRESS=        ", _fig);
        console.log("  NEXT_PUBLIC_RPGF_MINTER=              ", _rpgfMinter);
        console.log("  NEXT_PUBLIC_BATCH_VERIFIER=           ", _batchVerifier);
        console.log("---");
    }
}
